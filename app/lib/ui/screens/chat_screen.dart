import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/chat_api.dart';
import '../../core/realtime_client.dart';
import '../../models/conversation.dart';
import '../../models/message.dart';
import '../../state/chat_controller.dart';
import '../../state/conversations_controller.dart';
import '../../state/session_controller.dart';
import '../components/app_avatar.dart';
import '../components/connection_banner.dart';
import '../components/message_bubble.dart';
import '../components/message_dividers.dart';
import '../components/scroll_to_newest_button.dart';
import '../components/state_views.dart';
import '../components/typing_indicator.dart';
import '../design/app_colors.dart';
import '../design/tokens.dart';
import '../format.dart';
import '../l10n.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.conversation, this.onBack});

  final Conversation conversation;

  /// Shown as a back button on compact layouts, where the chat is full screen.
  final VoidCallback? onBack;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  late final ChatController _chat;
  late final ConversationsController _conversations;
  final _scroll = ScrollController();

  /// Messages that arrived while the user was reading older history.
  int _missedWhileAway = 0;
  bool _atNewest = true;

  @override
  void initState() {
    super.initState();
    final realtime = context.read<RealtimeClient>();
    _conversations = context.read<ConversationsController>()..activeId = widget.conversation.id;
    _chat = ChatController(
      api: context.read<ChatApi>(),
      frames: realtime.frames,
      me: context.read<SessionController>().user!,
      conversation: widget.conversation,
      onMessage: _conversations.applyMessage,
      onMessageUpdated: _conversations.applyUpdate,
      onRead: _conversations.markReadLocally,
      sendFrame: realtime.send,
    );
    _scroll.addListener(_onScroll);
    unawaited(_chat.load());
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    if (_conversations.activeId == widget.conversation.id) _conversations.activeId = null;
    _chat.dispose();
    super.dispose();
  }

  /// The list is reversed, so offset 0 is the newest message.
  void _onScroll() {
    if (!_scroll.hasClients) return;
    final atNewest = _scroll.offset <= 24;
    if (atNewest == _atNewest) return;
    setState(() {
      _atNewest = atNewest;
      if (atNewest) _missedWhileAway = 0;
    });
  }

  void _scrollToNewest() {
    if (!_scroll.hasClients) return;
    _scroll.animateTo(0, duration: AppDurations.medium, curve: Curves.easeOut);
  }

  Future<void> _confirmDelete(Message message) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l.deleteMessage),
        content: Text(l.deleteMessageConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.cancel)),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l.delete)),
        ],
      ),
    );
    if (!(confirmed ?? false)) return;
    try {
      await _chat.delete(message);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorMessage(l, e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return ListenableBuilder(
      listenable: _chat,
      builder: (context, _) {
        final participant = _chat.participant;
        final typing = _chat.participantTyping;
        final palette = AppPalette.of(context);
        final theme = Theme.of(context);
        return Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: false,
            leading: widget.onBack == null
                ? null
                : IconButton(tooltip: l.back, icon: const BackButtonIcon(), onPressed: widget.onBack),
            titleSpacing: widget.onBack == null ? AppSpacing.md : 0,
            title: Row(
              children: [
                UserAvatar(user: participant, size: AvatarSize.medium, showPresence: true),
                const SizedBox(width: AppSpacing.smd),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(participant.displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
                      if (typing)
                        // Named, so it reads as "X is typing" instead of a
                        // bare "typing…" with no indication of who.
                        TypingIndicator(displayName: participant.displayName)
                      else
                        Semantics(
                          liveRegion: true,
                          child: Text(
                            presenceLabel(l, participant),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: participant.isOnline ? palette.online : theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          body: SafeArea(
            top: false,
            child: Column(
              children: [
                // On wide layouts the conversation list next to the chat already shows it.
                if (widget.onBack != null) const ConnectionBanner(),
                Expanded(child: _messages(context)),
                _Composer(onSend: _chat.send, onComposing: _chat.onComposing),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _messages(BuildContext context) {
    final l = context.l10n;
    if (_chat.loading && _chat.messages.isEmpty) {
      return LoadingView(label: l.loadingMessages);
    }
    if (_chat.error != null && _chat.messages.isEmpty) {
      return ErrorView(message: errorMessage(l, _chat.error!), onRetry: _chat.load);
    }
    if (_chat.messages.isEmpty) {
      return EmptyView(
        icon: Icons.waving_hand_outlined,
        title: l.noMessagesYet,
        message: l.sayHello(_chat.participant.displayName),
      );
    }

    final messages = _chat.messages;
    return LayoutBuilder(
      builder: (context, constraints) {
        final bubbleMax = min(560.0, constraints.maxWidth * 0.78);
        return Stack(
          children: [
            NotificationListener<ScrollNotification>(
              onNotification: (n) {
                // The list is reversed, so "after" is older history at the top.
                if (n.metrics.extentAfter < 300 && _chat.hasMore) unawaited(_chat.loadMore());
                return false;
              },
              child: ListView.builder(
                controller: _scroll,
                reverse: true,
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.smd, vertical: AppSpacing.sm),
                itemCount: messages.length + (_chat.hasMore ? 1 : 0),
                itemBuilder: (context, i) {
                  if (i == messages.length) {
                    return const Padding(
                      padding: EdgeInsets.all(AppSpacing.md),
                      child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                    );
                  }
                  final index = messages.length - 1 - i;
                  final message = messages[index];
                  final isMine = message.sender.id == _chat.me.id;
                  final showDay = index == 0 || !isSameDay(messages[index - 1].createdAt, message.createdAt);
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (showDay) DayDivider(date: message.createdAt),
                      MessageBubble(
                        message: message,
                        isMine: isMine,
                        maxWidth: bubbleMax,
                        onRetry: () => _chat.retry(message),
                        onDelete: isMine && !message.isLocal && !message.isDeleted
                            ? () => _confirmDelete(message)
                            : null,
                      ),
                    ],
                  );
                },
              ),
            ),
            PositionedDirectional(
              bottom: AppSpacing.md,
              end: AppSpacing.md,
              child: AnimatedScale(
                scale: _atNewest ? 0 : 1,
                duration: context.motion(AppDurations.fast),
                child: IgnorePointer(
                  ignoring: _atNewest,
                  child: ScrollToNewestButton(unreadCount: _missedWhileAway, onPressed: _scrollToNewest),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Composer extends StatefulWidget {
  const _Composer({required this.onSend, required this.onComposing});
  final Future<void> Function(String text) onSend;
  final ValueChanged<bool> onComposing;

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
  final _text = TextEditingController();
  late final FocusNode _focus = FocusNode(onKeyEvent: _onKey);
  bool _canSend = false;

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    final can = value.trim().isNotEmpty;
    widget.onComposing(can);
    if (can != _canSend) setState(() => _canSend = can);
  }

  /// Hardware Enter sends; Shift+Enter inserts a newline. Soft keyboards are unaffected.
  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    final isEnter = event.logicalKey == LogicalKeyboardKey.enter || event.logicalKey == LogicalKeyboardKey.numpadEnter;
    if (event is KeyDownEvent && isEnter && !HardwareKeyboard.instance.isShiftPressed) {
      _send();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  void _send() {
    final text = _text.text.trim();
    if (text.isEmpty) return;
    _text.clear();
    setState(() => _canSend = false);
    _focus.requestFocus();
    unawaited(widget.onSend(text));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainer,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.smd, AppSpacing.sm, AppSpacing.sm, AppSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  key: const Key('chat.input'),
                  controller: _text,
                  focusNode: _focus,
                  onChanged: _onChanged,
                  minLines: 1,
                  maxLines: 5,
                  keyboardType: TextInputType.multiline,
                  textCapitalization: TextCapitalization.sentences,
                  inputFormatters: [LengthLimitingTextInputFormatter(4000)],
                  decoration: InputDecoration(
                    hintText: l.writeMessage,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.smd),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              IconButton.filled(
                key: const Key('chat.send'),
                tooltip: l.send,
                onPressed: _canSend ? _send : null,
                icon: const Icon(Icons.send_rounded),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

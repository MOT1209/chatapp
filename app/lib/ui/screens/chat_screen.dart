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
import '../format.dart';
import '../l10n.dart';
import '../widgets/connection_banner.dart';
import '../widgets/state_views.dart';
import '../widgets/user_avatar.dart';

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
    unawaited(_chat.load());
  }

  @override
  void dispose() {
    if (_conversations.activeId == widget.conversation.id) _conversations.activeId = null;
    _chat.dispose();
    super.dispose();
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
        final theme = Theme.of(context);
        final typing = _chat.participantTyping;
        return Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: false,
            leading: widget.onBack == null
                ? null
                : IconButton(tooltip: l.back, icon: const BackButtonIcon(), onPressed: widget.onBack),
            titleSpacing: widget.onBack == null ? 16 : 0,
            title: Row(
              children: [
                UserAvatar(user: participant, radius: 18, showPresence: true),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(participant.displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          typing ? l.typing : presenceLabel(l, participant),
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: typing || participant.isOnline
                                ? Colors.green.shade600
                                : theme.colorScheme.onSurfaceVariant,
                            fontStyle: typing ? FontStyle.italic : null,
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
        return NotificationListener<ScrollNotification>(
          onNotification: (n) {
            // The list is reversed, so "after" is older history at the top.
            if (n.metrics.extentAfter < 300 && _chat.hasMore) unawaited(_chat.loadMore());
            return false;
          },
          child: ListView.builder(
            reverse: true,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            itemCount: messages.length + (_chat.hasMore ? 1 : 0),
            itemBuilder: (context, i) {
              if (i == messages.length) {
                return const Padding(
                  padding: EdgeInsets.all(12),
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
                  if (showDay) _DayDivider(message.createdAt),
                  MessageBubble(
                    message: message,
                    isMine: isMine,
                    maxWidth: bubbleMax,
                    onRetry: () => _chat.retry(message),
                    onDelete: isMine && !message.isLocal && !message.isDeleted ? () => _confirmDelete(message) : null,
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

class _DayDivider extends StatelessWidget {
  const _DayDivider(this.date);
  final DateTime date;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Center(
      child: Text(
        formatDayDivider(context.l10n, date),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
      ),
    ),
  );
}

class MessageBubble extends StatelessWidget {
  const MessageBubble({
    super.key,
    required this.message,
    required this.isMine,
    required this.maxWidth,
    required this.onRetry,
    this.onDelete,
  });

  final Message message;
  final bool isMine;
  final double maxWidth;
  final VoidCallback onRetry;

  /// Long-press on touch, right-click on desktop and web.
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    final failed = message.status == MessageStatus.failed;
    final deleted = message.isDeleted;
    final background = deleted
        ? scheme.surfaceContainerLow
        : isMine
        ? scheme.primary
        : scheme.surfaceContainerHighest;
    final foreground = deleted
        ? scheme.onSurfaceVariant
        : isMine
        ? scheme.onPrimary
        : scheme.onSurface;
    final time = formatTime(message.createdAt);

    final bubble = Container(
      constraints: BoxConstraints(maxWidth: maxWidth),
      margin: const EdgeInsets.symmetric(vertical: 2),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
      decoration: BoxDecoration(
        color: failed ? scheme.errorContainer : background,
        border: deleted ? Border.all(color: scheme.outlineVariant) : null,
        borderRadius: BorderRadiusDirectional.only(
          topStart: const Radius.circular(16),
          topEnd: const Radius.circular(16),
          bottomStart: Radius.circular(isMine ? 16 : 4),
          bottomEnd: Radius.circular(isMine ? 4 : 16),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            widthFactor: 1,
            child: deleted
                ? Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.block, size: 14, color: foreground),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          l.messageDeleted,
                          style: TextStyle(color: foreground, fontSize: 14, fontStyle: FontStyle.italic),
                        ),
                      ),
                    ],
                  )
                : Text(
                    message.body,
                    style: TextStyle(color: failed ? scheme.onErrorContainer : foreground, fontSize: 15),
                  ),
          ),
          const SizedBox(height: 2),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Flexible so a narrow bubble at a large text size shortens the time instead of overflowing.
              Flexible(
                child: Text(
                  time,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    color: (failed ? scheme.onErrorContainer : foreground).withValues(alpha: 0.75),
                  ),
                ),
              ),
              if (isMine && !deleted) ...[
                const SizedBox(width: 4),
                _StatusIcon(status: message.status, foreground: foreground, background: background),
              ],
            ],
          ),
        ],
      ),
    );

    final status = switch (message.status) {
      MessageStatus.pending => l.statusSending,
      MessageStatus.sent => l.statusSent,
      MessageStatus.read => l.statusRead,
      MessageStatus.failed => l.statusFailed,
    };
    return Semantics(
      label: '${isMine ? l.you : message.sender.displayName}, $time${isMine && !deleted ? ', $status' : ''}',
      onLongPressHint: onDelete == null ? null : l.deleteMessage,
      child: Align(
        alignment: isMine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
        child: Column(
          crossAxisAlignment: isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            GestureDetector(onLongPress: onDelete, onSecondaryTap: onDelete, child: bubble),
            if (failed)
              TextButton.icon(
                onPressed: onRetry,
                icon: Icon(Icons.refresh, size: 16, color: scheme.error),
                label: Text(l.notSentRetry, style: TextStyle(color: scheme.error)),
              ),
          ],
        ),
      ),
    );
  }
}

/// Contract §5.4: pending = one grey check, sent = two grey, read = two blue, failed = red.
class _StatusIcon extends StatelessWidget {
  const _StatusIcon({required this.status, required this.foreground, required this.background});
  final MessageStatus status;
  final Color foreground;
  final Color background;

  @override
  Widget build(BuildContext context) {
    final muted = foreground.withValues(alpha: 0.75);
    // The bubble is dark in light mode and light in dark mode; keep "read" blue legible on both.
    final readBlue = ThemeData.estimateBrightnessForColor(background) == Brightness.dark
        ? Colors.lightBlueAccent.shade100
        : Colors.blue.shade800;
    final icon = switch (status) {
      MessageStatus.pending => Icons.done,
      MessageStatus.sent || MessageStatus.read => Icons.done_all,
      MessageStatus.failed => Icons.error_outline,
    };
    final color = switch (status) {
      MessageStatus.pending || MessageStatus.sent => muted,
      MessageStatus.read => readBlue,
      MessageStatus.failed => Theme.of(context).colorScheme.error,
    };
    return ExcludeSemantics(child: Icon(icon, size: 14, color: color));
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
    return Material(
      color: Theme.of(context).colorScheme.surface,
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(12, 8, 8, 8),
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
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              key: const Key('chat.send'),
              tooltip: l.send,
              onPressed: _canSend ? _send : null,
              icon: const Icon(Icons.send_rounded),
            ),
          ],
        ),
      ),
    );
  }
}

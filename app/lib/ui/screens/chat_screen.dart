import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/chat_api.dart';
import '../../core/realtime_client.dart';
import '../../models/conversation.dart';
import '../../models/message.dart';
import '../../state/chat_controller.dart';
import '../../state/conversations_controller.dart';
import '../../state/session_controller.dart';
import '../format.dart';
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
    _conversations = context.read<ConversationsController>()..activeId = widget.conversation.id;
    _chat = ChatController(
      api: context.read<ChatApi>(),
      frames: context.read<RealtimeClient>().frames,
      me: context.read<SessionController>().user!,
      conversation: widget.conversation,
      onMessage: _conversations.applyMessage,
      onRead: _conversations.markReadLocally,
    );
    unawaited(_chat.load());
  }

  @override
  void dispose() {
    if (_conversations.activeId == widget.conversation.id) _conversations.activeId = null;
    _chat.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _chat,
      builder: (context, _) {
        final participant = _chat.participant;
        return Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: false,
            leading: widget.onBack == null
                ? null
                : IconButton(tooltip: 'Back', icon: const BackButtonIcon(), onPressed: widget.onBack),
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
                      Text(
                        presenceLabel(participant),
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: participant.isOnline
                              ? Colors.green.shade600
                              : Theme.of(context).colorScheme.onSurfaceVariant,
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
                Expanded(child: _messages(context)),
                _Composer(onSend: _chat.send),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _messages(BuildContext context) {
    if (_chat.loading && _chat.messages.isEmpty) {
      return const LoadingView(label: 'Loading messages');
    }
    if (_chat.error != null && _chat.messages.isEmpty) {
      return ErrorView(message: _chat.error!.message, onRetry: _chat.load);
    }
    if (_chat.messages.isEmpty) {
      return EmptyView(
        icon: Icons.waving_hand_outlined,
        title: 'No messages yet',
        message: 'Say hello to ${_chat.participant.displayName} 👋',
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
              final showDay = index == 0 || !isSameDay(messages[index - 1].createdAt, message.createdAt);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (showDay) _DayDivider(message.createdAt),
                  MessageBubble(
                    message: message,
                    isMine: message.sender.id == _chat.me.id,
                    maxWidth: bubbleMax,
                    onRetry: () => _chat.retry(message),
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
        formatDayDivider(date),
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
  });

  final Message message;
  final bool isMine;
  final double maxWidth;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final failed = message.status == MessageStatus.failed;
    final background = isMine ? scheme.primary : scheme.surfaceContainerHighest;
    final foreground = isMine ? scheme.onPrimary : scheme.onSurface;
    final time = formatTime(message.createdAt);

    final bubble = Container(
      constraints: BoxConstraints(maxWidth: maxWidth),
      margin: const EdgeInsets.symmetric(vertical: 2),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
      decoration: BoxDecoration(
        color: failed ? scheme.errorContainer : background,
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
            child: Text(
              message.body,
              style: TextStyle(color: failed ? scheme.onErrorContainer : foreground, fontSize: 15),
            ),
          ),
          const SizedBox(height: 2),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                time,
                style: TextStyle(
                  fontSize: 11,
                  color: (failed ? scheme.onErrorContainer : foreground).withValues(alpha: 0.75),
                ),
              ),
              if (isMine) ...[
                const SizedBox(width: 4),
                _StatusIcon(status: message.status, foreground: foreground, background: background),
              ],
            ],
          ),
        ],
      ),
    );

    return Semantics(
      label:
          '${isMine ? 'You' : message.sender.displayName}, $time'
          '${isMine ? ', ${message.status.name}' : ''}',
      child: Align(
        alignment: isMine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
        child: Column(
          crossAxisAlignment: isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            bubble,
            if (failed)
              TextButton.icon(
                onPressed: onRetry,
                icon: Icon(Icons.refresh, size: 16, color: scheme.error),
                label: Text('Not sent. Tap to retry', style: TextStyle(color: scheme.error)),
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
    final (icon, color, label) = switch (status) {
      MessageStatus.pending => (Icons.done, muted, 'Sending'),
      MessageStatus.sent => (Icons.done_all, muted, 'Sent'),
      MessageStatus.read => (Icons.done_all, readBlue, 'Read'),
      MessageStatus.failed => (Icons.error_outline, Theme.of(context).colorScheme.error, 'Failed'),
    };
    return Icon(icon, size: 14, color: color, semanticLabel: label);
  }
}

class _Composer extends StatefulWidget {
  const _Composer({required this.onSend});
  final Future<void> Function(String text) onSend;

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
  final _text = TextEditingController();
  late final FocusNode _focus = FocusNode(onKeyEvent: _onKey);
  bool _canSend = false;

  @override
  void initState() {
    super.initState();
    _text.addListener(() {
      final can = _text.text.trim().isNotEmpty;
      if (can != _canSend) setState(() => _canSend = can);
    });
  }

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
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
    _focus.requestFocus();
    unawaited(widget.onSend(text));
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                key: const Key('chat.input'),
                controller: _text,
                focusNode: _focus,
                minLines: 1,
                maxLines: 5,
                keyboardType: TextInputType.multiline,
                textCapitalization: TextCapitalization.sentences,
                inputFormatters: [LengthLimitingTextInputFormatter(4000)],
                decoration: const InputDecoration(
                  hintText: 'Write a message...',
                  isDense: true,
                  contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              key: const Key('chat.send'),
              tooltip: 'Send',
              onPressed: _canSend ? _send : null,
              icon: const Icon(Icons.send_rounded),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

import '../l10n.dart';
import '../../models/message.dart';
import '../design/app_colors.dart';
import '../design/tokens.dart';
import '../format.dart';

/// One message. Own messages sit at the end of the row with a tail on the
/// end-side corner, incoming messages on the start-side, so which side a bubble
/// is on reads the same in Arabic and English.
///
/// Deleting is offered by an always-present menu button on own messages, plus
/// long-press and right-click as shortcuts. The button is not hover-gated: a
/// hover-only affordance would be unreachable on touch and easy to miss for
/// anyone using a keyboard or a screen reader.
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
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final theme = Theme.of(context);
    final palette = AppPalette.of(context);
    final message = this.message;
    final isMine = this.isMine;
    final failed = message.status == MessageStatus.failed;
    final deleted = message.isDeleted;

    final background = deleted
        ? palette.bubbleDeleted
        : failed
        ? theme.colorScheme.errorContainer
        : isMine
        ? palette.bubbleMine
        : palette.bubbleTheirs;
    final foreground = deleted
        ? palette.onBubbleDeleted
        : failed
        ? theme.colorScheme.onErrorContainer
        : isMine
        ? palette.onBubbleMine
        : palette.onBubbleTheirs;

    final time = formatTime(message.createdAt);
    // The tight corner faces the other speaker, so the bubble points at them:
    // "mine" is the end side in both LTR and RTL.
    final shape = BorderRadiusDirectional.only(
      topStart: const Radius.circular(AppRadius.lg),
      topEnd: const Radius.circular(AppRadius.lg),
      bottomStart: Radius.circular(isMine ? AppRadius.lg : AppRadius.xs),
      bottomEnd: Radius.circular(isMine ? AppRadius.xs : AppRadius.lg),
    );

    final bubble = Container(
      constraints: BoxConstraints(maxWidth: maxWidth),
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppSpacing.smd,
        AppSpacing.sm + AppSpacing.xxs,
        AppSpacing.smd,
        AppSpacing.xs + AppSpacing.xxs,
      ),
      decoration: BoxDecoration(color: background, borderRadius: shape),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            widthFactor: 1,
            child: deleted
                ? Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.block, size: AppSizes.iconSmall, color: foreground),
                      const SizedBox(width: AppSpacing.xsm),
                      Flexible(
                        child: Text(
                          l.messageDeleted,
                          style: theme.textTheme.bodyMedium?.copyWith(color: foreground, fontStyle: FontStyle.italic),
                        ),
                      ),
                    ],
                  )
                : Text(message.body, style: theme.textTheme.bodyMedium?.copyWith(color: foreground)),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(time, style: theme.textTheme.labelSmall?.copyWith(color: foreground.withValues(alpha: 0.75))),
              if (isMine && !deleted) ...[
                const SizedBox(width: AppSpacing.xs),
                MessageStatusIcon(status: message.status, foreground: foreground, background: background),
              ],
            ],
          ),
          // Retrying lives on the message itself: a failed send is the one thing
          // about that bubble the user needs to act on. Its own line so the
          // label never has to share width with the timestamp.
          if (failed && message.isLocal)
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xxs),
                child: _RetryChip(onRetry: onRetry),
              ),
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
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (onDelete != null) _MessageActions(onDelete: onDelete!),
              Flexible(
                child: GestureDetector(onLongPress: onDelete, onSecondaryTap: onDelete, child: bubble),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The trailing menu affordance for an own message.
class _MessageActions extends StatelessWidget {
  const _MessageActions({required this.onDelete});

  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: context.l10n.deleteMessage,
    child: IconButton(onPressed: onDelete, iconSize: AppSizes.iconSmall, icon: const Icon(Icons.more_horiz)),
  );
}

/// Tapping a failed message resends it, which is one target instead of a
/// separate button floating underneath the bubble.
class _RetryChip extends StatelessWidget {
  const _RetryChip({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // "Not sent. Tap to retry" rather than a bare "Try again": it says why the
    // message failed and that the bubble itself is the retry target.
    final label = context.l10n.notSentRetry;
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onRetry,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.xs, 1, AppSpacing.xs, 1),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.refresh, size: AppSizes.iconSmall, color: scheme.onErrorContainer),
              const SizedBox(width: AppSpacing.xxs),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.labelSmall?.copyWith(color: scheme.onErrorContainer, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Contract §5.4: pending = one grey check, sent = two grey, read = two blue,
/// failed = red.
class MessageStatusIcon extends StatelessWidget {
  const MessageStatusIcon({super.key, required this.status, required this.foreground, required this.background});

  final MessageStatus status;
  final Color foreground;
  final Color background;

  @override
  Widget build(BuildContext context) {
    final muted = foreground.withValues(alpha: 0.75);
    // The bubble is dark in light mode and light in dark mode, so the read
    // receipt needs a colour that survives on either.
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
    return ExcludeSemantics(
      child: Icon(icon, size: AppSizes.iconSmall, color: color),
    );
  }
}

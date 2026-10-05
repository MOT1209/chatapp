import 'package:flutter/material.dart';

import '../l10n.dart';
import '../../models/conversation.dart';
import '../design/app_colors.dart';
import '../design/tokens.dart';
import '../format.dart';
import 'app_avatar.dart';

/// One row in the conversation list: who, what they last said, when, and how
/// much is unread.
///
/// The unread preview is bold and the timestamp shifts to the primary colour so
/// an unread chat is identifiable without relying on the badge alone.
class ConversationTile extends StatelessWidget {
  const ConversationTile({
    super.key,
    required this.conversation,
    required this.currentUserId,
    required this.onTap,
    this.selected = false,
  });

  final Conversation conversation;
  final String currentUserId;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final palette = AppPalette.of(context);
    final l = context.l10n;
    final last = conversation.lastMessage;
    final unread = conversation.unreadCount;

    final deleted = last?.isDeleted ?? false;
    final body = last == null ? null : (deleted ? l.messageDeleted : last.body);
    final preview = switch (last) {
      null => l.noMessagesYet,
      _ when last.sender.id == currentUserId => l.youPrefix(body!),
      _ => body!,
    };

    return ListTile(
      selected: selected,
      selectedTileColor: scheme.secondaryContainer.withValues(alpha: 0.5),
      leading: UserAvatar(user: conversation.participant, size: AvatarSize.large, showPresence: true),
      title: Text(
        conversation.participant.displayName,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: unread > 0 ? theme.textTheme.titleSmall : theme.textTheme.bodyLarge,
      ),
      subtitle: Text(
        preview,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: theme.textTheme.bodySmall?.copyWith(
          color: unread > 0 ? scheme.onSurface : scheme.onSurfaceVariant,
          fontWeight: unread > 0 ? FontWeight.w600 : null,
          fontStyle: deleted ? FontStyle.italic : null,
        ),
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            formatListTimestamp(l, last?.createdAt ?? conversation.updatedAt),
            style: theme.textTheme.labelSmall?.copyWith(
              color: unread > 0 ? scheme.primary : scheme.onSurfaceVariant,
              fontWeight: unread > 0 ? FontWeight.w700 : null,
            ),
          ),
          if (unread > 0) ...[
            const SizedBox(height: AppSpacing.xs),
            Semantics(
              label: l.unreadCount(unread),
              excludeSemantics: true,
              child: Badge(backgroundColor: scheme.primary, label: Text(unread > 99 ? '99+' : '$unread')),
            ),
          ] else if (conversation.participant.isOnline) ...[
            const SizedBox(height: AppSpacing.sm),
            ExcludeSemantics(
              child: Container(
                width: AppSizes.dot + AppSpacing.xxs,
                height: AppSizes.dot + AppSpacing.xxs,
                decoration: BoxDecoration(color: palette.online, shape: BoxShape.circle),
              ),
            ),
          ],
        ],
      ),
      onTap: onTap,
    );
  }
}

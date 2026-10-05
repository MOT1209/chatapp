import 'package:flutter/material.dart';

import '../l10n.dart';
import '../design/tokens.dart';

/// Floating button that appears when the reader has scrolled away from the
/// newest message, returning them to it.
///
/// It overlays the message list instead of sitting in the layout, so appearing
/// and disappearing never reflows the transcript.
class ScrollToNewestButton extends StatelessWidget {
  const ScrollToNewestButton({super.key, required this.onPressed, this.unreadCount = 0});

  final VoidCallback onPressed;

  /// When greater than zero the button doubles as an unread marker.
  final int unreadCount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Tooltip(
      message: context.l10n.scrollToNewest,
      child: Material(
        color: scheme.surfaceContainerHigh,
        elevation: AppElevation.medium,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.sm + AppSpacing.xs),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.keyboard_double_arrow_down_rounded,
                  size: AppSizes.iconLarge,
                  color: scheme.onSurfaceVariant,
                ),
                if (unreadCount > 0) ...[
                  const SizedBox(width: AppSpacing.xs + AppSpacing.xxs),
                  Text(
                    unreadCount > 99 ? '99+' : '$unreadCount',
                    style: theme.textTheme.labelMedium?.copyWith(color: scheme.primary, fontWeight: FontWeight.w700),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

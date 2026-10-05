import 'package:flutter/material.dart';

import '../l10n.dart';
import '../design/tokens.dart';
import '../format.dart';

/// A date pill between message groups. Sticking to the surface and drawing a
/// hairline keeps it legible over both bubble colours.
class DayDivider extends StatelessWidget {
  const DayDivider({super.key, required this.date});

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.smd),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.smd, vertical: AppSpacing.xs),
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(AppRadius.pill),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Text(
            formatDayDivider(context.l10n, date),
            style: theme.textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ),
      ),
    );
  }
}

/// Marks where the reader stopped last time: everything below this line arrived
/// while the chat was closed. Rendered once, above the first unread message.
class UnreadDivider extends StatelessWidget {
  const UnreadDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final label = context.l10n.unreadMessages;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Semantics(
        label: label,
        child: Row(
          children: [
            Expanded(child: Divider(color: scheme.primary.withValues(alpha: 0.5), thickness: 1)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.smd),
              child: Text(
                label,
                style: theme.textTheme.labelSmall?.copyWith(color: scheme.primary, fontWeight: FontWeight.w700),
              ),
            ),
            Expanded(child: Divider(color: scheme.primary.withValues(alpha: 0.5), thickness: 1)),
          ],
        ),
      ),
    );
  }
}

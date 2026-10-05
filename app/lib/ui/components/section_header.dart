import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// Section label inside a scrolling list ("Chats", "People", "Chats" on the
/// contacts screen). Announced as a header so screen-reader users can jump
/// between groups.
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.md, AppSpacing.smd, AppSpacing.md, AppSpacing.xs),
      child: Semantics(
        header: true,
        child: Text(label, style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.primary)),
      ),
    );
  }
}

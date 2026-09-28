import 'package:flutter/material.dart';

import '../l10n.dart';

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label});
  final String? label;

  @override
  Widget build(BuildContext context) => Center(
    child: Semantics(label: label ?? context.l10n.loading, child: const CircularProgressIndicator()),
  );
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.icon, required this.title, this.message, this.action});

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: theme.colorScheme.outline),
            const SizedBox(height: 16),
            Text(title, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
            if (message != null) ...[
              const SizedBox(height: 8),
              Text(
                message!,
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return EmptyView(
      icon: Icons.error_outline,
      title: l.somethingWentWrong,
      message: message,
      action: OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: Text(l.tryAgain)),
    );
  }
}

class ErrorBanner extends StatelessWidget {
  const ErrorBanner({super.key, required this.message, this.success = false});
  final String message;
  final bool success;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final background = success ? scheme.secondaryContainer : scheme.errorContainer;
    final foreground = success ? scheme.onSecondaryContainer : scheme.onErrorContainer;
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: [
            Icon(success ? Icons.check_circle_outline : Icons.error_outline, color: foreground),
            const SizedBox(width: 12),
            Expanded(
              child: Text(message, style: TextStyle(color: foreground)),
            ),
          ],
        ),
      ),
    );
  }
}

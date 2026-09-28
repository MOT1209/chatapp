import 'package:flutter/material.dart';

import '../l10n.dart';
import '../widgets/state_views.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key, this.error, required this.onRetry});

  final String? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l = context.l10n;
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.chat_bubble_rounded, size: 72, color: theme.colorScheme.primary),
                const SizedBox(height: 16),
                Text(l.appTitle, style: theme.textTheme.headlineMedium),
                const SizedBox(height: 32),
                if (error == null)
                  LoadingView(label: l.checkingSession)
                else ...[
                  ErrorBanner(message: error!),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: Text(l.tryAgain)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

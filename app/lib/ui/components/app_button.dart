import 'package:flutter/material.dart';

import '../l10n.dart';
import '../design/app_colors.dart';
import '../design/tokens.dart';

/// A primary button that owns its own busy state, so a screen never has to
/// remember to swap the label for a spinner and forget to re-enable itself.
class LoadingButton extends StatelessWidget {
  const LoadingButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.icon,
    this.expand = true,
  });

  final String label;

  /// Null while loading, which is what actually disables the button.
  final VoidCallback? onPressed;
  final bool isLoading;
  final IconData? icon;

  /// Stretches to the full width available (the default for form actions).
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final child = isLoading
        ? Row(
            mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(
                width: AppSizes.iconMedium,
                height: AppSizes.iconMedium,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
              const SizedBox(width: AppSpacing.smd),
              Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
            ],
          )
        : icon == null
        ? Text(label)
        : Row(
            mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: AppSizes.iconMedium),
              const SizedBox(width: AppSpacing.sm),
              Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
            ],
          );

    return FilledButton(onPressed: isLoading ? null : onPressed, child: child);
  }
}

/// The app's confirmation dialog. Every destructive action routes through here
/// so cancel/confirm order, wording and shape stay identical.
Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  String? cancelLabel,
  bool destructive = false,
}) async {
  final l = context.l10n;
  final scheme = Theme.of(context).colorScheme;
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actionsPadding: const EdgeInsets.fromLTRB(AppSpacing.smd, 0, AppSpacing.smd, AppSpacing.smd),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(cancelLabel ?? l.cancel)),
        FilledButton(
          style: destructive
              ? FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError)
              : null,
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}

/// Feedback after an action. Errors and successes look different so a failure is
/// never mistaken for a confirmation.
enum SnackKind { error, success, info }

void showAppSnackBar(BuildContext context, String message, {SnackKind kind = SnackKind.info}) {
  final theme = Theme.of(context);
  final palette = AppPalette.of(context);
  final (background, foreground, icon) = switch (kind) {
    SnackKind.error => (theme.colorScheme.errorContainer, theme.colorScheme.onErrorContainer, Icons.error_outline),
    SnackKind.success => (palette.successContainer, palette.onSuccessContainer, Icons.check_circle_outline),
    SnackKind.info => (theme.colorScheme.inverseSurface, theme.colorScheme.onInverseSurface, null),
  };

  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  messenger
    ..clearSnackBars()
    ..showSnackBar(
      SnackBar(
        content: Row(
          children: [
            if (icon != null) ...[
              Icon(icon, size: AppSizes.iconMedium, color: foreground),
              const SizedBox(width: AppSpacing.smd),
            ],
            Expanded(
              child: Text(message, style: theme.textTheme.bodyMedium?.copyWith(color: foreground)),
            ),
          ],
        ),
        backgroundColor: background,
        duration: const Duration(seconds: 4),
      ),
    );
}

import 'package:flutter/material.dart';

import '../l10n.dart';
import '../design/app_colors.dart';
import '../design/tokens.dart';

/// Spinner plus a label, announced to screen readers as one busy region.
///
/// Prefer [SkeletonList] where the shape of the content is known: a spinner in
/// the middle of a list makes the page look empty and causes a layout jump when
/// the data arrives.
class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label});

  final String? label;

  @override
  Widget build(BuildContext context) => Center(
    child: Semantics(
      liveRegion: true,
      label: label ?? context.l10n.loading,
      child: const SizedBox(
        width: AppSizes.controlLarge,
        height: AppSizes.controlLarge,
        child: CircularProgressIndicator(strokeWidth: 2.5),
      ),
    ),
  );
}

/// Placeholder block used to build skeletons. A hairline shimmer runs across it,
/// unless the platform asked for reduced motion, in which case it stays a flat
/// block and the screen settles immediately.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({super.key, this.width, this.height = AppSpacing.smd, this.circle = false});

  /// A circle for avatars.
  const SkeletonBox.circle({super.key, required double diameter}) : width = diameter, height = diameter, circle = true;

  final double? width;
  final double height;

  /// Draws as a circle (avatars) instead of a rounded rectangle.
  final bool circle;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: AppDurations.slow);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final shape = widget.circle
        ? const CircleBorder()
        : RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sm));

    if (context.reduceMotion) {
      return Container(
        width: widget.width,
        height: widget.height,
        decoration: ShapeDecoration(color: palette.skeletonBase, shape: shape),
      );
    }

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final t = _controller.value;
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: ShapeDecoration(
            shape: shape,
            gradient: LinearGradient(
              begin: Alignment(-1 - 2 * (1 - t), 0),
              end: Alignment(1 - 2 * (1 - t), 0),
              colors: [palette.skeletonBase, palette.skeletonHighlight, palette.skeletonBase],
              stops: const [0.1, 0.5, 0.9],
            ),
          ),
        );
      },
    );
  }
}

/// One row of a conversation-list skeleton: avatar, name line, preview line.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.itemCount = 8});

  final int itemCount;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      itemCount: itemCount,
      itemBuilder: (context, index) => const Padding(
        padding: EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm + AppSpacing.xs),
        child: Row(
          children: [
            SkeletonBox(width: AppSizes.avatarLarge, height: AppSizes.avatarLarge),
            SizedBox(width: AppSpacing.smd),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonBox(width: 148, height: 14),
                  SizedBox(height: AppSpacing.sm),
                  SkeletonBox(width: 200, height: 12),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Full-page "nothing here" state with an optional call to action.
class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.icon, required this.title, this.message, this.action});

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final constrained = ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: AppSizes.contentMaxWidth),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: AppSizes.controlLarge * 1.5,
            height: AppSizes.controlLarge * 1.5,
            decoration: BoxDecoration(color: scheme.surfaceContainerHigh, shape: BoxShape.circle),
            child: Icon(icon, size: 32, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(title, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
          if (message != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              message!,
              style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
          ],
          if (action != null) ...[const SizedBox(height: AppSpacing.lg), action!],
        ],
      ),
    );

    return Center(
      child: SingleChildScrollView(padding: const EdgeInsets.all(AppSpacing.lg), child: constrained),
    );
  }
}

/// Full-page failure state. The retry is part of this view so every failure in
/// the app looks and behaves the same.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry, this.icon});

  final String message;
  final VoidCallback onRetry;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => EmptyView(
    icon: icon ?? Icons.cloud_off_outlined,
    title: context.l10n.somethingWentWrong,
    message: message,
    action: OutlinedButton.icon(
      onPressed: onRetry,
      icon: const Icon(Icons.refresh, size: AppSizes.iconMedium),
      label: Text(context.l10n.tryAgain),
    ),
  );
}

/// Inline notice above a form or a message. Announced live so a screen reader
/// hears the failure without the user having to go looking for it.
class ErrorBanner extends StatelessWidget {
  const ErrorBanner({super.key, required this.message, this.kind = ErrorBannerKind.error, this.onDismiss});

  final String message;
  final ErrorBannerKind kind;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = AppPalette.of(context);
    final (background, foreground, icon) = switch (kind) {
      ErrorBannerKind.error => (
        theme.colorScheme.errorContainer,
        theme.colorScheme.onErrorContainer,
        Icons.error_outline,
      ),
      ErrorBannerKind.warning => (palette.warningContainer, palette.onWarningContainer, Icons.warning_amber_rounded),
      ErrorBannerKind.success => (palette.successContainer, palette.onSuccessContainer, Icons.check_circle_outline),
      ErrorBannerKind.info => (palette.infoContainer, palette.onInfoContainer, Icons.info_outline),
    };

    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.smd),
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(AppRadius.md)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: AppSizes.iconMedium, color: foreground),
            const SizedBox(width: AppSpacing.smd),
            Expanded(
              child: Text(message, style: theme.textTheme.bodyMedium?.copyWith(color: foreground)),
            ),
            if (onDismiss != null) ...[
              const SizedBox(width: AppSpacing.sm),
              Tooltip(
                message: context.l10n.dismiss,
                child: InkResponse(
                  onTap: onDismiss,
                  radius: minTapTarget / 2,
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.xxs),
                    child: Icon(Icons.close, size: AppSizes.iconMedium, color: foreground),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

enum ErrorBannerKind { error, warning, success, info }

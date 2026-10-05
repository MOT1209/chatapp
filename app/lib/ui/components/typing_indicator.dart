import 'package:flutter/material.dart';

import '../l10n.dart';
import '../design/tokens.dart';

/// "Sara is typing…" with three dots that pulse in sequence.
///
/// The dots stop moving when the platform asked for reduced motion; the label
/// still appears, because the information itself is not decoration.
class TypingIndicator extends StatefulWidget {
  const TypingIndicator({super.key, required this.displayName});

  final String displayName;

  @override
  State<TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<TypingIndicator> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _controller.stop();
      _controller.value = 0.25;
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
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Semantics(
      liveRegion: true,
      label: context.l10n.typingNamed(widget.displayName),
      excludeSemantics: true,
      child: Padding(
        padding: EdgeInsets.zero,
        child: Row(
          children: [
            SizedBox(
              width: AppSizes.avatarSmall,
              height: AppSizes.avatarSmall,
              child: AnimatedBuilder(
                animation: _controller,
                builder: (context, _) => Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: List.generate(3, (i) {
                    // Three staggered pulses over one 1200ms loop.
                    final phase = (_controller.value - i * 0.18) % 1.0;
                    final lift = (phase < 0.5 ? phase * 2 : 2 - phase * 2) * 0.6;
                    return Transform.translate(
                      offset: Offset(0, -lift * AppSizes.iconSmall * 0.5),
                      child: Container(
                        width: AppSizes.dot,
                        height: AppSizes.dot,
                        decoration: BoxDecoration(
                          color: scheme.onSurfaceVariant.withValues(alpha: 0.5 + lift * 0.5),
                          shape: BoxShape.circle,
                        ),
                      ),
                    );
                  }),
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Flexible(
              child: Text(
                context.l10n.typingNamed(widget.displayName),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

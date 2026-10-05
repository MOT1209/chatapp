import 'package:flutter/material.dart';

/// Colours the chat UI needs that a Material [ColorScheme] does not name:
/// presence, warning, the read-receipt blue, skeleton placeholders and the
/// message bubble palette.
///
/// It is a [ThemeExtension] so every colour follows the active brightness and is
/// reachable with `AppPalette.of(context)` instead of a hardcoded literal.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.online,
    required this.away,
    required this.onBubbleMine,
    required this.bubbleMine,
    required this.onBubbleTheirs,
    required this.bubbleTheirs,
    required this.onBubbleDeleted,
    required this.bubbleDeleted,
    required this.readReceipt,
    required this.warning,
    required this.warningContainer,
    required this.onWarningContainer,
    required this.infoContainer,
    required this.onInfoContainer,
    required this.successContainer,
    required this.onSuccessContainer,
    required this.skeletonBase,
    required this.skeletonHighlight,
  });

  /// Presence dot and "Online" label when the participant is reachable.
  final Color online;

  /// "Last seen" / away dot.
  final Color away;

  final Color bubbleMine;
  final Color onBubbleMine;
  final Color bubbleTheirs;
  final Color onBubbleTheirs;

  /// Tombstone for a deleted message.
  final Color bubbleDeleted;
  final Color onBubbleDeleted;

  /// The "Read" tick. Deliberately not `primary`, so a read receipt never
  /// disappears into the bubble it sits on.
  final Color readReceipt;

  final Color warning;
  final Color warningContainer;
  final Color onWarningContainer;
  final Color infoContainer;
  final Color onInfoContainer;
  final Color successContainer;
  final Color onSuccessContainer;

  /// Placeholder blocks shown while a list loads.
  final Color skeletonBase;
  final Color skeletonHighlight;

  static AppPalette of(BuildContext context) => Theme.of(context).extension<AppPalette>()!;

  factory AppPalette.light(ColorScheme scheme) => AppPalette(
    online: const Color(0xFF15A34A),
    away: const Color(0xFFB45309),
    bubbleMine: scheme.primary,
    onBubbleMine: scheme.onPrimary,
    bubbleTheirs: scheme.surfaceContainerHighest,
    onBubbleTheirs: scheme.onSurface,
    bubbleDeleted: scheme.surfaceContainerLow,
    onBubbleDeleted: scheme.onSurfaceVariant,
    readReceipt: scheme.onPrimary,
    warning: const Color(0xFF92400E),
    warningContainer: const Color(0xFFFEF3C7),
    onWarningContainer: const Color(0xFF451A03),
    infoContainer: scheme.secondaryContainer,
    onInfoContainer: scheme.onSecondaryContainer,
    successContainer: const Color(0xFFDCFCE7),
    onSuccessContainer: const Color(0xFF14532D),
    skeletonBase: scheme.surfaceContainerHighest,
    skeletonHighlight: scheme.surface,
  );

  factory AppPalette.dark(ColorScheme scheme) => AppPalette(
    online: const Color(0xFF4ADE80),
    away: const Color(0xFFFBBF24),
    bubbleMine: scheme.primary,
    onBubbleMine: scheme.onPrimary,
    bubbleTheirs: scheme.surfaceContainerHigh,
    onBubbleTheirs: scheme.onSurface,
    bubbleDeleted: scheme.surfaceContainerLow,
    onBubbleDeleted: scheme.onSurfaceVariant,
    readReceipt: scheme.onPrimary,
    warning: const Color(0xFFFCD34D),
    warningContainer: const Color(0xFF451A03),
    onWarningContainer: const Color(0xFFFEF3C7),
    infoContainer: scheme.secondaryContainer,
    onInfoContainer: scheme.onSecondaryContainer,
    successContainer: const Color(0xFF14532D),
    onSuccessContainer: const Color(0xFFDCFCE7),
    skeletonBase: scheme.surfaceContainerHigh,
    skeletonHighlight: scheme.surfaceContainerHighest,
  );

  @override
  AppPalette copyWith({
    Color? online,
    Color? away,
    Color? bubbleMine,
    Color? onBubbleMine,
    Color? bubbleTheirs,
    Color? onBubbleTheirs,
    Color? bubbleDeleted,
    Color? onBubbleDeleted,
    Color? readReceipt,
    Color? warning,
    Color? warningContainer,
    Color? onWarningContainer,
    Color? infoContainer,
    Color? onInfoContainer,
    Color? successContainer,
    Color? onSuccessContainer,
    Color? skeletonBase,
    Color? skeletonHighlight,
  }) => AppPalette(
    online: online ?? this.online,
    away: away ?? this.away,
    bubbleMine: bubbleMine ?? this.bubbleMine,
    onBubbleMine: onBubbleMine ?? this.onBubbleMine,
    bubbleTheirs: bubbleTheirs ?? this.bubbleTheirs,
    onBubbleTheirs: onBubbleTheirs ?? this.onBubbleTheirs,
    bubbleDeleted: bubbleDeleted ?? this.bubbleDeleted,
    onBubbleDeleted: onBubbleDeleted ?? this.onBubbleDeleted,
    readReceipt: readReceipt ?? this.readReceipt,
    warning: warning ?? this.warning,
    warningContainer: warningContainer ?? this.warningContainer,
    onWarningContainer: onWarningContainer ?? this.onWarningContainer,
    infoContainer: infoContainer ?? this.infoContainer,
    onInfoContainer: onInfoContainer ?? this.onInfoContainer,
    successContainer: successContainer ?? this.successContainer,
    onSuccessContainer: onSuccessContainer ?? this.onSuccessContainer,
    skeletonBase: skeletonBase ?? this.skeletonBase,
    skeletonHighlight: skeletonHighlight ?? this.skeletonHighlight,
  );

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppPalette(
      online: mix(online, other.online),
      away: mix(away, other.away),
      bubbleMine: mix(bubbleMine, other.bubbleMine),
      onBubbleMine: mix(onBubbleMine, other.onBubbleMine),
      bubbleTheirs: mix(bubbleTheirs, other.bubbleTheirs),
      onBubbleTheirs: mix(onBubbleTheirs, other.onBubbleTheirs),
      bubbleDeleted: mix(bubbleDeleted, other.bubbleDeleted),
      onBubbleDeleted: mix(onBubbleDeleted, other.onBubbleDeleted),
      readReceipt: mix(readReceipt, other.readReceipt),
      warning: mix(warning, other.warning),
      warningContainer: mix(warningContainer, other.warningContainer),
      onWarningContainer: mix(onWarningContainer, other.onWarningContainer),
      infoContainer: mix(infoContainer, other.infoContainer),
      onInfoContainer: mix(onInfoContainer, other.onInfoContainer),
      successContainer: mix(successContainer, other.successContainer),
      onSuccessContainer: mix(onSuccessContainer, other.onSuccessContainer),
      skeletonBase: mix(skeletonBase, other.skeletonBase),
      skeletonHighlight: mix(skeletonHighlight, other.skeletonHighlight),
    );
  }
}

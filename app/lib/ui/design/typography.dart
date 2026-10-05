import 'package:flutter/material.dart';

import 'tokens.dart';

/// The type scale. Sizes follow Material 3, but line heights are raised
/// because the app ships Arabic: `NotoSansArabic` needs more leading than the
/// Latin default to stay readable, and one scale has to serve both.
abstract final class AppTypography {
  static TextTheme scaleFor(Brightness brightness) {
    final base = ThemeData(brightness: brightness).textTheme;
    return base
        .copyWith(
          displaySmall: base.displaySmall?.copyWith(fontSize: 34, height: 1.2, letterSpacing: -0.5),
          headlineMedium: base.headlineMedium?.copyWith(fontSize: 28, height: 1.2, letterSpacing: -0.4),
          headlineSmall: base.headlineSmall?.copyWith(fontSize: 24, height: 1.25, letterSpacing: -0.3),
          titleLarge: base.titleLarge?.copyWith(fontSize: 20, height: 1.25, letterSpacing: -0.2),
          titleMedium: base.titleMedium?.copyWith(fontSize: 16, height: 1.3, fontWeight: FontWeight.w600),
          titleSmall: base.titleSmall?.copyWith(fontSize: 14, height: 1.3, fontWeight: FontWeight.w600),
          bodyLarge: base.bodyLarge?.copyWith(fontSize: 16, height: 1.45),
          bodyMedium: base.bodyMedium?.copyWith(fontSize: 14, height: 1.45),
          bodySmall: base.bodySmall?.copyWith(fontSize: 12, height: 1.4),
          labelLarge: base.labelLarge?.copyWith(fontSize: 14, height: 1.3, fontWeight: FontWeight.w600),
          labelMedium: base.labelMedium?.copyWith(fontSize: 12, height: 1.3, fontWeight: FontWeight.w500),
          labelSmall: base.labelSmall?.copyWith(fontSize: 11, height: 1.3, fontWeight: FontWeight.w500),
        )
        // Arabic (and any future script the seed font lacks) falls back without
        // the caller having to set a font family per widget.
        .apply(fontFamilyFallback: const [arabicFontFamily]);
  }
}

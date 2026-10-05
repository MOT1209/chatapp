import 'package:flutter/material.dart';

import 'design/app_theme.dart';

export 'design/app_colors.dart';
export 'design/app_theme.dart' show brandSeed;
export 'design/tokens.dart';
export 'design/typography.dart';

/// Kept as the single entry point for theming; the tokens themselves live in
/// `design/` so they can be reviewed as one system.
ThemeData buildTheme(Brightness brightness) => buildAppTheme(brightness);

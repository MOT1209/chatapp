import 'package:flutter/widgets.dart';

/// Material 3 window size classes.
enum ScreenSize { compact, medium, expanded }

ScreenSize screenSizeOf(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  if (width < 600) return ScreenSize.compact;
  if (width < 1024) return ScreenSize.medium;
  return ScreenSize.expanded;
}

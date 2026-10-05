import 'package:flutter/widgets.dart';

/// Material 3 window size classes.
enum ScreenSize { compact, medium, expanded }

ScreenSize screenSizeOf(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  if (width < 600) return ScreenSize.compact;
  if (width < 1024) return ScreenSize.medium;
  return ScreenSize.expanded;
}

/// Narrowest window that shows the conversation list and an open chat side by side.
///
/// Below it the navigation rail stays but only one of the two is shown at a time, like the
/// phone layout. With the rail (80) and the list (300) taking 382 px, a 600 px window left the
/// chat just 218 px: bubbles, the composer and the header all collapsed. 720 leaves 338 px,
/// which still fits a bubble, a composer and a name at larger text sizes.
const double kTwoPaneMinWidth = 720;

bool useTwoPane(BuildContext context) => MediaQuery.sizeOf(context).width >= kTwoPaneMinWidth;

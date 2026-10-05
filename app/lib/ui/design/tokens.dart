import 'package:flutter/material.dart';

/// Bundled so Arabic renders offline and on web without a font CDN.
const arabicFontFamily = 'NotoSansArabic';

/// Minimum touch/click target (Material + WCAG guidance), used for buttons,
/// icon buttons and list rows people tap or click.
const minTapTarget = 48.0;

/// The spacing grid. Every gap, pad and inset in the app comes from here so
/// rhythm stays consistent; do not hardcode pixel values in widgets.
///
/// The scale is intentionally dense at the small end: chat bubbles, chips and
/// icon gaps need 2/4/6/8px steps, while screen padding needs 16/24/32/48.
abstract final class AppSpacing {
  /// Hairline nudge, e.g. between an icon and its label.
  static const xxs = 2.0;

  /// Tight stack inside one component (time under a bubble).
  static const xs = 4.0;

  /// Gap between two small inline elements.
  static const xsm = 6.0;

  /// Default gap inside a component.
  static const sm = 8.0;

  /// The most common gap: chip padding, icon-to-text, list tile insets.
  static const smd = 12.0;

  /// Default screen padding and gap between form fields.
  static const md = 16.0;

  /// Gap between sections.
  static const lg = 24.0;

  /// Gap between major blocks.
  static const xl = 32.0;

  /// Auth/splash breathing room.
  static const xxl = 48.0;

  /// Bottom clearance for a list that scrolls under a floating action button.
  static const xxxl = 88.0;
}

/// Corner radii. Bubbles use [xs] for the tail corner and [lg] everywhere else,
/// which is what makes a bubble read as "mine" or "theirs" at a glance.
abstract final class AppRadius {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;

  /// Fully rounded (badges, chips, presence dots).
  static const pill = 999.0;
}

/// Surface elevation. Material 3 themes surfaces with tonal colour rather than
/// shadow, so these are for the few places that must float above the page:
/// menus, dialogs and the "scroll to newest" button.
abstract final class AppElevation {
  static const none = 0.0;
  static const low = 2.0;
  static const medium = 6.0;
  static const high = 12.0;
}

/// Fixed control and layout sizes that are not derived from spacing.
abstract final class AppSizes {
  /// Dense toolbars and chips.
  static const controlCompact = 40.0;

  /// Default interactive control height, equal to the accessible tap target.
  static const controlDefault = minTapTarget;

  /// Primary call-to-action rows on touch.
  static const controlLarge = 56.0;

  /// Conversation sidebar on medium (tablet) widths.
  static const sidebarMedium = 300.0;

  /// Conversation sidebar on expanded (desktop) widths.
  static const sidebarExpanded = 360.0;

  /// Long-form content (profile, settings, forms) never grows past this.
  static const contentMaxWidth = 560.0;

  /// Sign-in / sign-up forms.
  static const authMaxWidth = 420.0;

  /// Widest a chat bubble may get before it wraps.
  static const bubbleMaxWidth = 560.0;

  static const avatarSmall = 18.0;
  static const avatarMedium = 22.0;
  static const avatarLarge = 48.0;

  static const iconSmall = 16.0;
  static const iconMedium = 20.0;
  static const iconLarge = 24.0;

  /// One typing-indicator dot.
  static const dot = 6.0;
}

/// Motion durations. Always used through [AppMotion] so the platform's
/// "reduce motion" setting is honoured instead of hardcoded per widget.
abstract final class AppDurations {
  static const fast = Duration(milliseconds: 150);
  static const medium = Duration(milliseconds: 250);
  static const slow = Duration(milliseconds: 400);

  /// How long the "Connected" confirmation stays in the connection banner.
  static const bannerVisible = Duration(seconds: 2);

  /// A first connection that succeeds this fast never shows a banner.
  static const connectingGrace = Duration(milliseconds: 800);
}

abstract final class AppCurves {
  static const standard = Curves.easeOutCubic;
  static const decelerate = Curves.easeOut;
  static const emphasized = Curves.easeInOutCubicEmphasized;
}

/// The platform asked for less motion (Reduce Motion / TalkBack). Widgets should
/// animate through [AppMotion.motion] so the duration collapses to zero here.
extension AppMotion on BuildContext {
  static bool _reduced(BuildContext context) {
    final data = MediaQuery.maybeOf(context);
    if (data == null) return false;
    return data.disableAnimations || data.accessibleNavigation;
  }

  bool get reduceMotion => _reduced(this);

  /// [duration], or zero when the user asked for reduced motion.
  Duration motion(Duration duration) => _reduced(this) ? Duration.zero : duration;
}

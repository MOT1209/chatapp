import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'tokens.dart';
import 'typography.dart';

/// Brand seed. Everything else is generated so light and dark stay in step.
const brandSeed = Color(0xFF2563EB);

/// Assembles the whole [ThemeData] from the tokens. Every widget in the app
/// reads from this theme or from [AppPalette]; nothing hardcodes a colour,
/// radius or spacing value of its own.
ThemeData buildAppTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(seedColor: brandSeed, brightness: brightness);
  final palette = brightness == Brightness.dark ? AppPalette.dark(scheme) : AppPalette.light(scheme);
  final outline = OutlineInputBorder(borderRadius: BorderRadius.circular(AppRadius.md), borderSide: BorderSide.none);

  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    visualDensity: VisualDensity.adaptivePlatformDensity,
    scaffoldBackgroundColor: scheme.surface,
    textTheme: AppTypography.scaleFor(brightness),
    extensions: <ThemeExtension<dynamic>>[palette],

    // A pointer-driven hover tint; touch platforms simply never fire it.
    hoverColor: scheme.primary.withValues(alpha: 0.04),
    highlightColor: scheme.primary.withValues(alpha: 0.08),
    splashFactory: InkSparkle.splashFactory,

    dividerTheme: DividerThemeData(color: scheme.outlineVariant, thickness: 1, space: 1),
    iconTheme: IconThemeData(color: scheme.onSurfaceVariant, size: AppSizes.iconMedium),

    appBarTheme: AppBarTheme(
      centerTitle: false,
      scrolledUnderElevation: 0,
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: AppTypography.scaleFor(brightness).titleLarge,
    ),

    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surfaceContainerLowest,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.smd + AppSpacing.xs),
      border: outline,
      enabledBorder: outline,
      focusedBorder: outline.copyWith(borderSide: BorderSide(color: scheme.primary, width: 2)),
      errorBorder: outline.copyWith(borderSide: BorderSide(color: scheme.error, width: 1.5)),
      focusedErrorBorder: outline.copyWith(borderSide: BorderSide(color: scheme.error, width: 2)),
      prefixIconColor: scheme.onSurfaceVariant,
      suffixIconColor: scheme.onSurfaceVariant,
      helperMaxLines: 3,
      errorMaxLines: 3,
    ),

    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(AppSizes.controlDefault),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(AppSizes.controlDefault),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        side: BorderSide(color: scheme.outline),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(minTapTarget, minTapTarget),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sm)),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(minimumSize: const Size(minTapTarget, minTapTarget)),
    ),

    floatingActionButtonTheme: FloatingActionButtonThemeData(
      elevation: AppElevation.low,
      highlightElevation: AppElevation.medium,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
    ),

    navigationBarTheme: NavigationBarThemeData(
      elevation: 0,
      height: AppSizes.controlLarge + AppSpacing.xxl,
      backgroundColor: scheme.surfaceContainer,
      indicatorColor: scheme.secondaryContainer,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
    ),
    navigationRailTheme: NavigationRailThemeData(
      elevation: 0,
      backgroundColor: scheme.surface,
      indicatorColor: scheme.secondaryContainer,
      selectedIconTheme: IconThemeData(color: scheme.onSecondaryContainer),
      unselectedIconTheme: IconThemeData(color: scheme.onSurfaceVariant),
    ),

    cardTheme: CardThemeData(
      elevation: 0,
      color: scheme.surfaceContainerLow,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
    ),

    listTileTheme: ListTileThemeData(
      minVerticalPadding: AppSpacing.sm + AppSpacing.xs,
      horizontalTitleGap: AppSpacing.smd,
      contentPadding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.md, AppSpacing.xs, AppSpacing.md, AppSpacing.xs),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
    ),

    dialogTheme: DialogThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.xl)),
      backgroundColor: scheme.surfaceContainerLow,
      surfaceTintColor: Colors.transparent,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      showDragHandle: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl))),
    ),

    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      insetPadding: const EdgeInsets.all(AppSpacing.md),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
      backgroundColor: scheme.inverseSurface,
      contentTextStyle: TextStyle(color: scheme.onInverseSurface),
      actionTextColor: scheme.inversePrimary,
    ),

    badgeTheme: BadgeThemeData(
      backgroundColor: scheme.primary,
      textColor: scheme.onPrimary,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs + 2, vertical: AppSpacing.xxs),
      textStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
    ),

    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
      side: BorderSide(color: scheme.outlineVariant),
      labelStyle: const TextStyle(fontWeight: FontWeight.w500),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
    ),

    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: scheme.primary,
      linearTrackColor: scheme.surfaceContainerHighest,
      circularTrackColor: scheme.surfaceContainerHighest,
    ),

    tooltipTheme: TooltipThemeData(
      waitDuration: const Duration(milliseconds: 500),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
      decoration: BoxDecoration(color: scheme.inverseSurface, borderRadius: BorderRadius.circular(AppRadius.sm)),
      textStyle: TextStyle(color: scheme.onInverseSurface, fontSize: 12),
    ),

    scrollbarTheme: ScrollbarThemeData(
      thickness: const WidgetStatePropertyAll(6),
      radius: const Radius.circular(AppRadius.pill),
      thumbColor: WidgetStatePropertyAll(scheme.outline),
    ),

    textSelectionTheme: TextSelectionThemeData(
      cursorColor: scheme.primary,
      selectionColor: scheme.primary.withValues(alpha: 0.24),
      selectionHandleColor: scheme.primary,
    ),

    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
        TargetPlatform.iOS: FadeForwardsPageTransitionsBuilder(),
      },
    ),
  );
}

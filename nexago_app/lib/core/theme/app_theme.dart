import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

abstract final class AppTheme {
  AppTheme._();

  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData get light => _build(Brightness.light);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final colorScheme = isDark ? _darkColorScheme : _lightColorScheme;

    final inter = GoogleFonts.interTextTheme();
    final sora = GoogleFonts.soraTextTheme();
    final textTheme = inter.copyWith(
      displayLarge: sora.displayLarge,
      displayMedium: sora.displayMedium,
      displaySmall: sora.displaySmall,
      headlineLarge: sora.headlineLarge,
      headlineMedium: sora.headlineMedium,
      headlineSmall: sora.headlineSmall,
      titleLarge: sora.titleLarge,
      titleMedium: sora.titleMedium,
      titleSmall: sora.titleSmall,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor:
          isDark ? AppColors.canvas : AppColors.canvasLight,
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: isDark ? AppColors.canvas : AppColors.canvasLight,
        foregroundColor:
            isDark ? AppColors.onSurface : AppColors.onSurfaceLight,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: isDark ? AppColors.surfaceCard : AppColors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      dividerColor: colorScheme.outline.withValues(alpha: 0.12),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColors.brand,
        foregroundColor: AppColors.black,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.black,
          elevation: 0,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor:
              isDark ? AppColors.onSurface : AppColors.onSurfaceLight,
          side: BorderSide(
            color: colorScheme.outline.withValues(alpha: 0.35),
          ),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: isDark ? AppColors.surfaceSheet : AppColors.white,
        indicatorColor: AppColors.brand.withValues(alpha: 0.15),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 11,
              color: isDark ? AppColors.onSurface : AppColors.brand,
            );
          }
          return TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 11,
            color: AppColors.onSurfaceMuted,
          );
        }),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: isDark ? AppColors.surfaceSheet : AppColors.white,
        selectedItemColor:
            isDark ? AppColors.onSurface : AppColors.brand,
        unselectedItemColor: AppColors.onSurfaceMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.surfaceRaised,
        contentTextStyle: const TextStyle(color: AppColors.onSurface),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  static final ColorScheme _darkColorScheme = ColorScheme.dark(
    primary: AppColors.brand,
    onPrimary: AppColors.black,
    secondary: AppColors.brandHover,
    onSecondary: AppColors.black,
    surface: AppColors.surfaceCard,
    onSurface: AppColors.onSurface,
    surfaceContainerLowest: AppColors.canvas,
    surfaceContainerLow: AppColors.surfaceCard,
    surfaceContainer: AppColors.surfaceRaised,
    surfaceContainerHigh: AppColors.surfaceRaised,
    surfaceContainerHighest: AppColors.surfaceSheet,
    onSurfaceVariant: AppColors.onSurfaceMuted,
    outline: AppColors.onSurfaceMuted.withValues(alpha: 0.35),
    error: AppColors.live,
    onError: AppColors.white,
  );

  static final ColorScheme _lightColorScheme = ColorScheme.light(
    primary: AppColors.brand,
    onPrimary: AppColors.black,
    secondary: AppColors.brandHover,
    onSecondary: AppColors.black,
    surface: AppColors.white,
    onSurface: AppColors.onSurfaceLight,
    surfaceContainerLowest: AppColors.canvasLight,
    surfaceContainerLow: AppColors.white,
    surfaceContainer: AppColors.white,
    surfaceContainerHigh: const Color(0xFFF0EDE8),
    surfaceContainerHighest: const Color(0xFFE8E4DE),
    onSurfaceVariant: AppColors.onSurfaceMutedLight,
    outline: AppColors.onSurfaceMutedLight.withValues(alpha: 0.4),
    error: AppColors.live,
    onError: AppColors.white,
  );
}

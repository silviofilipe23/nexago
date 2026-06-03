import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_theme.dart';

/// Cores de UI derivadas do [ColorScheme] ativo.
///
/// Em widgets, prefira [BuildContext.themeColors] em vez de
/// `AppColors.canvas`, `AppColors.onSurface`, etc.
class AppThemeColors {
  const AppThemeColors(this._scheme);

  final ColorScheme _scheme;

  bool get isDark => _scheme.brightness == Brightness.dark;

  Color get canvas => _scheme.surfaceContainerLowest;
  Color get surfaceCard => _scheme.surface;
  Color get surfaceRaised => _scheme.surfaceContainerHigh;
  Color get surfaceSheet => _scheme.surfaceContainerHighest;
  Color get onSurface => _scheme.onSurface;
  Color get onSurfaceMuted => _scheme.onSurfaceVariant;
  Color get outline => _scheme.outline;

  Color get brand => AppColors.brand;
  Color get brandHover => AppColors.brandHover;
  Color get brandPressed => AppColors.brandPressed;
  Color get live => AppColors.live;
  Color get win => AppColors.win;
  Color get pending => AppColors.pending;
  Color get white => AppColors.white;
  Color get black => AppColors.black;

  static AppThemeColors ofBrightness(Brightness brightness) {
    final theme =
        brightness == Brightness.dark ? AppTheme.dark : AppTheme.light;
    return AppThemeColors(theme.colorScheme);
  }
}

extension AppThemeColorsContext on BuildContext {
  AppThemeColors get themeColors =>
      AppThemeColors(Theme.of(this).colorScheme);
}

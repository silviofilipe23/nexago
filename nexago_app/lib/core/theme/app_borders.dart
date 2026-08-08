import 'package:flutter/widgets.dart';

import 'app_theme_colors.dart';

/// Bordas padrão NexaGO — normaliza os alphas usados em superfícies.
abstract final class AppBorders {
  AppBorders._();

  static const double subtleAlpha = 0.08;
  static const double baseAlpha = 0.12;
  static const double strongAlpha = 0.22;

  static BorderSide subtleSide(AppThemeColors colors) =>
      BorderSide(color: colors.onSurfaceMuted.withValues(alpha: subtleAlpha));

  static BorderSide baseSide(AppThemeColors colors) =>
      BorderSide(color: colors.onSurfaceMuted.withValues(alpha: baseAlpha));

  static BorderSide strongSide(AppThemeColors colors) =>
      BorderSide(color: colors.onSurfaceMuted.withValues(alpha: strongAlpha));

  static Border subtle(AppThemeColors colors) =>
      Border.fromBorderSide(subtleSide(colors));

  static Border base(AppThemeColors colors) =>
      Border.fromBorderSide(baseSide(colors));

  static Border strong(AppThemeColors colors) =>
      Border.fromBorderSide(strongSide(colors));
}

import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Constantes visuais compartilhadas do painel arena.
abstract final class ArenaDashboardTokens {
  ArenaDashboardTokens._();

  static const double horizontalPadding = 20;
  static const double sectionGap = 28;
  static const double cardRadius = 16;
  static const double chipRadius = 999;

  static BoxDecoration cardDecoration(BuildContext context, {Color? color}) =>
      BoxDecoration(
        color: color ?? context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(cardRadius),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      );
}

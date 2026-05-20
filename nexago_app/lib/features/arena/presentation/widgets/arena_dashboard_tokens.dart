import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

/// Constantes visuais compartilhadas do painel arena.
abstract final class ArenaDashboardTokens {
  ArenaDashboardTokens._();

  static const double horizontalPadding = 20;
  static const double sectionGap = 28;
  static const double cardRadius = 16;
  static const double chipRadius = 999;

  static BoxDecoration cardDecoration({Color? color}) => BoxDecoration(
        color: color ?? AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(cardRadius),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      );
}

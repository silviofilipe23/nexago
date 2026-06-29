import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Constantes visuais compartilhadas do painel arena.
abstract final class ArenaDashboardTokens {
  ArenaDashboardTokens._();

  static const double horizontalPadding = 20;
  static const double sectionGap = 28;
  static const double cardRadius = 16;
  static const double chipRadius = 999;

  /// Altura da tab bar do shell arena (`NexaBottomNavBar.height`).
  static const double shellBottomNavHeight = 100;

  /// Padding inferior para conteúdo scrollável acima da tab bar flutuante.
  static double shellScrollBottomPadding(BuildContext context) {
    return shellBottomNavHeight + MediaQuery.paddingOf(context).bottom + 24;
  }

  /// Espaço inferior do FAB acima da tab bar do shell.
  static double shellFabBottomPadding(BuildContext context) {
    return shellBottomNavHeight + MediaQuery.paddingOf(context).bottom + 12;
  }

  /// Padding inferior de listas com FAB flutuante no shell arena.
  static double shellFabScrollBottomPadding(BuildContext context) {
    return shellFabBottomPadding(context) + 56;
  }

  static ScrollPhysics get shellScrollPhysics =>
      const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics());

  static BoxDecoration cardDecoration(BuildContext context, {Color? color}) =>
      BoxDecoration(
        color: color ?? context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(cardRadius),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      );
}

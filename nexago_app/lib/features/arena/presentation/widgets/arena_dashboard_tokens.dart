import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Constantes visuais compartilhadas do painel arena.
abstract final class ArenaDashboardTokens {
  ArenaDashboardTokens._();

  static const double horizontalPadding = AppSpacing.screenH;
  static const double sectionGap = AppSpacing.sectionGap;
  static const double cardRadius = AppRadii.lg;
  static const double chipRadius = AppRadii.pill;

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

  /// Recuo para o `floatingActionButton` de uma tela do shell ficar logo
  /// acima da cápsula da tab bar.
  ///
  /// O `Scaffold` da tela já sobe o FAB pela área segura do aparelho
  /// (`viewPadding.bottom`, a home indicator) e pela margem de 16. A cápsula
  /// fica com o topo a ~[shellBottomNavHeight] da borda no iOS; no Android
  /// ela sobe pelo inset do sistema (ver `_groundedBottomInset` da tab bar).
  /// O recuo é só o que falta até ali. Não usar `padding.bottom`: no shell
  /// (`extendBody`) ele já soma a tab bar, e a conta antiga, que somava a
  /// barra de novo, levava o botão para o meio da tela.
  static double shellFabLift(BuildContext context) {
    final systemInset = MediaQuery.viewPaddingOf(context).bottom;
    final grounded = systemInset <= 0
        ? 6.0
        : Theme.of(context).platform == TargetPlatform.iOS
            ? 0.0
            : systemInset;
    final target = shellBottomNavHeight + grounded;
    final applied = kFloatingActionButtonMargin + systemInset;
    return math.max(0, target - applied);
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

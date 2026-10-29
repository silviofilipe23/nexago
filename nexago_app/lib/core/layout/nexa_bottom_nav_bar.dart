export 'nexa_bottom_nav_models.dart';

import 'package:flutter/material.dart';
import 'package:native_liquid_glass/native_liquid_glass.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme_colors.dart';
import 'nexa_bottom_nav_models.dart';
import 'nexa_liquid_glass_tab_bar.dart';
import 'nexa_native_liquid_glass.dart';
import 'shell_tab_bar_collapse.dart';

/// Bottom navigation Liquid Glass — nativo no iOS 26+, cápsula NexaGO nos demais.
class NexaBottomNavBar extends StatelessWidget {
  const NexaBottomNavBar({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
    this.centerAction,
    this.selectedItemColor = AppColors.brand,
    this.unselectedItemColor,
    this.uppercaseLabels = false,
    this.height = 100,
    this.showLabels = true,
    this.labelTextStyle,
    this.horizontalMargin = 16,
    this.bottomMargin = 0,
    this.collapseProgress = 0,
    this.isScrolling = false,
    this.capsuleBuilder,
  });

  final List<NexaBottomNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;
  final NexaBottomNavAction? centerAction;
  final Color selectedItemColor;
  final Color? unselectedItemColor;
  final bool uppercaseLabels;
  final double height;
  final bool showLabels;
  final TextStyle? labelTextStyle;
  final double horizontalMargin;
  final double bottomMargin;
  final double collapseProgress;

  /// Repassado à cápsula Flutter (fallback não-nativo) pra suspender o blur
  /// ao vivo enquanto o conteúdo atrás dela está rolando.
  final bool isScrolling;

  /// Embrulha a cápsula em si, nativa ou Flutter (sem margens nem sombra).
  /// Ex.: o tour da Início marca o retângulo exato dela.
  final Widget Function(Widget capsule)? capsuleBuilder;

  static const double _glassOverflow = 20;

  @override
  Widget build(BuildContext context) {
    // A barra fica sempre expandida, com rótulos, nas duas plataformas.
    // Minimizada (só ícones — sempre no Android, ao rolar no iOS) os atletas
    // não sabiam o que cada aba era: ícone sem texto não se explica. O
    // [collapseProgress] segue chegando das shells, mas não encolhe mais nada.
    const effectiveCollapseProgress = 0.0;
    return ListenableBuilder(
      listenable: Listenable.merge([
        nexaNativeLiquidGlassEnabled,
        nexaPopupRouteDepth,
      ]),
      builder: (context, _) {
        // Com modal aberto a barra nativa encobriria o modal (ver
        // [nexaPopupRouteDepth]); por baixo da película, a cápsula Flutter
        // passa despercebida.
        if (nexaNativeLiquidGlassEnabled.value &&
            nexaPopupRouteDepth.value == 0 &&
            NativeLiquidGlassUtils.supportsLiquidGlass &&
            items.length >= 2) {
          return _buildNativeBar(context, effectiveCollapseProgress);
        }
        return _buildGlassBar(context, effectiveCollapseProgress);
      },
    );
  }

  Widget _buildNativeBar(BuildContext context, double collapseProgress) {
    final screenWidth = MediaQuery.sizeOf(context).width;
    final barWidth = screenWidth - (horizontalMargin * 2);
    final glassItems = items
        .map((item) => item.toLiquidGlassItem(selectedColor: selectedItemColor))
        .toList();
    final t = collapseProgress.clamp(0.0, 1.0);
    final rawHeight = ShellTabBarCollapseController.collapsedHeight +
        (height + 0 - ShellTabBarCollapseController.collapsedHeight) * (1 - t);
    // O LiquidGlassTabBar nativo exige height >= 56 (alvo de toque). O estado
    // colapsado (50) fica abaixo disso, então aplicamos um piso de 56.
    const minNativeHeight = 64.0;
    final nativeHeight =
        rawHeight < minNativeHeight ? minNativeHeight : rawHeight;
    final labelsVisible = showLabels && t < 0.45;

    return NexaLiquidGlassNativeTabShell(
      height: nativeHeight,
      horizontalMargin: horizontalMargin,
      bottomMargin: bottomMargin,
      collapseProgress: t,
      capsuleBuilder: capsuleBuilder,
      child: LiquidGlassTabBar(
        width: barWidth,
        items: glassItems,
        currentIndex: currentIndex.clamp(0, items.length - 1),
        onTabSelected: onTap,
        height: nativeHeight,
        showLabels: labelsVisible,
        selectedItemColor: selectedItemColor,
        labelTextStyle: labelTextStyle ??
            TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              letterSpacing: uppercaseLabels ? 0.3 : 0,
            ),
        iosActionButton: centerAction?.toLiquidGlassItem(),
        onActionButtonPressed: centerAction?.onPressed,
      ),
    );
  }

  Widget _buildGlassBar(BuildContext context, double collapseProgress) {
    final muted = unselectedItemColor ?? context.themeColors.onSurfaceMuted;

    return NexaLiquidGlassTabBar(
      items: items,
      currentIndex: currentIndex,
      onTap: onTap,
      centerAction: centerAction,
      selectedColor: selectedItemColor,
      unselectedColor: muted,
      uppercaseLabels: uppercaseLabels,
      height: height,
      horizontalMargin: horizontalMargin,
      bottomMargin: bottomMargin,
      collapseProgress: collapseProgress,
      isScrolling: isScrolling,
      capsuleBuilder: capsuleBuilder,
    );
  }
}

/// Altura útil da barra (cápsula flutuante + safe area aproximada).
///
/// A barra fica sempre expandida (ver [NexaBottomNavBar.build]), então a
/// folga é a mesma nas duas plataformas. O [context] fica na assinatura pra
/// não mexer nas telas que já o passam.
double nexaBottomNavBarHeight(
  BuildContext context, {
  double barHeight = 75,
  double bottomMargin = 10,
}) =>
    barHeight + bottomMargin + NexaBottomNavBar._glassOverflow;

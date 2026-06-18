export 'nexa_bottom_nav_models.dart';

import 'package:flutter/material.dart';
import 'package:native_liquid_glass/native_liquid_glass.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme_colors.dart';
import 'nexa_bottom_nav_models.dart';
import 'nexa_liquid_glass_tab_bar.dart';
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
    this.height = 64,
    this.showLabels = true,
    this.labelTextStyle,
    this.horizontalMargin = 16,
    this.bottomMargin = 0,
    this.collapseProgress = 0,
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

  static const double _glassOverflow = 20;

  @override
  Widget build(BuildContext context) {
    if (NativeLiquidGlassUtils.supportsLiquidGlass && items.length >= 2) {
      return _buildNativeBar(context);
    }
    return _buildGlassBar(context);
  }

  Widget _buildNativeBar(BuildContext context) {
    final screenWidth = MediaQuery.sizeOf(context).width;
    final barWidth = screenWidth - (horizontalMargin * 2);
    final glassItems = items
        .map((item) => item.toLiquidGlassItem(selectedColor: selectedItemColor))
        .toList();
    final t = collapseProgress.clamp(0.0, 1.0);
    final rawHeight =
        ShellTabBarCollapseController.collapsedHeight +
        (height + 0 - ShellTabBarCollapseController.collapsedHeight) * (1 - t);
    // O LiquidGlassTabBar nativo exige height >= 56 (alvo de toque). O estado
    // colapsado (50) fica abaixo disso, então aplicamos um piso de 56.
    const minNativeHeight = 64.0;
    final nativeHeight = rawHeight < minNativeHeight
        ? minNativeHeight
        : rawHeight;
    final labelsVisible = showLabels && t < 0.45;

    return NexaLiquidGlassNativeTabShell(
      height: nativeHeight,
      horizontalMargin: horizontalMargin,
      bottomMargin: bottomMargin,
      collapseProgress: t,
      child: LiquidGlassTabBar(
        width: barWidth,
        items: glassItems,
        currentIndex: currentIndex.clamp(0, items.length - 1),
        onTabSelected: onTap,
        height: nativeHeight,
        showLabels: labelsVisible,
        selectedItemColor: selectedItemColor,
        labelTextStyle:
            labelTextStyle ??
            TextStyle(
              fontSize: uppercaseLabels ? 8 : 9,
              fontWeight: FontWeight.w500,
              letterSpacing: uppercaseLabels ? 0.3 : 0,
            ),
        iosActionButton: centerAction?.toLiquidGlassItem(),
        onActionButtonPressed: centerAction?.onPressed,
      ),
    );
  }

  Widget _buildGlassBar(BuildContext context) {
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
    );
  }
}

/// Altura útil da barra (cápsula flutuante + safe area aproximada).
double nexaBottomNavBarHeight({
  double barHeight = 64,
  double bottomMargin = 10,
}) => barHeight + bottomMargin + NexaBottomNavBar._glassOverflow;

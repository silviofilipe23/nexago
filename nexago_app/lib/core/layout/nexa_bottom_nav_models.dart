import 'package:flutter/material.dart';
import 'package:native_liquid_glass/native_liquid_glass.dart';

import '../theme/app_colors.dart';
import 'nexa_bottom_nav_icon_map.dart';

/// Item da barra inferior NexaGO.
class NexaBottomNavItem {
  const NexaBottomNavItem({
    required this.label,
    required this.icon,
    this.selectedIcon,
    this.sfSymbol,
    this.selectedSfSymbol,
    this.badge,
  });

  final String label;
  final IconData icon;
  final IconData? selectedIcon;
  final String? sfSymbol;
  final String? selectedSfSymbol;
  final String? badge;

  LiquidGlassTabItem toLiquidGlassItem({Color? selectedColor}) {
    final outline = sfSymbol ?? materialIconToSfSymbol(icon);
    final filled = selectedSfSymbol ??
        materialIconToSfSymbol(selectedIcon ?? icon) ??
        outline;

    return LiquidGlassTabItem(
      label: label,
      icon: outline != null
          ? NativeLiquidGlassIcon.sfSymbol(outline)
          : NativeLiquidGlassIcon.iconData(icon),
      selectedIcon: filled != null
          ? NativeLiquidGlassIcon.sfSymbol(filled)
          : NativeLiquidGlassIcon.iconData(selectedIcon ?? icon),
      iosBadgeValue: badge,
      selectedItemColor: selectedColor,
    );
  }
}

/// Ação central opcional (ex.: criar evento no organizador).
class NexaBottomNavAction {
  const NexaBottomNavAction({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.sfSymbol,
  });

  final String label;
  final IconData icon;
  final VoidCallback onPressed;
  final String? sfSymbol;

  LiquidGlassTabItem toLiquidGlassItem() {
    final symbol = sfSymbol ?? materialIconToSfSymbol(icon);
    return LiquidGlassTabItem(
      label: label,
      icon: symbol != null
          ? NativeLiquidGlassIcon.sfSymbol(symbol)
          : NativeLiquidGlassIcon.iconData(icon),
      selectedItemColor: AppColors.brand,
    );
  }
}

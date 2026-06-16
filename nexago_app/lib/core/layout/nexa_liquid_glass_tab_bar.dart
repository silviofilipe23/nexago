import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme_colors.dart';
import 'nexa_bottom_nav_models.dart';

/// Tab bar flutuante estilo Liquid Glass (blur + cápsula + pill ativo).
class NexaLiquidGlassTabBar extends StatelessWidget {
  const NexaLiquidGlassTabBar({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
    this.centerAction,
    this.selectedColor = AppColors.brand,
    this.unselectedColor,
    this.uppercaseLabels = false,
    this.height = 64,
    this.horizontalMargin = 16,
    this.bottomMargin = 10,
  });

  final List<NexaBottomNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;
  final NexaBottomNavAction? centerAction;
  final Color selectedColor;
  final Color? unselectedColor;
  final bool uppercaseLabels;
  final double height;
  final double horizontalMargin;
  final double bottomMargin;

  @override
  Widget build(BuildContext context) {
    final themeColors = context.themeColors;
    final tokens = _NexaGlassTabTokens.of(context, themeColors);
    final muted = unselectedColor ?? themeColors.onSurfaceMuted;
    final index = currentIndex.clamp(0, items.length - 1);

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          horizontalMargin,
          0,
          horizontalMargin,
          bottomMargin,
        ),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(height / 2),
            boxShadow: tokens.outerShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(height / 2),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: tokens.barFill,
                  borderRadius: BorderRadius.circular(height / 2),
                  border: Border.all(color: tokens.outerStroke, width: 0.8),
                ),
                child: SizedBox(
                  height: height,
                  child: centerAction == null
                      ? _TabRow(
                          items: items,
                          currentIndex: index,
                          onTap: onTap,
                          tokens: tokens,
                          selectedColor: selectedColor,
                          unselectedColor: muted,
                          uppercaseLabels: uppercaseLabels,
                        )
                      : _TabRowWithCenterAction(
                          items: items,
                          currentIndex: index,
                          onTap: onTap,
                          centerAction: centerAction!,
                          tokens: tokens,
                          selectedColor: selectedColor,
                          unselectedColor: muted,
                          uppercaseLabels: uppercaseLabels,
                        ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NexaGlassTabTokens {
  const _NexaGlassTabTokens({
    required this.barFill,
    required this.outerStroke,
    required this.selectionFill,
    required this.selectionStroke,
    required this.outerShadow,
  });

  final Color barFill;
  final Color outerStroke;
  final Color selectionFill;
  final Color selectionStroke;
  final List<BoxShadow> outerShadow;

  factory _NexaGlassTabTokens.of(BuildContext context, AppThemeColors colors) {
    final isDark = colors.isDark;
    return _NexaGlassTabTokens(
      barFill: isDark
          ? colors.surfaceSheet.withValues(alpha: 0.58)
          : colors.white.withValues(alpha: 0.72),
      outerStroke: isDark
          ? AppColors.white.withValues(alpha: 0.22)
          : AppColors.white.withValues(alpha: 0.65),
      selectionFill: isDark
          ? AppColors.white.withValues(alpha: 0.1)
          : AppColors.brand.withValues(alpha: 0.14),
      selectionStroke: isDark
          ? AppColors.white.withValues(alpha: 0.14)
          : AppColors.brand.withValues(alpha: 0.28),
      outerShadow: [
        BoxShadow(
          color: AppColors.black.withValues(alpha: isDark ? 0.45 : 0.14),
          blurRadius: 28,
          offset: const Offset(0, 10),
        ),
        BoxShadow(
          color: AppColors.brand.withValues(alpha: isDark ? 0.06 : 0.08),
          blurRadius: 40,
          spreadRadius: -4,
          offset: const Offset(0, 12),
        ),
      ],
    );
  }
}

class _TabRow extends StatelessWidget {
  const _TabRow({
    required this.items,
    required this.currentIndex,
    required this.onTap,
    required this.tokens,
    required this.selectedColor,
    required this.unselectedColor,
    required this.uppercaseLabels,
  });

  final List<NexaBottomNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;
  final _NexaGlassTabTokens tokens;
  final Color selectedColor;
  final Color unselectedColor;
  final bool uppercaseLabels;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final tabWidth = constraints.maxWidth / items.length;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            AnimatedPositioned(
              duration: const Duration(milliseconds: 280),
              curve: Curves.easeOutCubic,
              left: tabWidth * currentIndex + 4,
              width: tabWidth - 8,
              top: 4,
              bottom: 4,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: tokens.selectionFill,
                  border: Border.all(color: tokens.selectionStroke, width: 0.6),
                ),
              ),
            ),
            Row(
              children: [
                for (var i = 0; i < items.length; i++)
                  Expanded(
                    child: _GlassTabItem(
                      item: items[i],
                      selected: i == currentIndex,
                      onTap: () => onTap(i),
                      selectedColor: selectedColor,
                      unselectedColor: unselectedColor,
                      uppercaseLabels: uppercaseLabels,
                    ),
                  ),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _TabRowWithCenterAction extends StatelessWidget {
  const _TabRowWithCenterAction({
    required this.items,
    required this.currentIndex,
    required this.onTap,
    required this.centerAction,
    required this.tokens,
    required this.selectedColor,
    required this.unselectedColor,
    required this.uppercaseLabels,
  });

  final List<NexaBottomNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;
  final NexaBottomNavAction centerAction;
  final _NexaGlassTabTokens tokens;
  final Color selectedColor;
  final Color unselectedColor;
  final bool uppercaseLabels;

  @override
  Widget build(BuildContext context) {
    assert(items.length == 2, 'centerAction layout expects 2 tabs');

    return LayoutBuilder(
      builder: (context, constraints) {
        final sideWidth = (constraints.maxWidth - 76) / 2;
        final pillLeft = currentIndex == 0 ? 4.0 : sideWidth + 76 + 4;

        return Stack(
          children: [
            AnimatedPositioned(
              duration: const Duration(milliseconds: 280),
              curve: Curves.easeOutCubic,
              left: pillLeft,
              width: sideWidth - 8,
              top: 4,
              bottom: 4,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: tokens.selectionFill,
                  border: Border.all(color: tokens.selectionStroke, width: 0.6),
                ),
              ),
            ),
            Row(
              children: [
                Expanded(
                  child: _GlassTabItem(
                    item: items[0],
                    selected: currentIndex == 0,
                    onTap: () => onTap(0),
                    selectedColor: selectedColor,
                    unselectedColor: unselectedColor,
                    uppercaseLabels: uppercaseLabels,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Material(
                    color: AppColors.brand,
                    borderRadius: BorderRadius.circular(18),
                    clipBehavior: Clip.antiAlias,
                    elevation: 0,
                    child: InkWell(
                      onTap: centerAction.onPressed,
                      child: SizedBox(
                        width: 68,
                        height: 52,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              centerAction.icon,
                              color: AppColors.black,
                              size: 22,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              centerAction.label,
                              style: const TextStyle(
                                color: AppColors.black,
                                fontWeight: FontWeight.w800,
                                fontSize: 10,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: _GlassTabItem(
                    item: items[1],
                    selected: currentIndex == 1,
                    onTap: () => onTap(1),
                    selectedColor: selectedColor,
                    unselectedColor: unselectedColor,
                    uppercaseLabels: uppercaseLabels,
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _GlassTabItem extends StatelessWidget {
  const _GlassTabItem({
    required this.item,
    required this.selected,
    required this.onTap,
    required this.selectedColor,
    required this.unselectedColor,
    required this.uppercaseLabels,
  });

  final NexaBottomNavItem item;
  final bool selected;
  final VoidCallback onTap;
  final Color selectedColor;
  final Color unselectedColor;
  final bool uppercaseLabels;

  @override
  Widget build(BuildContext context) {
    final color = selected ? selectedColor : unselectedColor;
    final label = uppercaseLabels ? item.label.toUpperCase() : item.label;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              selected ? (item.selectedIcon ?? item.icon) : item.icon,
              size: 22,
              color: color,
            ),
            const SizedBox(height: 3),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: uppercaseLabels ? 10 : 11,
                fontWeight: FontWeight.w700,
                letterSpacing: uppercaseLabels ? 0.3 : 0,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Envolve a tab bar nativa iOS em cápsula flutuante com tokens NexaGO.
class NexaLiquidGlassNativeTabShell extends StatelessWidget {
  const NexaLiquidGlassNativeTabShell({
    super.key,
    required this.height,
    required this.horizontalMargin,
    required this.bottomMargin,
    required this.child,
  });

  final double height;
  final double horizontalMargin;
  final double bottomMargin;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = _NexaGlassTabTokens.of(context, context.themeColors);
    const glassOverflow = 20.0;

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          horizontalMargin,
          0,
          horizontalMargin,
          bottomMargin,
        ),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular((height + glassOverflow) / 2),
            boxShadow: tokens.outerShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular((height + glassOverflow) / 2),
            child: child,
          ),
        ),
      ),
    );
  }
}

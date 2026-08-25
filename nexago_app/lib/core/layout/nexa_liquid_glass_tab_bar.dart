import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme_colors.dart';
import 'nexa_bottom_nav_models.dart';
import 'shell_tab_bar_collapse.dart';

/// No iOS a home indicator é translúcida e por gesto, então a cápsula assenta
/// na borda inferior ("grounded") em vez de flutuar alta. No Android o inset
/// pode ser a barra de navegação de 3 botões (opaca, ~48dp) — reservar o
/// inset inteiro para a cápsula nunca ficar atrás dos botões do sistema.
double _groundedBottomInset(BuildContext context) {
  final safeBottom = MediaQuery.viewPaddingOf(context).bottom;
  if (safeBottom <= 0) return 6;
  if (Theme.of(context).platform == TargetPlatform.iOS) return 0;
  return safeBottom;
}

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
    this.collapseProgress = 0,
    this.isScrolling = false,
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

  /// 0 = expandida, 1 = compacta (ícones, menor altura).
  final double collapseProgress;

  /// Enquanto o conteúdo por trás está rolando, suspendemos o blur ao vivo
  /// (custo de raster por frame) e mostramos só o tint translúcido; o blur
  /// volta assim que o scroll assenta.
  final bool isScrolling;

  @override
  Widget build(BuildContext context) {
    final themeColors = context.themeColors;
    final tokens = _NexaGlassTabTokens.of(context, themeColors);
    final muted = unselectedColor ?? themeColors.onSurfaceMuted;
    final index = currentIndex.clamp(0, items.length - 1);
    final t = collapseProgress.clamp(0.0, 1.0);
    final barHeight = _lerp(
      height,
      ShellTabBarCollapseController.collapsedHeight,
      t,
    );
    final sideInset = _lerp(horizontalMargin, horizontalMargin + 10, t);
    final bottomInset =
        _lerp(bottomMargin, bottomMargin * 0.6, t) +
        _groundedBottomInset(context);
    final showTabLabels = t < 0.45;
    final content = DecoratedBox(
      decoration: BoxDecoration(
        color: tokens.barFill,
        borderRadius: BorderRadius.circular(barHeight / 2),
        border: Border.all(color: tokens.outerStroke, width: 0.8),
      ),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        height: barHeight,
        child: centerAction == null
            ? _TabRow(
                items: items,
                currentIndex: index,
                onTap: onTap,
                tokens: tokens,
                selectedColor: selectedColor,
                unselectedColor: muted,
                uppercaseLabels: uppercaseLabels,
                showLabels: showTabLabels,
                collapseProgress: t,
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
                showLabels: showTabLabels,
                collapseProgress: t,
              ),
      ),
    );

    return Padding(
      padding: EdgeInsets.fromLTRB(sideInset, 0, sideInset, bottomInset),
      child: Transform.scale(
        scale: _lerp(1, 0.94, t),
        alignment: Alignment.bottomCenter,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(barHeight / 2),
            boxShadow: tokens.outerShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(barHeight / 2),
            child: isScrolling
                ? content
                : BackdropFilter(
                    filter: ImageFilter.blur(
                      sigmaX: _lerp(28, 20, t),
                      sigmaY: _lerp(28, 20, t),
                    ),
                    child: content,
                  ),
          ),
        ),
      ),
    );
  }

  static double _lerp(double a, double b, double t) => a + (b - a) * t;
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
    required this.showLabels,
    required this.collapseProgress,
  });

  final List<NexaBottomNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;
  final _NexaGlassTabTokens tokens;
  final Color selectedColor;
  final Color unselectedColor;
  final bool uppercaseLabels;
  final bool showLabels;
  final double collapseProgress;

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
                      showLabel: showLabels,
                      collapseProgress: collapseProgress,
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
    required this.showLabels,
    required this.collapseProgress,
  });

  final List<NexaBottomNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;
  final NexaBottomNavAction centerAction;
  final _NexaGlassTabTokens tokens;
  final Color selectedColor;
  final Color unselectedColor;
  final bool uppercaseLabels;
  final bool showLabels;
  final double collapseProgress;

  @override
  Widget build(BuildContext context) {
    assert(items.length == 2, 'centerAction layout expects 2 tabs');

    return LayoutBuilder(
      builder: (context, constraints) {
        final sideWidth = (constraints.maxWidth - 76) / 2;
        final pillLeft = currentIndex == 0 ? 4.0 : sideWidth + 76 + 4;
        final centerHeight = NexaLiquidGlassTabBar._lerp(
          52,
          44,
          collapseProgress,
        );

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
                    showLabel: showLabels,
                    collapseProgress: collapseProgress,
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
                        height: centerHeight,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              centerAction.icon,
                              color: AppColors.black,
                              size: NexaLiquidGlassTabBar._lerp(
                                22,
                                20,
                                collapseProgress,
                              ),
                            ),
                            if (showLabels) ...[
                              const SizedBox(height: 2),
                              Text(
                                centerAction.label,
                                style: const TextStyle(
                                  color: AppColors.black,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 8,
                                ),
                              ),
                            ],
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
                    showLabel: showLabels,
                    collapseProgress: collapseProgress,
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
    required this.showLabel,
    required this.collapseProgress,
  });

  final NexaBottomNavItem item;
  final bool selected;
  final VoidCallback onTap;
  final Color selectedColor;
  final Color unselectedColor;
  final bool uppercaseLabels;
  final bool showLabel;
  final double collapseProgress;

  @override
  Widget build(BuildContext context) {
    final color = selected ? selectedColor : unselectedColor;
    final label = uppercaseLabels ? item.label.toUpperCase() : item.label;
    final iconSize = NexaLiquidGlassTabBar._lerp(22, 24, collapseProgress);

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
              size: iconSize,
              color: color,
            ),
            if (showLabel) ...[
              SizedBox(
                height: NexaLiquidGlassTabBar._lerp(3, 0, collapseProgress),
              ),
              Opacity(
                opacity: (1 - collapseProgress).clamp(0.0, 1.0),
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: uppercaseLabels ? 11 : 8,
                    fontWeight: FontWeight.w700,
                    letterSpacing: uppercaseLabels ? 0.3 : 0,
                    color: color,
                  ),
                ),
              ),
            ],
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
    this.collapseProgress = 0,
  });

  final double height;
  final double horizontalMargin;
  final double bottomMargin;
  final Widget child;
  final double collapseProgress;

  @override
  Widget build(BuildContext context) {
    final tokens = _NexaGlassTabTokens.of(context, context.themeColors);
    const glassOverflow = 20.0;
    final t = collapseProgress.clamp(0.0, 1.0);
    final shellHeight = NexaLiquidGlassTabBar._lerp(
      height + glassOverflow,
      ShellTabBarCollapseController.collapsedHeight + glassOverflow * 0.6,
      t,
    );
    final sideInset = NexaLiquidGlassTabBar._lerp(
      horizontalMargin,
      horizontalMargin + 10,
      t,
    );
    final bottomInset = NexaLiquidGlassTabBar._lerp(
      bottomMargin,
      bottomMargin * 0.6,
      t,
    );
    // Reserva só parte do inset da home indicator para a cápsula não flutuar
    // alta demais — fica próxima da borda inferior, com folga mínima.
    final groundedBottom = bottomInset + _groundedBottomInset(context);

    return Padding(
      padding: EdgeInsets.fromLTRB(sideInset, 0, sideInset, groundedBottom),
      child: Transform.scale(
        scale: NexaLiquidGlassTabBar._lerp(1, 0.94, t),
        alignment: Alignment.bottomCenter,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(shellHeight / 2),
            boxShadow: tokens.outerShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(shellHeight / 2),
            child: child,
          ),
        ),
      ),
    );
  }
}

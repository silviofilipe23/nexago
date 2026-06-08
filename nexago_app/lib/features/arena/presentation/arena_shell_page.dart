import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../domain/arena_shell_providers.dart';
import '../domain/arena_tab.dart';

/// Shell com navegação inferior escura (gestor da arena).
class ArenaShellPage extends ConsumerWidget {
  const ArenaShellPage({
    super.key,
    required this.navigationShell,
  });

  final StatefulNavigationShell navigationShell;

  static const _tabs = <ArenaTab>[
    ArenaTab.dashboard,
    ArenaTab.schedule,
    ArenaTab.bookings,
    ArenaTab.settings,
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentIndex =
        navigationShell.currentIndex.clamp(0, _tabs.length - 1);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: navigationShell,
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          color: context.themeColors.surfaceSheet,
          border: Border(
            top: BorderSide(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 64,
            child: Row(
              children: [
                for (var i = 0; i < _tabs.length; i++)
                  Expanded(
                    child: _NavItem(
                      tab: _tabs[i],
                      selected: i == currentIndex,
                      onTap: () {
                        ref.read(arenaShellScrollRegistryProvider).scrollToTop(i);
                        navigationShell.goBranch(
                          i,
                          initialLocation: i == navigationShell.currentIndex,
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.tab,
    required this.selected,
    required this.onTap,
  });

  final ArenaTab tab;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              _iconFor(tab, selected: selected),
              size: 22,
              color: selected ? context.themeColors.onSurface : context.themeColors.onSurfaceMuted,
            ),
            SizedBox(height: 4),
            Text(
              tab.label.toUpperCase(),
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.3,
                color:
                    selected ? context.themeColors.onSurface : context.themeColors.onSurfaceMuted,
              ),
            ),
            SizedBox(height: 4),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 5,
              height: 5,
              decoration: BoxDecoration(
                color: selected ? AppColors.brand : Colors.transparent,
                shape: BoxShape.circle,
              ),
            ),
          ],
        ),
      ),
    );
  }

  static IconData _iconFor(ArenaTab tab, {required bool selected}) {
    switch (tab) {
      case ArenaTab.dashboard:
        return selected
            ? Icons.dashboard_rounded
            : Icons.dashboard_outlined;
      case ArenaTab.schedule:
        return selected
            ? Icons.calendar_month_rounded
            : Icons.calendar_month_outlined;
      case ArenaTab.bookings:
        return selected
            ? Icons.event_available_rounded
            : Icons.event_available_outlined;
      case ArenaTab.settings:
        return selected ? Icons.settings_rounded : Icons.settings_outlined;
    }
  }
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../domain/arena_tab.dart';

/// Shell com [BottomNavigationBar] para o módulo gestor da arena.
class ArenaShellPage extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: Theme(
        data: theme.copyWith(
          splashColor: AppColors.brand.withValues(alpha: 0.08),
          highlightColor: AppColors.brand.withValues(alpha: 0.05),
        ),
        child: BottomNavigationBar(
          type: BottomNavigationBarType.fixed,
          currentIndex: navigationShell.currentIndex.clamp(0, _tabs.length - 1),
          selectedFontSize: 11,
          unselectedFontSize: 11,
          onTap: (index) => navigationShell.goBranch(
            index,
            initialLocation: index == navigationShell.currentIndex,
          ),
          selectedItemColor: AppColors.brand,
          unselectedItemColor:
              theme.colorScheme.onSurface.withValues(alpha: 0.55),
          items: [
            for (final tab in _tabs)
              BottomNavigationBarItem(
                icon: Icon(_iconFor(tab, selected: false)),
                activeIcon: Icon(_iconFor(tab, selected: true)),
                label: tab.label,
              ),
          ],
        ),
      ),
    );
  }

  static IconData _iconFor(ArenaTab tab, {required bool selected}) {
    switch (tab) {
      case ArenaTab.dashboard:
        return selected ? Icons.dashboard_rounded : Icons.dashboard_outlined;
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/layout/shell_tab_bar_collapse.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../domain/arena_route_guard.dart';
import '../domain/arena_shell_providers.dart';
import '../domain/arena_tab.dart';

/// Shell com navegação inferior escura (gestor da arena).
class ArenaShellPage extends ConsumerWidget {
  const ArenaShellPage({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static const _tabs = <ArenaTab>[
    ArenaTab.dashboard,
    ArenaTab.schedule,
    ArenaTab.comandas,
    ArenaTab.bookings,
    ArenaTab.settings,
  ];

  static const _navItems = <NexaBottomNavItem>[
    NexaBottomNavItem(
      label: 'Painel',
      icon: Icons.dashboard_outlined,
      selectedIcon: Icons.dashboard_rounded,
      sfSymbol: 'square.grid.2x2',
      selectedSfSymbol: 'square.grid.2x2.fill',
    ),
    NexaBottomNavItem(
      label: 'Agenda',
      icon: Icons.calendar_month_outlined,
      selectedIcon: Icons.calendar_month_rounded,
      sfSymbol: 'calendar',
      selectedSfSymbol: 'calendar',
    ),
    NexaBottomNavItem(
      label: 'Comandas',
      icon: Icons.receipt_long_outlined,
      selectedIcon: Icons.receipt_long_rounded,
      sfSymbol: 'doc.text',
      selectedSfSymbol: 'doc.text.fill',
    ),
    NexaBottomNavItem(
      label: 'Reservas',
      icon: Icons.event_available_outlined,
      selectedIcon: Icons.event_available_rounded,
      sfSymbol: 'calendar.badge.clock',
      selectedSfSymbol: 'calendar.badge.clock',
    ),
    NexaBottomNavItem(
      label: 'Ajustes',
      icon: Icons.settings_outlined,
      selectedIcon: Icons.settings_rounded,
      sfSymbol: 'gearshape',
      selectedSfSymbol: 'gearshape.fill',
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentIndex = navigationShell.currentIndex.clamp(
      0,
      _tabs.length - 1,
    );
    final hideBottomNav = shouldHideArenaShellBottomNav(
      GoRouterState.of(context).uri.path,
    );
    final scrollRegistry = ref.watch(arenaShellScrollRegistryProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      extendBody: true,
      body: ShellTabBarCollapseListener(
        controller: scrollRegistry.tabBarCollapse,
        child: navigationShell,
      ),
      bottomNavigationBar: hideBottomNav
          ? null
          : ListenableBuilder(
              listenable: scrollRegistry.tabBarCollapse,
              builder: (context, _) => NexaBottomNavBar(
                items: _navItems,
                currentIndex: currentIndex,
                collapseProgress: scrollRegistry.tabBarCollapse.progress,
                isScrolling: scrollRegistry.tabBarCollapse.isScrolling,
                uppercaseLabels: true,
                onTap: (i) {
                  scrollRegistry.tabBarCollapse.expand();
                  ref.read(arenaShellScrollRegistryProvider).scrollToTop(i);
                  navigationShell.goBranch(
                    i,
                    initialLocation: i == navigationShell.currentIndex,
                  );
                },
              ),
            ),
    );
  }
}

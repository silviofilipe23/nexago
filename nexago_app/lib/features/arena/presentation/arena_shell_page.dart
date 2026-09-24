import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/layout/shell_tab_bar_collapse.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../domain/arena_access_providers.dart';
import '../domain/arena_route_guard.dart';
import '../domain/arena_selection_providers.dart';
import '../domain/arena_shell_providers.dart';
import '../domain/arena_tab.dart';
import '../domain/arena_tab_visibility.dart';
import 'widgets/arena_selection_gate.dart';

/// Shell com navegação inferior escura (gestor da arena).
class ArenaShellPage extends ConsumerWidget {
  const ArenaShellPage({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(needsArenaSelectionProvider)) {
      return const ArenaSelectionGate();
    }

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
          : ArenaShellTabBar(
              currentBranchIndex: navigationShell.currentIndex,
              onSelectBranch: (branch) {
                scrollRegistry.tabBarCollapse.expand();
                ref.read(arenaShellScrollRegistryProvider).scrollToTop(branch);
                navigationShell.goBranch(
                  branch,
                  initialLocation: branch == navigationShell.currentIndex,
                );
              },
            ),
    );
  }
}

/// A barra do painel, separada do shell para poder ser montada em teste sem
/// o `StatefulNavigationShell` do go_router.
class ArenaShellTabBar extends ConsumerWidget {
  const ArenaShellTabBar({
    super.key,
    required this.currentBranchIndex,
    required this.onSelectBranch,
    this.collapse,
  });

  /// Índice do branch atual (posição fixa no [StatefulNavigationShell]).
  final int currentBranchIndex;

  /// Chamado com o índice do branch escolhido (já traduzido da posição na
  /// barra, que pode ter menos abas que branches existem).
  final ValueChanged<int> onSelectBranch;

  /// `null` fora de teste: a barra usa o controller do registry do shell.
  final ShellTabBarCollapseController? collapse;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accessAsync = ref.watch(arenaAccessProvider);
    final visible = visibleArenaTabs(
      accessAsync.valueOrNull ?? ArenaAccess.none,
      accessLoaded: accessAsync.hasValue,
    );
    // Indice do branch (posicao fixa no StatefulShell) -> posicao na barra.
    final branchOf = [for (final tab in visible) ArenaTab.values.indexOf(tab)];
    final currentVisibleIndex = branchOf.indexOf(currentBranchIndex);

    final effectiveCollapse =
        collapse ?? ref.watch(arenaShellScrollRegistryProvider).tabBarCollapse;

    return ListenableBuilder(
      listenable: effectiveCollapse,
      builder: (context, _) => NexaBottomNavBar(
        items: [for (final tab in visible) _navItemFor(tab)],
        currentIndex: currentVisibleIndex < 0 ? 0 : currentVisibleIndex,
        collapseProgress: effectiveCollapse.progress,
        isScrolling: effectiveCollapse.isScrolling,
        uppercaseLabels: true,
        onTap: (i) => onSelectBranch(branchOf[i]),
      ),
    );
  }

  static NexaBottomNavItem _navItemFor(ArenaTab tab) => switch (tab) {
        ArenaTab.dashboard => const NexaBottomNavItem(
            label: 'Painel',
            icon: Icons.dashboard_outlined,
            selectedIcon: Icons.dashboard_rounded,
            sfSymbol: 'square.grid.2x2',
            selectedSfSymbol: 'square.grid.2x2.fill',
          ),
        ArenaTab.schedule => const NexaBottomNavItem(
            label: 'Agenda',
            icon: Icons.calendar_month_outlined,
            selectedIcon: Icons.calendar_month_rounded,
            sfSymbol: 'calendar',
            selectedSfSymbol: 'calendar',
          ),
        ArenaTab.comandas => const NexaBottomNavItem(
            label: 'Comandas',
            icon: Icons.receipt_long_outlined,
            selectedIcon: Icons.receipt_long_rounded,
            sfSymbol: 'doc.text',
            selectedSfSymbol: 'doc.text.fill',
          ),
        ArenaTab.bookings => const NexaBottomNavItem(
            label: 'Reservas',
            icon: Icons.event_available_outlined,
            selectedIcon: Icons.event_available_rounded,
            sfSymbol: 'calendar.badge.clock',
            selectedSfSymbol: 'calendar.badge.clock',
          ),
        ArenaTab.settings => const NexaBottomNavItem(
            label: 'Ajustes',
            icon: Icons.settings_outlined,
            selectedIcon: Icons.settings_rounded,
            sfSymbol: 'gearshape',
            selectedSfSymbol: 'gearshape.fill',
          ),
      };
}

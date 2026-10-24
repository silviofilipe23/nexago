import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../../core/router/routes.dart';
import '../../../store/application/store_providers.dart';
import '../../domain/athlete_shell_providers.dart';

/// Barra do shell do atleta: Início · Agenda · Reservar · Hub · Loja (ou
/// Comunidade, com a Loja desligada).
///
/// Fica separada do [AthleteShellPage] para as telas empilhadas que mantêm o
/// menu (Meus treinos) mostrarem a mesma barra.
class AthleteShellTabBar extends ConsumerWidget {
  const AthleteShellTabBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.collapseProgress = 0,
    this.isScrolling = false,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;
  final double collapseProgress;
  final bool isScrolling;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final storeTab = ref.watch(storeEnabledProvider);
    return NexaBottomNavBar(
      collapseProgress: collapseProgress,
      isScrolling: isScrolling,
      currentIndex: currentIndex,
      onTap: onTap,
      items: [
        const NexaBottomNavItem(
          label: 'Início',
          icon: Icons.home_outlined,
          selectedIcon: Icons.home,
          sfSymbol: 'house',
          selectedSfSymbol: 'house.fill',
        ),
        const NexaBottomNavItem(
          label: 'Agenda',
          icon: Icons.calendar_today_outlined,
          selectedIcon: Icons.calendar_today,
          sfSymbol: 'calendar',
          selectedSfSymbol: 'calendar',
        ),
        const NexaBottomNavItem(
          label: 'Reservar',
          icon: Icons.add_circle_outline,
          selectedIcon: Icons.add_circle,
          sfSymbol: 'plus.circle',
          selectedSfSymbol: 'plus.circle.fill',
        ),
        const NexaBottomNavItem(
          label: 'Hub',
          icon: Icons.emoji_events_outlined,
          selectedIcon: Icons.emoji_events,
          sfSymbol: 'trophy',
          selectedSfSymbol: 'trophy.fill',
        ),
        if (storeTab)
          const NexaBottomNavItem(
            label: 'Loja',
            icon: Icons.shopping_bag_outlined,
            selectedIcon: Icons.shopping_bag,
            sfSymbol: 'bag',
            selectedSfSymbol: 'bag.fill',
          )
        else
          const NexaBottomNavItem(
            label: 'Comunidade',
            icon: Icons.diversity_2_outlined,
            selectedIcon: Icons.diversity_2_rounded,
            sfSymbol: 'person.2',
            selectedSfSymbol: 'person.2.fill',
          ),
      ],
    );
  }
}

/// Sai de uma tela empilhada para o shell do atleta já na aba [index].
///
/// O provider troca a aba do shell que já está montado embaixo; o `?tab=`
/// cobre quem chegou por link direto (o shell nasce agora, com
/// `initialIndex`).
void goToAthleteShellTab(BuildContext context, WidgetRef ref, int index) {
  ref.read(athleteShellTabIndexProvider.notifier).state = index;
  ref.read(athleteShellScrollRegistryProvider).tabBarCollapse.expand();
  final tab = switch (index) {
    athleteShellAgendaTabIndex => 'agenda',
    athleteShellReservarTabIndex => 'reservar',
    athleteShellCompeteTabIndex => 'competir',
    athleteShellStoreTabIndex => 'loja',
    _ => null,
  };
  context.go(
    tab == null ? AppRoutes.discover : '${AppRoutes.discover}?tab=$tab',
  );
}

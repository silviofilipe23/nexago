import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/layout/shell_tab_bar_collapse.dart';
import '../../../core/auth/app_mobile_role.dart';
import '../../../core/auth/active_role_providers.dart';
import '../../arena/domain/arena_access_provider.dart';
import '../domain/athlete_shell_providers.dart';
import '../domain/daily_mission_sync_provider.dart';
import '../domain/gamification_models.dart';
import 'arena_list_page.dart';
import 'widgets/gamification_feedback_sheet.dart';
import 'athlete_agenda_page.dart';
import 'athlete_community_page.dart';
import 'athlete_home_page.dart';
import '../../tournaments/presentation/tournament_discovery_page.dart'
    show TournamentDiscoveryPage;
import '../../tournaments/presentation/widgets/compete_hub/compete_hub_shell_app_bar.dart';
import '../../tournaments/presentation/widgets/tournament_invite_accept_coordinator.dart';

/// Container principal do atleta com [BottomNavigationBar] e [IndexedStack].
class AthleteShellPage extends ConsumerStatefulWidget {
  const AthleteShellPage({super.key, this.initialIndex = 0});

  final int initialIndex;

  @override
  ConsumerState<AthleteShellPage> createState() => _AthleteShellPageState();
}

class _AthleteShellPageState extends ConsumerState<AthleteShellPage> {
  late int _index;

  static const _titles = <String>[
    'Início',
    'Agenda',
    'Reservar',
    'Competir',
    'Comunidade',
  ];

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex.clamp(0, _titles.length - 1);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(athleteShellTabIndexProvider.notifier).state = _index;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arenaPanelAsync = ref.watch(arenaPanelAccessProvider);
    final activeRole = ref.watch(activeMobileRoleProvider);
    final showArenaPanelShortcut = arenaPanelAsync.maybeWhen(
      data: (allowed) => allowed && activeRole == AppMobileRole.arena,
      orElse: () => false,
    );
    final hideAppBarForImmersiveTabs =
        _index == 0 || _index == 1 || _index == 2 || _index == 4;
    final isCompeteTab = _index == 3;
    final scrollRegistry = ref.watch(athleteShellScrollRegistryProvider);

    ref.listen<int>(athleteShellTabIndexProvider, (previous, next) {
      if (next != _index && next >= 0 && next < _titles.length) {
        setState(() => _index = next);
      }
    });

    ref.watch(dailyMissionSyncProvider);

    ref.listen<GamificationFeedback?>(dailyMissionFeedbackProvider, (
      previous,
      next,
    ) {
      if (next == null || next.xpGained <= 0) return;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted) return;
        await showGamificationFeedbackSheet(context, feedback: next);
        if (!mounted) return;
        ref.read(dailyMissionFeedbackProvider.notifier).state = null;
      });
    });

    return TournamentInviteAcceptCoordinator(
      child: Scaffold(
        extendBody: true,
        backgroundColor: theme.colorScheme.surfaceContainerLowest,
        appBar: hideAppBarForImmersiveTabs
            ? null
            : isCompeteTab
            ? CompeteHubShellAppBar(
                trailingActions: showArenaPanelShortcut
                    ? [
                        IconButton(
                          tooltip: 'Painel da arena',
                          onPressed: () =>
                              context.push(AppRoutes.arenaDashboard),
                          icon: const Icon(Icons.admin_panel_settings_outlined),
                        ),
                      ]
                    : <Widget>[],
              )
            : NexaAppBar(
                title: Text(_titles[_index]),
                actions: [
                  if (showArenaPanelShortcut)
                    IconButton(
                      tooltip: 'Painel da arena',
                      onPressed: () => context.push(AppRoutes.arenaDashboard),
                      icon: const Icon(Icons.admin_panel_settings_outlined),
                    ),
                ],
              ),
        body: ShellTabBarCollapseListener(
          controller: scrollRegistry.tabBarCollapse,
          child: IndexedStack(
            index: _index,
            children: const [
              AthleteHomePage(),
              AthleteAgendaPage(),
              ArenaListPage(),
              TournamentDiscoveryPage(),
              AthleteCommunityPage(),
            ],
          ),
        ),
        bottomNavigationBar: ListenableBuilder(
          listenable: scrollRegistry.tabBarCollapse,
          builder: (context, _) => NexaBottomNavBar(
            collapseProgress: scrollRegistry.tabBarCollapse.progress,
            currentIndex: _index,
            onTap: (i) {
              ref.read(athleteShellTabIndexProvider.notifier).state = i;
              setState(() => _index = i);
              scrollRegistry.tabBarCollapse.expand();
              ref.read(athleteShellScrollRegistryProvider).scrollToTop(i);
            },
            items: const [
              NexaBottomNavItem(
                label: 'Início',
                icon: Icons.home_outlined,
                selectedIcon: Icons.home,
                sfSymbol: 'house',
                selectedSfSymbol: 'house.fill',
              ),
              NexaBottomNavItem(
                label: 'Agenda',
                icon: Icons.calendar_today_outlined,
                selectedIcon: Icons.calendar_today,
                sfSymbol: 'calendar',
                selectedSfSymbol: 'calendar',
              ),
              NexaBottomNavItem(
                label: 'Reservar',
                icon: Icons.add_circle_outline,
                selectedIcon: Icons.add_circle,
                sfSymbol: 'plus.circle',
                selectedSfSymbol: 'plus.circle.fill',
              ),
              NexaBottomNavItem(
                label: 'Competir',
                icon: Icons.emoji_events_outlined,
                selectedIcon: Icons.emoji_events,
                sfSymbol: 'trophy',
                selectedSfSymbol: 'trophy.fill',
              ),
              NexaBottomNavItem(
                label: 'Comunidade',
                icon: Icons.diversity_2_outlined,
                selectedIcon: Icons.diversity_2_rounded,
                sfSymbol: 'person.2',
                selectedSfSymbol: 'person.2.fill',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

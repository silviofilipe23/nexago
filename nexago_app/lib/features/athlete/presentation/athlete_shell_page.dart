import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../arena/domain/arena_access_provider.dart';
import '../domain/athlete_shell_providers.dart';
import '../domain/daily_mission_sync_provider.dart';
import '../domain/gamification_models.dart';
import 'arena_list_page.dart';
import 'widgets/gamification_feedback_sheet.dart';
import 'athlete_bookings_page.dart';
import 'athlete_home_page.dart';
import 'athlete_profile_page.dart';
import '../../tournaments/presentation/tournament_discovery_page.dart'
    show TournamentDiscoveryPage;

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
    'Perfil',
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
    final hideAppBarForProfile = _index == 0 || _index == 2 || _index == 4;

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

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: hideAppBarForProfile
          ? null
          : AppBar(
              title: Text(_titles[_index]),
              actions: [
                ...arenaPanelAsync.maybeWhen(
                  data: (allowed) => allowed
                      ? [
                          IconButton(
                            tooltip: 'Painel da arena',
                            onPressed: () => context.push(AppRoutes.arenaDashboard),
                            icon: const Icon(Icons.admin_panel_settings_outlined),
                          ),
                        ]
                      : <Widget>[],
                  orElse: () => <Widget>[],
                ),
              ],
            ),
      body: IndexedStack(
        index: _index,
        children: const [
          AthleteHomePage(),
          AthleteBookingsPage(),
          ArenaListPage(),
          TournamentDiscoveryPage(),
          AthleteProfilePage(embedded: true),
        ],
      ),
      bottomNavigationBar: Theme(
        data: theme.copyWith(
          splashColor: AppColors.brand.withValues(alpha: 0.08),
          highlightColor: AppColors.brand.withValues(alpha: 0.05),
        ),
        child: BottomNavigationBar(
          type: BottomNavigationBarType.fixed,
          currentIndex: _index,
          onTap: (i) {
            ref.read(athleteShellTabIndexProvider.notifier).state = i;
            setState(() => _index = i);
          },
          selectedItemColor: AppColors.brand,
          unselectedItemColor:
              theme.colorScheme.onSurface.withValues(alpha: 0.55),
          selectedFontSize: 12,
          unselectedFontSize: 12,
          showUnselectedLabels: true,
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.home_outlined),
              activeIcon: Icon(Icons.home),
              label: 'Início',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.calendar_today_outlined),
              activeIcon: Icon(Icons.calendar_today),
              label: 'Agenda',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.add_circle_outline),
              activeIcon: Icon(Icons.add_circle),
              label: 'Reservar',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.emoji_events_outlined),
              activeIcon: Icon(Icons.emoji_events),
              label: 'Competir',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.person_outline),
              activeIcon: Icon(Icons.person),
              label: 'Perfil',
            ),
          ],
        ),
      ),
    );
  }
}

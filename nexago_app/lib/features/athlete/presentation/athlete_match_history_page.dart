import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/match_history/athlete_match_history_models.dart';
import '../domain/match_history/athlete_match_history_providers.dart';
import 'widgets/match_history/match_history_filter_chips.dart';
import 'widgets/match_history/match_history_match_card.dart';
import 'widgets/match_history/match_history_month_header.dart';
import 'widgets/match_history/match_history_season_card.dart';
import 'widgets/match_history/match_history_tab_switcher.dart';
import 'widgets/match_history/match_history_tournament_card.dart';
import 'widgets/match_history/match_history_tournament_stats_row.dart';

/// Histórico de partidas e torneios do atleta (protótipos 07/08).
class AthleteMatchHistoryPage extends ConsumerWidget {
  const AthleteMatchHistoryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bundleAsync = ref.watch(athleteMatchHistoryBundleProvider);
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: _appBar(context, theme),
      body: bundleAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o histórico.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
        data: (bundle) => _ReadyBody(bundle: bundle),
      ),
    );
  }

  PreferredSizeWidget _appBar(BuildContext context, ThemeData theme) {
    return AppBar(
      backgroundColor: AppColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: AppColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go(AppRoutes.athleteSettings);
                }
              },
              borderRadius: BorderRadius.circular(12),
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: AppColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        'Histórico',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: AppColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
    );
  }
}

class _ReadyBody extends ConsumerWidget {
  const _ReadyBody({required this.bundle});

  final AthleteMatchHistoryBundle bundle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(matchHistoryTabProvider);
    final filter = ref.watch(matchHistoryFilterProvider);
    final derived = MatchHistoryDerived(
      bundle: bundle,
      tab: tab,
      filter: filter,
    );

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        MatchHistoryTabSwitcher(
          tab: tab,
          matchCount: derived.matchCount,
          tournamentCount: derived.tournamentCount,
          onTabChanged: (t) =>
              ref.read(matchHistoryTabProvider.notifier).state = t,
        ),
        const SizedBox(height: 16),
        if (tab == MatchHistoryTab.matches) ...[
          MatchHistorySeasonCard(summary: bundle.seasonSummary),
          const SizedBox(height: 16),
          MatchHistoryFilterChips(
            filter: filter,
            onFilterChanged: (f) =>
                ref.read(matchHistoryFilterProvider.notifier).state = f,
          ),
          const SizedBox(height: 16),
          if (derived.monthGroups.isEmpty)
            _emptyState('Nenhuma partida neste filtro.')
          else
            ...derived.monthGroups.expand((group) {
              return [
                MatchHistoryMonthHeader(
                  title: group.title,
                  summaryLabel: group.summaryLabel,
                ),
                ...group.matches.map(
                  (m) => MatchHistoryMatchCard(
                    match: m,
                    onTap: () => _openMatchDetail(context, m.id),
                  ),
                ),
              ];
            }),
        ] else ...[
          MatchHistoryTournamentStatsRow(counts: derived.medalCounts),
          const SizedBox(height: 16),
          ...bundle.tournaments.map(
            (t) => MatchHistoryTournamentCard(
              tournament: t,
              onTap: () => _onTournamentTap(context, t),
            ),
          ),
        ],
      ],
    );
  }

  void _openMatchDetail(BuildContext context, String matchId) {
    context.pushNamed(
      AppRouteNames.athleteMatchDetail,
      pathParameters: {'matchId': matchId},
    );
  }

  void _onTournamentTap(BuildContext context, AthleteTournamentHistoryItem t) {
    final id = (t.tournamentId ?? t.id).trim();
    if (id.isNotEmpty) {
      context.pushNamed(
        AppRouteNames.athleteTournamentDetail,
        pathParameters: {'tournamentId': id},
      );
      return;
    }
    showAppSnackBar(context, 'Em breve.');
  }

  Widget _emptyState(String message) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Center(
        child: Text(
          message,
          style: const TextStyle(color: AppColors.onSurfaceMuted),
        ),
      ),
    );
  }
}

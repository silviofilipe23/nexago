import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_detail_tabs_logic.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../tournament_match_card.dart';

/// Aba "Hoje" (paridade com o portal): partidas ao vivo do torneio primeiro,
/// depois a timeline "Seu dia" com as partidas do atleta agendadas pra hoje.
class TournamentDetailTodayTab extends ConsumerWidget {
  const TournamentDetailTodayTab({
    super.key,
    required this.tournamentId,
    required this.athleteTeamIds,
  });

  final String tournamentId;
  final Set<String> athleteTeamIds;

  void _openMatchDetail(BuildContext context, String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return;
    context.pushNamed(
      AppRouteNames.athleteMatchDetail,
      pathParameters: {'matchId': id},
      queryParameters: {AppRoutes.matchDetailFromTournamentQuery: '1'},
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cardsAsync = ref.watch(tournamentMatchCardsProvider(tournamentId));
    final colors = context.themeColors;

    return cardsAsync.when(
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.only(top: 60),
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      ),
      error: (_, _) => Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Text(
          'Não foi possível carregar as partidas de hoje.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
        ),
      ),
      data: (cards) {
        final byId = {for (final c in cards) c.match.id: c};
        final matches = [for (final c in cards) c.match];
        final live = liveTournamentMatches(matches);
        final liveIds = live.map((m) => m.id).toSet();
        final mine = myTournamentDayTimeline(
          matches,
          athleteTeamIds,
          DateTime.now(),
        ).where((m) => !liveIds.contains(m.id)).toList();

        if (live.isEmpty && mine.isEmpty) {
          return Padding(
            padding: const EdgeInsets.all(AppSpacing.xxl),
            child: Text(
              'Nada acontecendo agora — os jogos de hoje aparecem aqui '
              'assim que forem programados.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
            ),
          );
        }

        Widget cardOf(TournamentMatchCardViewModel vm) => Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenH,
                0,
                AppSpacing.screenH,
                AppSpacing.xxl,
              ),
              child: TournamentMatchCard(
                viewModel: vm,
                athleteTeamIds: athleteTeamIds,
                onTap: () => _openMatchDetail(context, vm.match.id),
              ),
            );

        return ListView(
          padding: const EdgeInsets.only(
            top: AppSpacing.md,
            bottom: AppSpacing.xxl,
          ),
          children: [
            if (live.isNotEmpty) ...[
              _TodaySectionHeader(
                label: 'AO VIVO AGORA',
                color: AppColors.live,
                dot: true,
              ),
              for (final m in live) cardOf(byId[m.id]!),
            ],
            if (mine.isNotEmpty) ...[
              if (live.isNotEmpty) const SizedBox(height: AppSpacing.md),
              _TodaySectionHeader(
                label: 'SEU DIA NO TORNEIO',
                color: colors.onSurfaceMuted,
              ),
              for (final m in mine) cardOf(byId[m.id]!),
            ],
          ],
        );
      },
    );
  }
}

class _TodaySectionHeader extends StatelessWidget {
  const _TodaySectionHeader({
    required this.label,
    required this.color,
    this.dot = false,
  });

  final String label;
  final Color color;
  final bool dot;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.sm,
        AppSpacing.screenH,
        AppSpacing.sm + 2,
      ),
      child: Row(
        children: [
          if (dot) ...[
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: AppSpacing.sm - 2),
          ],
          Text(
            label,
            style: AppTypography.eyebrow.copyWith(color: color),
          ),
        ],
      ),
    );
  }
}

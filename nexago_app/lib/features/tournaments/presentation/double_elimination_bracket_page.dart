import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../domain/double_elimination_bracket_layout.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_matches_logic.dart';
import 'widgets/bracket/double_elimination_bracket_canvas.dart';
import 'widgets/tournament_detail/tournament_detail_message.dart';

class DoubleEliminationBracketPage extends ConsumerWidget {
  const DoubleEliminationBracketPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

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
    final tournamentAsync = ref.watch(tournamentDetailProvider(tournamentId));
    final cardsAsync = ref.watch(tournamentMatchCardsProvider(tournamentId));
    final teamIdsByCategory = ref
            .watch(tournamentUserTeamIdsByCategoryProvider(tournamentId))
            .valueOrNull ??
        const <String, String>{};
    final athleteTeamIds = athleteTeamIdsForHighlight(teamIdsByCategory);

    final categoryName = tournamentAsync.valueOrNull?.categoryOffers
            .where((o) => o.id == categoryId)
            .map((o) => o.name)
            .firstOrNull ??
        categoryId;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: AppColors.onSurface),
          onPressed: () => context.pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Chave interativa',
              style: AppTypography.soraRegular(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.onSurface,
              ),
            ),
            Text(
              categoryName,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: AppColors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
      body: cardsAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => TournamentDetailMessageList(
          title: 'Não foi possível carregar a chave',
          message: '$e',
        ),
        data: (cards) {
          final matches = cards.map((c) => c.match).toList();
          final bracket = bracketMatchesForCategory(matches, categoryId);

          if (bracket.isEmpty) {
            return const TournamentDetailMessageList(
              title: 'Chave ainda não publicada',
              message:
                  'Quando o organizador gerar os jogos eliminatórios desta categoria, eles aparecerão aqui.',
            );
          }

          final cardsById = {for (final c in cards) c.match.id: c};
          final layout = buildDoubleEliminationBracketLayout(bracket);

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Row(
                  children: [
                    _LegendChip(label: 'WB', color: AppColors.brand),
                    const SizedBox(width: 8),
                    _LegendChip(label: 'LB', color: AppColors.brand),
                    const SizedBox(width: 8),
                    _LegendChip(label: 'Final', color: AppColors.pending),
                    const Spacer(),
                    Text(
                      'Pinça para zoom',
                      style: AppTypography.mono(
                        fontSize: 10,
                        color: AppColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: DoubleEliminationBracketCanvas(
                  layout: layout,
                  cardsById: cardsById,
                  athleteTeamIds: athleteTeamIds,
                  onMatchTap: (matchId) => _openMatchDetail(context, matchId),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _LegendChip extends StatelessWidget {
  const _LegendChip({
    required this.label,
    required this.color,
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: AppColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

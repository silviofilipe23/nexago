import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../data/tournament_inscriptions_repository.dart';
import '../../../domain/double_elimination_bracket_layout.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_matches_logic.dart';
import '../tournament_detail/tournament_detail_message.dart';
import 'double_elimination_bracket_canvas.dart';

/// A chave navegável da dupla eliminação: legenda + canvas com pinça, arrasto
/// e os chips que pulam a câmera de fase em fase.
///
/// Mora aqui, e não dentro da página, porque DUAS telas mostram esta mesma
/// chave — a rota `/chave-interativa` e a seção "Chave" do Modo Focus. Uma
/// segunda cópia divergiria no primeiro ajuste de layout.
///
/// A chave NÃO é filtrável por "minhas partidas": tirar os jogos dos outros
/// quebraria a árvore — o caminho do atleta só faz sentido com os confrontos
/// que alimentam cada nó. O destaque do time dele faz esse papel.
class DoubleEliminationBracketView extends ConsumerWidget {
  const DoubleEliminationBracketView({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    this.bottomPadding = 0,
  });

  final String tournamentId;
  final String categoryId;

  /// Folga inferior — no Focus a nav flutuante sobrepõe o corpo, então a
  /// viewport do canvas precisa terminar acima dela.
  final double bottomPadding;

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
    final teamIdsByCategory = ref
            .watch(tournamentUserTeamIdsByCategoryProvider(tournamentId))
            .valueOrNull ??
        const <String, String>{};
    final athleteTeamIds = athleteTeamIdsForHighlight(teamIdsByCategory);

    return cardsAsync.when(
      loading: () => Center(
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
                'Quando o organizador gerar os jogos eliminatórios desta '
                'categoria, eles aparecerão aqui.',
          );
        }

        final cardsById = {for (final c in cards) c.match.id: c};
        final layout = buildDoubleEliminationBracketLayout(bracket);

        return Padding(
          padding: EdgeInsets.only(bottom: bottomPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  0,
                  AppSpacing.screenH,
                  AppSpacing.sm + 4,
                ),
                child: _BracketLegend(),
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
          ),
        );
      },
    );
  }
}

class _BracketLegend extends StatelessWidget {
  const _BracketLegend();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const _LegendChip(label: 'WB', color: AppColors.brand),
        const SizedBox(width: AppSpacing.sm),
        const _LegendChip(label: 'LB', color: AppColors.brand),
        const SizedBox(width: AppSpacing.sm),
        const _LegendChip(label: 'Final', color: AppColors.pending),
        const Spacer(),
        Text(
          'Pinça para zoom',
          style: AppTypography.mono(
            fontSize: 10,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ],
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
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/nexa_async_view.dart';
import 'package:nexago_app/core/ui/nexa_icon_square_button.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_group_standings_logic.dart';
import '../domain/tournament_matches_logic.dart';
import '../domain/tournament_discovery_providers.dart';
import 'widgets/tournament_detail/tournament_pool_standings_widgets.dart';
import 'widgets/tournament_match_card.dart';

/// Visão do GRUPO — o terceiro nível da cascata Torneio → Categoria → Grupo:
/// classificação do grupo + as partidas dele em ordem cronológica.
class TournamentGroupViewPage extends ConsumerWidget {
  const TournamentGroupViewPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    required this.poolId,
  });

  final String tournamentId;
  final String categoryId;
  final String poolId;

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
    final colors = context.themeColors;
    final topInset = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaAsyncView<TournamentDetail?>(
        value: tournamentAsync,
        onRetry: () => ref.invalidate(tournamentDetailProvider(tournamentId)),
        skeleton: const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        emptyWhen: (t) => t == null,
        data: (value) {
          final tournament = value!;
          final offer = tournament.categoryOffers
              .where((o) => o.id == categoryId)
              .firstOrNull;
          final cards = ref
                  .watch(tournamentMatchCardsProvider(tournamentId))
                  .valueOrNull ??
              const [];
          final matches = [for (final c in cards) c.match];
          final cardsById = {for (final c in cards) c.match.id: c};
          final teamIdsByCategory = ref
                  .watch(tournamentUserTeamIdsByCategoryProvider(tournamentId))
                  .valueOrNull ??
              const <String, String>{};
          final athleteTeamIds =
              athleteTeamIdsForHighlight(teamIdsByCategory);
          final resolvedTeamNames = ref
                  .watch(
                    tournamentCategoryPoolTeamDisplayNamesProvider((
                      tournamentId: tournamentId,
                      categoryId: categoryId,
                    )),
                  )
                  .valueOrNull ??
              const {};

          final pool = poolMatchesForCategory(matches, categoryId)
              .where((m) => m.poolId.trim() == poolId)
              .toList();
          final qualifiersPerGroup = offer?.qualifiersPerGroup ?? 2;
          final group = buildPoolStandingsGroups(
            poolMatches: pool,
            cardsById: cardsById,
            qualifiersPerGroup: qualifiersPerGroup,
            athleteTeamIds: athleteTeamIds,
            resolvedTeamNamesById: resolvedTeamNames,
          ).where((g) => g.poolId == poolId).firstOrNull;

          final poolCards = [
            for (final m in pool)
              if (cardsById[m.id] != null) cardsById[m.id]!,
          ]..sort((a, b) {
              final at = a.match.scheduleTime;
              final bt = b.match.scheduleTime;
              if (at == null && bt == null) {
                return a.match.matchNumber.compareTo(b.match.matchNumber);
              }
              if (at == null) return 1;
              if (bt == null) return -1;
              return at.compareTo(bt);
            });

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(height: topInset + AppSpacing.xs),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
                child: Row(
                  children: [
                    NexaIconSquareButton(
                      icon: Icons.arrow_back_rounded,
                      onTap: () => context.pop(),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Text(
                      offer?.name.toUpperCase() ?? 'CATEGORIA',
                      style: AppTypography.labelS
                          .copyWith(color: colors.onSurfaceMuted),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.sm,
                  AppSpacing.screenH,
                  AppSpacing.xs,
                ),
                child: Text(
                  group?.poolLabel ?? 'Grupo',
                  style: AppTypography.titleL.copyWith(color: colors.onSurface),
                ),
              ),
              Expanded(
                child: group == null
                    ? Padding(
                        padding: const EdgeInsets.all(AppSpacing.xxl),
                        child: Text(
                          'Este grupo ainda não tem jogos publicados.',
                          style: AppTypography.bodyM
                              .copyWith(color: colors.onSurfaceMuted),
                        ),
                      )
                    : ListView(
                        padding:
                            const EdgeInsets.only(bottom: AppSpacing.xxl),
                        children: [
                          TournamentPoolStandingsCard(
                            group: group,
                            qualifiersPerGroup: qualifiersPerGroup,
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(
                              AppSpacing.screenH,
                              AppSpacing.lg,
                              AppSpacing.screenH,
                              AppSpacing.sm,
                            ),
                            child: Text(
                              'PARTIDAS DO GRUPO',
                              style: AppTypography.eyebrow
                                  .copyWith(color: colors.onSurfaceMuted),
                            ),
                          ),
                          for (final card in poolCards)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(
                                AppSpacing.screenH,
                                0,
                                AppSpacing.screenH,
                                AppSpacing.sm + 2,
                              ),
                              child: TournamentMatchCard(
                                viewModel: card,
                                athleteTeamIds: athleteTeamIds,
                                onTap: () =>
                                    _openMatchDetail(context, card.match.id),
                              ),
                            ),
                        ],
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/tournament_inscriptions_repository.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_matches_logic.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../tournament_match_card.dart';
import 'tournament_detail_category_chips.dart';
import 'tournament_detail_message.dart';
import 'tournament_detail_tab_slivers.dart';
import 'tournament_matches_filter_toggle.dart';

class TournamentDetailBracketTab extends ConsumerWidget {
  const TournamentDetailBracketTab({
    super.key,
    required this.tournament,
    required this.categoryId,
    required this.filter,
    required this.onCategorySelected,
    required this.onFilterChanged,
  });

  final TournamentDetail tournament;
  final String categoryId;
  final TournamentMatchesFilter filter;
  final ValueChanged<String> onCategorySelected;
  final ValueChanged<TournamentMatchesFilter> onFilterChanged;

  void _openMatchDetail(BuildContext context, String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return;
    context.pushNamed(
      AppRouteNames.athleteMatchDetail,
      pathParameters: {'matchId': id},
      queryParameters: {AppRoutes.matchDetailFromTournamentQuery: '1'},
    );
  }

  List<Widget> buildSlivers(BuildContext context, WidgetRef ref) {
    final offers = tournament.categoryOffers;
    final cardsAsync = ref.watch(
      tournamentMatchCardsProvider(tournament.id),
    );
    final teamIdsByCategory =
        ref
            .watch(
              tournamentUserTeamIdsByCategoryProvider(tournament.id),
            )
            .valueOrNull ??
        const <String, String>{};
    final athleteTeamIds = athleteTeamIdsForHighlight(teamIdsByCategory);
    final registrations =
        ref
            .watch(
              tournamentUserRegistrationsByCategoryProvider(tournament.id),
            )
            .valueOrNull ??
        const <String, UserCategoryRegistration>{};
    final isRegistered = athleteTeamIds.isNotEmpty || registrations.isNotEmpty;

    return cardsAsync.when(
      loading: () => tournamentDetailTabSliversFromChildren(
        children: [
          SizedBox(
            height: 240,
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          ),
        ],
      ),
      error: (e, _) => TournamentDetailMessageList(
        title: 'Não foi possível carregar a chave',
        message: '$e',
      ).buildSlivers(),
      data: (cards) {
        if (offers.isEmpty) {
          return const TournamentDetailMessageList(
            title: 'Sem categorias',
            message: 'As categorias ainda não foram publicadas.',
          ).buildSlivers();
        }

        final matches = cards.map((c) => c.match).toList();
        final cardsById = {for (final c in cards) c.match.id: c};
        final selectedOffer = offers
            .where((o) => o.id == categoryId)
            .cast<TournamentCategoryOffer?>()
            .firstOrNull;

        var pool = poolMatchesForCategory(matches, categoryId);
        var bracket = bracketMatchesForCategory(matches, categoryId);
        if (filter == TournamentMatchesFilter.mine) {
          pool = filterAthleteMatches(pool, athleteTeamIds);
          bracket = filterAthleteMatches(bracket, athleteTeamIds);
        }
        final poolGroups = groupMatchesByPool(pool);
        final knockoutGroups = groupBracketMatchesByRound(bracket);
        final showPools = selectedOffer != null &&
            categoryHasGroupsPhase(selectedOffer) &&
            poolGroups.isNotEmpty;
        final showInteractiveBracket = selectedOffer != null &&
            isDoubleEliminationBracketFormat(selectedOffer.bracketFormat) &&
            bracket.isNotEmpty;
        final hasKnockoutContent = knockoutGroups.isNotEmpty;
        final isEmpty = !showPools && !hasKnockoutContent;

        return tournamentDetailTabSliversFromChildren(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            TournamentDetailCategoryChips(
              offers: offers,
              selectedId: categoryId,
              onSelected: onCategorySelected,
            ),
            if (showInteractiveBracket)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Material(
                  color: context.themeColors.surfaceCard,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    onTap: () => context.pushNamed(
                      AppRouteNames.tournamentDoubleEliminationBracket,
                      pathParameters: {
                        'tournamentId': tournament.id,
                        'categoryId': categoryId,
                      },
                    ),
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.account_tree_outlined,
                            color: AppColors.brand,
                            size: 20,
                          ),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Ver chave interativa',
                              style: AppTypography.soraRegular(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: context.themeColors.onSurface,
                              ),
                            ),
                          ),
                          Icon(
                            Icons.chevron_right_rounded,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            if (isRegistered)
              TournamentMatchesFilterToggle(
                value: filter,
                onChanged: onFilterChanged,
              ),
            if (isEmpty && filter == TournamentMatchesFilter.mine)
              Padding(
                padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: TournamentDetailMessageBody(
                  title: 'Nenhum jogo seu',
                  message: 'Você ainda não tem jogos nesta categoria.',
                ),
              )
            else if (isEmpty)
              Padding(
                padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: TournamentDetailMessageBody(
                  title: 'Chave ainda não publicada',
                  message:
                      'Quando o organizador gerar os jogos desta categoria, eles aparecerão aqui.',
                ),
              )
            else ...[
              if (showPools) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                  child: Text(
                    'FASE DE GRUPOS',
                    style: AppTypography.mono(
                      fontSize: 11,
                      color: context.themeColors.onSurfaceMuted,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
                for (final group in poolGroups) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                    child: Text(
                      group.poolLabel.toUpperCase(),
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                  ),
                  for (final match in group.matches)
                    TournamentMatchCard(
                      viewModel: cardsById[match.id]!,
                      athleteTeamIds: athleteTeamIds,
                      onTap: () => _openMatchDetail(context, match.id),
                    ),
                ],
              ],
              if (hasKnockoutContent) ...[
                if (showPools)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                    child: Text(
                      'MATA-MATA',
                      style: AppTypography.mono(
                        fontSize: 11,
                        color: context.themeColors.onSurfaceMuted,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                for (final group in knockoutGroups) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                    child: Text(
                      group.roundLabel.toUpperCase(),
                      style: AppTypography.mono(
                        fontSize: 11,
                        color: context.themeColors.onSurfaceMuted,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                  for (final match in group.matches)
                    TournamentMatchCard(
                      viewModel: cardsById[match.id]!,
                      athleteTeamIds: athleteTeamIds,
                      onTap: () => _openMatchDetail(context, match.id),
                    ),
                ],
              ],
            ],
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CustomScrollView(slivers: buildSlivers(context, ref));
  }
}

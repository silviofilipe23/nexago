import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../data/tournament_inscriptions_repository.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_group_standings_logic.dart';
import '../../../domain/tournament_matches_logic.dart';
import '../../../domain/tournament_discovery_providers.dart';
import 'tournament_detail_category_chips.dart';
import 'tournament_detail_message.dart';
import 'tournament_detail_tab_slivers.dart';
import 'tournament_matches_filter_toggle.dart';
import 'tournament_pool_standings_widgets.dart';

class TournamentDetailGroupsTab extends ConsumerWidget {
  const TournamentDetailGroupsTab({
    super.key,
    required this.tournament,
    required this.categoryId,
    required this.filter,
    required this.onCategorySelected,
    required this.onFilterChanged,
    this.showCategoryChips = true,
  });

  /// `false` dentro da casca da categoria — lá a cascata manda voltar por
  /// "Todas as categorias", sem trocar de categoria pelos chips.
  final bool showCategoryChips;

  final TournamentDetail tournament;
  final String categoryId;
  final TournamentMatchesFilter filter;
  final ValueChanged<String> onCategorySelected;
  final ValueChanged<TournamentMatchesFilter> onFilterChanged;

  TournamentCategoryOffer? _selectedOffer(List<TournamentCategoryOffer> offers) {
    for (final offer in offers) {
      if (offer.id == categoryId) return offer;
    }
    return offers.isNotEmpty ? offers.first : null;
  }

  List<Widget> buildSlivers(BuildContext context, WidgetRef ref) {
    final offers = tournament.categoryOffers;
    final cardsAsync =
        ref.watch(tournamentMatchCardsProvider(tournament.id));
    final teamIdsByCategory = ref
            .watch(tournamentUserTeamIdsByCategoryProvider(tournament.id))
            .valueOrNull ??
        const <String, String>{};
    final athleteTeamIds = athleteTeamIdsForHighlight(teamIdsByCategory);
    final registrations = ref
            .watch(
              tournamentUserRegistrationsByCategoryProvider(tournament.id),
            )
            .valueOrNull ??
        const <String, UserCategoryRegistration>{};
    final isRegistered =
        athleteTeamIds.isNotEmpty || registrations.isNotEmpty;

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
        title: 'Não foi possível carregar os grupos',
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
        final pool = poolMatchesForCategory(matches, categoryId);
        final selectedOffer = _selectedOffer(offers);
        final qualifiersPerGroup = selectedOffer?.qualifiersPerGroup ?? 2;
        final teamNamesAsync = ref.watch(
          tournamentCategoryPoolTeamDisplayNamesProvider((
            tournamentId: tournament.id,
            categoryId: categoryId,
          )),
        );
        final resolvedTeamNames = teamNamesAsync.valueOrNull ?? const {};

        var standingsGroups = buildPoolStandingsGroups(
          poolMatches: pool,
          cardsById: cardsById,
          qualifiersPerGroup: qualifiersPerGroup,
          athleteTeamIds: athleteTeamIds,
          resolvedTeamNamesById: resolvedTeamNames,
        );

        final isPhaseComplete =
            isGroupStageCompleteForCategory(standingsGroups);

        if (filter == TournamentMatchesFilter.mine) {
          standingsGroups = standingsGroups
              .where(
                (group) => group.rows.any(
                  (row) => athleteTeamIds.contains(row.teamId),
                ),
              )
              .toList();
        }

        return tournamentDetailTabSliversFromChildren(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            if (showCategoryChips)
              TournamentDetailCategoryChips(
                offers: offers,
                selectedId: categoryId,
                onSelected: onCategorySelected,
              ),
            if (isRegistered)
              TournamentMatchesFilterToggle(
                value: filter,
                onChanged: onFilterChanged,
              ),
            if (pool.isEmpty)
              Padding(
                padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: TournamentDetailMessageBody(
                  title: filter == TournamentMatchesFilter.mine
                      ? 'Nenhum jogo seu'
                      : 'Grupos ainda não publicados',
                  message: filter == TournamentMatchesFilter.mine
                      ? 'Você ainda não tem jogos nesta categoria.'
                      : 'Quando a fase de grupos for gerada para esta categoria, a classificação aparecerá aqui.',
                ),
              )
            else if (standingsGroups.isEmpty &&
                filter == TournamentMatchesFilter.mine)
              Padding(
                padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: TournamentDetailMessageBody(
                  title: 'Nenhum jogo seu',
                  message: 'Você ainda não tem jogos nesta categoria.',
                ),
              )
            else ...[
              TournamentGroupStandingsHeader(
                isComplete: isPhaseComplete,
                qualifiersPerGroup: qualifiersPerGroup,
              ),
              // Cascata Torneio → Categoria → Grupo: o card abre a visão do
              // grupo (classificação + partidas dele).
              for (final group in standingsGroups)
                GestureDetector(
                  onTap: () => context.pushNamed(
                    AppRouteNames.tournamentGroupView,
                    pathParameters: {
                      'tournamentId': tournament.id,
                      'categoryId': categoryId,
                      'poolId': group.poolId,
                    },
                  ),
                  child: TournamentPoolStandingsCard(
                    group: group,
                    qualifiersPerGroup: qualifiersPerGroup,
                  ),
                ),
              TournamentGroupStandingsFooter(
                qualifiersPerGroup: qualifiersPerGroup,
              ),
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

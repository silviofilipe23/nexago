import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../data/tournament_inscriptions_repository.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_matches_logic.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../tournament_match_card.dart';
import 'tournament_detail_category_chips.dart';
import 'tournament_detail_message.dart';
import 'tournament_matches_filter_toggle.dart';

class TournamentDetailBracketTab extends ConsumerStatefulWidget {
  const TournamentDetailBracketTab({super.key, required this.tournament});

  final TournamentDetail tournament;

  @override
  ConsumerState<TournamentDetailBracketTab> createState() =>
      _TournamentDetailBracketTabState();
}

class _TournamentDetailBracketTabState
    extends ConsumerState<TournamentDetailBracketTab> {
  late String _categoryId;
  TournamentMatchesFilter _filter = TournamentMatchesFilter.all;

  @override
  void initState() {
    super.initState();
    _categoryId = widget.tournament.categoryOffers.isNotEmpty
        ? widget.tournament.categoryOffers.first.id
        : '';
  }

  @override
  Widget build(BuildContext context) {
    final offers = widget.tournament.categoryOffers;
    final cardsAsync = ref.watch(
      tournamentMatchCardsProvider(widget.tournament.id),
    );
    final teamIdsByCategory =
        ref
            .watch(
              tournamentUserTeamIdsByCategoryProvider(widget.tournament.id),
            )
            .valueOrNull ??
        const <String, String>{};
    final athleteTeamIds = athleteTeamIdsForHighlight(teamIdsByCategory);
    final registrations =
        ref
            .watch(
              tournamentUserRegistrationsByCategoryProvider(
                widget.tournament.id,
              ),
            )
            .valueOrNull ??
        const <String, String>{};
    final isRegistered = athleteTeamIds.isNotEmpty || registrations.isNotEmpty;

    return cardsAsync.when(
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppColors.brand),
      ),
      error: (e, _) => TournamentDetailMessageList(
        title: 'Não foi possível carregar a chave',
        message: '$e',
      ),
      data: (cards) {
        if (offers.isEmpty) {
          return const TournamentDetailMessageList(
            title: 'Sem categorias',
            message: 'As categorias ainda não foram publicadas.',
          );
        }

        final matches = cards.map((c) => c.match).toList();
        final cardsById = {for (final c in cards) c.match.id: c};
        var bracket = bracketMatchesForCategory(matches, _categoryId);
        if (_filter == TournamentMatchesFilter.mine) {
          bracket = filterAthleteMatches(bracket, athleteTeamIds);
        }
        final groups = groupBracketMatchesByRound(bracket);
        final selectedOffer = offers
            .where((o) => o.id == _categoryId)
            .cast<TournamentCategoryOffer?>()
            .firstOrNull;
        final showInteractiveBracket = selectedOffer != null &&
            isDoubleEliminationBracketFormat(selectedOffer.bracketFormat) &&
            bracket.isNotEmpty;

        return ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            TournamentDetailCategoryChips(
              offers: offers,
              selectedId: _categoryId,
              onSelected: (id) => setState(() => _categoryId = id),
            ),
            if (showInteractiveBracket)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Material(
                  color: AppColors.surfaceCard,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    onTap: () => context.pushNamed(
                      AppRouteNames.tournamentDoubleEliminationBracket,
                      pathParameters: {
                        'tournamentId': widget.tournament.id,
                        'categoryId': _categoryId,
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
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Ver chave interativa',
                              style: AppTypography.soraRegular(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppColors.onSurface,
                              ),
                            ),
                          ),
                          Icon(
                            Icons.chevron_right_rounded,
                            color: AppColors.onSurfaceMuted,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            if (isRegistered)
              TournamentMatchesFilterToggle(
                value: _filter,
                onChanged: (filter) => setState(() => _filter = filter),
              ),
            if (bracket.isEmpty && _filter == TournamentMatchesFilter.mine)
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: TournamentDetailMessageBody(
                  title: 'Nenhum jogo seu',
                  message: 'Você ainda não tem jogos nesta categoria.',
                ),
              )
            else if (bracket.isEmpty)
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: TournamentDetailMessageBody(
                  title: 'Chave ainda não publicada',
                  message:
                      'Quando o organizador gerar os jogos eliminatórios desta categoria, eles aparecerão aqui.',
                ),
              )
            else
              for (final group in groups) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                  child: Text(
                    group.roundLabel.toUpperCase(),
                    style: AppTypography.mono(
                      fontSize: 11,
                      color: AppColors.onSurfaceMuted,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
                for (final match in group.matches)
                  TournamentMatchCard(
                    viewModel: cardsById[match.id]!,
                    isAthleteMatch: isAthleteMatchForHighlight(
                      match,
                      athleteTeamIds,
                    ),
                  ),
              ],
          ],
        );
      },
    );
  }
}

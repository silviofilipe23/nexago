import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_matches_logic.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../tournament_match_card.dart';
import 'tournament_detail_category_chips.dart';
import 'tournament_detail_message.dart';

class TournamentDetailBracketTab extends ConsumerStatefulWidget {
  const TournamentDetailBracketTab({
    super.key,
    required this.tournament,
  });

  final TournamentDetail tournament;

  @override
  ConsumerState<TournamentDetailBracketTab> createState() =>
      _TournamentDetailBracketTabState();
}

class _TournamentDetailBracketTabState
    extends ConsumerState<TournamentDetailBracketTab> {
  late String _categoryId;

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
    final cardsAsync =
        ref.watch(tournamentMatchCardsProvider(widget.tournament.id));

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
        final bracket = bracketMatchesForCategory(matches, _categoryId);
        final groups = groupBracketMatchesByRound(bracket);

        return ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            TournamentDetailCategoryChips(
              offers: offers,
              selectedId: _categoryId,
              onSelected: (id) => setState(() => _categoryId = id),
            ),
            if (bracket.isEmpty)
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
                  TournamentMatchCard(viewModel: cardsById[match.id]!),
              ],
          ],
        );
      },
    );
  }
}

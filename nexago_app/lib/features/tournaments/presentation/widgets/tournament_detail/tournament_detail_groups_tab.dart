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

class TournamentDetailGroupsTab extends ConsumerStatefulWidget {
  const TournamentDetailGroupsTab({
    super.key,
    required this.tournament,
  });

  final TournamentDetail tournament;

  @override
  ConsumerState<TournamentDetailGroupsTab> createState() =>
      _TournamentDetailGroupsTabState();
}

class _TournamentDetailGroupsTabState
    extends ConsumerState<TournamentDetailGroupsTab> {
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
        title: 'Não foi possível carregar os grupos',
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
        final pool = poolMatchesForCategory(matches, _categoryId);
        final groups = groupMatchesByPool(pool);

        return ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            TournamentDetailCategoryChips(
              offers: offers,
              selectedId: _categoryId,
              onSelected: (id) => setState(() => _categoryId = id),
            ),
            if (pool.isEmpty)
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: TournamentDetailMessageBody(
                  title: 'Grupos ainda não publicados',
                  message:
                      'Quando a fase de grupos for gerada para esta categoria, os confrontos aparecerão aqui.',
                ),
              )
            else
              for (final group in groups) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          group.poolLabel.toUpperCase(),
                          style: AppTypography.soraRegular(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: AppColors.onSurface,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceCard,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: AppColors.onSurfaceMuted
                                .withValues(alpha: 0.15),
                          ),
                        ),
                        child: Text(
                          '${group.matches.length} jogos',
                          style: AppTypography.mono(
                            fontSize: 10,
                            color: AppColors.onSurfaceMuted,
                          ),
                        ),
                      ),
                    ],
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

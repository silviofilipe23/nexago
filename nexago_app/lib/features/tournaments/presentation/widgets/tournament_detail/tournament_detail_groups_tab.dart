import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_match.dart';
import '../../../domain/tournament_matches_logic.dart';
import '../../../domain/tournament_discovery_providers.dart';
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
    final matchesAsync =
        ref.watch(tournamentMatchesProvider(widget.tournament.id));

    return matchesAsync.when(
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppColors.brand),
      ),
      error: (e, _) => TournamentDetailMessageList(
        title: 'Não foi possível carregar os grupos',
        message: '$e',
      ),
      data: (matches) {
        if (offers.isEmpty) {
          return const TournamentDetailMessageList(
            title: 'Sem categorias',
            message: 'As categorias ainda não foram publicadas.',
          );
        }

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
                  _GroupMatchTile(match: match),
              ],
          ],
        );
      },
    );
  }
}

class _GroupMatchTile extends StatelessWidget {
  const _GroupMatchTile({required this.match});

  final TournamentMatch match;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  match.teamsLabel,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  matchStatusLabel(match.status),
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          Text(
            match.scoreLabel,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
            ),
          ),
        ],
      ),
    );
  }
}

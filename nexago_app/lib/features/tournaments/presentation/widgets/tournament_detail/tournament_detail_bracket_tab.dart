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
    final matchesAsync =
        ref.watch(tournamentMatchesProvider(widget.tournament.id));

    return matchesAsync.when(
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppColors.brand),
      ),
      error: (e, _) => TournamentDetailMessageList(
        title: 'Não foi possível carregar a chave',
        message: '$e',
      ),
      data: (matches) {
        if (offers.isEmpty) {
          return const TournamentDetailMessageList(
            title: 'Sem categorias',
            message: 'As categorias ainda não foram publicadas.',
          );
        }

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
                for (final match in group.matches) _MatchTile(match: match),
              ],
          ],
        );
      },
    );
  }
}

class _MatchTile extends StatelessWidget {
  const _MatchTile({required this.match});

  final TournamentMatch match;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  match.teamsLabel,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurface,
                  ),
                ),
              ),
              Text(
                matchStatusLabel(match.status),
                style: AppTypography.mono(
                  fontSize: 10,
                  color: AppColors.onSurfaceMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            match.scoreLabel,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.brand,
            ),
          ),
        ],
      ),
    );
  }
}

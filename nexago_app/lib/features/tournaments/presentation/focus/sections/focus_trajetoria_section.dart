import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_journey_logic.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_match.dart';
import '../../../domain/tournament_match_display.dart';
import '../focus_section_header.dart';

/// Seção "Trajetória": quanto falta pro título, por onde passa o caminho, e os
/// números da campanha.
///
/// REGRA DA TELA: quando o motor devolve `null`, a manchete e o caminho SOMEM.
/// Nada de placeholder, "a definir" ou contagem de fases chutada — o `null` de
/// `winsToTitleOf`/`happyPathOf` significa "não dá pra afirmar", e inventar um
/// número ali é exatamente o bug que as guardas daquele módulo existem pra
/// evitar.
class FocusTrajetoriaSection extends ConsumerWidget {
  const FocusTrajetoriaSection({
    super.key,
    required this.tournament,
    required this.categoryId,
    required this.athleteTeamIds,
  });

  final TournamentDetail tournament;
  final String? categoryId;
  final Set<String> athleteTeamIds;

  TournamentCategoryOffer? _offer(List<TournamentCategoryOffer> offers) {
    for (final offer in offers) {
      if (offer.id == categoryId) return offer;
    }
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final cardsAsync = ref.watch(tournamentMatchCardsProvider(tournament.id));
    final cards = cardsAsync.valueOrNull;
    if (cards == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.only(top: 60),
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      );
    }

    final all = [for (final c in cards) c.match];
    final id = categoryId;
    if (id == null) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Text(
          'Sua campanha aparece aqui quando você tiver partida nesta '
          'categoria.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
        ),
      );
    }

    final offer = _offer(tournament.categoryOffers);
    final isDouble =
        offer != null && isDoubleEliminationBracketFormat(offer.bracketFormat);

    final wins = winsToTitleOf(
      all,
      id,
      athleteTeamIds,
      isDoubleElimination: isDouble,
    );
    final path = happyPathOf(all, id, athleteTeamIds);
    final numbers = tournamentNumbersOf(
      all.where((m) => m.categoryId == id).toList(),
      athleteTeamIds,
    );

    return ListView(
      padding: const EdgeInsets.only(
        top: AppSpacing.md,
        bottom: AppSpacing.xxxl,
      ),
      children: [
        if (wins != null) _Headline(wins: wins),
        if (path != null && path.isNotEmpty) ...[
          const FocusSectionHeader(label: 'CAMINHO ATÉ A FINAL'),
          _Path(matches: path, categoryMatches: all),
        ],
        if (numbers.matches > 0) ...[
          const FocusSectionHeader(label: 'SEUS NÚMEROS NO TORNEIO'),
          _Numbers(numbers: numbers),
        ],
        if (wins == null && numbers.matches == 0)
          Padding(
            padding: const EdgeInsets.all(AppSpacing.xxl),
            child: Text(
              'Sua campanha aparece aqui quando a chave for sorteada.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
            ),
          ),
      ],
    );
  }
}

/// `0` é campeão — resposta honesta, diferente do `null` de "não dá pra
/// afirmar", que faz a manchete sumir antes de chegar aqui.
class _Headline extends StatelessWidget {
  const _Headline({required this.wins});

  final int wins;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final champion = wins == 0;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.sm,
      ),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.xl),
        decoration: BoxDecoration(
          color: champion ? colors.win : colors.surfaceCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: champion ? colors.win : colors.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              champion ? 'CAMPEÃO' : 'ATÉ O TÍTULO',
              style: AppTypography.eyebrow.copyWith(
                color: champion ? Colors.white : colors.onSurfaceMuted,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              champion
                  ? 'Você venceu a final.'
                  : wins == 1
                      ? 'Falta 1 vitória.'
                      : 'Faltam $wins vitórias.',
              style: AppTypography.titleL.copyWith(
                color: champion ? Colors.white : colors.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Path extends StatelessWidget {
  const _Path({required this.matches, required this.categoryMatches});

  final List<TournamentMatch> matches;
  final List<TournamentMatch> categoryMatches;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Column(
      children: [
        for (var i = 0; i < matches.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenH,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              children: [
                Container(
                  width: 24,
                  height: 24,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: i == 0 ? colors.brand : colors.surfaceRaised,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '${i + 1}',
                    style: AppTypography.bodyS.copyWith(
                      color: i == 0 ? Colors.white : colors.onSurfaceMuted,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    matchPhaseDisplayLabel(
                      matches[i],
                      categoryMatches: categoryMatches,
                    ),
                    style: AppTypography.bodyM.copyWith(
                      color: i == 0 ? colors.onSurface : colors.onSurfaceMuted,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Numbers extends StatelessWidget {
  const _Numbers({required this.numbers});

  final TournamentNumbers numbers;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    Widget stat(String label, String value) {
      return Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: AppTypography.titleL.copyWith(color: colors.onSurface),
            ),
            Text(
              label,
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.outline),
        ),
        child: Row(
          children: [
            stat('partidas', '${numbers.matches}'),
            stat('sets', '${numbers.setsWon}–${numbers.setsLost}'),
            stat('pontos', '${numbers.points}'),
            stat('por set', '${numbers.pointsPerSet}'),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_journey_logic.dart';
import '../../../domain/focus/focus_journey_view.dart';
import '../../../domain/focus/focus_views_logic.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../focus_section_header.dart';
import '../widgets/focus_journey_rail.dart';
import '../widgets/focus_set_bars.dart';

/// Seção "Trajetória": quanto falta pro título, o caminho até a final, os
/// números da campanha e o que o torneio muda.
///
/// REGRA DA TELA: quando o motor devolve `null`, a manchete SOME. Nada de
/// placeholder ou contagem de fases chutada — `null` significa "não dá pra
/// afirmar", e inventar um número ali é exatamente o bug que as guardas de
/// `focus_journey_logic.dart` existem pra evitar.
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

  TournamentCategoryOffer? _offer() {
    for (final offer in tournament.categoryOffers) {
      if (offer.id == categoryId) return offer;
    }
    return null;
  }

  void _openMatch(BuildContext context, String matchId) {
    context.pushNamed(
      AppRouteNames.athleteMatchDetail,
      pathParameters: {'matchId': matchId},
      queryParameters: {AppRoutes.matchDetailFromTournamentQuery: '1'},
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cards =
        ref.watch(tournamentMatchCardsProvider(tournament.id)).valueOrNull;

    if (cards == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.only(top: 60),
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      );
    }

    final id = categoryId;
    if (id == null) {
      return _Empty(
        text: 'Sua campanha aparece aqui quando você tiver partida nesta '
            'categoria.',
      );
    }

    final all = [for (final c in cards) c.match];
    final teamNames = <String, String>{};
    for (final c in cards) {
      if (c.match.teamAId.isNotEmpty) {
        teamNames[c.match.teamAId] = c.teamA.displayName;
      }
      if (c.match.teamBId.isNotEmpty) {
        teamNames[c.match.teamBId] = c.teamB.displayName;
      }
    }

    final categoryMatches = all.where((m) => m.categoryId == id).toList();
    final offer = _offer();
    final isDouble =
        offer != null && isDoubleEliminationBracketFormat(offer.bracketFormat);

    final wins = winsToTitleOf(
      all,
      id,
      athleteTeamIds,
      isDoubleElimination: isDouble,
    );
    final headline = journeyHeadlineOf(wins);
    final happyPath = isDouble ? happyPathOf(all, id, athleteTeamIds) : null;
    final numbers = tournamentNumbersOf(categoryMatches, athleteTeamIds);

    final worstPlace = bracketWorstPlaceOf(
      all,
      id,
      athleteTeamIds,
      isDoubleElimination: isDouble,
    );
    final prizes = _prizeRows(offer, worstPlace);
    final finalPrize = _finalPrizeLabel(offer);

    final ctx = FocusViewContext(
      matches: categoryMatches,
      myTeamIds: athleteTeamIds,
      duoNameOf: (teamId, [fallback]) =>
          teamNames[teamId] ?? fallback ?? 'A definir',
      standingsOf: (_) => const [],
      nextMatch: null,
    );
    final steps = journeyStepsOf(
      ctx,
      journeyPathOf(categoryMatches, id, athleteTeamIds),
      null,
      finalPrize,
      happyPath: happyPath,
    );

    return ListView(
      padding: const EdgeInsets.only(
        top: AppSpacing.md,
        bottom: AppSpacing.xxxl,
      ),
      children: [
        if (headline != null) _Headline(headline: headline),
        const FocusSectionHeader(label: 'CAMINHO ATÉ A FINAL'),
        if (steps.isEmpty)
          _Empty(text: 'Sua chave ainda não foi sorteada.')
        else
          FocusJourneyRail(
            steps: steps,
            onOpen: (matchId) => _openMatch(context, matchId),
          ),
        const FocusSectionHeader(label: 'SEUS NÚMEROS NO TORNEIO'),
        _Stats(numbers: numbers),
        if (numbers.sets.isNotEmpty)
          FocusSetBars(bars: numbers.sets)
        else
          _Empty(text: 'Nenhuma partida encerrada ainda.'),
        if (prizes.isNotEmpty) ...[
          const FocusSectionHeader(label: 'O QUE ESTE TORNEIO MUDA'),
          for (final prize in prizes) _PrizeRow(prize: prize),
        ],
      ],
    );
  }

  /// A premiação da categoria, com a colocação já garantida destacada.
  ///
  /// "Garantido" casa a colocação EXATA que a campanha assegura ([worstPlace]),
  /// não um piso: o atleta pode terminar em qualquer lugar até ela, nunca pior.
  /// Se essa colocação não tem prêmio cadastrado, a resposta certa é "nada
  /// garantido", não o prêmio de uma colocação que ele não pode mais alcançar.
  List<_Prize> _prizeRows(TournamentCategoryOffer? offer, int? worstPlace) {
    if (offer == null) return const [];
    final rows = <_Prize>[];
    for (final p in offer.prizes) {
      final position = int.tryParse(p.position.trim().replaceAll('º', ''));
      if (position == null) continue;
      rows.add(_Prize(
        position: position,
        label: p.label?.trim().isNotEmpty == true ? p.label!.trim() : 'Prêmio',
        valueLabel: p.value > 0 ? _brl(p.value) : null,
        guaranteed: worstPlace != null && position == worstPlace,
      ));
    }
    rows.sort((a, b) => a.position.compareTo(b.position));
    return rows;
  }

  String? _finalPrizeLabel(TournamentCategoryOffer? offer) {
    if (offer == null) return null;
    for (final p in offer.prizes) {
      final position = int.tryParse(p.position.trim().replaceAll('º', ''));
      if (position == 1 && p.value > 0) return 'campeão leva ${_brl(p.value)}';
    }
    return null;
  }

  static String _brl(double value) {
    final cents = (value * 100).round();
    final reais = cents ~/ 100;
    final rest = cents % 100;
    final buffer = StringBuffer();
    final digits = reais.toString();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buffer.write('.');
      buffer.write(digits[i]);
    }
    return rest == 0
        ? 'R\$ $buffer'
        : 'R\$ $buffer,${rest.toString().padLeft(2, '0')}';
  }
}

class _Prize {
  const _Prize({
    required this.position,
    required this.label,
    required this.valueLabel,
    required this.guaranteed,
  });

  final int position;
  final String label;
  final String? valueLabel;
  final bool guaranteed;
}

class _Headline extends StatelessWidget {
  const _Headline({required this.headline});

  final JourneyHeadline headline;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final champion = headline.kind == JourneyHeadlineKind.champion;

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
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: champion ? colors.win : colors.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              champion ? 'Fim de jornada' : 'Rumo ao título',
              style: AppTypography.eyebrow.copyWith(
                color: champion ? Colors.white : colors.onSurfaceMuted,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              champion ? 'Campeão da categoria!' : headline.text!,
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

class _Stats extends StatelessWidget {
  const _Stats({required this.numbers});

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
              style: AppTypography.monoStat.copyWith(
                color: colors.onSurface,
                fontSize: 20,
              ),
            ),
            const SizedBox(height: 2),
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
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            stat('Sets', '${numbers.setsWon}–${numbers.setsLost}'),
            stat('Pontos', '${numbers.points}'),
            stat('Por set', '${numbers.pointsPerSet}'),
            stat('Partidas', '${numbers.matches}'),
          ],
        ),
      ),
    );
  }
}

class _PrizeRow extends StatelessWidget {
  const _PrizeRow({required this.prize});

  final _Prize prize;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.sm,
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: prize.guaranteed ? colors.win : colors.outline,
          ),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 32,
              child: Text(
                '${prize.position}º',
                style: AppTypography.monoMeta
                    .copyWith(color: colors.onSurfaceMuted),
              ),
            ),
            Expanded(
              child: Text(
                prize.label,
                style: AppTypography.bodyM.copyWith(color: colors.onSurface),
              ),
            ),
            if (prize.valueLabel != null)
              Text(
                prize.valueLabel!,
                style: AppTypography.monoMeta.copyWith(color: colors.onSurface),
              ),
            if (prize.guaranteed) ...[
              const SizedBox(width: AppSpacing.sm),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: colors.win,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  'Garantido',
                  style: AppTypography.eyebrow.copyWith(color: Colors.white),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenH,
        vertical: AppSpacing.md,
      ),
      child: Text(
        text,
        style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
      ),
    );
  }
}

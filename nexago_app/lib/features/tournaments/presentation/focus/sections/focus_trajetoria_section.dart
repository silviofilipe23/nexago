import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_double_elimination.dart';
import '../../../domain/focus/focus_journey_logic.dart';
import '../../../domain/focus/focus_journey_view.dart';
import '../../../domain/focus/focus_views_logic.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../widgets/nexa_duo_avatars.dart';
import '../focus_rosters.dart';
import '../focus_section_header.dart';
import '../../../domain/focus/campaign_share_data.dart';
import '../widgets/focus_journey_rail.dart';
import '../widgets/focus_share_campaign_sheet.dart';
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
    final colors = context.themeColors;
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
    final rosters = FocusRosters.fromCards(cards);

    final categoryMatches = all.where((m) => m.categoryId == id).toList();

    // Os dois rostos da dupla do atleta, tirados do lado dele em qualquer
    // partida da categoria. Sem isso o card de campanha sai sem avatar.
    var myPlayers = const <CampaignPlayer>[];
    var myTeamName = 'Sua dupla';
    for (final c in cards) {
      if (c.match.categoryId != id) continue;
      final iAmA = athleteTeamIds.contains(c.match.teamAId);
      final iAmB = athleteTeamIds.contains(c.match.teamBId);
      if (!iAmA && !iAmB) continue;
      final side = iAmA ? c.teamA : c.teamB;
      myTeamName = side.displayName;
      myPlayers = [
        for (final p in side.players)
          CampaignPlayer(initial: p.initials, photo: p.avatarUrl),
      ];
      break;
    }
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
      duoNameOf: rosters.nameOf,
      standingsOf: (_) => const [],
      nextMatch: null,
    );
    final opponents = possibleOpponentsOf(
      categoryMatches,
      id,
      athleteTeamIds,
      rosters.nameOf,
    );
    final steps = journeyStepsOf(
      ctx,
      journeyPathOf(categoryMatches, id, athleteTeamIds),
      null,
      finalPrize,
      happyPath: happyPath,
    );

    // Na dupla eliminação a manchete muda: quem caiu para a repescagem ainda
    // tem título pela frente, e a tela precisa dizer isso — "3 vitórias até o
    // título" sozinho não distingue quem está invicto de quem está na última
    // vida.
    final standing = isDouble
        ? focusDoubleEliminationStandingOf(all, id, athleteTeamIds)
        : null;
    final inRepescagem = standing?.side == FocusBracketSide.losers;

    // Quantas duplas disputam a categoria — times distintos que aparecem nas
    // partidas dela. Sai do que a chave e os grupos realmente têm, não de um
    // contador de inscrições que pode incluir quem desistiu.
    final duplas = <String>{};
    for (final m in categoryMatches) {
      if (m.teamAId.isNotEmpty) duplas.add(m.teamAId);
      if (m.teamBId.isNotEmpty) duplas.add(m.teamBId);
    }

    // "Classificado" = já tem partida NO MATA-MATA. É o único sinal que não
    // exige simular o desempate do grupo — a linha que este projeto se recusa
    // a cruzar antes de o grupo encerrar.
    final classificado = categoryMatches.any((m) =>
        m.poolId.isEmpty &&
        !m.isGroupMatch &&
        (athleteTeamIds.contains(m.teamAId) ||
            athleteTeamIds.contains(m.teamBId)));

    return ListView(
      padding: const EdgeInsets.only(
        top: AppSpacing.md,
        bottom: AppSpacing.xxxl,
      ),
      children: [
        // Cabeçalho do protótipo: eyebrow nomeando a dupla, manchete grande e
        // as pílulas logo abaixo. Texto solto, não card — o card competia com
        // a manchete e roubava a hierarquia dela.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                ['SUA TRAJETÓRIA', myTeamName.toUpperCase()].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.eyebrow.copyWith(color: AppColors.brand),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                inRepescagem
                    ? 'Ainda dá título — por baixo.'
                    : headline == null
                        ? 'Sua campanha no torneio.'
                        : headline.kind == JourneyHeadlineKind.champion
                            ? 'Campeão da categoria!'
                            : headline.text!,
                style:
                    AppTypography.displayL.copyWith(color: colors.onSurface),
              ),
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  if (standing != null)
                    _Pill(
                      label: switch (standing.side) {
                        FocusBracketSide.winners => 'VENCEDORES · 2 VIDAS',
                        FocusBracketSide.losers => 'REPESCAGEM · 1 VIDA',
                        FocusBracketSide.eliminated => 'ELIMINADO',
                      },
                      color: switch (standing.side) {
                        FocusBracketSide.winners => colors.win,
                        FocusBracketSide.losers => AppColors.pending,
                        FocusBracketSide.eliminated => colors.onSurfaceMuted,
                      },
                      icon: standing.side == FocusBracketSide.winners
                          ? Icons.check_rounded
                          : null,
                    )
                  else if (classificado)
                    _Pill(
                      label: 'CLASSIFICADO',
                      color: colors.win,
                      icon: Icons.check_rounded,
                    ),
                  if (isDouble && wins != null && wins > 0)
                    _Pill(
                      label: wins == 1
                          ? '1 JOGO ATÉ A FINAL'
                          : '$wins JOGOS ATÉ A FINAL',
                      color: colors.onSurfaceMuted,
                    )
                  else if (duplas.length > 1)
                    _Pill(
                      label: '${duplas.length} DUPLAS',
                      color: colors.onSurfaceMuted,
                    ),
                  // Só com partida encerrada: um card de campanha sem campanha
                  // nenhuma não diz nada.
                  if (numbers.matches > 0)
                    _Pill(
                      label: 'COMPARTILHAR',
                      color: AppColors.brand,
                      icon: Icons.ios_share_rounded,
                      onTap: () => showFocusShareCampaignSheet(
                        context,
                        buildCampaignShareData(
                          matches: categoryMatches,
                          categoryId: id,
                          myTeamIds: athleteTeamIds,
                          teamName: myTeamName,
                          players: myPlayers,
                          categoryLine: offer?.name ?? '',
                          tournamentName: tournament.name,
                          locationName: tournament.location,
                          duoNameOf: (teamId) => rosters.nameOf(teamId),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        FocusSectionHeader(
          label:
              isDouble ? 'CAMINHO ATÉ A GRANDE FINAL' : 'CAMINHO ATÉ A FINAL',
        ),
        if (steps.isEmpty)
          _Empty(text: 'Sua chave ainda não foi sorteada.')
        else
          FocusJourneyRail(
            steps: steps,
            playersOf: rosters.playersOf,
            onOpen: (matchId) => _openMatch(context, matchId),
          ),
        const FocusSectionHeader(label: 'SEUS NÚMEROS NO TORNEIO'),
        _Stats(numbers: numbers),
        if (numbers.sets.isNotEmpty)
          FocusSetBars(bars: numbers.sets)
        else
          _Empty(text: 'Nenhuma partida encerrada ainda.'),
        if (opponents.isNotEmpty) ...[
          const FocusSectionHeader(label: 'QUEM PODE CRUZAR COM VOCÊ'),
          for (final opponent in opponents)
            _Opponent(
              opponent: opponent,
              players: rosters.playersOf(opponent.teamId),
            ),
        ],
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

/// Pílula do cabeçalho: contorno na cor do estado, rótulo em caixa alta e um
/// ícone opcional. Com [onTap] ela vira botão — é assim que "COMPARTILHAR"
/// convive com as pílulas informativas na mesma linha, como no protótipo.
class _Pill extends StatelessWidget {
  const _Pill({
    required this.label,
    required this.color,
    this.icon,
    this.onTap,
  });

  final String label;
  final Color color;
  final IconData? icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final pill = Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm - 1,
      ),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.75)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 5),
          ],
          Text(label, style: AppTypography.eyebrow.copyWith(color: color)),
        ],
      ),
    );

    if (onTap == null) return pill;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: pill,
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

/// Um adversário que a chave ainda pode cruzar. NÃO promete confronto — a
/// seção lista quem segue vivo do outro lado, e a campanha dele explica por quê
/// ele importa.
class _Opponent extends StatelessWidget {
  const _Opponent({required this.opponent, required this.players});

  final PossibleOpponent opponent;
  final List<TournamentMatchCardPlayerViewModel> players;

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
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: colors.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                NexaDuoAvatars(players: players, size: 28),
                const SizedBox(width: AppSpacing.sm),
                Flexible(
                  child: Text(
                    opponent.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyM.copyWith(
                      color: colors.onSurface,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            if (opponent.campaign.isEmpty)
              Text(
                'Primeira partida no torneio.',
                style: AppTypography.bodyS
                    .copyWith(color: colors.onSurfaceMuted),
              )
            else
              for (final entry in opponent.campaign)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          entry.label,
                          style: AppTypography.bodyS
                              .copyWith(color: colors.onSurfaceMuted),
                        ),
                      ),
                      Text(
                        entry.detail,
                        style: AppTypography.monoMeta
                            .copyWith(color: colors.onSurfaceMuted),
                      ),
                    ],
                  ),
                ),
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

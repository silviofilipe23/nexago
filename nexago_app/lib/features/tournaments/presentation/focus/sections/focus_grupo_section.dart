import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_journey_view.dart';
import '../../../domain/focus/focus_scenarios.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_group_standings_logic.dart';
import '../../../domain/tournament_match.dart';
import '../../../domain/tournament_match_display.dart';
import '../../../domain/tournament_match_status.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../widgets/nexa_duo_avatars.dart';
import '../focus_bottom_clearance.dart';
import '../focus_rosters.dart';
import '../focus_section_header.dart';

/// Seção "Grupo": a classificação do atleta, o que a rodada decide, o que está
/// em quadra na categoria e onde é o quê.
///
/// A tabela é desenhada aqui, mas o MOTOR de classificação é o mesmo
/// [computePoolStandings] que o resto do app usa — o Focus nunca pode discordar
/// da tabela que o atleta vê no detalhe do torneio.
///
/// A categoria vem travada de fora: `poolId` só é único DENTRO da categoria —
/// os grupos são 'A', 'B', 'C'… em todas elas.
class FocusGrupoSection extends ConsumerStatefulWidget {
  const FocusGrupoSection({
    super.key,
    required this.tournament,
    required this.categoryId,
    required this.athleteTeamIds,
  });

  final TournamentDetail tournament;
  final String categoryId;
  final Set<String> athleteTeamIds;

  @override
  ConsumerState<FocusGrupoSection> createState() => _FocusGrupoSectionState();
}

class _FocusGrupoSectionState extends ConsumerState<FocusGrupoSection> {
  TournamentCategoryOffer? get _offer {
    for (final offer in widget.tournament.categoryOffers) {
      if (offer.id == widget.categoryId) return offer;
    }
    return null;
  }

  String? get _address {
    final t = widget.tournament;
    final raw = t.locationAddress?.trim();
    if (raw != null && raw.isNotEmpty) return raw;
    final fallback = [t.location.trim(), t.city.trim()]
        .where((p) => p.isNotEmpty)
        .join(', ');
    return fallback.isEmpty ? null : fallback;
  }

  Future<void> _openMaps() async {
    final address = _address;
    if (address == null) return;
    await launchUrl(
      Uri.parse(
        'https://www.google.com/maps/search/?api=1'
        '&query=${Uri.encodeComponent(address)}',
      ),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final cards = ref
            .watch(tournamentMatchCardsProvider(widget.tournament.id))
            .valueOrNull ??
        const [];
    final all = [for (final c in cards) c.match];
    final categoryMatches =
        all.where((m) => m.categoryId == widget.categoryId).toList();

    final rosters = FocusRosters.fromCards(cards);

    final myTeamId = _myTeamId(categoryMatches);
    final poolId = _myPoolId(categoryMatches, myTeamId);
    if (poolId == null) {
      return _Empty(
        text: 'Sua classificação aparece aqui quando o grupo for sorteado.',
      );
    }

    final poolMatches =
        categoryMatches.where((m) => m.poolId == poolId).toList();
    final order = computePoolStandings(
      poolId,
      teamIdsInPool(poolMatches),
      poolMatches,
    );
    final stats = computePoolTeamStats(
      poolId,
      teamIdsInPool(poolMatches),
      poolMatches,
    );
    final qualifiers = _offer?.qualifiersPerGroup ?? 2;

    final myPending = _myPendingMatch(poolMatches, myTeamId);
    final scenarios = myPending == null
        ? const <RoundScenario>[]
        : roundScenariosOf(
            matches: categoryMatches,
            poolId: poolId,
            myTeamId: myTeamId,
            myMatchId: myPending.id,
            qualifiersPerGroup: qualifiers,
          );

    // "1º do grupo · quartas às 14:30 contra o 2º Grupo A": o destino sai da
    // fiação declarada da chave. Sem slot correspondente o texto encolhe para a
    // posição — nunca aponta um cruzamento inventado.
    final scenariosComDestino = [
      for (final s in scenarios)
        (
          scenario: s,
          destination: s.rank == null || poolId.isEmpty
              ? null
              : knockoutDestinationOf(
                  matches: categoryMatches,
                  categoryId: widget.categoryId,
                  place: s.rank!,
                  poolId: poolId,
                  nameOf: rosters.nameOf,
                  phaseLabelOf: (m) => matchPhaseDisplayLabel(
                    m,
                    categoryMatches: categoryMatches,
                  ),
                  timeLabelOf: (m) => m.scheduleTime == null
                      ? null
                      : matchTimeLabelForCard(m),
                ),
        ),
    ];

    final live = categoryMatches
        .where((m) => TournamentMatchStatus.isInProgress(m.status))
        .toList();
    final crossing = crossingRowsOf(categoryMatches, widget.categoryId);

    return ListView(
      padding: EdgeInsets.only(
        top: AppSpacing.xs,
        bottom: focusBottomClearance(context),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _kicker(poolId, poolMatches),
                style:
                    AppTypography.eyebrow.copyWith(color: AppColors.brand),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                qualifiers == 1 ? 'Um avança.' : '$_qualifiersWord avançam.',
                style:
                    AppTypography.displayL.copyWith(color: colors.onSurface),
              ),
            ],
          ),
        ),
        const FocusSectionHeader(label: 'CLASSIFICAÇÃO'),
        _StandingsTable(
          order: order,
          stats: stats,
          rosters: rosters,
          myTeamId: myTeamId,
          qualifiers: qualifiers,
          scenarios: scenariosComDestino,
          scenarioRound: myPending?.round,
        ),
        if (crossing.isNotEmpty) ...[
          const FocusSectionHeader(label: 'CRUZAMENTO NO MATA-MATA'),
          for (final row in crossing) _CrossingTile(row: row),
        ],
        if (live.isNotEmpty) ...[
          const FocusSectionHeader(
            label: 'AO VIVO NA CATEGORIA',
            live: true,
          ),
          for (final m in live)
            _LiveRow(
              nameA: rosters.nameOf(m.teamAId),
              nameB: rosters.nameOf(m.teamBId),
              playersA: rosters.playersOf(m.teamAId),
              playersB: rosters.playersOf(m.teamBId),
              context: [
                if (m.poolId.isNotEmpty) poolLabelForId(m.poolId),
                if (matchCourtLabelForCard(m).trim().isNotEmpty)
                  matchCourtLabelForCard(m),
              ].join(' · '),
              score: matchCardScoreLabel(m),
            ),
        ],
        if (_address != null) ...[
          const FocusSectionHeader(label: 'ONDE É O QUÊ'),
          _WhereCard(
            rows: [
              (
                'Sua quadra agora',
                myPending != null &&
                        matchCourtLabelForCard(myPending).trim().isNotEmpty
                    ? matchCourtLabelForCard(myPending)
                    : 'A definir',
              ),
              if (widget.tournament.location.trim().isNotEmpty)
                ('Arena', widget.tournament.location.trim()),
              if (widget.tournament.city.trim().isNotEmpty)
                ('Cidade', widget.tournament.city.trim()),
            ],
            onOpenMaps: _openMaps,
          ),
        ],
      ],
    );
  }

  String get _qualifiersWord {
    final n = _offer?.qualifiersPerGroup ?? 2;
    return switch (n) {
      2 => 'Dois',
      3 => 'Três',
      4 => 'Quatro',
      _ => '$n',
    };
  }

  /// "GRUPO B · APÓS 2 DE 3 RODADAS".
  String _kicker(String poolId, List<TournamentMatch> poolMatches) {
    final rounds = poolMatches.map((m) => m.round).toSet().length;
    final played = poolMatches
        .where((m) => TournamentMatchStatus.isCompleted(m.status))
        .map((m) => m.round)
        .toSet()
        .length;
    final label = poolLabelForId(poolId).toUpperCase();
    if (rounds == 0) return label;
    return '$label · APÓS $played DE $rounds RODADAS';
  }

  String? _myTeamId(List<TournamentMatch> matches) {
    for (final m in matches) {
      if (widget.athleteTeamIds.contains(m.teamAId)) return m.teamAId;
      if (widget.athleteTeamIds.contains(m.teamBId)) return m.teamBId;
    }
    return null;
  }

  String? _myPoolId(List<TournamentMatch> matches, String? myTeamId) {
    if (myTeamId == null) return null;
    for (final m in matches) {
      if (m.poolId.trim().isEmpty) continue;
      if (m.teamAId == myTeamId || m.teamBId == myTeamId) return m.poolId;
    }
    return null;
  }

  TournamentMatch? _myPendingMatch(
    List<TournamentMatch> poolMatches,
    String? myTeamId,
  ) {
    if (myTeamId == null) return null;
    final mine = poolMatches
        .where((m) =>
            (m.teamAId == myTeamId || m.teamBId == myTeamId) &&
            !TournamentMatchStatus.isCompleted(m.status) &&
            !TournamentMatchStatus.isCanceled(m.status))
        .toList()
      ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
    return mine.isEmpty ? null : mine.first;
  }
}

/// A tabela do grupo, no desenho do protótipo: cabeçalho de colunas, uma linha
/// por dupla e — no MESMO card, separado por um divisor — o que a rodada
/// decide. Manter os dois juntos é o ponto: a pergunta "em que posição eu
/// estou" e a pergunta "o que muda se eu vencer" se leem na mesma olhada.
class _StandingsTable extends StatelessWidget {
  const _StandingsTable({
    required this.order,
    required this.stats,
    required this.rosters,
    required this.myTeamId,
    required this.qualifiers,
    required this.scenarios,
    required this.scenarioRound,
  });

  final List<String> order;
  final Map<String, TournamentPoolTeamStats> stats;
  final FocusRosters rosters;
  final String? myTeamId;
  final int qualifiers;
  final List<({RoundScenario scenario, String? destination})> scenarios;
  final int? scenarioRound;

  static const double _wV = 26;
  static const double _wD = 26;
  static const double _wSets = 44;
  static const double _wPts = 32;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    Widget head(String text, double width) => SizedBox(
          width: width,
          child: Text(
            text,
            textAlign: TextAlign.center,
            style: AppTypography.monoMeta.copyWith(
              color: colors.onSurfaceMuted,
              fontSize: 10,
            ),
          ),
        );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.outline),
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.sm,
              ),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(
                    color: colors.outline.withValues(alpha: 0.6),
                  ),
                ),
              ),
              child: Row(
                children: [
                  // O mesmo recuo da barra de classificação, para o "#" ficar
                  // alinhado com os números das linhas.
                  const SizedBox(width: 3),
                  SizedBox(width: 20, child: head('#', 20)),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      'DUPLA',
                      style: AppTypography.monoMeta.copyWith(
                        color: colors.onSurfaceMuted,
                        fontSize: 10,
                      ),
                    ),
                  ),
                  head('V', _wV),
                  head('D', _wD),
                  head('SETS', _wSets),
                  head('PTS', _wPts),
                ],
              ),
            ),
            for (var i = 0; i < order.length; i++)
              _StandingRow(
                rank: i + 1,
                stats: stats[order[i]],
                name: rosters.nameOf(order[i], 'Dupla'),
                isMe: order[i] == myTeamId,
                qualifies: i < qualifiers,
                isLast: i == order.length - 1 && scenarios.isEmpty,
              ),
            if (scenarios.isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  AppSpacing.md,
                  AppSpacing.md,
                  AppSpacing.md,
                ),
                decoration: BoxDecoration(
                  color: colors.surfaceRaised.withValues(alpha: 0.4),
                  border: Border(
                    top: BorderSide(
                      color: colors.outline.withValues(alpha: 0.6),
                    ),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      scenarioRound != null
                          ? 'EM JOGO NA RODADA $scenarioRound'
                          : 'EM JOGO NESTA RODADA',
                      style: AppTypography.monoMeta.copyWith(
                        color: colors.onSurfaceMuted,
                        fontSize: 10,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    for (final entry in scenarios)
                      _ScenarioRow(
                        scenario: entry.scenario,
                        destination: entry.destination,
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

/// Uma linha da classificação. A do atleta ganha fundo e o nome marcado com
/// "você"; quem está na faixa de classificação ganha a barra verde à esquerda.
///
/// SEM avatar, seguindo o protótipo: a linha carrega cinco colunas numéricas
/// além do nome, e um rosto aqui espremeria V/D/SETS/PTS. Os rostos seguem nas
/// outras listas do Focus, que têm espaço para eles.
class _StandingRow extends StatelessWidget {
  const _StandingRow({
    required this.rank,
    required this.stats,
    required this.name,
    required this.isMe,
    required this.qualifies,
    required this.isLast,
  });

  final int rank;
  final TournamentPoolTeamStats? stats;
  final String name;
  final bool isMe;
  final bool qualifies;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = stats;

    Widget cell(String text, double width, {bool strong = false}) => SizedBox(
          width: width,
          child: Text(
            text,
            textAlign: TextAlign.center,
            style: AppTypography.monoMeta.copyWith(
              color: strong ? colors.onSurface : colors.onSurfaceMuted,
              fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
            ),
          ),
        );

    return Container(
      decoration: BoxDecoration(
        color: isMe ? AppColors.brand.withValues(alpha: 0.10) : null,
        border: Border(
          left: BorderSide(
            color: qualifies ? colors.win : Colors.transparent,
            width: 3,
          ),
          bottom: isLast
              ? BorderSide.none
              : BorderSide(color: colors.outline.withValues(alpha: 0.5)),
        ),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
      child: Row(
        children: [
          SizedBox(
            width: 20,
            child: Text(
              '$rank',
              textAlign: TextAlign.center,
              style: AppTypography.monoMeta.copyWith(
                color: qualifies ? colors.win : colors.onSurfaceMuted,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    // Menor que o corpo padrão: a linha divide a largura com
                    // quatro colunas numéricas, e nome grande empurra as duas
                    // últimas para fora no celular.
                    style: AppTypography.bodyS.copyWith(
                      color: colors.onSurface,
                      fontWeight: isMe ? FontWeight.w800 : FontWeight.w500,
                    ),
                  ),
                ),
                if (isMe)
                  Text(
                    ' · você',
                    style: AppTypography.bodyS.copyWith(
                      color: AppColors.brand,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
              ],
            ),
          ),
          cell('${s?.wins ?? 0}', _StandingsTable._wV, strong: isMe),
          cell('${s?.losses ?? 0}', _StandingsTable._wD, strong: isMe),
          cell('${s?.setsWon ?? 0}–${s?.setsLost ?? 0}', _StandingsTable._wSets),
          cell('${(s?.wins ?? 0) * 3}', _StandingsTable._wPts, strong: true),
        ],
      ),
    );
  }
}

/// "VENCE 1º do grupo" / "PERDE 2º do grupo" — o que a rodada decide.
class _ScenarioRow extends StatelessWidget {
  const _ScenarioRow({required this.scenario, required this.destination});

  final RoundScenario scenario;

  /// "quartas às 14:30 contra o 2º Grupo A". `null` quando a chave ainda não
  /// declara para onde aquela colocação leva.
  final String? destination;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tag = scenario.won ? 'VENCE' : 'PERDE';
    final tagColor = scenario.won ? colors.win : AppColors.pending;

    // Sem recuo horizontal: esta linha vive DENTRO do card da tabela, que já
    // tem o seu próprio.
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 52,
            child: Text(
              tag,
              style: AppTypography.eyebrow.copyWith(color: tagColor),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              [scenario.text, ?destination].join(' · '),
              style: AppTypography.bodyS.copyWith(color: colors.onSurface),
            ),
          ),
        ],
      ),
    );
  }
}

class _LiveRow extends StatelessWidget {
  const _LiveRow({
    required this.nameA,
    required this.nameB,
    required this.playersA,
    required this.playersB,
    required this.context,
    required this.score,
  });

  final String nameA;
  final String nameB;
  final List<TournamentMatchCardPlayerViewModel> playersA;
  final List<TournamentMatchCardPlayerViewModel> playersB;
  final String context;
  final String score;

  @override
  Widget build(BuildContext ctx) {
    final colors = ctx.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.sm,
      ),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: colors.outline),
        ),
        child: Row(
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: const BoxDecoration(
                color: AppColors.live,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            NexaDuoAvatars(players: playersA, size: 22),
            const SizedBox(width: 4),
            NexaDuoAvatars(players: playersB, size: 22),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$nameA vs $nameB',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style:
                        AppTypography.bodyM.copyWith(color: colors.onSurface),
                  ),
                  if (context.trim().isNotEmpty)
                    Text(
                      context.toUpperCase(),
                      style: AppTypography.eyebrow
                          .copyWith(color: colors.onSurfaceMuted),
                    ),
                ],
              ),
            ),
            if (score.trim().isNotEmpty)
              Text(
                score,
                style: AppTypography.monoMeta
                    .copyWith(color: colors.onSurface),
              ),
          ],
        ),
      ),
    );
  }
}

class _CrossingTile extends StatelessWidget {
  const _CrossingTile({required this.row});

  final CrossingRow row;

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
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: colors.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              row.label,
              style:
                  AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '${row.a}  ×  ${row.b}',
              style: AppTypography.bodyM.copyWith(color: colors.onSurface),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Onde é o quê": as referências do dia, uma por linha, com o mapa da arena
/// no rodapé do mesmo card — o desenho do protótipo.
///
/// O protótipo traz também mesa/súmula, ponto de hidratação e fisioterapia.
/// Nenhum tem campo no projeto: as comodidades da arena são estacionamento,
/// vestiário, quadra coberta, bar, aluguel e acessibilidade, e o torneio nem
/// carrega `arenaId`. Entram quando alguém puder preenchê-los — até lá o card
/// mostra só o que é verdade.
class _WhereCard extends StatelessWidget {
  const _WhereCard({required this.rows, required this.onOpenMaps});

  final List<(String, String)> rows;
  final VoidCallback onOpenMaps;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final visible =
        rows.where((r) => r.$2.trim().isNotEmpty).toList(growable: false);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.outline),
        ),
        child: Column(
          children: [
            for (var i = 0; i < visible.length; i++)
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.lg,
                  vertical: AppSpacing.lg - 2,
                ),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: colors.outline.withValues(alpha: 0.5),
                    ),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        visible[i].$1,
                        style: AppTypography.bodyM
                            .copyWith(color: colors.onSurfaceMuted),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Flexible(
                      child: Text(
                        visible[i].$2,
                        textAlign: TextAlign.right,
                        style: AppTypography.bodyM.copyWith(
                          color: colors.onSurface,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onOpenMaps,
                  icon: const Icon(Icons.place_outlined, size: 16),
                  // Mapa da ARENA: as quadras do torneio são só `{id, name}`,
                  // sem posição, então apontar a quadra seria mentira.
                  label: const Text('Abrir mapa da arena'),
                ),
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
      padding: const EdgeInsets.all(AppSpacing.xxl),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
      ),
    );
  }
}

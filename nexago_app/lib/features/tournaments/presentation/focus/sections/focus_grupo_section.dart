import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
import '../../widgets/tournament_detail/tournament_pool_standings_widgets.dart';
import '../focus_bottom_clearance.dart';
import '../focus_rosters.dart';
import '../focus_section_header.dart';

/// Seção "Grupo": a classificação do atleta, o que a rodada decide, o cruzamento
/// no mata-mata e o que está em quadra na categoria.
///
/// A tabela é a mesma [TournamentPoolStandingsCard] do detalhe do torneio —
/// mesmo motor ([buildPoolStandingsGroups]) e mesmo desenho, para o Focus não
/// discordar do que o atleta vê fora do Modo Focus. Com vários grupos na
/// categoria, a classificação vira carrossel (chips + PageView), começando no
/// grupo do atleta.
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
  PageController? _standingsController;
  int _standingsPage = 0;

  TournamentCategoryOffer? get _offer {
    for (final offer in widget.tournament.categoryOffers) {
      if (offer.id == widget.categoryId) return offer;
    }
    return null;
  }

  @override
  void dispose() {
    _standingsController?.dispose();
    super.dispose();
  }

  void _ensureStandingsController(int initialPage) {
    if (_standingsController != null) return;
    _standingsPage = initialPage;
    _standingsController = PageController(
      initialPage: initialPage,
      viewportFraction: 0.92,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final cards =
        ref
            .watch(tournamentMatchCardsProvider(widget.tournament.id))
            .valueOrNull ??
        const [];
    final all = [for (final c in cards) c.match];
    final categoryMatches = all
        .where((m) => m.categoryId == widget.categoryId)
        .toList();

    final rosters = FocusRosters.fromCards(cards);

    final myTeamId = _myTeamId(categoryMatches);
    final poolId = _myPoolId(categoryMatches, myTeamId);
    if (poolId == null) {
      return _Empty(
        text: 'Sua classificação aparece aqui quando o grupo for sorteado.',
      );
    }

    final myPoolMatches = categoryMatches
        .where((m) => m.poolId == poolId)
        .toList();
    // Todos os grupos da categoria — o carrossel deixa o atleta ver o resto.
    final allPoolMatches = categoryMatches
        .where((m) => m.poolId.trim().isNotEmpty)
        .toList();
    final byId = {for (final c in cards) c.match.id: c};
    final qualifiers = _offer?.qualifiersPerGroup ?? 2;
    final resolvedTeamNames =
        ref
            .watch(
              tournamentCategoryPoolTeamDisplayNamesProvider((
                tournamentId: widget.tournament.id,
                categoryId: widget.categoryId,
              )),
            )
            .valueOrNull ??
        const <String, String>{};
    final standingsGroups = buildPoolStandingsGroups(
      poolMatches: allPoolMatches.isEmpty ? myPoolMatches : allPoolMatches,
      cardsById: byId,
      qualifiersPerGroup: qualifiers,
      athleteTeamIds: widget.athleteTeamIds,
      resolvedTeamNamesById: mergeTeamDisplayNameMaps(
        resolvedTeamNames,
        rosters.duoNamesByTeamId,
      ),
    );

    final myGroupIndex = standingsGroups.indexWhere((g) => g.poolId == poolId);
    final initialPage = myGroupIndex < 0 ? 0 : myGroupIndex;
    if (standingsGroups.length > 1) {
      _ensureStandingsController(initialPage);
    }

    final visibleIndex = standingsGroups.isEmpty
        ? 0
        : _standingsPage.clamp(0, standingsGroups.length - 1);
    final visibleGroup = standingsGroups.isEmpty
        ? null
        : standingsGroups[visibleIndex];
    final visiblePoolMatches = visibleGroup == null
        ? myPoolMatches
        : categoryMatches
              .where((m) => m.poolId == visibleGroup.poolId)
              .toList();
    final kickerPoolId = visibleGroup?.poolId ?? poolId;

    final myPending = _myPendingMatch(myPoolMatches, myTeamId);
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
                  timeLabelOf: (m) =>
                      m.scheduleTime == null ? null : matchTimeLabelForCard(m),
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
                _kicker(kickerPoolId, visiblePoolMatches),
                style: AppTypography.eyebrow.copyWith(color: AppColors.brand),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                qualifiers == 1 ? 'Um avança.' : '$_qualifiersWord avançam.',
                style: AppTypography.displayL.copyWith(color: colors.onSurface),
              ),
            ],
          ),
        ),
        const FocusSectionHeader(label: 'CLASSIFICAÇÃO'),
        if (standingsGroups.length > 1) ...[
          _StandingsGroupChips(
            groups: standingsGroups,
            selectedIndex: visibleIndex,
            athletePoolId: poolId,
            onSelected: (i) {
              setState(() => _standingsPage = i);
              _standingsController?.animateToPage(
                i,
                duration: const Duration(milliseconds: 280),
                curve: Curves.easeOutCubic,
              );
            },
          ),
          const SizedBox(height: 4),
        ],
        if (standingsGroups.isNotEmpty)
          _StandingsCarousel(
            groups: standingsGroups,
            qualifiersPerGroup: qualifiers,
            controller: standingsGroups.length > 1 ? _standingsController : null,
            onPageChanged: (i) => setState(() => _standingsPage = i),
          ),
        if (scenariosComDestino.isNotEmpty)
          _ScenariosCard(
            scenarios: scenariosComDestino,
            scenarioRound: myPending == null
                ? null
                : poolRoundDisplayNumberOf(myPoolMatches, myPending),
          ),
        if (crossing.isNotEmpty) ...[
          const FocusSectionHeader(label: 'CRUZAMENTO NO MATA-MATA'),
          _CrossingBracket(rows: crossing),
        ],
        if (live.isNotEmpty) ...[
          const FocusSectionHeader(label: 'AO VIVO NA CATEGORIA', live: true),
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
    final rounds = poolTotalRounds(poolMatches);
    final played = poolCompletedRounds(poolMatches);
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
    final mine =
        poolMatches
            .where(
              (m) =>
                  (m.teamAId == myTeamId || m.teamBId == myTeamId) &&
                  !TournamentMatchStatus.isCompleted(m.status) &&
                  !TournamentMatchStatus.isCanceled(m.status),
            )
            .toList()
          ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
    return mine.isEmpty ? null : mine.first;
  }
}

/// Chips A/B/C… — atalho pro carrossel (além do swipe).
class _StandingsGroupChips extends StatelessWidget {
  const _StandingsGroupChips({
    required this.groups,
    required this.selectedIndex,
    required this.athletePoolId,
    required this.onSelected,
  });

  final List<TournamentPoolStandingsGroup> groups;
  final int selectedIndex;
  final String athletePoolId;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
        itemCount: groups.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final group = groups[i];
          final selected = i == selectedIndex;
          final isMine = group.poolId == athletePoolId;
          final letter = _groupLetter(group);
          return GestureDetector(
            onTap: () => onSelected(i),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected
                    ? AppColors.brand
                    : Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: selected
                      ? AppColors.brand
                      : Colors.white.withValues(alpha: 0.12),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    letter,
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: selected ? AppColors.black : Colors.white,
                    ),
                  ),
                  if (isMine) ...[
                    const SizedBox(width: 6),
                    Text(
                      'SEU',
                      style: AppTypography.mono(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                        color: selected
                            ? AppColors.black.withValues(alpha: 0.7)
                            : AppColors.brand,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  static String _groupLetter(TournamentPoolStandingsGroup group) {
    final label = group.poolLabel.trim();
    final lower = label.toLowerCase();
    if (lower.startsWith('grupo ')) {
      final parts = label.split(' ');
      if (parts.length >= 2) return parts.last.toUpperCase();
    }
    return (group.poolId.isNotEmpty ? group.poolId : label).toUpperCase();
  }
}

/// Carrossel das classificações — um card por grupo, começa no do atleta.
class _StandingsCarousel extends StatelessWidget {
  const _StandingsCarousel({
    required this.groups,
    required this.qualifiersPerGroup,
    required this.onPageChanged,
    this.controller,
  });

  final List<TournamentPoolStandingsGroup> groups;
  final int qualifiersPerGroup;
  final ValueChanged<int> onPageChanged;
  final PageController? controller;

  @override
  Widget build(BuildContext context) {
    if (groups.length == 1) {
      return TournamentPoolStandingsCard(
        group: groups.first,
        qualifiersPerGroup: qualifiersPerGroup,
        showFooter: true,
      );
    }

    final height = groups
        .map(_estimateHeight)
        .reduce((a, b) => a > b ? a : b);

    return Column(
      children: [
        SizedBox(
          height: height,
          child: PageView.builder(
            controller: controller,
            itemCount: groups.length,
            onPageChanged: onPageChanged,
            itemBuilder: (context, i) {
              return TournamentPoolStandingsCard(
                group: groups[i],
                qualifiersPerGroup: qualifiersPerGroup,
                showFooter: true,
                padding: const EdgeInsets.fromLTRB(6, 8, 6, 0),
              );
            },
          ),
        ),
        const SizedBox(height: 10),
        _StandingsDots(
          count: groups.length,
          controller: controller,
        ),
      ],
    );
  }

  /// Altura estável pro PageView: cabeçalho + linhas (até 2 linhas de nome) +
  /// rodapé da legenda.
  static double _estimateHeight(TournamentPoolStandingsGroup group) {
    const chrome = 14.0 * 2 + 52 + 12 + 20 + 12 + 52;
    return chrome + group.rows.length * 48.0;
  }
}

class _StandingsDots extends StatelessWidget {
  const _StandingsDots({required this.count, required this.controller});

  final int count;
  final PageController? controller;

  @override
  Widget build(BuildContext context) {
    if (controller == null || count <= 1) return const SizedBox.shrink();

    return AnimatedBuilder(
      animation: controller!,
      builder: (context, _) {
        final page = controller!.hasClients
            ? (controller!.page ?? controller!.initialPage.toDouble())
            : controller!.initialPage.toDouble();
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 0; i < count; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: (page - i).abs() < 0.5 ? 16 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color: (page - i).abs() < 0.5
                      ? AppColors.brand
                      : Colors.white.withValues(alpha: 0.28),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

/// O que a rodada decide — fica sob a tabela compartilhada, não embutido nela.
class _ScenariosCard extends StatelessWidget {
  const _ScenariosCard({required this.scenarios, required this.scenarioRound});

  final List<({RoundScenario scenario, String? destination})> scenarios;
  final int? scenarioRound;

  static const _radius = 16.0;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.md,
        AppSpacing.screenH,
        0,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(_radius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(_radius),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
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
        ),
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
    final icon = scenario.won
        ? Icons.trending_up_rounded
        : Icons.trending_down_rounded;

    // Sem padding horizontal extra: o card pai já tem o recuo.
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: tagColor.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: tagColor.withValues(alpha: 0.35)),
            ),
            child: Icon(icon, size: 16, color: tagColor),
          ),
          const SizedBox(width: AppSpacing.sm),
          SizedBox(
            width: 52,
            child: Padding(
              padding: const EdgeInsets.only(top: 5),
              child: Text(
                tag,
                style: AppTypography.eyebrow.copyWith(color: tagColor),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                [
                  scenario.text,
                  if (destination != null && destination!.trim().isNotEmpty)
                    destination!.trim(),
                ].join(' · '),
                style: AppTypography.bodyS.copyWith(color: colors.onSurface),
              ),
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
                    style: AppTypography.bodyM.copyWith(
                      color: colors.onSurface,
                    ),
                  ),
                  if (context.trim().isNotEmpty)
                    Text(
                      context.toUpperCase(),
                      style: AppTypography.eyebrow.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                ],
              ),
            ),
            if (score.trim().isNotEmpty)
              Text(
                score,
                style: AppTypography.monoMeta.copyWith(color: colors.onSurface),
              ),
          ],
        ),
      ),
    );
  }
}

/// Cruzamento em 3 colunas (protótipo): seeds à esquerda, troféu + fase no
/// centro, adversários à direita, com linhas de chave convergindo.
/// Cruzamento em 3 colunas. Em cada lado, os slots vêm **dois a dois** por
/// jogo: cards 1–2 = equipes do 1º confronto, 3–4 = do 2º, etc.
class _CrossingBracket extends StatelessWidget {
  const _CrossingBracket({required this.rows});

  final List<CrossingRow> rows;

  static const _slotHeight = 36.0;
  static const _slotGap = 10.0;
  static const _hubWidth = 64.0;
  static const _gutterWidth = 28.0;

  /// Metade esquerda / direita dos confrontos; cada confronto vira 2 slots
  /// (1º em cima, 2º embaixo na coluna).
  static List<String> _slotsForHalf(List<CrossingRow> matches) {
    final slots = <String>[];
    for (final row in matches) {
      final sides = crossingBracketSides(row);
      slots.add(_compactCrossingSlot(sides.left));
      slots.add(_compactCrossingSlot(sides.right));
    }
    return slots;
  }

  static double _heightForSlotCount(int n) {
    if (n == 0) return 0;
    return n * _slotHeight + (n - 1) * _slotGap;
  }

  @override
  Widget build(BuildContext context) {
    if (rows.length == 1) {
      return _CrossingTile(row: rows.first);
    }

    final colors = context.themeColors;
    final phase = rows.first.label.trim().toUpperCase();
    final lineColor = Colors.white.withValues(alpha: 0.22);

    // Metade dos jogos à esquerda, metade à direita — assim o 1º e o 2º card
    // da coluna esquerda são as duas equipes do primeiro confronto.
    final split = (rows.length + 1) ~/ 2;
    final leftSlots = _slotsForHalf(rows.sublist(0, split));
    final rightSlots = _slotsForHalf(rows.sublist(split));
    final columnHeight = _heightForSlotCount(
      leftSlots.length > rightSlots.length
          ? leftSlots.length
          : rightSlots.length,
    );

    Widget slotColumn(List<String> slots) {
      return Column(
        children: [
          for (var i = 0; i < slots.length; i++) ...[
            if (i > 0) const SizedBox(height: _slotGap),
            _CrossingSlot(label: slots[i], height: _slotHeight),
          ],
        ],
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      child: SizedBox(
        height: columnHeight,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: slotColumn(leftSlots)),
            SizedBox(
              width: _gutterWidth,
              child: CustomPaint(
                painter: _CrossingSidePainter(
                  slotCount: leftSlots.length,
                  slotHeight: _slotHeight,
                  slotGap: _slotGap,
                  color: lineColor,
                  towardCenter: true,
                ),
              ),
            ),
            SizedBox(
              width: _hubWidth,
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.emoji_events_rounded,
                      color: AppColors.brand,
                      size: 28,
                      shadows: [
                        Shadow(
                          color: AppColors.brand.withValues(alpha: 0.55),
                          blurRadius: 12,
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      phase.replaceAll(' ', '\n'),
                      textAlign: TextAlign.center,
                      style: AppTypography.mono(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurfaceMuted,
                        letterSpacing: 0.6,
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(
              width: _gutterWidth,
              child: CustomPaint(
                painter: _CrossingSidePainter(
                  slotCount: rightSlots.length,
                  slotHeight: _slotHeight,
                  slotGap: _slotGap,
                  color: lineColor,
                  towardCenter: false,
                ),
              ),
            ),
            Expanded(child: slotColumn(rightSlots)),
          ],
        ),
      ),
    );
  }
}

/// "1º do Grupo A" → "1º Grupo A" (como no protótipo).
String _compactCrossingSlot(String raw) =>
    raw.replaceAll(' do ', ' ').replaceAll(' Do ', ' ').trim();

class _CrossingSlot extends StatelessWidget {
  const _CrossingSlot({required this.label, required this.height});

  final String label;
  final double height;

  static const _radius = 10.0;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return SizedBox(
      height: height,
      width: double.infinity,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(_radius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(_radius),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${label}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 16,
                  color: colors.onSurfaceMuted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Linhas no vão entre slots e hub: pares → nível seguinte → centro.
class _CrossingSidePainter extends CustomPainter {
  const _CrossingSidePainter({
    required this.slotCount,
    required this.slotHeight,
    required this.slotGap,
    required this.color,
    required this.towardCenter,
  });

  final int slotCount;
  final double slotHeight;
  final double slotGap;
  final Color color;

  /// `true` = coluna esquerda (linhas correm para a direita / hub).
  final bool towardCenter;

  double _slotCenterY(int index) =>
      index * (slotHeight + slotGap) + slotHeight / 2;

  @override
  void paint(Canvas canvas, Size size) {
    if (slotCount < 2) return;

    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final startX = towardCenter ? 0.0 : size.width;
    final endX = towardCenter ? size.width : 0.0;
    final joinX = towardCenter ? size.width * 0.45 : size.width * 0.55;

    void pairBracket(double y1, double y2, double outX) {
      final midY = (y1 + y2) / 2;
      final path = Path()
        ..moveTo(startX, y1)
        ..lineTo(joinX, y1)
        ..lineTo(joinX, y2)
        ..moveTo(startX, y2)
        ..lineTo(joinX, y2)
        ..moveTo(joinX, midY)
        ..lineTo(outX, midY);
      canvas.drawPath(path, paint);
    }

    final pairMids = <double>[];
    for (var i = 0; i + 1 < slotCount; i += 2) {
      final y1 = _slotCenterY(i);
      final y2 = _slotCenterY(i + 1);
      final outX = slotCount <= 2
          ? endX
          : (towardCenter ? size.width * 0.72 : size.width * 0.28);
      pairBracket(y1, y2, outX);
      pairMids.add((y1 + y2) / 2);
    }

    if (slotCount.isOdd) {
      final y = _slotCenterY(slotCount - 1);
      canvas.drawLine(Offset(startX, y), Offset(endX, y), paint);
    }

    if (pairMids.length >= 2) {
      final y1 = pairMids[0];
      final y2 = pairMids[1];
      final midY = (y1 + y2) / 2;
      final level2X = towardCenter ? size.width * 0.72 : size.width * 0.28;
      final path = Path()
        ..moveTo(level2X, y1)
        ..lineTo(level2X, y2)
        ..moveTo(level2X, midY)
        ..lineTo(endX, midY);
      canvas.drawPath(path, paint);
    } else if (pairMids.length == 1 && slotCount > 2) {
      canvas.drawLine(
        Offset(joinX, pairMids.first),
        Offset(endX, pairMids.first),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _CrossingSidePainter oldDelegate) =>
      oldDelegate.slotCount != slotCount ||
      oldDelegate.slotHeight != slotHeight ||
      oldDelegate.slotGap != slotGap ||
      oldDelegate.color != color ||
      oldDelegate.towardCenter != towardCenter;
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
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  row.label,
                  style: AppTypography.eyebrow.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  '${_compactCrossingSlot(crossingBracketSides(row).left)}  ×  '
                  '${_compactCrossingSlot(crossingBracketSides(row).right)}',
                  style: AppTypography.bodyM.copyWith(color: colors.onSurface),
                ),
              ],
            ),
          ),
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

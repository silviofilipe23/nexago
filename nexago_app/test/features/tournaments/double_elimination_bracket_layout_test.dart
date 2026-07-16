import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/double_elimination_bracket_layout.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';

TournamentMatch _match({
  required String id,
  String matchType = 'WB',
  int round = 1,
  int matchNumber = 0,
  int? advanceTo,
  String? advanceSlot,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'cat-a',
    round: round,
    matchType: matchType,
    poolId: '',
    teamAId: 'a$id',
    teamBId: 'b$id',
    status: 'Scheduled',
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: matchNumber,
    winnerAdvanceMatchNumber: advanceTo,
    winnerAdvanceSlot: advanceSlot,
  );
}

void main() {
  // Planta de 6 duplas (`functions/src/bracket-definitions/bracket-6-teams.ts`):
  // fiação irregular — #1 alimenta o slot B do #3, #2 alimenta o slot A do #4.
  final sixTeamPlan = [
    _match(id: 'w1', matchType: 'WB', round: 1, matchNumber: 1, advanceTo: 3, advanceSlot: 'B'),
    _match(id: 'w2', matchType: 'WB', round: 1, matchNumber: 2, advanceTo: 4, advanceSlot: 'A'),
    _match(id: 'w3', matchType: 'WB', round: 2, matchNumber: 3, advanceTo: 7, advanceSlot: 'A'),
    _match(id: 'w4', matchType: 'WB', round: 2, matchNumber: 4, advanceTo: 7, advanceSlot: 'B'),
    _match(id: 'l5', matchType: 'LB', round: 1, matchNumber: 5, advanceTo: 8, advanceSlot: 'A'),
    _match(id: 'l6', matchType: 'LB', round: 1, matchNumber: 6, advanceTo: 8, advanceSlot: 'B'),
    _match(id: 'w7', matchType: 'WB', round: 3, matchNumber: 7, advanceTo: 11, advanceSlot: 'B'),
    _match(id: 'l8', matchType: 'LB', round: 2, matchNumber: 8, advanceTo: 9, advanceSlot: 'B'),
    _match(id: 'l9', matchType: 'LB', round: 3, matchNumber: 9, advanceTo: 11, advanceSlot: 'A'),
    _match(id: 'tp', matchType: 'Third Place', round: 1, matchNumber: 10),
    _match(id: 'gf', matchType: 'Final', round: 1, matchNumber: 11),
  ];

  BracketLayoutNode nodeOf(DoubleEliminationBracketLayout layout, String id) =>
      layout.nodes.firstWhere((n) => n.matchId == id);

  double centerY(BracketLayoutNode node) =>
      node.position.dy + node.size.height / 2;

  test('columns follow the DE track order (WB, 3º lugar, Final, LB)', () {
    final layout = buildDoubleEliminationBracketLayout(sixTeamPlan);

    expect(layout.nodes, hasLength(11));
    expect(
      layout.columns.map((c) => c.label),
      [
        'WB · RODADA 1',
        'WB · RODADA 2',
        'WB · RODADA 3',
        '3º LUGAR',
        'FINAL',
        'LB · RODADA 1',
        'LB · RODADA 2',
        'LB · RODADA 3',
      ],
    );
    expect(layout.canvasSize.width, greaterThan(0));
    expect(layout.canvasSize.height, greaterThan(0));
  });

  test('edges follow the real advance wiring, not positional pairing', () {
    final layout = buildDoubleEliminationBracketLayout(sixTeamPlan);

    BracketLayoutEdge? edge(String from, String to) {
      for (final e in layout.edges) {
        if (e.fromMatchId == from && e.toMatchId == to) return e;
      }
      return null;
    }

    // Fiação real da planta de 6: #1→#3 e #2→#4 (posicional daria #2→#3).
    expect(edge('w1', 'w3'), isNotNull);
    expect(edge('w2', 'w4'), isNotNull);
    expect(edge('w2', 'w3'), isNull);
    expect(edge('w3', 'w7'), isNotNull);
    expect(edge('w4', 'w7'), isNotNull);
    expect(edge('l5', 'l8'), isNotNull);
    expect(edge('l6', 'l8'), isNotNull);
    expect(edge('l8', 'l9'), isNotNull);

    // Sem conector entrando na Final nem cruzando WB↔LB.
    expect(layout.edges.where((e) => e.toMatchId == 'gf'), isEmpty);
    expect(layout.edges.where((e) => e.toMatchId == 'tp'), isEmpty);
    expect(edge('w7', 'l9'), isNull);
  });

  test('column order derives from wiring (feeder of slot A above slot B)', () {
    // Fiação invertida: #3 alimenta o slot B da final da WB e #4 o slot A —
    // o #4 deve ficar ACIMA do #3, apesar do matchNumber maior.
    final inverted = [
      _match(id: 'w1', matchType: 'WB', round: 1, matchNumber: 1, advanceTo: 4, advanceSlot: 'A'),
      _match(id: 'w2', matchType: 'WB', round: 1, matchNumber: 2, advanceTo: 3, advanceSlot: 'A'),
      _match(id: 'w3', matchType: 'WB', round: 2, matchNumber: 3, advanceTo: 5, advanceSlot: 'B'),
      _match(id: 'w4', matchType: 'WB', round: 2, matchNumber: 4, advanceTo: 5, advanceSlot: 'A'),
      _match(id: 'w5', matchType: 'WB', round: 3, matchNumber: 5),
    ];
    final layout = buildDoubleEliminationBracketLayout(inverted);

    expect(
      centerY(nodeOf(layout, 'w4')),
      lessThan(centerY(nodeOf(layout, 'w3'))),
    );
    // E a rodada anterior acompanha os jogos que alimenta: #1 (→#4) acima de #2 (→#3).
    expect(
      centerY(nodeOf(layout, 'w1')),
      lessThan(centerY(nodeOf(layout, 'w2'))),
    );
  });

  test('vertical position follows feeders (straight line for single feeder)', () {
    final layout = buildDoubleEliminationBracketLayout(sixTeamPlan);

    // Alimentador único → mesmo centro (conector reto).
    expect(
      centerY(nodeOf(layout, 'w3')),
      closeTo(centerY(nodeOf(layout, 'w1')), 0.01),
    );
    expect(
      centerY(nodeOf(layout, 'w4')),
      closeTo(centerY(nodeOf(layout, 'w2')), 0.01),
    );
    // Dois alimentadores → nó no meio dos pais.
    expect(
      centerY(nodeOf(layout, 'w7')),
      closeTo(
        (centerY(nodeOf(layout, 'w3')) + centerY(nodeOf(layout, 'w4'))) / 2,
        0.01,
      ),
    );
  });

  test('play-in sharing the fed round is split into its own column', () {
    // Planta 25: play-in da LB gravado com o MESMO round da rodada que alimenta.
    final matches = [
      _match(id: 'p1', matchType: 'LB', round: 2, matchNumber: 5, advanceTo: 6, advanceSlot: 'A'),
      _match(id: 'p2', matchType: 'LB', round: 2, matchNumber: 6, advanceTo: 9, advanceSlot: 'A'),
    ];
    final layout = buildDoubleEliminationBracketLayout(matches);

    final p1 = nodeOf(layout, 'p1');
    final p2 = nodeOf(layout, 'p2');
    expect(p1.columnKey, isNot(p2.columnKey));
    expect(p1.position.dx, lessThan(p2.position.dx));
    expect(
      layout.edges,
      contains(
        isA<BracketLayoutEdge>()
            .having((e) => e.fromMatchId, 'from', 'p1')
            .having((e) => e.toMatchId, 'to', 'p2'),
      ),
    );
  });

  test('LB track is placed below WB track and Final is centered on WB', () {
    final layout = buildDoubleEliminationBracketLayout(sixTeamPlan);

    final wbBottom = layout.nodes
        .where((n) => n.columnKey.startsWith('WB'))
        .map((n) => n.position.dy + n.size.height)
        .reduce((a, b) => a > b ? a : b);
    for (final node
        in layout.nodes.where((n) => n.columnKey.startsWith('LB'))) {
      expect(node.position.dy, greaterThan(wbBottom));
    }

    final wbTop = layout.nodes
        .where((n) => n.columnKey.startsWith('WB'))
        .map((n) => n.position.dy)
        .reduce((a, b) => a < b ? a : b);
    final finalNode = nodeOf(layout, 'gf');
    expect(finalNode.isFinal, isTrue);
    expect(centerY(finalNode), greaterThan(wbTop));
    expect(centerY(finalNode), lessThan(wbBottom));
  });

  test('legacy matches without wiring still lay out, without connectors', () {
    final legacy = [
      _match(id: 'w1', matchType: 'WB', round: 1, matchNumber: 1),
      _match(id: 'w2', matchType: 'WB', round: 1, matchNumber: 2),
      _match(id: 'w3', matchType: 'WB', round: 2, matchNumber: 3),
      _match(id: 'gf', matchType: 'Final', round: 1, matchNumber: 4),
    ];
    final layout = buildDoubleEliminationBracketLayout(legacy);

    expect(layout.nodes, hasLength(4));
    expect(layout.edges, isEmpty);
    // Sem fiação, a coluna preserva a ordem por matchNumber.
    expect(
      centerY(nodeOf(layout, 'w1')),
      lessThan(centerY(nodeOf(layout, 'w2'))),
    );
  });

  test('returns empty layout for no matches', () {
    final layout = buildDoubleEliminationBracketLayout(const []);
    expect(layout.nodes, isEmpty);
    expect(layout.canvasSize, Size.zero);
  });
}

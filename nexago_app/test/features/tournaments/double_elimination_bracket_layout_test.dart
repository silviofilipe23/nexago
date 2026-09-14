import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/double_elimination_bracket_layout.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';

import 'bracket_plants_fixture.dart';

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
    _match(
        id: 'w1',
        matchType: 'WB',
        round: 1,
        matchNumber: 1,
        advanceTo: 3,
        advanceSlot: 'B'),
    _match(
        id: 'w2',
        matchType: 'WB',
        round: 1,
        matchNumber: 2,
        advanceTo: 4,
        advanceSlot: 'A'),
    _match(
        id: 'w3',
        matchType: 'WB',
        round: 2,
        matchNumber: 3,
        advanceTo: 7,
        advanceSlot: 'A'),
    _match(
        id: 'w4',
        matchType: 'WB',
        round: 2,
        matchNumber: 4,
        advanceTo: 7,
        advanceSlot: 'B'),
    _match(
        id: 'l5',
        matchType: 'LB',
        round: 1,
        matchNumber: 5,
        advanceTo: 8,
        advanceSlot: 'A'),
    _match(
        id: 'l6',
        matchType: 'LB',
        round: 1,
        matchNumber: 6,
        advanceTo: 8,
        advanceSlot: 'B'),
    _match(
        id: 'w7',
        matchType: 'WB',
        round: 3,
        matchNumber: 7,
        advanceTo: 11,
        advanceSlot: 'B'),
    _match(
        id: 'l8',
        matchType: 'LB',
        round: 2,
        matchNumber: 8,
        advanceTo: 9,
        advanceSlot: 'B'),
    _match(
        id: 'l9',
        matchType: 'LB',
        round: 3,
        matchNumber: 9,
        advanceTo: 11,
        advanceSlot: 'A'),
    _match(id: 'tp', matchType: 'Third Place', round: 1, matchNumber: 10),
    _match(id: 'gf', matchType: 'Final', round: 1, matchNumber: 11),
  ];

  BracketLayoutNode nodeOf(DoubleEliminationBracketLayout layout, String id) =>
      layout.nodes.firstWhere((n) => n.matchId == id);

  double centerY(BracketLayoutNode node) =>
      node.position.dy + node.size.height / 2;

  test('WB à esquerda do centro, LB à direita, convergência no meio', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);

    double xOf(int n) =>
        layout.nodes.firstWhere((node) => node.matchId == 'm$n').position.dx;

    // #16 (quarta da WB) → #19 (semifinal) ← #17 (LB)
    expect(xOf(16), lessThan(xOf(19)));
    expect(xOf(17), greaterThan(xOf(19)));
    // A LB corre da direita para o centro: a R1 fica na ponta direita.
    expect(xOf(11), greaterThan(xOf(14)));
    expect(xOf(14), greaterThan(xOf(17)));
  });

  test('a semifinal fica na média vertical dos seus dois alimentadores', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    double cy(int n) {
      final node = layout.nodes.firstWhere((x) => x.matchId == 'm$n');
      return node.position.dy + node.size.height / 2;
    }

    expect(cy(19), closeTo((cy(16) + cy(17)) / 2, 0.01));
    expect(cy(20), closeTo((cy(15) + cy(18)) / 2, 0.01));
  });

  test('as duas semifinais não colidem', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    final a = layout.nodes.firstWhere((n) => n.matchId == 'm19');
    final b = layout.nodes.firstWhere((n) => n.matchId == 'm20');
    expect((a.position.dy - b.position.dy).abs(),
        greaterThanOrEqualTo(a.size.height));
  });

  test('o jogo com bye desloca — não cola na altura do alimentador', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    double cy(int n) {
      final node = layout.nodes.firstWhere((x) => x.matchId == 'm$n');
      return node.position.dy + node.size.height / 2;
    }

    // #5 recebe o seed 2 (bye) e o vencedor do #1. Se colasse no #1, os dois
    // teriam o mesmo centro — o bug que o desenho antigo tinha.
    expect(cy(5), isNot(closeTo(cy(1), 0.01)));
    expect(cy(5), lessThan(cy(1)));
  });

  test(
      'columns follow the convergent order — WB left-to-right, '
      'DESFECHO at the center, LB right-to-left', () {
    final layout = buildDoubleEliminationBracketLayout(sixTeamPlan);

    expect(layout.nodes, hasLength(11));
    expect(
      layout.columns.map((c) => c.label),
      [
        'WB · RODADA 1',
        'WB · RODADA 2',
        'WB · RODADA 3',
        'DESFECHO',
        'LB · RODADA 3',
        'LB · RODADA 2',
        'LB · RODADA 1',
      ],
    );
    // A coluna central mistura Final e 3º lugar (nenhum dos dois converge
    // direto nesta planta): key e label viram 'DESFECHO', e o columnKey de
    // cada node concorda com a key da coluna em que ele foi colocado.
    final desfecho = layout.columns.firstWhere((c) => c.key == 'DESFECHO');
    expect(desfecho.matchIds, containsAll(['tp', 'gf']));
    expect(nodeOf(layout, 'tp').columnKey, 'DESFECHO');
    expect(nodeOf(layout, 'gf').columnKey, 'DESFECHO');
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

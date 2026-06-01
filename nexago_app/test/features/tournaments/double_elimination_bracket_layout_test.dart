import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/double_elimination_bracket_layout.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';

TournamentMatch _match({
  required String id,
  String matchType = 'WB',
  int round = 1,
  int matchNumber = 0,
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
  );
}

void main() {
  final deMatches = [
    _match(id: 'wb1', matchType: 'WB', round: 1, matchNumber: 1),
    _match(id: 'wb2', matchType: 'WB', round: 1, matchNumber: 2),
    _match(id: 'lb1', matchType: 'LB', round: 1, matchNumber: 3),
    _match(id: 'wb3', matchType: 'WB', round: 2, matchNumber: 4),
    _match(id: 'lb2', matchType: 'LB', round: 2, matchNumber: 5),
    _match(id: 'final', matchType: 'Final', round: 0, matchNumber: 6),
  ];

  test('buildDoubleEliminationBracketLayout groups columns in DE order', () {
    final layout = buildDoubleEliminationBracketLayout(deMatches);

    expect(layout.nodes, hasLength(6));
    expect(
      layout.columns.map((c) => c.label),
      [
        'WB · RODADA 1',
        'WB · RODADA 2',
        'FINAL',
        'LB · RODADA 1',
        'LB · RODADA 2',
      ],
    );
    expect(layout.canvasSize.width, greaterThan(0));
    expect(layout.canvasSize.height, greaterThan(0));
  });

  test('round 1 nodes have wider vertical spacing than round 2 within WB', () {
    final layout = buildDoubleEliminationBracketLayout(deMatches);
    final wb1Nodes = layout.nodes.where((n) => n.columnKey == 'WB:1').toList()
      ..sort((a, b) => a.slotIndex.compareTo(b.slotIndex));
    final wb2Node = layout.nodes.firstWhere((n) => n.columnKey == 'WB:2');

    expect(wb1Nodes, hasLength(2));
    final spacing = (wb1Nodes[1].position.dy - wb1Nodes[0].position.dy).abs();
    expect(spacing, greaterThan(BracketLayoutMetrics.rowUnit));
    expect(
      wb2Node.position.dy + BracketLayoutMetrics.cardHeight / 2,
      closeTo(
        (wb1Nodes[0].position.dy +
                wb1Nodes[1].position.dy +
                BracketLayoutMetrics.cardHeight) /
            2,
        2,
      ),
    );
  });

  test('LB track is placed below WB track', () {
    final layout = buildDoubleEliminationBracketLayout(deMatches);
    final wb1 = layout.nodes.firstWhere((n) => n.columnKey == 'WB:1');
    final lb1 = layout.nodes.firstWhere((n) => n.columnKey == 'LB:1');

    expect(lb1.position.dy, greaterThan(wb1.position.dy + 100));
  });

  test('edges connect intra-bracket matches to next round', () {
    final layout = buildDoubleEliminationBracketLayout(deMatches);

    expect(
      layout.edges,
      contains(
        isA<BracketLayoutEdge>()
            .having((e) => e.fromMatchId, 'from', 'wb1')
            .having((e) => e.toMatchId, 'to', 'wb3'),
      ),
    );
    expect(
      layout.edges,
      contains(
        isA<BracketLayoutEdge>()
            .having((e) => e.fromMatchId, 'from', 'wb2')
            .having((e) => e.toMatchId, 'to', 'wb3'),
      ),
    );
  });

  test('returns empty layout for no matches', () {
    final layout = buildDoubleEliminationBracketLayout(const []);
    expect(layout.nodes, isEmpty);
    expect(layout.canvasSize, Size.zero);
  });
}

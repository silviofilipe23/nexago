import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/match_point_write.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';

const _bt = {
  'kind': 'sets_games',
  'bestOf': 3,
  'gamesPerSet': 6,
  'winByGames': 2,
  'tiebreakAtGames': 6,
  'tiebreakTo': 7,
  'noAd': true,
  'decidingSet': 'super_tiebreak',
  'superTiebreakTo': 10,
};

Map<String, dynamic> _doc(Map<String, dynamic> extra) => {
  'tournamentId': 't1',
  'teamAId': 'A',
  'teamBId': 'B',
  'status': 'In Progress',
  'bestOf': 3,
  'servingTeamId': 'A',
  ...extra,
};

/// Aplica o `matchUpdate` sobre o doc (sentinelas de delete apagam o campo).
Map<String, dynamic> _apply(
  Map<String, dynamic> doc,
  Map<String, dynamic> update,
) {
  final next = Map<String, dynamic>.from(doc);
  update.forEach((k, v) {
    if (v is FieldValue) {
      next.remove(k);
    } else {
      next[k] = v;
    }
  });
  return next;
}

void main() {
  test('desfazer com a timeline atrasada não repõe estado velho', () {
    ({int scoreA, int scoreB, int gameA, int gameB}) landedOf(
      Map<String, dynamic> e,
    ) => (
      scoreA: e['scoreA'] as int,
      scoreB: e['scoreB'] as int,
      gameA: e['gameA'] as int,
      gameB: e['gameB'] as int,
    );
    final d0 = _doc({
      'scoringProfile': _bt,
      'sets': [
        {'a': 5, 'b': 0},
      ],
      'currentSetIndex': 0,
      'currentGame': {'a': 1, 'b': 0},
    });
    final p1 = buildPointWrite(TournamentMatchMapper.fromMap('m1', d0), 'A')!;
    final d1 = _apply(d0, p1.matchUpdate);
    final p2 = buildPointWrite(TournamentMatchMapper.fromMap('m1', d1), 'A')!;
    final d2 = _apply(d1, p2.matchUpdate);
    // Outra mesa já marcou P2; esta ainda acha que o último é P1.
    final stale = buildUndoWrite(
      TournamentMatchMapper.fromMap('m1', d2),
      'A',
      0,
      prev: p1.pointEvent['prev'] as Map<String, dynamic>,
      landed: landedOf(p1.pointEvent),
    );
    expect(stale, isNull);
    final ok = buildUndoWrite(
      TournamentMatchMapper.fromMap('m1', d2),
      'A',
      0,
      prev: p2.pointEvent['prev'] as Map<String, dynamic>,
      landed: landedOf(p2.pointEvent),
    )!;
    expect(ok.matchUpdate['currentGame'], {'a': 2, 'b': 0});
  });

  test(
    'ponto que fecha o set: currentGame zerado, snapshot no evento; desfazer volta ao 40-0',
    () {
      final before = _doc({
        'scoringProfile': _bt,
        'sets': [
          {'a': 5, 'b': 0},
        ],
        'currentSetIndex': 0,
        'currentGame': {'a': 3, 'b': 0},
      });
      final w = buildPointWrite(
        TournamentMatchMapper.fromMap('m1', before),
        'A',
      )!;
      expect(w.matchUpdate['currentGame'], {'a': 0, 'b': 0});
      expect((w.matchUpdate['sets'] as List).first['a'], 6);
      expect(w.matchUpdate['currentSetIndex'], 1);
      expect(w.matchUpdate['servingTeamId'], '');
      expect(w.pointEvent['scoreA'], 6);
      expect(w.pointEvent['gameA'], 0);
      final prev = w.pointEvent['prev'] as Map<String, dynamic>;
      expect(prev['currentGame'], {'a': 3, 'b': 0});

      final after = _apply(before, w.matchUpdate);
      final u = buildUndoWrite(
        TournamentMatchMapper.fromMap('m1', after),
        'A',
        0,
        prev: prev,
      )!;
      expect(u.matchUpdate['sets'], [
        {'a': 5, 'b': 0},
      ]);
      expect(u.matchUpdate['currentGame'], {'a': 3, 'b': 0});
      expect(u.matchUpdate['currentSetIndex'], 0);
      expect(u.matchUpdate['servingTeamId'], 'A');
      expect(u.pointEvent['type'], 'undo-point');
    },
  );

  test('ponto que fecha a partida e o desfazer dele', () {
    final before = _doc({
      'scoringProfile': _bt,
      'sets': [
        {'a': 6, 'b': 0},
        {'a': 5, 'b': 0},
      ],
      'currentSetIndex': 1,
      'currentGame': {'a': 3, 'b': 0},
    });
    final w = buildPointWrite(
      TournamentMatchMapper.fromMap('m1', before),
      'A',
    )!;
    expect(w.matchUpdate['status'], 'Completed');
    expect(w.matchUpdate['winnerId'], 'A');
    final after = _apply(before, w.matchUpdate);
    final u = buildUndoWrite(
      TournamentMatchMapper.fromMap('m1', after),
      'A',
      1,
      prev: w.pointEvent['prev'] as Map<String, dynamic>,
    )!;
    expect(u.matchUpdate['status'], 'In Progress');
    expect(u.matchUpdate['resultA'], '1');
  });

  test('partida de games sem snapshot no evento: desfazer não faz nada', () {
    final m = TournamentMatchMapper.fromMap(
      'm1',
      _doc({
        'scoringProfile': _bt,
        'sets': [
          {'a': 1, 'b': 0},
        ],
        'currentSetIndex': 0,
      }),
    );
    expect(buildUndoWrite(m, 'A', 0), isNull);
  });

  test(
    'partida de pontos: nada de currentGame nem snapshot, desfazer igual a hoje',
    () {
      final doc = _doc({
        'sets': [
          {'a': 10, 'b': 8},
        ],
        'currentSetIndex': 0,
      });
      final w = buildPointWrite(TournamentMatchMapper.fromMap('m1', doc), 'A')!;
      expect(w.matchUpdate.containsKey('currentGame'), isFalse);
      expect(w.pointEvent.containsKey('prev'), isFalse);
      final m = TournamentMatchMapper.fromMap('m1', {
        ...doc,
        'sets': [
          {'a': 11, 'b': 8},
        ],
      });
      expect(
        buildUndoWrite(m, 'A', 0, prev: const {'x': 1})!.matchUpdate['sets'],
        buildUndoWrite(m, 'A', 0)!.matchUpdate['sets'],
      );
    },
  );
}

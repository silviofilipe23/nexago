import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/sports/sport_catalog.dart';

import 'sport_vectors_data.dart';

ScoreSetValue _set(Map<String, dynamic> m) {
  final tb = m['tb'] as Map<String, dynamic>?;
  return ScoreSetValue(
    m['a'] as int,
    m['b'] as int,
    tb: tb == null ? null : ScoreSetValue(tb['a'] as int, tb['b'] as int),
  );
}

List<Object> _plain(List<ScoreSetValue> sets) => [
  for (final s in sets)
    [s.a, s.b, if (s.tb != null) s.tb!.a, if (s.tb != null) s.tb!.b],
];

GamesLiveState _state(Map<String, dynamic> m) {
  final g = m['currentGame'] as Map<String, dynamic>;
  return (
    sets: [
      for (final s in m['sets'] as List<dynamic>)
        _set(s as Map<String, dynamic>),
    ],
    currentSetIndex: m['currentSetIndex'] as int,
    currentGame: (a: g['a'] as int, b: g['b'] as int),
    servingTeamId: m['servingTeamId'] as String,
  );
}

void main() {
  final vectors = jsonDecode(kScoringVectorsJson) as Map<String, dynamic>;
  final profiles = vectors['profiles'] as Map<String, dynamic>;
  final live = vectors['liveVectors'] as List<dynamic>;

  group('motor de games da mesa (vetores compartilhados com os portais)', () {
    for (var i = 0; i < live.length; i++) {
      final v = live[i] as Map<String, dynamic>;
      final points = v['points'] as String;
      test('caso $i (${v['profile']} · ${points.length} pontos)', () {
        final profile =
            ScoringRules.profileFromRaw(profiles[v['profile']])
                as SetsGamesProfile;
        var state = v['start'] == null
            ? (
                sets: const <ScoreSetValue>[],
                currentSetIndex: 0,
                currentGame: (a: 0, b: 0),
                servingTeamId: 'A',
              )
            : _state(v['start'] as Map<String, dynamic>);
        String? closed;
        String? winner;
        for (final ch in points.split('')) {
          final r = LiveGames.apply(
            state,
            ch,
            profile,
            teamAId: 'A',
            teamBId: 'B',
          );
          state = r.state;
          closed = r.closed.name;
          winner = r.winnerSide;
        }
        final expected = v['expect'] as Map<String, dynamic>;
        final want = _state(expected);
        expect(_plain(state.sets), _plain(want.sets));
        expect(state.currentSetIndex, want.currentSetIndex);
        expect(state.currentGame, want.currentGame);
        expect(state.servingTeamId, want.servingTeamId);
        expect(winner, expected['winnerSide']);
        expect(closed, expected['closed']);
        final labels = v['labels'] as Map<String, dynamic>?;
        if (labels != null) {
          final got = LiveGames.pointLabels(state, profile);
          expect([got.a, got.b], [labels['a'], labels['b']]);
        }
        final hint = v['hint'] as String?;
        if (hint != null) {
          expect(
            LiveGames.hint(state, profile, teamAId: 'A', teamBId: 'B'),
            hint,
          );
        }
      });
    }
  });
}

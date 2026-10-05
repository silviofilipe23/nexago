import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/sports/sport_catalog.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/quick_score_rows.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';

const _bt = SetsGamesProfile(
  bestOf: 3,
  gamesPerSet: 6,
  winByGames: 2,
  tiebreakAtGames: 6,
  tiebreakTo: 7,
  noAd: true,
  decidingSet: DecidingSet.superTiebreak,
  superTiebreakTo: 10,
);

void main() {
  test('partida de pontos: linhas e payload como hoje', () {
    final p = quickScoreProfile(null, 3);
    final rows = quickScoreRows(p, const [
      TournamentMatchSet(a: 21, b: 19),
      TournamentMatchSet(a: 15, b: 21),
      TournamentMatchSet(a: 15, b: 13),
    ]);
    expect(rows.map((r) => r.label).toList(), ['até 21', 'até 21', 'até 15']);
    expect(
      quickScorePayload(p, const [
        TournamentMatchSet(a: 21, b: 19, tb: (a: 1, b: 0)),
      ]),
      [
        {'a': 21, 'b': 19},
      ],
    );
  });

  test('beach tennis: tie-break em 7-6 e super tie-break no 3º set', () {
    final p = quickScoreProfile(_bt, 3);
    const sets = [
      TournamentMatchSet(a: 7, b: 6, tb: (a: 7, b: 3)),
      TournamentMatchSet(a: 2, b: 6),
      TournamentMatchSet(a: 0, b: 0, tb: (a: 10, b: 7)),
    ];
    expect(quickScoreRows(p, sets).map((r) => r.kind).toList(), [
      QuickSetKind.gamesTiebreak,
      QuickSetKind.games,
      QuickSetKind.superTiebreak,
    ]);
    expect(quickScorePayload(p, sets), [
      {
        'a': 7,
        'b': 6,
        'tb': {'a': 7, 'b': 3},
      },
      {'a': 2, 'b': 6},
      {
        'a': 1,
        'b': 0,
        'tb': {'a': 10, 'b': 7},
      },
    ]);
    expect(quickScoreWins(p, sets), (a: 2, b: 1));
    expect(quickScoreWinnerSide(p, sets), 'A');
  });

  test('chip em MD1 numa partida de games usa o perfil de games', () {
    final p = quickScoreProfile(_bt, 1);
    expect(
      quickScoreRows(p, const [TournamentMatchSet(a: 6, b: 3)]).single.label,
      'até 6 games',
    );
    expect(ScoringRules.rulesLabel(p), contains('6 games'));
  });
}

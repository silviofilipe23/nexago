import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/sports/sport_catalog.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_journey_logic.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_scenarios.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_tournament_numbers.dart';

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

List<ScoreSetValue> _values(List<dynamic> sets) => [
  for (final s in sets)
    ScoreSetValue(
      s.a as int,
      s.b as int,
      tb: s.tb == null ? null : ScoreSetValue(s.tb!.a as int, s.tb!.b as int),
    ),
];

void main() {
  test('unidade dos números: games em campanha de games', () {
    final games = TournamentMatchMapper.fromMap('g', {
      'teamAId': 'mine',
      'teamBId': 'x',
      'winnerId': 'mine',
      'status': 'Completed',
      'bestOf': 3,
      'scoringProfile': _bt,
      'sets': [
        {'a': 6, 'b': 4},
        {'a': 6, 'b': 3},
      ],
    });
    expect(tournamentNumbersOf([games], {'mine'}).unit, 'games');
    final points = TournamentMatchMapper.fromMap('p', {
      'teamAId': 'mine',
      'teamBId': 'x',
      'winnerId': 'mine',
      'status': 'Completed',
      'bestOf': 3,
      'sets': [
        {'a': 21, 'b': 15},
        {'a': 21, 'b': 12},
      ],
    });
    expect(tournamentNumbersOf([points], {'mine'}).unit, 'pontos');
  });

  testWidgets('card de números diz GAMES em campanha de games', (tester) async {
    const numbers = TournamentNumbers(
      matches: 1,
      setsWon: 2,
      setsLost: 0,
      points: 12,
      pointsAgainst: 7,
      pointsPerSet: 6,
      sets: [SetBar(label: 'P1 · S1', mine: 6, theirs: 4)],
      unit: 'games',
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(body: FocusTournamentNumbers(numbers: numbers)),
      ),
    );
    expect(find.text('GAMES'), findsOneWidget);
    expect(find.text('PONTOS'), findsNothing);
  });

  test('limites de cenário em games são placares legais', () {
    final bt = ScoringRules.profileFromRaw(_bt)!;
    final bounds = winBoundsOf(3, bt);
    expect(bounds[0].map((s) => [s.a, s.b]).toList(), [
      [6, 0],
      [6, 0],
    ]);
    expect(bounds[1].map((s) => [s.a, s.b, s.tb?.a, s.tb?.b]).toList(), [
      [0, 6, null, null],
      [7, 6, 7, 5],
      [1, 0, 10, 8],
    ]);
    for (final b in bounds) {
      expect(ScoringRules.validate(_values(b), bt), isEmpty);
    }
  });
}

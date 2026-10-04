import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_group_standings_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_display.dart';

const _bt = {
  'kind': 'sets_games',
  'bestOf': 3,
  'gamesPerSet': 6,
  'winByGames': 2,
  'tiebreakAtGames': 6,
  'tiebreakTo': 7,
  'noAd': false,
  'decidingSet': 'super_tiebreak',
  'superTiebreakTo': 10,
};

TournamentMatch _match(Map<String, dynamic> extra) =>
    TournamentMatchMapper.fromMap('m1', {
      'tournamentId': 't1',
      'categoryId': 'c',
      'teamAId': 'A',
      'teamBId': 'B',
      'status': 'In Progress',
      'bestOf': 3,
      'scoringProfile': _bt,
      ...extra,
    });

void main() {
  group('partida de games', () {
    test('6-4 fecha o set; o game em andamento vem em 0/15/30/40', () {
      final m = _match({
        'sets': [
          {'a': 6, 'b': 4},
          {'a': 2, 'b': 1},
        ],
        'currentSetIndex': 1,
        'currentGame': {'a': 3, 'b': 1},
      });
      expect(matchClosedSets(m).map((s) => [s.a, s.b]).toList(), [
        [6, 4],
      ]);
      final live = matchLiveCurrentSet(m)!;
      expect([live.setNumber, live.a, live.b], [2, 2, 1]);
      expect(live.game, (a: '40', b: '15'));
      expect(live.tiebreak, isFalse);
      expect(setsWonCountForMatch(m), (1, 0));
    });

    test('5-4 não fecha; 6-6 em tie-break mostra os pontos corridos', () {
      final open = _match({
        'sets': [
          {'a': 5, 'b': 4},
        ],
        'currentSetIndex': 0,
        'currentGame': {'a': 4, 'b': 3},
      });
      expect(matchClosedSets(open), isEmpty);
      expect(matchLiveCurrentSet(open)!.game, (a: 'AD', b: '40'));
      final tb = _match({
        'sets': [
          {'a': 6, 'b': 6},
        ],
        'currentSetIndex': 0,
        'currentGame': {'a': 4, 'b': 2},
      });
      final live = matchLiveCurrentSet(tb)!;
      expect(live.game, (a: '4', b: '2'));
      expect(live.tiebreak, isTrue);
    });

    test('super tie-break em andamento: marcado e exibido pelos pontos', () {
      final m = _match({
        'sets': [
          {'a': 6, 'b': 4},
          {'a': 3, 'b': 6},
          {'a': 0, 'b': 0},
        ],
        'currentSetIndex': 2,
        'currentGame': {'a': 7, 'b': 5},
      });
      final live = matchLiveCurrentSet(m)!;
      expect(live.superTiebreak, isTrue);
      expect(live.game, (a: '7', b: '5'));
      final last = matchDisplaySets(m).last;
      expect([last.a, last.b, last.inProgress], [7, 5, true]);
    });

    test('encerrada: textos com tie-break e super tie-break em pontos', () {
      final m = _match({
        'status': 'Completed',
        'winnerId': 'A',
        'sets': [
          {'a': 6, 'b': 4},
          {
            'a': 6,
            'b': 7,
            'tb': {'a': 5, 'b': 7},
          },
          {
            'a': 1,
            'b': 0,
            'tb': {'a': 10, 'b': 8},
          },
        ],
      });
      expect(matchClosedSetTexts(m), ['6-4', '6-7 (5-7)', '10-8']);
      expect(matchClosedDisplaySets(m).map((s) => [s.a, s.b]).toList(), [
        [6, 4],
        [6, 7],
        [10, 8],
      ]);
      expect(matchDisplaySets(m).map((s) => [s.a, s.b]).toList(), [
        [6, 4],
        [6, 7],
        [10, 8],
      ]);
    });

    test('set novo 0-0 com o game começado aparece em andamento', () {
      final m = _match({
        'sets': [
          {'a': 6, 'b': 4},
          {'a': 0, 'b': 0},
        ],
        'currentSetIndex': 1,
        'currentGame': {'a': 1, 'b': 0},
      });
      final last = matchDisplaySets(m).last;
      expect([last.a, last.b, last.inProgress], [0, 0, true]);
    });

    test(
      'encerrada (W.O. com set aberto): conta todo set, como as outras telas',
      () {
        final m = _match({
          'status': 'Completed',
          'sets': [
            {'a': 6, 'b': 4},
            {'a': 3, 'b': 2},
          ],
        });
        expect(setsWonCountForMatch(m), (2, 0));
      },
    );

    test('partida de pontos: igual a hoje, sem game', () {
      final m = _match({
        'scoringProfile': null,
        'sets': [
          {'a': 21, 'b': 15},
          {'a': 14, 'b': 11},
        ],
        'currentSetIndex': 1,
        'currentGame': {'a': 3, 'b': 1},
      });
      final live = matchLiveCurrentSet(m)!;
      expect([live.setNumber, live.a, live.b], [2, 14, 11]);
      expect(live.game, isNull);
      expect(live.superTiebreak, isFalse);
      expect(
        matchClosedSetTexts(
          _match({
            'scoringProfile': null,
            'status': 'Completed',
            'sets': [
              {
                'a': 21,
                'b': 19,
                'tb': {'a': 7, 'b': 5},
              },
            ],
          }),
        ),
        ['21-19'],
      );
      // Pontos mantém a contagem de hoje (inclui o set em andamento).
      expect(setsWonCountForMatch(m), (2, 0));
    });
  });

  group('computePoolStandings · critério por tipo', () {
    // Ciclo A>B, B>C, C>A: A e B empatam em vitórias e saldo de games (+3);
    // B tem saldo de sets maior, A venceu o confronto direto. Mesmo caso de
    // functions/src/group-standings.test.ts.
    List<TournamentMatch> cycle(Object? profile) {
      TournamentMatch m(String a, String b, String winner, List<Object> sets) =>
          TournamentMatchMapper.fromMap('$a$b', {
            'tournamentId': 't1',
            'categoryId': 'c',
            'poolId': 'P',
            'teamAId': a,
            'teamBId': b,
            'winnerId': winner,
            'status': 'Completed',
            'isGroupMatch': true,
            'bestOf': 3,
            'scoringProfile': profile,
            'sets': sets,
          });
      return [
        m('A', 'B', 'A', [
          {'a': 4, 'b': 6},
          {'a': 6, 'b': 4},
          {'a': 1, 'b': 0},
        ]),
        m('B', 'C', 'B', [
          {'a': 6, 'b': 4},
          {'a': 6, 'b': 4},
        ]),
        m('A', 'C', 'C', [
          {'a': 6, 'b': 2},
          {'a': 6, 'b': 7},
          {'a': 0, 'b': 1},
        ]),
      ];
    }

    test('games: saldo de sets antes do confronto direto', () {
      expect(computePoolStandings('P', ['A', 'B', 'C'], cycle(_bt)), [
        'B',
        'A',
        'C',
      ]);
    });

    test('pontos: saldo de pontos e confronto direto, como sempre', () {
      expect(computePoolStandings('P', ['A', 'B', 'C'], cycle(null)), [
        'A',
        'B',
        'C',
      ]);
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_share_poster_builder.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_display.dart';

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

TournamentMatch _match(Map<String, dynamic> extra) =>
    TournamentMatchMapper.fromMap('m1', {
      'tournamentId': 't1',
      'categoryId': 'c',
      'teamAId': 'A',
      'teamBId': 'B',
      'status': 'Completed',
      'winnerId': 'B',
      'bestOf': 3,
      'scoringProfile': _bt,
      'sets': [
        {'a': 6, 'b': 4},
        {
          'a': 6,
          'b': 7,
          'tb': {'a': 5, 'b': 7},
        },
        {
          'a': 0,
          'b': 1,
          'tb': {'a': 8, 'b': 10},
        },
      ],
      ...extra,
    });

void main() {
  test('pôster: super tie-break entra com os pontos dele', () {
    expect(
      matchSharePosterClosedSets(_match({})).map((s) => [s.a, s.b]).toList(),
      [
        [6, 4],
        [6, 7],
        [8, 10],
      ],
    );
    expect(matchSharePosterSetWins(_match({})), (1, 2));
  });

  test('campanha: parciais na ótica de cada lado', () {
    expect(matchClosedSetTextsForSide(_match({}), sideA: false), [
      '4-6',
      '7-6 (7-5)',
      '10-8',
    ]);
    expect(matchClosedSetTextsForSide(_match({}), sideA: true), [
      '6-4',
      '6-7 (5-7)',
      '8-10',
    ]);
  });

  test('linha ao vivo compartilhada (pôster)', () {
    final live = _match({
      'status': 'In Progress',
      'winnerId': null,
      'sets': [
        {'a': 6, 'b': 4},
        {'a': 5, 'b': 4},
      ],
      'currentSetIndex': 1,
      'currentGame': {'a': 3, 'b': 1},
    });
    expect(matchLiveScoreLine(live), '1–0 · 2º set 5-4 · 40-15');
    final points = _match({
      'scoringProfile': null,
      'status': 'In Progress',
      'winnerId': null,
      'sets': [
        {'a': 21, 'b': 15},
        {'a': 14, 'b': 11},
      ],
      'currentSetIndex': 1,
    });
    expect(matchLiveScoreLine(points), '1–0 · 2º set 14-11');
  });
}

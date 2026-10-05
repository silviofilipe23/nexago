import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_detail_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_detail_play_by_play_logic.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_point_event.dart';

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
      'status': 'In Progress',
      'bestOf': 3,
      'scoringProfile': _bt,
      ...extra,
    });

TournamentMatchPointEvent _ev(
  int seq,
  String side,
  int setIndex,
  int scoreA,
  int scoreB,
  int gameA,
  int gameB,
) => TournamentMatchPointEvent(
  seq: seq,
  type: 'point',
  setIndex: setIndex,
  side: side,
  scoreA: scoreA,
  scoreB: scoreB,
  gameA: gameA,
  gameB: gameB,
  ts: DateTime.utc(2026, 10, 4, 15, seq),
);

List<String> _labels(List<MatchDetailPlayByPlayGroup> groups, int setIndex) =>
    groups
        .firstWhere((g) => g.setIndex == setIndex)
        .items
        .map((i) => i.scoreLabel)
        .toList();

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  test('lance por extenso na ótica da dupla de referência', () {
    final groups = buildPlayByPlayTimeline(
      match: _match({
        'sets': [
          {'a': 1, 'b': 0},
        ],
        'currentSetIndex': 0,
      }),
      perspectiveTeamId: 'B',
      ourTeamLabel: 'Nós',
      opponentTeamLabel: 'Eles',
      isParticipantView: true,
      pointEvents: [
        _ev(1, 'A', 0, 0, 0, 1, 0),
        _ev(2, 'B', 0, 0, 0, 1, 1),
        _ev(3, 'A', 0, 0, 0, 2, 1),
        _ev(4, 'A', 0, 0, 0, 3, 1),
        _ev(5, 'A', 0, 1, 0, 0, 0),
      ],
    );
    expect(_labels(groups, 0), [
      '0-0 · 0-15',
      '0-0 · 15-15',
      '0-0 · 15-30',
      '0-0 · 15-40',
      '0-1',
    ]);
  });

  test('super tie-break: pontos corridos e fechamento pelo tb do doc', () {
    final groups = buildPlayByPlayTimeline(
      match: _match({
        'status': 'Completed',
        'winnerId': 'A',
        'sets': [
          {'a': 6, 'b': 4},
          {'a': 3, 'b': 6},
          {
            'a': 1,
            'b': 0,
            'tb': {'a': 10, 'b': 8},
          },
        ],
      }),
      perspectiveTeamId: 'A',
      ourTeamLabel: 'Nós',
      opponentTeamLabel: 'Eles',
      isParticipantView: true,
      pointEvents: [_ev(1, 'A', 2, 0, 0, 9, 8), _ev(2, 'A', 2, 1, 0, 0, 0)],
    );
    expect(_labels(groups, 2), ['9-8', '10-8']);
    expect(groups.firstWhere((g) => g.setIndex == 2).finalScoreLabel, '10-8');
  });

  test('sem eventos, partida de games não inventa pontos', () {
    final groups = buildPlayByPlayTimeline(
      match: _match({
        'status': 'Completed',
        'winnerId': 'A',
        'sets': [
          {'a': 6, 'b': 4},
          {'a': 6, 'b': 3},
        ],
      }),
      perspectiveTeamId: 'A',
      ourTeamLabel: 'Nós',
      opponentTeamLabel: 'Eles',
      isParticipantView: true,
    );
    expect(groups.expand((g) => g.items), isEmpty);
  });
}

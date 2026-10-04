import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';

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

Map<String, dynamic> _doc(Map<String, dynamic> extra) => {
  'tournamentId': 't1',
  'teamAId': 'A',
  'teamBId': 'B',
  'status': 'In Progress',
  'bestOf': 3,
  'servingTeamId': 'A',
  ...extra,
};

void main() {
  test('games: rótulo do game, regra do set e dica', () {
    final m = TournamentMatchMapper.fromMap(
      'm1',
      _doc({
        'scoringProfile': _bt,
        'sets': [
          {'a': 5, 'b': 0},
        ],
        'currentSetIndex': 0,
        'currentGame': {'a': 3, 'b': 1},
      }),
    );
    final v = liveTableGamesView(m)!;
    expect(v.labelA, '40');
    expect(v.labelB, '15');
    expect(v.rules, 'até 6 games');
    expect(v.hint, 'set point');
  });

  test('games: tie-break mostra os pontos e a regra do tie-break', () {
    final m = TournamentMatchMapper.fromMap(
      'm1',
      _doc({
        'scoringProfile': _bt,
        'sets': [
          {'a': 6, 'b': 6},
        ],
        'currentSetIndex': 0,
        'currentGame': {'a': 4, 'b': 2},
      }),
    );
    final v = liveTableGamesView(m)!;
    expect(v.labelA, '4');
    expect(v.labelB, '2');
    expect(v.rules, 'até 6 games · tie-break até 7');
  });

  test('games: sets vencidos pela regra de games, sem o set em curso', () {
    final m = TournamentMatchMapper.fromMap(
      'm1',
      _doc({
        'scoringProfile': _bt,
        'sets': [
          {'a': 6, 'b': 4},
          {'a': 2, 'b': 1},
        ],
        'currentSetIndex': 1,
      }),
    );
    expect(liveTableSetsWon(m), (1, 0));
  });

  test('partida de pontos não tem visão de games', () {
    final m = TournamentMatchMapper.fromMap(
      'm1',
      _doc({
        'sets': [
          {'a': 21, 'b': 15},
          {'a': 3, 'b': 1},
        ],
        'currentSetIndex': 1,
      }),
    );
    expect(liveTableGamesView(m), isNull);
    expect(liveTableSetsWon(m), (1, 0));
  });
}

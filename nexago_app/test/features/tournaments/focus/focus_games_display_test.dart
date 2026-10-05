import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_match_card_view.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_views_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_row.dart';

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
  group('card de partida do Focus · games', () {
    test('ao vivo: centro = ponto do game; linha fina = sets e games', () {
      final m = _match({
        'sets': [
          {'a': 6, 'b': 4},
          {'a': 5, 'b': 4},
        ],
        'currentSetIndex': 1,
        'currentGame': {'a': 3, 'b': 1},
      });
      expect(focusMatchCardScoreOf(m, TournamentMatchRowState.live), (
        center: '40-15',
        detail: 'SETS 1-0 · 5-4',
      ));
      expect(liveScoreLineOf(m), '1–0 · 2º set 5-4 · 40-15');
    });

    test('super tie-break em andamento', () {
      final m = _match({
        'sets': [
          {'a': 6, 'b': 4},
          {'a': 3, 'b': 6},
          {'a': 0, 'b': 0},
        ],
        'currentSetIndex': 2,
        'currentGame': {'a': 7, 'b': 5},
      });
      expect(focusMatchCardScoreOf(m, TournamentMatchRowState.live), (
        center: '7-5',
        detail: 'SETS 1-1 · SUPER TIE-BREAK',
      ));
      expect(liveScoreLineOf(m), '1–1 · super tie-break 7-5');
    });

    test('encerrada: parciais com tie-break e super tie-break em pontos', () {
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
      expect(focusMatchCardScoreOf(m, TournamentMatchRowState.done), (
        center: '2-1',
        detail: '6-4 · 6-7 (5-7) · 10-8',
      ));
    });

    test('partida de pontos: igual a hoje', () {
      final m = _match({
        'scoringProfile': null,
        'sets': [
          {'a': 21, 'b': 15},
          {'a': 14, 'b': 11},
        ],
        'currentSetIndex': 1,
      });
      expect(focusMatchCardScoreOf(m, TournamentMatchRowState.live), (
        center: '14-11',
        detail: 'SETS 1-0',
      ));
      expect(liveScoreLineOf(m), '1–0 · 2º set 14-11');
    });
  });
}

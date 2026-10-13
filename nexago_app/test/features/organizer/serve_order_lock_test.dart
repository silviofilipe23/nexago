import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_serving_player_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

void main() {
  TournamentMatch match({
    List<TournamentMatchSet> sets = const [TournamentMatchSet(a: 0, b: 0)],
    int currentSetIndex = 0,
    String status = TournamentMatchStatus.inProgress,
    ({int a, int b}) currentGame = (a: 0, b: 0),
  }) {
    return TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'c1',
      round: 1,
      matchType: 'semifinal',
      poolId: '',
      teamAId: 'a',
      teamBId: 'b',
      status: status,
      resultA: '0',
      resultB: '0',
      isGroupMatch: false,
      matchNumber: 1,
      sets: sets,
      currentSetIndex: currentSetIndex,
      currentGame: currentGame,
      bestOf: 3,
    );
  }

  group('isServeOrderLocked', () {
    test('livre antes do 1º ponto do set (0–0)', () {
      expect(MatchServingPlayerLogic.isServeOrderLocked(match()), isFalse);
    });

    test('trava depois do 1º ponto', () {
      final m = match(sets: const [TournamentMatchSet(a: 1, b: 0)]);
      expect(MatchServingPlayerLogic.isServeOrderLocked(m), isTrue);
    });

    test('set novo (0–0) volta a ficar livre, mesmo com o set anterior jogado',
        () {
      final m = match(
        sets: const [
          TournamentMatchSet(a: 21, b: 15),
          TournamentMatchSet(a: 0, b: 0),
        ],
        currentSetIndex: 1,
      );
      expect(MatchServingPlayerLogic.isServeOrderLocked(m), isFalse);
    });

    test('partida de games: ponto no game em curso também trava', () {
      final m = match(currentGame: (a: 15, b: 0));
      expect(MatchServingPlayerLogic.isServeOrderLocked(m), isTrue);
    });

    test('partida encerrada fica travada', () {
      final m = match(status: TournamentMatchStatus.completed);
      expect(MatchServingPlayerLogic.isServeOrderLocked(m), isTrue);
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_scoring_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';

void main() {
  group('MatchScoringLogic', () {
    test('isSetWon requires advantage', () {
      expect(MatchScoringLogic.isSetWon(21, 19), isTrue);
      expect(MatchScoringLogic.isSetWon(21, 20), isFalse);
      expect(MatchScoringLogic.isSetWon(22, 20), isTrue);
    });

    test('applyPoint increments and detects match winner', () {
      final result = MatchScoringLogic.applyPoint(
        sets: const [TournamentMatchSet(a: 20, b: 18)],
        currentSetIndex: 0,
        side: 'A',
        teamAId: 'teamA',
        teamBId: 'teamB',
      );
      expect(result.sets.first.a, 21);
      expect(result.winnerId, isNull);

      final matchWin = MatchScoringLogic.applyPoint(
        sets: const [
          TournamentMatchSet(a: 21, b: 10),
          TournamentMatchSet(a: 20, b: 18),
        ],
        currentSetIndex: 1,
        side: 'A',
        teamAId: 'teamA',
        teamBId: 'teamB',
      );
      expect(matchWin.winnerId, 'teamA');
    });

    test('undoPoint decrements score', () {
      final result = MatchScoringLogic.undoPoint(
        sets: const [TournamentMatchSet(a: 5, b: 3)],
        currentSetIndex: 0,
        side: 'A',
      );
      expect(result.sets.first.a, 4);
    });

    test('formatElapsedMmSs pads minutes and seconds', () {
      expect(MatchScoringLogic.formatElapsedMmSs(0), '00:00');
      expect(MatchScoringLogic.formatElapsedMmSs(1450), '24:10');
    });

    test('setPointHint shows remaining points before set point', () {
      expect(
        MatchScoringLogic.setPointHint(18, 16, setIndex: 0),
        'set point em 3',
      );
      expect(
        MatchScoringLogic.setPointHint(20, 19, setIndex: 0),
        'set point em 1',
      );
    });

    test('teamLabelForSide prefers team description', () {
      expect(
        MatchScoringLogic.teamLabelForSide(
          side: 'A',
          teamADescription: 'Marcos / Victor',
          teamBDescription: 'Igor / João',
          teamAId: 'a',
          teamBId: 'b',
        ),
        'Marcos / Victor',
      );
    });
  });
}

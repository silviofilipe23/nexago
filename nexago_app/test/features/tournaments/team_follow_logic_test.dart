import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/team_follow_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

void main() {
  const fullTeam = TournamentTeam(
    id: 't1',
    player1Id: 'p1',
    player2Id: 'p2',
  );

  const lookingTeam = TournamentTeam(
    id: 't2',
    player1Id: 'p3',
    player2Id: 'p3',
  );

  group('teamFollowTargetAthleteIds', () {
    test('returns both players for complete team', () {
      expect(
        teamFollowTargetAthleteIds(fullTeam, 'viewer'),
        {'p1', 'p2'},
      );
    });

    test('returns only player1 when looking for partner', () {
      expect(
        teamFollowTargetAthleteIds(lookingTeam, 'viewer'),
        {'p3'},
      );
    });

    test('excludes viewer uid', () {
      expect(
        teamFollowTargetAthleteIds(fullTeam, 'p1'),
        {'p2'},
      );
    });
  });

  group('canFollowTeam', () {
    test('returns false without viewer', () {
      expect(canFollowTeam(fullTeam, null), isFalse);
      expect(canFollowTeam(fullTeam, ''), isFalse);
    });

    test('returns false when viewer is on the team', () {
      expect(canFollowTeam(fullTeam, 'p1'), isFalse);
      expect(canFollowTeam(fullTeam, 'p2'), isFalse);
    });

    test('returns true for external viewer', () {
      expect(canFollowTeam(fullTeam, 'viewer'), isTrue);
    });
  });

  group('isTeamFollowed', () {
    test('checks team id in set', () {
      expect(isTeamFollowed({'t1', 't2'}, 't1'), isTrue);
      expect(isTeamFollowed({'t1'}, 't2'), isFalse);
    });
  });
}

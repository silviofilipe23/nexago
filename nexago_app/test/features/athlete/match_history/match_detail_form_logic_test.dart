import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_detail_form_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _completedMatch({
  required String id,
  required String teamAId,
  required String teamBId,
  required String winnerId,
  required DateTime playedAt,
  String status = TournamentMatchStatus.completed,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'cat',
    round: 1,
    matchType: 'Group',
    poolId: 'A',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '2',
    resultB: '0',
    isGroupMatch: true,
    matchNumber: 1,
    winnerId: winnerId,
    matchEndedAt: playedAt,
  );
}

void main() {
  const ourTeamId = 'our-team';
  const opponentTeamId = 'opp-team';
  const currentMatchId = 'current';

  final baseTime = DateTime.utc(2026, 6, 1, 12);

  group('recentFormResultsForTeam', () {
    test('returns last 5 results oldest-to-newest with most recent on the right',
        () {
      final matches = [
        _completedMatch(
          id: 'm1',
          teamAId: ourTeamId,
          teamBId: 'x1',
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
        _completedMatch(
          id: 'm2',
          teamAId: ourTeamId,
          teamBId: 'x2',
          winnerId: ourTeamId,
          playedAt: baseTime.add(const Duration(days: 1)),
        ),
        _completedMatch(
          id: 'm3',
          teamAId: ourTeamId,
          teamBId: 'x3',
          winnerId: 'x3',
          playedAt: baseTime.add(const Duration(days: 2)),
        ),
        _completedMatch(
          id: 'm4',
          teamAId: ourTeamId,
          teamBId: 'x4',
          winnerId: ourTeamId,
          playedAt: baseTime.add(const Duration(days: 3)),
        ),
        _completedMatch(
          id: 'm5',
          teamAId: ourTeamId,
          teamBId: 'x5',
          winnerId: ourTeamId,
          playedAt: baseTime.add(const Duration(days: 4)),
        ),
        _completedMatch(
          id: 'm6',
          teamAId: ourTeamId,
          teamBId: 'x6',
          winnerId: 'x6',
          playedAt: baseTime.add(const Duration(days: 5)),
        ),
      ];

      final results = recentFormResultsForTeam(
        matches: matches,
        teamId: ourTeamId,
        excludeMatchId: currentMatchId,
      );

      expect(results, [true, false, true, true, false]);
    });

    test('excludes current match', () {
      final matches = [
        _completedMatch(
          id: currentMatchId,
          teamAId: ourTeamId,
          teamBId: opponentTeamId,
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
        _completedMatch(
          id: 'm2',
          teamAId: ourTeamId,
          teamBId: 'x2',
          winnerId: 'x2',
          playedAt: baseTime.add(const Duration(days: 1)),
        ),
      ];

      final results = recentFormResultsForTeam(
        matches: matches,
        teamId: ourTeamId,
        excludeMatchId: currentMatchId,
      );

      expect(results, [false]);
    });

    test('ignores non-completed matches and matches without winner', () {
      final matches = [
        _completedMatch(
          id: 'm1',
          teamAId: ourTeamId,
          teamBId: 'x1',
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
        TournamentMatch(
          id: 'm2',
          tournamentId: 't1',
          categoryId: 'cat',
          round: 1,
          matchType: 'Group',
          poolId: 'A',
          teamAId: ourTeamId,
          teamBId: 'x2',
          status: TournamentMatchStatus.scheduled,
          resultA: '',
          resultB: '',
          isGroupMatch: true,
          matchNumber: 2,
          scheduleTime: baseTime.add(const Duration(days: 1)),
        ),
        TournamentMatch(
          id: 'm3',
          tournamentId: 't1',
          categoryId: 'cat',
          round: 1,
          matchType: 'Group',
          poolId: 'A',
          teamAId: ourTeamId,
          teamBId: 'x3',
          status: TournamentMatchStatus.completed,
          resultA: '2',
          resultB: '0',
          isGroupMatch: true,
          matchNumber: 3,
          matchEndedAt: baseTime.add(const Duration(days: 2)),
        ),
      ];

      final results = recentFormResultsForTeam(
        matches: matches,
        teamId: ourTeamId,
        excludeMatchId: currentMatchId,
      );

      expect(results, [true]);
    });

    test('returns fewer than 5 when history is shorter', () {
      final matches = [
        _completedMatch(
          id: 'm1',
          teamAId: ourTeamId,
          teamBId: 'x1',
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
        _completedMatch(
          id: 'm2',
          teamAId: ourTeamId,
          teamBId: 'x2',
          winnerId: 'x2',
          playedAt: baseTime.add(const Duration(days: 1)),
        ),
      ];

      final results = recentFormResultsForTeam(
        matches: matches,
        teamId: ourTeamId,
        excludeMatchId: currentMatchId,
      );

      expect(results, [true, false]);
    });

    test('returns empty when team has no eligible matches', () {
      final results = recentFormResultsForTeam(
        matches: const [],
        teamId: ourTeamId,
        excludeMatchId: currentMatchId,
      );

      expect(results, isEmpty);
    });
  });

  group('buildMatchDetailFormRows', () {
    test('omits row when team has no history', () {
      final ourMatch = _completedMatch(
        id: 'm1',
        teamAId: ourTeamId,
        teamBId: 'x1',
        winnerId: ourTeamId,
        playedAt: baseTime,
      );

      final rows = buildMatchDetailFormRows(
        ourTeamMatches: [ourMatch],
        opponentTeamMatches: const [],
        ourTeamId: ourTeamId,
        opponentTeamId: opponentTeamId,
        excludeMatchId: currentMatchId,
        ourLabel: 'Você',
        opponentLabel: 'Adversário',
      );

      expect(rows, hasLength(1));
      expect(rows.first.label, 'Você');
      expect(rows.first.results, [true]);
    });

    test('returns empty when both teams lack history', () {
      final rows = buildMatchDetailFormRows(
        ourTeamMatches: const [],
        opponentTeamMatches: const [],
        ourTeamId: ourTeamId,
        opponentTeamId: opponentTeamId,
        excludeMatchId: currentMatchId,
        ourLabel: 'Você',
        opponentLabel: 'Adversário',
      );

      expect(rows, isEmpty);
    });

    test('builds both rows when each team has history', () {
      final ourMatch = _completedMatch(
        id: 'm1',
        teamAId: ourTeamId,
        teamBId: 'x1',
        winnerId: ourTeamId,
        playedAt: baseTime,
      );
      final oppMatch = _completedMatch(
        id: 'm2',
        teamAId: opponentTeamId,
        teamBId: 'y1',
        winnerId: 'y1',
        playedAt: baseTime,
      );

      final rows = buildMatchDetailFormRows(
        ourTeamMatches: [ourMatch],
        opponentTeamMatches: [oppMatch],
        ourTeamId: ourTeamId,
        opponentTeamId: opponentTeamId,
        excludeMatchId: currentMatchId,
        ourLabel: 'Você',
        opponentLabel: 'Dupla X',
      );

      expect(rows, hasLength(2));
      expect(rows[0].label, 'Você');
      expect(rows[0].results, [true]);
      expect(rows[1].label, 'Dupla X');
      expect(rows[1].results, [false]);
    });
  });
}

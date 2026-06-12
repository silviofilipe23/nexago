import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_detail_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_detail_xp_logic.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _completedMatch({
  required String id,
  required String teamAId,
  required String teamBId,
  required String winnerId,
  required DateTime playedAt,
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
    status: TournamentMatchStatus.completed,
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
  final baseTime = DateTime.utc(2026, 6, 1, 12);

  group('tournamentWinStreakIncludingMatch', () {
    test('counts consecutive wins through current match', () {
      final matches = [
        _completedMatch(
          id: 'm3',
          teamAId: ourTeamId,
          teamBId: 'x3',
          winnerId: ourTeamId,
          playedAt: baseTime.add(const Duration(days: 2)),
        ),
        _completedMatch(
          id: 'm2',
          teamAId: ourTeamId,
          teamBId: 'x2',
          winnerId: ourTeamId,
          playedAt: baseTime.add(const Duration(days: 1)),
        ),
        _completedMatch(
          id: 'm1',
          teamAId: ourTeamId,
          teamBId: 'x1',
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
      ];

      expect(
        tournamentWinStreakIncludingMatch(
          matches: matches,
          teamId: ourTeamId,
          throughMatchId: 'm3',
        ),
        3,
      );
    });
  });

  group('buildMatchDetailXpInfo', () {
    test('returns null when not a win', () {
      final info = buildMatchDetailXpInfo(
        phase: MatchDetailPhase.completed,
        isParticipantView: true,
        isWin: false,
        ourTeamMatches: const [],
        ourTeamId: ourTeamId,
        currentMatchId: 'm1',
      );

      expect(info, isNull);
    });

    test('omits xp gain until backend confirms award', () {
      final matches = [
        _completedMatch(
          id: 'm1',
          teamAId: ourTeamId,
          teamBId: 'x1',
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
      ];

      final info = buildMatchDetailXpInfo(
        phase: MatchDetailPhase.completed,
        isParticipantView: true,
        isWin: true,
        ourTeamMatches: matches,
        ourTeamId: ourTeamId,
        currentMatchId: 'm1',
        ranking: const CompeteHubUserRanking(
          rank: 11,
          seasonLabel: 'TEMPORADA 2026',
          subtitle: '',
          points: 100,
          tournamentsCount: 2,
        ),
      );

      expect(info, isNotNull);
      expect(info!.xpGained, isNull);
    });

    test('omits level progress until gamification summary is available', () {
      final matches = [
        _completedMatch(
          id: 'm1',
          teamAId: ourTeamId,
          teamBId: 'x1',
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
      ];

      final info = buildMatchDetailXpInfo(
        phase: MatchDetailPhase.completed,
        isParticipantView: true,
        isWin: true,
        ourTeamMatches: matches,
        ourTeamId: ourTeamId,
        currentMatchId: 'm1',
        ranking: const CompeteHubUserRanking(
          rank: 11,
          seasonLabel: 'TEMPORADA 2026',
          subtitle: '',
          points: 100,
          tournamentsCount: 2,
        ),
      );

      expect(info, isNotNull);
      expect(info!.xpGained, isNull);
      expect(info.levelProgressLabel, isNull);
      expect(info.progress, isNull);
    });

    test('builds XP card for completed win', () {
      final matches = [
        _completedMatch(
          id: 'm1',
          teamAId: ourTeamId,
          teamBId: 'x1',
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
      ];

      final info = buildMatchDetailXpInfo(
        phase: MatchDetailPhase.completed,
        isParticipantView: true,
        isWin: true,
        ourTeamMatches: matches,
        ourTeamId: ourTeamId,
        currentMatchId: 'm1',
        ranking: const CompeteHubUserRanking(
          rank: 11,
          seasonLabel: 'TEMPORADA 2026',
          subtitle: '',
          points: 100,
          tournamentsCount: 2,
        ),
        gamification: const GamificationSummary(
          xp: 162,
          level: 1,
          streak: 0,
          totalGames: 5,
          lastGameDate: null,
          updatedAt: null,
        ),
        confirmedXpGained: 50,
      );

      expect(info, isNotNull);
      expect(info!.xpGained, 50);
      expect(info.rankLabel, '#11');
      expect(info.streakLabel, '1 vitória');
      expect(info.levelProgressLabel, 'faltam 38 XP pro nível 2');
      expect(info.progress, closeTo(0.62, 0.01));
    });
  });
}

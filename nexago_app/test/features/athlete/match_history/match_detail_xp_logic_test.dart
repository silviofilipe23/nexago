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
        eloEnabled: true,
      );

      expect(info, isNotNull);
      expect(info!.xpGained, 50);
      expect(info.rankLabel, '#11');
      expect(info.streakLabel, '1 vitória');
      // 162 XP = Iniciante II (100–249): o XP move o elo, não um "nível".
      expect(info.levelProgressLabel, 'faltam 88 XP pra Iniciante I');
      expect(info.progress, closeTo(62 / 150, 0.001));
    });
  });

  group('matchDetailEloProgress', () {
    GamificationSummary summary(int xp) => GamificationSummary(
      xp: xp,
      level: xp ~/ 100,
      streak: 0,
      totalGames: 0,
      lastGameDate: null,
      updatedAt: null,
    );

    test('sem a flag do elo o card fica sem a linha de progresso', () {
      expect(matchDetailEloProgress(summary(162), eloEnabled: false), isNull);
      expect(matchDetailEloProgress(null, eloEnabled: true), isNull);
    });

    test('no topo da trilha não aponta próximo elo', () {
      final elo = matchDetailEloProgress(summary(20000), eloEnabled: true);
      expect(elo?.label, 'topo da trilha de elos');
      expect(elo?.progress, 1);
    });
  });
}

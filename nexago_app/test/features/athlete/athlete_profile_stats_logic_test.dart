import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/features/athlete/domain/athlete_profile_stats_logic.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

void main() {
  group('buildAthleteProfileStats', () {
    test('counts games and wins from match history', () {
      final matches = [
        AthleteMatchHistoryItem(
          id: '1',
          playedAt: DateTime(2026, 3, 1),
          result: AthleteMatchResult.win,
          opponentLabel: 'Time A',
          competitionLabel: 'Torneio',
          scoreDisplay: '2-0',
        ),
        AthleteMatchHistoryItem(
          id: '2',
          playedAt: DateTime(2026, 3, 2),
          result: AthleteMatchResult.loss,
          opponentLabel: 'Time B',
          competitionLabel: 'Torneio',
          scoreDisplay: '0-2',
        ),
        AthleteMatchHistoryItem(
          id: '3',
          playedAt: DateTime(2026, 3, 3),
          result: AthleteMatchResult.win,
          opponentLabel: 'Time C',
          competitionLabel: 'Torneio',
          scoreDisplay: '2-1',
        ),
      ];

      final stats = buildAthleteProfileStats(
        gamification: const GamificationSummary(
          xp: 120,
          level: 1,
          streak: 4,
          totalGames: 10,
          lastGameDate: null,
          updatedAt: null,
        ),
        matches: matches,
        ranking: const CompeteHubUserRanking(
          rank: 12,
          seasonLabel: 'TEMPORADA 2026',
          subtitle: 'Ranking',
          points: 500,
          tournamentsCount: 2,
        ),
      );

      expect(stats.games, 3);
      expect(stats.wins, 2);
      expect(stats.streak, 4);
      expect(stats.rankingLabel, '#12');
    });

    test('uses zero games when history is empty', () {
      final stats = buildAthleteProfileStats(
        gamification: GamificationSummary.initial(),
        matches: const [],
        ranking: null,
      );

      expect(stats.games, 0);
      expect(stats.wins, 0);
      expect(stats.streak, 0);
      expect(stats.rankingLabel, '—');
    });
  });

  group('formatProfileRankingLabel', () {
    test('returns dash when unranked', () {
      expect(
        formatProfileRankingLabel(
          CompeteHubUserRanking.unranked(
            seasonYear: 2026,
            isSeasonMode: true,
          ),
        ),
        '—',
      );
    });

    test('formats ranked position', () {
      expect(
        formatProfileRankingLabel(
          const CompeteHubUserRanking(
            rank: 42,
            seasonLabel: 'TEMPORADA 2026',
            subtitle: 'Ranking',
            points: 100,
            tournamentsCount: 1,
          ),
        ),
        '#42',
      );
    });
  });

  group('countSharedMatchesByPartner', () {
    const athleteId = 'athlete-1';
    const partnerId = 'partner-2';

    final team = TournamentTeam(
      id: 'team-a',
      player1Id: athleteId,
      player2Id: partnerId,
    );

    TournamentMatch completedMatch({required String id}) {
      return TournamentMatch(
        id: id,
        tournamentId: 't1',
        categoryId: 'open',
        round: 1,
        matchType: 'pool',
        poolId: 'p1',
        teamAId: team.id,
        teamBId: 'team-b',
        status: TournamentMatchStatus.completed,
        resultA: '2',
        resultB: '0',
        isGroupMatch: true,
        matchNumber: 1,
        winnerId: team.id,
      );
    }

    test('counts matches per partner uid', () {
      final counts = countSharedMatchesByPartner(
        athleteId: athleteId,
        completedMatches: [
          completedMatch(id: 'm1'),
          completedMatch(id: 'm2'),
        ],
        teams: {
          team.id: team,
          'team-b': const TournamentTeam(
            id: 'team-b',
            player1Id: 'other-1',
            player2Id: 'other-2',
          ),
        },
      );

      expect(counts[partnerId], 2);
    });

    test('ignores matches without a distinct partner', () {
      const soloTeam = TournamentTeam(
        id: 'solo',
        player1Id: athleteId,
        player2Id: athleteId,
      );

      final counts = countSharedMatchesByPartner(
        athleteId: athleteId,
        completedMatches: [
          TournamentMatch(
            id: 'm1',
            tournamentId: 't1',
            categoryId: 'open',
            round: 1,
            matchType: 'pool',
            poolId: 'p1',
            teamAId: soloTeam.id,
            teamBId: 'team-b',
            status: TournamentMatchStatus.completed,
            resultA: '2',
            resultB: '0',
            isGroupMatch: true,
            matchNumber: 1,
            winnerId: soloTeam.id,
          ),
        ],
        teams: {soloTeam.id: soloTeam},
      );

      expect(counts, isEmpty);
    });
  });

  group('formatPartnerGamesLabel', () {
    test('formats singular and plural labels', () {
      expect(formatPartnerGamesLabel(0), 'DUPLA');
      expect(formatPartnerGamesLabel(1), '1 JOGO');
      expect(formatPartnerGamesLabel(4), '4 JOGOS');
    });
  });
}

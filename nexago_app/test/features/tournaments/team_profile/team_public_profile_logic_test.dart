import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

TournamentMatch _match({
  required String id,
  required String tournamentId,
  required String teamAId,
  required String teamBId,
  required String status,
  String? winnerId,
  String matchType = 'Group',
  int round = 1,
  String? teamADescription,
  String? teamBDescription,
  DateTime? endedAt,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: tournamentId,
    categoryId: 'cat',
    round: round,
    matchType: matchType,
    poolId: 'A',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: true,
    matchNumber: 1,
    winnerId: winnerId,
    teamADescription: teamADescription,
    teamBDescription: teamBDescription,
    matchEndedAt: endedAt,
  );
}

void main() {
  const ourTeamId = 'team-a';
  const opponentId = 'team-b';

  group('buildTeamProfileStats', () {
    test('computes games, win rate, titles and points', () {
      final matches = [
        _match(
          id: 'm1',
          tournamentId: 't1',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
          matchType: 'Final',
        ),
        _match(
          id: 'm2',
          tournamentId: 't1',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
        ),
        _match(
          id: 'm3',
          tournamentId: 't2',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: opponentId,
          matchType: 'Semi-Final',
        ),
      ];

      final stats = buildTeamProfileStats(
        matches: matches,
        teamId: ourTeamId,
        rankingPoints: 3120,
      );

      expect(stats.games, 3);
      expect(stats.winRatePercent, 67);
      expect(stats.titles, 1);
      expect(stats.points, 3120);
    });
  });

  group('buildTeamCampaigns', () {
    test('groups tournaments and labels champion as 1º', () {
      final ended = DateTime.utc(2026, 5, 10);
      final matches = [
        _match(
          id: 'm1',
          tournamentId: 't1',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
          matchType: 'Final',
          endedAt: ended,
        ),
        _match(
          id: 'm2',
          tournamentId: 't1',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
          endedAt: ended,
        ),
        _match(
          id: 'm3',
          tournamentId: 't2',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: opponentId,
          matchType: 'Semi-Final',
          endedAt: DateTime.utc(2026, 4, 1),
        ),
      ];

      final campaigns = buildTeamCampaigns(
        matches: matches,
        teamId: ourTeamId,
        tournamentNames: const {
          't1': 'BR Cup Sub 23',
          't2': 'Open Brasília',
        },
      );

      expect(campaigns, hasLength(2));
      expect(campaigns.first.tournamentName, 'BR Cup Sub 23');
      expect(campaigns.first.resultLabel, '1º');
      expect(campaigns.first.wins, 2);
      expect(campaigns.first.losses, 0);
      expect(campaigns.last.resultLabel, 'SF');
      expect(campaigns.last.recordLabel, '0V · 1D');
    });
  });

  group('buildTeamHeadToHead', () {
    test('aggregates wins and losses per opponent label', () {
      final matches = [
        _match(
          id: 'm1',
          tournamentId: 't1',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
          teamBDescription: 'Duarte/Reis',
        ),
        _match(
          id: 'm2',
          tournamentId: 't2',
          teamAId: opponentId,
          teamBId: ourTeamId,
          status: TournamentMatchStatus.completed,
          winnerId: opponentId,
          teamADescription: 'Duarte/Reis',
        ),
        _match(
          id: 'm3',
          tournamentId: 't3',
          teamAId: ourTeamId,
          teamBId: 'team-c',
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
          teamBDescription: 'Lima/Santos',
        ),
      ];

      final entries = buildTeamHeadToHead(
        matches: matches,
        teamId: ourTeamId,
      );

      expect(entries, hasLength(2));
      expect(entries.first.opponentLabel, 'Duarte/Reis');
      expect(entries.first.wins, 1);
      expect(entries.first.losses, 1);
      expect(entries.last.opponentLabel, 'Lima/Santos');
      expect(entries.last.wins, 1);
    });
  });

  group('teamProfileDisplayName', () {
    test('uses first names with slash when team name is empty', () {
      final name = teamProfileDisplayName(
        team: const TournamentTeam(
          id: 't',
          player1Id: 'p1',
          player2Id: 'p2',
        ),
        player1: null,
        player2: null,
      );
      expect(name, 'Dupla');
    });
  });
}

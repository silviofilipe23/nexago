import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_group_standings_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _groupMatch({
  required String id,
  required String poolId,
  required String teamAId,
  required String teamBId,
  required String winnerId,
  String resultA = '2',
  String resultB = '0',
  List<TournamentMatchSet> sets = const [],
  int matchNumber = 0,
  String? teamADescription,
  String? teamBDescription,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'cat-a',
    round: 0,
    matchType: 'Group',
    poolId: poolId,
    teamAId: teamAId,
    teamBId: teamBId,
    status: TournamentMatchStatus.completed,
    resultA: resultA,
    resultB: resultB,
    isGroupMatch: true,
    matchNumber: matchNumber,
    winnerId: winnerId,
    sets: sets,
    teamADescription: teamADescription,
    teamBDescription: teamBDescription,
  );
}

void main() {
  group('computePoolStandings', () {
    test('ranks teams by wins then point difference', () {
      final standings = computePoolStandings(
        'A',
        ['t1', 't2', 't3'],
        [
          _groupMatch(
            id: 'm1',
            poolId: 'A',
            teamAId: 't1',
            teamBId: 't2',
            winnerId: 't1',
            resultA: '2',
            resultB: '0',
            matchNumber: 1,
          ),
          _groupMatch(
            id: 'm2',
            poolId: 'A',
            teamAId: 't1',
            teamBId: 't3',
            winnerId: 't1',
            resultA: '2',
            resultB: '1',
            matchNumber: 2,
          ),
          _groupMatch(
            id: 'm3',
            poolId: 'A',
            teamAId: 't2',
            teamBId: 't3',
            winnerId: 't3',
            resultA: '0',
            resultB: '2',
            matchNumber: 3,
          ),
        ],
      );

      expect(standings, ['t1', 't3', 't2']);
    });

    test('point difference beats head-to-head', () {
      TournamentMatch win(
        String teamAId,
        String teamBId,
        String winnerId,
        List<List<int>> sets,
        int matchNumber,
      ) {
        return _groupMatch(
          id: 'm$matchNumber',
          poolId: 'A',
          teamAId: teamAId,
          teamBId: teamBId,
          winnerId: winnerId,
          resultA: '${sets.where((s) => s[0] > s[1]).length}',
          resultB: '${sets.where((s) => s[1] > s[0]).length}',
          matchNumber: matchNumber,
          sets: [
            for (final s in sets) TournamentMatchSet(a: s[0], b: s[1]),
          ],
        );
      }

      // Ciclo: 1V cada. t1 venceu t2 no H2H, mas t2 tem SP maior.
      final standings = computePoolStandings(
        'A',
        ['t1', 't2', 't3'],
        [
          win('t1', 't2', 't1', [
            [21, 19],
            [21, 19],
          ], 1),
          win('t2', 't3', 't2', [
            [21, 5],
            [21, 5],
          ], 2),
          win('t3', 't1', 't3', [
            [21, 19],
            [21, 19],
          ], 3),
        ],
      );

      expect(standings, ['t2', 't1', 't3']);
    });

    test('breaks ties by game difference then head-to-head', () {
      TournamentMatch win20(
        String teamAId,
        String teamBId,
        String winnerId,
        List<int> g1,
        List<int> g2,
        int matchNumber,
      ) {
        return _groupMatch(
          id: 'm$matchNumber',
          poolId: 'A',
          teamAId: teamAId,
          teamBId: teamBId,
          winnerId: winnerId,
          resultA: '2',
          resultB: '0',
          matchNumber: matchNumber,
          sets: [
            TournamentMatchSet(a: g1[0], b: g1[1]),
            TournamentMatchSet(a: g2[0], b: g2[1]),
          ],
        );
      }

      final byPointDiff = computePoolStandings(
        'A',
        ['t1', 't2', 't3'],
        [
          win20('t1', 't3', 't1', [21, 10], [21, 12], 1),
          win20('t2', 't3', 't2', [21, 18], [21, 19], 2),
        ],
      );
      expect(byPointDiff, ['t1', 't2', 't3']);

      // Mesmas vitórias e SP (+6); H2H decide (ciclo com t3 atrás em SP).
      final byH2h = computePoolStandings(
        'A',
        ['t1', 't2', 't3'],
        [
          win20('t1', 't2', 't1', [21, 15], [21, 15], 1),
          win20('t2', 't3', 't2', [21, 12], [21, 12], 2),
          win20('t3', 't1', 't3', [21, 18], [21, 18], 3),
        ],
      );
      expect(byH2h, ['t1', 't2', 't3']);
    });
  });

  group('isPoolRoundRobinComplete', () {
    test('detects completed and incomplete pools', () {
      final complete = isPoolRoundRobinComplete(
        'A',
        ['t1', 't2'],
        [
          _groupMatch(
            id: 'm1',
            poolId: 'A',
            teamAId: 't1',
            teamBId: 't2',
            winnerId: 't1',
            matchNumber: 1,
          ),
        ],
      );
      expect(complete, isTrue);

      final incomplete = isPoolRoundRobinComplete('A', ['t1', 't2'], []);
      expect(incomplete, isFalse);
    });
  });

  group('buildPoolStandingsGroups', () {
    test('builds display rows with PTS, SF and team names from cards', () {
      final matches = [
        _groupMatch(
          id: 'm1',
          poolId: 'A',
          teamAId: 't1',
          teamBId: 't2',
          winnerId: 't1',
          resultA: '2',
          resultB: '0',
          matchNumber: 1,
        ),
        _groupMatch(
          id: 'm2',
          poolId: 'A',
          teamAId: 't1',
          teamBId: 't3',
          winnerId: 't1',
          resultA: '2',
          resultB: '1',
          matchNumber: 2,
        ),
        _groupMatch(
          id: 'm3',
          poolId: 'A',
          teamAId: 't2',
          teamBId: 't3',
          winnerId: 't3',
          resultA: '0',
          resultB: '2',
          matchNumber: 3,
        ),
      ];

      final cardsById = {
        for (final match in matches)
          match.id: TournamentMatchCardViewModel(
            match: match,
            teamA: TournamentMatchCardTeamViewModel(
              displayName: match.teamAId == 't1' ? 'Marcelo / Enzo' : 'Time A',
              players: const [],
            ),
            teamB: TournamentMatchCardTeamViewModel(
              displayName: match.teamBId == 't2' ? 'Dupla B' : 'Time B',
              players: const [],
            ),
          ),
      };

      final groups = buildPoolStandingsGroups(
        poolMatches: matches,
        cardsById: cardsById,
        qualifiersPerGroup: 2,
        athleteTeamIds: {'t1'},
      );

      expect(groups, hasLength(1));
      final group = groups.first;
      expect(group.poolLabel, 'Grupo A');
      expect(group.isComplete, isTrue);
      expect(group.rows.first.displayName, 'Marcelo / Enzo');
      expect(group.rows.first.wins, 2);
      expect(group.rows.first.losses, 0);
      expect(group.rows.first.setsForDisplay, '4-1');
      expect(group.rows.first.points, 4);
      expect(group.rows.first.qualifies, isTrue);
      expect(group.rows.first.isAthleteTeam, isTrue);
    });

    test('resolves team names from match descriptions when cards only have ids', () {
      final matches = [
        _groupMatch(
          id: 'm1',
          poolId: 'A',
          teamAId: 'team-abc',
          teamBId: 'team-def',
          winnerId: 'team-abc',
          teamADescription: 'Marcelo / Enzo',
          teamBDescription: 'Dupla B',
          matchNumber: 1,
        ),
      ];

      final cardsById = {
        for (final match in matches)
          match.id: TournamentMatchCardViewModel(
            match: match,
            teamA: TournamentMatchCardTeamViewModel(
              displayName: match.teamAId,
              players: const [],
            ),
            teamB: TournamentMatchCardTeamViewModel(
              displayName: match.teamBId,
              players: const [],
            ),
          ),
      };

      final groups = buildPoolStandingsGroups(
        poolMatches: matches,
        cardsById: cardsById,
        qualifiersPerGroup: 1,
        athleteTeamIds: const {},
      );

      expect(groups.single.rows.first.displayName, 'Marcelo / Enzo');
      expect(groups.single.rows.last.displayName, 'Dupla B');
    });

    test('prefers resolved card name from another match in the tournament', () {
      final poolMatches = [
        _groupMatch(
          id: 'm1',
          poolId: 'A',
          teamAId: 't1',
          teamBId: 't2',
          winnerId: 't1',
          matchNumber: 1,
        ),
      ];
      final otherMatch = _groupMatch(
        id: 'm9',
        poolId: 'B',
        teamAId: 't1',
        teamBId: 't9',
        winnerId: 't1',
        matchNumber: 9,
      );

      final cardsById = {
        'm1': TournamentMatchCardViewModel(
          match: poolMatches.first,
          teamA: const TournamentMatchCardTeamViewModel(
            displayName: 't1',
            players: [],
          ),
          teamB: const TournamentMatchCardTeamViewModel(
            displayName: 't2',
            players: [],
          ),
        ),
        'm9': TournamentMatchCardViewModel(
          match: otherMatch,
          teamA: const TournamentMatchCardTeamViewModel(
            displayName: 'Marcelo / Enzo',
            players: [],
          ),
          teamB: const TournamentMatchCardTeamViewModel(
            displayName: 'Outra dupla',
            players: [],
          ),
        ),
      };

      final name = teamDisplayNameFromCards(
        teamId: 't1',
        poolMatches: poolMatches,
        cardsById: cardsById,
      );

      expect(name, 'Marcelo / Enzo');
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_matches_logic.dart';

TournamentMatch _match({
  required String id,
  String categoryId = 'cat-a',
  int round = 1,
  String matchType = 'Elimination',
  String poolId = '',
  bool isGroupMatch = false,
  int matchNumber = 0,
  String teamAId = '',
  String teamBId = '',
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: categoryId,
    round: round,
    matchType: matchType,
    poolId: poolId,
    teamAId: teamAId.isEmpty ? 'a$id' : teamAId,
    teamBId: teamBId.isEmpty ? 'b$id' : teamBId,
    status: 'Scheduled',
    resultA: '',
    resultB: '',
    isGroupMatch: isGroupMatch,
    matchNumber: matchNumber,
  );
}

void main() {
  final all = [
    _match(
      id: 'b1',
      categoryId: 'cat-a',
      round: 2,
      matchType: 'Round of 16',
      matchNumber: 1,
    ),
    _match(
      id: 'b2',
      categoryId: 'cat-a',
      round: 3,
      matchType: 'Quarter-Final',
      matchNumber: 1,
    ),
    _match(id: 'b3', categoryId: 'cat-b', round: 2),
    _match(
      id: 'g1',
      categoryId: 'cat-a',
      matchType: 'Group',
      poolId: 'B',
      isGroupMatch: true,
      matchNumber: 1,
    ),
    _match(
      id: 'g2',
      categoryId: 'cat-a',
      matchType: 'Group',
      poolId: 'A',
      isGroupMatch: true,
      matchNumber: 2,
    ),
  ];

  test('bracketMatchesForCategory excludes pool matches', () {
    final bracket = bracketMatchesForCategory(all, 'cat-a');
    expect(bracket.map((m) => m.id), ['b1', 'b2']);
  });

  test('poolMatchesForCategory includes group matches only', () {
    final pools = poolMatchesForCategory(all, 'cat-a');
    expect(pools.map((m) => m.id), ['g2', 'g1']);
  });

  test('groupBracketMatchesByRound labels rounds', () {
    final bracket = bracketMatchesForCategory(all, 'cat-a');
    final groups = groupBracketMatchesByRound(bracket);
    expect(groups, hasLength(2));
    expect(groups[0].roundLabel, 'Oitavas de final');
    expect(groups[0].matches.map((m) => m.id), ['b1']);
    expect(groups[1].roundLabel, 'Quartas de final');
  });

  test(
    'groupBracketMatchesByRound interleaves WB and LB rounds in sequence',
    () {
      final matches = [
        _match(id: 'wb1', matchType: 'WB', round: 1, matchNumber: 1),
        _match(id: 'wb2', matchType: 'WB', round: 2, matchNumber: 4),
        _match(id: 'lb1', matchType: 'LB', round: 1, matchNumber: 3),
        _match(id: 'lb2', matchType: 'LB', round: 2, matchNumber: 5),
        _match(id: 'final', matchType: 'Final', round: 0, matchNumber: 6),
      ];

      final groups = groupBracketMatchesByRound(matches);
      expect(groups, hasLength(5));
      expect(
        groups.map((g) => g.roundLabel),
        ['WB1', 'LB1', 'WB2', 'LB2', 'Final'],
      );
      expect(groups.expand((g) => g.matches).map((m) => m.id), [
        'wb1',
        'lb1',
        'wb2',
        'lb2',
        'final',
      ]);
    },
  );

  test('bracketMatchesForCategory sorts double elimination in sequence', () {
    final matches = [
      _match(id: 'lb2', matchType: 'LB', round: 2, matchNumber: 5),
      _match(id: 'wb2', matchType: 'WB', round: 2, matchNumber: 4),
      _match(id: 'lb1', matchType: 'LB', round: 1, matchNumber: 3),
      _match(id: 'wb1', matchType: 'WB', round: 1, matchNumber: 1),
    ];

    expect(
      bracketMatchesForCategory(matches, 'cat-a').map((m) => m.id),
      ['wb1', 'lb1', 'wb2', 'lb2'],
    );
  });

  test('groupBracketMatchesByRound separates phases with round zero', () {
    final matches = [
      _match(id: 'qf1', matchType: 'Quarter-Final', round: 0, matchNumber: 1),
      _match(id: 'sf1', matchType: 'Semi-Final', round: 0, matchNumber: 2),
    ];

    final groups = groupBracketMatchesByRound(matches);
    expect(groups, hasLength(2));
    expect(groups[0].roundLabel, 'Quartas de final');
    expect(groups[1].roundLabel, 'Semifinais');
  });

  test('groupMatchesByPool sorts pool keys', () {
    final pools = poolMatchesForCategory(all, 'cat-a');
    final groups = groupMatchesByPool(pools);
    expect(groups, hasLength(2));
    expect(groups[0].poolLabel, 'Grupo A');
    expect(groups[1].poolLabel, 'Grupo B');
  });

  group('athlete match filters', () {
    final m1 = _match(id: '1', teamAId: 'my-team', teamBId: 'other-1');
    final m2 = _match(id: '2', teamAId: 'other-2', teamBId: 'other-3');
    final m3 = _match(id: '3', teamAId: 'other-4', teamBId: 'my-team');

    test('matchInvolvesTeam detects team on either side', () {
      expect(matchInvolvesTeam(m1, 'my-team'), isTrue);
      expect(matchInvolvesTeam(m1, 'other-1'), isTrue);
      expect(matchInvolvesTeam(m1, 'missing'), isFalse);
      expect(matchInvolvesTeam(m1, ''), isFalse);
    });

    test('filterAthleteMatches keeps only athlete games', () {
      expect(filterAthleteMatches([m1, m2, m3], {'my-team'}).map((m) => m.id), [
        '1',
        '3',
      ]);
    });

    test('athleteTeamIdForCategory returns team for selected category', () {
      expect(
        athleteTeamIdForCategory({
          'cat-a': 'team-a',
          'cat-b': 'team-b',
        }, 'cat-b'),
        'team-b',
      );
      expect(athleteTeamIdForCategory({'cat-a': 'team-a'}, 'cat-x'), isNull);
    });

    test('athleteTeamIdForCategory matches category case-insensitively', () {
      expect(
        athleteTeamIdForCategory({'Masculino C': 'team-a'}, 'masculino c'),
        'team-a',
      );
    });

    test('athleteTeamIdsForHighlight collects all registered team ids', () {
      expect(
        athleteTeamIdsForHighlight({'cat-a': 'team-a', 'cat-b': 'team-b'}),
        {'team-a', 'team-b'},
      );
    });

    test('isAthleteMatchForHighlight uses any athlete team id', () {
      expect(isAthleteMatchForHighlight(m1, {'my-team', 'other'}), isTrue);
      expect(isAthleteMatchForHighlight(m2, {'my-team'}), isFalse);
    });
  });
}

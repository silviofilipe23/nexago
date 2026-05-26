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
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: categoryId,
    round: round,
    matchType: matchType,
    poolId: poolId,
    teamAId: 'a$id',
    teamBId: 'b$id',
    status: 'Scheduled',
    resultA: '',
    resultB: '',
    isGroupMatch: isGroupMatch,
    matchNumber: matchNumber,
  );
}

void main() {
  final all = [
    _match(id: 'b1', categoryId: 'cat-a', round: 2, matchNumber: 1),
    _match(id: 'b2', categoryId: 'cat-a', round: 3, matchNumber: 1),
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
    expect(groups[0].roundLabel, 'Oitavas');
    expect(groups[0].matches.map((m) => m.id), ['b1']);
    expect(groups[1].roundLabel, 'Quartas');
  });

  test('groupMatchesByPool sorts pool keys', () {
    final pools = poolMatchesForCategory(all, 'cat-a');
    final groups = groupMatchesByPool(pools);
    expect(groups, hasLength(2));
    expect(groups[0].poolLabel, 'Grupo A');
    expect(groups[1].poolLabel, 'Grupo B');
  });
}

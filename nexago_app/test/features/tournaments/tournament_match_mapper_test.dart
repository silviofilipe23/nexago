import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';

void main() {
  test('fromMap parses bracket match fields', () {
    final match = TournamentMatchMapper.fromMap('m1', {
      'tournamentId': 'tour-1',
      'categoryId': 'Masculino B',
      'round': 3,
      'matchType': 'Elimination',
      'poolId': '',
      'teamAId': 'team-a',
      'teamBId': 'team-b',
      'status': 'Completed',
      'resultA': '2',
      'resultB': '1',
      'isGroupMatch': false,
      'matchNumber': 4,
    });

    expect(match.id, 'm1');
    expect(match.tournamentId, 'tour-1');
    expect(match.categoryId, 'Masculino B');
    expect(match.round, 3);
    expect(match.status, 'Completed');
    expect(match.resultA, '2');
    expect(match.isBracketMatch, isTrue);
    expect(match.isPoolMatch, isFalse);
    expect(match.scoreLabel, '2 × 1');
  });

  test('fromMap parses group match with poolId', () {
    final match = TournamentMatchMapper.fromMap('g1', {
      'tournamentId': 'tour-1',
      'categoryId': 'Misto',
      'round': 1,
      'matchType': 'Group',
      'poolId': 'A',
      'teamAId': 'a',
      'teamBId': 'b',
      'status': 'Scheduled',
      'isGroupMatch': true,
    });

    expect(match.poolId, 'A');
    expect(match.isPoolMatch, isTrue);
    expect(match.isBracketMatch, isFalse);
  });
}

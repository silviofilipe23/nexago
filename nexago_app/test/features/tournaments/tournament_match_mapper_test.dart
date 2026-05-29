import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_display.dart';

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
    expect(match.isCompleted, isTrue);
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

  test('fromMap parses sets timestamps and winnerId', () {
    final ended = DateTime.utc(2025, 6, 15, 18, 30);
    final match = TournamentMatchMapper.fromMap('live-1', {
      'tournamentId': 'tour-1',
      'categoryId': 'Feminino A',
      'round': 2,
      'matchType': 'WB',
      'teamAId': 'team-a',
      'teamBId': 'team-b',
      'status': 'In Progress',
      'sets': [
        {'a': 21, 'b': 19},
        {'a': 0, 'b': 0},
      ],
      'currentSetIndex': 1,
      'winnerId': '',
      'matchEndedAt': Timestamp.fromDate(ended),
      'teamADescription': 'Seed 1',
      'courtName': 'Quadra 2',
    });

    expect(match.sets, hasLength(2));
    expect(match.sets.first.a, 21);
    expect(match.sets.first.b, 19);
    expect(match.currentSetIndex, 1);
    expect(match.isInProgress, isTrue);
    expect(match.matchEndedAt?.toUtc(), ended);
    expect(match.teamADescription, 'Seed 1');
    expect(match.courtName, 'Quadra 2');
    expect(matchStatusPillLabelPt(match.status), 'AO VIVO');
    expect(setsForMatch(match).first.a, 21);
  });
}

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

  test('fromMap parses lastActions ordered by timestamp', () {
    final t1 = DateTime.utc(2026, 6, 9, 17, 12, 21);
    final t2 = DateTime.utc(2026, 6, 9, 17, 12, 45);
    final match = TournamentMatchMapper.fromMap('live-2', {
      'tournamentId': 'tour-1',
      'categoryId': 'Open',
      'teamAId': 'team-a',
      'teamBId': 'team-b',
      'status': 'In Progress',
      'lastActions': [
        {
          'type': 'point',
          'side': 'B',
          'setIndex': 0,
          'delta': 1,
          'ts': Timestamp.fromDate(t2),
        },
        {
          'type': 'point',
          'side': 'A',
          'setIndex': 0,
          'delta': 1,
          'ts': Timestamp.fromDate(t1),
        },
        {
          'type': 'invalid',
          'side': 'A',
          'setIndex': 0,
          'delta': 1,
          'ts': Timestamp.fromDate(t1),
        },
      ],
    });

    expect(match.lastActions, hasLength(2));
    expect(match.lastActions.first.side, 'A');
    expect(match.lastActions.last.side, 'B');
    expect(match.lastActions.first.setIndex, 0);
  });

  test('fromMap parses winnerAdvance wiring (bracket-definitions)', () {
    final match = TournamentMatchMapper.fromMap('de-1', {
      'tournamentId': 'tour-1',
      'categoryId': 'Open',
      'round': 1,
      'matchType': 'WB',
      'teamAId': 'team-a',
      'teamBId': 'team-b',
      'status': 'Scheduled',
      'matchNumber': 2,
      'winnerAdvance': {'matchNumber': 21, 'teamSlot': 'teamBId'},
    });

    expect(match.winnerAdvanceMatchNumber, 21);
    expect(match.winnerAdvanceSlot, 'B');
  });

  test('fromMap without winnerAdvance leaves wiring null', () {
    final match = TournamentMatchMapper.fromMap('de-2', {
      'tournamentId': 'tour-1',
      'categoryId': 'Open',
      'round': 1,
      'matchType': 'Final',
      'teamAId': 'team-a',
      'teamBId': 'team-b',
      'status': 'Scheduled',
      'matchNumber': 27,
    });

    expect(match.winnerAdvanceMatchNumber, isNull);
    expect(match.winnerAdvanceSlot, isNull);
  });

  test('fromMap parses liveScore quando presente e status In Progress', () {
    final updatedAt = DateTime.utc(2026, 7, 20, 15, 42);
    final match = TournamentMatchMapper.fromMap('live-3', {
      'tournamentId': 'tour-1',
      'categoryId': 'Open',
      'teamAId': 'team-a',
      'teamBId': 'team-b',
      'status': 'In Progress',
      'liveScore': {
        'setsA': 1,
        'setsB': 0,
        'currentGamesA': 4,
        'currentGamesB': 3,
        'updatedAt': Timestamp.fromDate(updatedAt),
      },
    });

    expect(match.isInProgress, isTrue);
    expect(match.liveScore, isNotNull);
    expect(match.liveScore!.setsA, 1);
    expect(match.liveScore!.setsB, 0);
    expect(match.liveScore!.currentGamesA, 4);
    expect(match.liveScore!.currentGamesB, 3);
    expect(match.liveScore!.updatedAt?.toUtc(), updatedAt);
  });

  test('fromMap sem campo liveScore deixa o placar ao vivo nulo', () {
    final match = TournamentMatchMapper.fromMap('sched-1', {
      'tournamentId': 'tour-1',
      'categoryId': 'Open',
      'teamAId': 'team-a',
      'teamBId': 'team-b',
      'status': 'Scheduled',
    });

    expect(match.liveScore, isNull);
  });
}

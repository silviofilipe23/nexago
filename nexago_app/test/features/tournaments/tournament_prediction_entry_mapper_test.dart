import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/predictions/tournament_prediction_entry_mapper.dart';

void main() {
  test('fromMap parses picks, championPick and score', () {
    final entry = TournamentPredictionEntryMapper.fromMap('u1', {
      'userId': 'u1',
      'picks': {'m1': 'team-a', 'm2': 'team-b'},
      'championPick': 'team-a',
      'score': 4,
    });

    expect(entry.userId, 'u1');
    expect(entry.picks, {'m1': 'team-a', 'm2': 'team-b'});
    expect(entry.championPick, 'team-a');
    expect(entry.score, 4);
    expect(entry.pickFor('m1'), 'team-a');
    expect(entry.pickFor('missing'), isNull);
  });

  test('fromMap tolerates missing optional fields', () {
    final entry = TournamentPredictionEntryMapper.fromMap('u2', {
      'userId': 'u2',
    });

    expect(entry.picks, isEmpty);
    expect(entry.championPick, isNull);
    expect(entry.score, 0);
  });

  test('fromMap ignores malformed pick entries', () {
    final entry = TournamentPredictionEntryMapper.fromMap('u3', {
      'picks': {'m1': 'team-a', 'm2': 42, '': 'team-c'},
    });

    expect(entry.picks, {'m1': 'team-a'});
  });
}

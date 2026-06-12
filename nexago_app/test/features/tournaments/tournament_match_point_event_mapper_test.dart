import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_point_event_mapper.dart';

void main() {
  test('fromMap parses point event fields', () {
    final ts = Timestamp.fromDate(DateTime.utc(2026, 6, 9, 17, 5));
    final event = TournamentMatchPointEventMapper.fromMap({
      'seq': 5,
      'type': 'point',
      'setIndex': 0,
      'side': 'A',
      'scoreA': 5,
      'scoreB': 3,
      'ts': ts,
    });

    expect(event, isNotNull);
    expect(event!.seq, 5);
    expect(event.type, 'point');
    expect(event.setIndex, 0);
    expect(event.side, 'A');
    expect(event.scoreA, 5);
    expect(event.scoreB, 3);
    expect(event.ts, ts.toDate());
    expect(event.isPoint, isTrue);
    expect(event.isSideA, isTrue);
  });

  test('fromMap returns null when required fields are missing', () {
    expect(
      TournamentMatchPointEventMapper.fromMap({
        'type': 'point',
        'setIndex': 0,
      }),
      isNull,
    );
  });

  test('fromMap parses undo-point', () {
    final event = TournamentMatchPointEventMapper.fromMap({
      'seq': 6,
      'type': 'undo-point',
      'setIndex': 0,
      'scoreA': 4,
      'scoreB': 3,
      'ts': Timestamp.fromDate(DateTime.utc(2026, 6, 9, 17, 6)),
    });

    expect(event, isNotNull);
    expect(event!.isUndoPoint, isTrue);
    expect(event.side, isNull);
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/live_point_replay.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_point_event.dart';

TournamentMatchPointEvent _ev(int seq, String type, String side) =>
    TournamentMatchPointEvent(
      seq: seq,
      type: type,
      setIndex: 0,
      scoreA: 0,
      scoreB: 0,
      ts: DateTime(2026, 10, 4),
      side: side,
    );

void main() {
  test(
    'dois desfazer seguidos miram pontos diferentes (replay da timeline)',
    () {
      final events = [
        _ev(1, 'point', 'A'),
        _ev(2, 'point', 'B'),
        _ev(3, 'undo-point', 'B'),
      ];
      expect(lastUndoablePoint(events)?.seq, 1);
    },
  );

  test('sem ponto a desfazer', () {
    expect(
      lastUndoablePoint([_ev(1, 'point', 'A'), _ev(2, 'undo-point', 'A')]),
      isNull,
    );
    expect(lastUndoablePoint(const []), isNull);
  });
}

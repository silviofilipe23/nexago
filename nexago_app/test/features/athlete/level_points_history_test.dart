import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/level_points_history.dart';

Map<String, dynamic> _event({
  String winner = 'tA',
  String status = 'applied',
  bool walkover = false,
  double before = 1949.4,
  double after = 2004.46,
}) =>
    {
      'status': status,
      'walkover': walkover,
      'endedAt': Timestamp.fromDate(DateTime(2026, 9, 12, 10)),
      'winnerTeamId': winner,
      'teamA': {
        'teamId': 'tA',
        'athleteIds': ['u1', 'u2'],
      },
      'teamB': {
        'teamId': 'tB',
        'athleteIds': ['u3', 'u4'],
      },
      'pre': {
        'u1': {'r': before, 'rd': 180},
      },
      'post': {
        'u1': {'r': after, 'rd': 167},
      },
    };

void main() {
  group('levelPointsEntryFromEvent', () {
    test('lê antes/depois arredondados e se o time do atleta venceu', () {
      final win = levelPointsEntryFromEvent(_event(), 'u1')!;
      expect(win.before, 1949);
      expect(win.after, 2004);
      expect(win.delta, 55);
      expect(win.win, isTrue);
      expect(
          levelPointsEntryFromEvent(_event(winner: 'tB'), 'u1')!.win, isFalse);
    });

    test('W.O., evento pulado ou atleta fora do evento não entram', () {
      expect(levelPointsEntryFromEvent(_event(walkover: true), 'u1'), isNull);
      expect(
          levelPointsEntryFromEvent(_event(status: 'skipped'), 'u1'), isNull);
      expect(levelPointsEntryFromEvent(_event(), 'u9'), isNull);
    });
  });

  test('summarizeLevelPoints: início, atual, pico e V–D', () {
    LevelPointsEntry e(int before, int after, bool win) => LevelPointsEntry(
          endedAt: DateTime(2026, 9, 1),
          before: before,
          after: after,
          win: win,
        );
    final summary = summarizeLevelPoints([
      e(1900, 1980, true),
      e(1980, 2147, true),
      e(2147, 2080, false),
    ])!;
    expect(summary.start, 1900);
    expect(summary.current, 2080);
    expect(summary.delta, 180);
    expect(summary.peak, 2147);
    expect(summary.wins, 2);
    expect(summary.losses, 1);
    expect(summary.matches, 3);
    expect(summarizeLevelPoints(const []), isNull);
  });
}

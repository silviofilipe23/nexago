import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/schedule_grid_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';

TournamentMatch _match({
  String status = 'scheduled',
  DateTime? scheduleTime,
  String courtId = 'Q1',
  String? teamADescription,
  String? teamBDescription,
  List<TournamentMatchSet> sets = const [],
}) {
  return TournamentMatch(
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: 3,
    matchType: 'wb',
    poolId: '',
    teamAId: 'a',
    teamBId: 'b',
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: 1,
    courtId: courtId,
    scheduleTime: scheduleTime,
    teamADescription: teamADescription ?? 'Igor / João',
    teamBDescription: teamBDescription ?? 'Bruno / Carlos',
    sets: sets,
  );
}

void main() {
  group('ScheduleGridLogic', () {
    test('buildTimeSlots creates 30-minute increments', () {
      final day = DateTime(2026, 6, 16);
      final slots = ScheduleGridLogic.buildTimeSlots(
        day: day,
        dayStart: '08:00',
        dayEnd: '10:00',
      );
      expect(slots.length, 4);
      expect(ScheduleGridLogic.timeLabel(slots.first), '08:00');
      expect(ScheduleGridLogic.timeLabel(slots[1]), '08:30');
    });

    test('matchTopOffset positions card by schedule time', () {
      final gridStart = DateTime(2026, 6, 16, 8);
      final match = _match(
        scheduleTime: DateTime(2026, 6, 16, 9),
      );
      expect(
        ScheduleGridLogic.matchTopOffset(match: match, gridStart: gridStart),
        ScheduleGridLogic.slotHeight * 2,
      );
    });

    test('teamLine shortens second player name', () {
      expect(
        ScheduleGridLogic.teamLine(description: 'Igor / João'),
        'Igor / J.',
      );
    });

    test('matchPhase detects live and finished', () {
      expect(
        ScheduleGridLogic.matchPhase(_match(status: 'in_progress')),
        ScheduleGridMatchPhase.live,
      );
      expect(
        ScheduleGridLogic.matchPhase(_match(status: 'completed')),
        ScheduleGridMatchPhase.finished,
      );
    });

    test('unscheduledCount ignores scheduled matches', () {
      final matches = [
        _match(
          scheduleTime: DateTime(2026, 6, 16, 8),
          courtId: 'Q1',
        ),
        _match(courtId: ''),
      ];
      expect(ScheduleGridLogic.unscheduledCount(matches), 1);
    });
  });
}

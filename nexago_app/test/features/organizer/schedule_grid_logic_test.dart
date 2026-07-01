import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/schedule_grid_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';

TournamentMatch _match({
  String status = 'scheduled',
  DateTime? scheduleTime,
  DateTime? scheduleEndTime,
  String courtId = 'Q1',
  String? teamADescription,
  String? teamBDescription,
  List<TournamentMatchSet> sets = const [],
  int matchNumber = 1,
  String matchType = 'wb',
  String poolId = '',
  bool isGroupMatch = false,
}) {
  return TournamentMatch(
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: 3,
    matchType: matchType,
    poolId: poolId,
    teamAId: 'a',
    teamBId: 'b',
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: isGroupMatch,
    matchNumber: matchNumber,
    courtId: courtId,
    scheduleTime: scheduleTime,
    scheduleEndTime: scheduleEndTime,
    teamADescription: teamADescription ?? 'Igor / João',
    teamBDescription: teamBDescription ?? 'Bruno / Carlos',
    sets: sets,
  );
}

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  group('ScheduleGridLogic', () {
    test('buildTimeSlots creates 30-minute increments in São Paulo', () {
      final day = nexagoEventDayKeyAnchor('2026-06-16')!;
      final slots = ScheduleGridLogic.buildTimeSlots(
        day: day,
        dayStart: '08:00',
        dayEnd: '10:00',
      );
      expect(slots.length, 4);
      expect(ScheduleGridLogic.timeLabel(slots.first), '08:00');
      expect(ScheduleGridLogic.timeLabel(slots[1]), '08:30');
    });

    test('matchBlockHeight is always one 30-minute slot', () {
      final match = _match(
        scheduleTime: nexagoEventDateTime(
          year: 2026,
          month: 6,
          day: 16,
          hour: 8,
        ),
        scheduleEndTime: nexagoEventDateTime(
          year: 2026,
          month: 6,
          day: 16,
          hour: 8,
          minute: 50,
        ),
      );
      expect(
        ScheduleGridLogic.matchBlockHeight(
          match: match,
          defaultDurationMin: 50,
        ),
        ScheduleGridLogic.slotHeight,
      );
    });

    test('matchTopOffset snaps start to 30-minute slot row', () {
      final gridStart = nexagoEventDateTime(
        year: 2026,
        month: 6,
        day: 16,
        hour: 8,
      );
      final match = _match(
        scheduleTime: nexagoEventDateTime(
          year: 2026,
          month: 6,
          day: 16,
          hour: 9,
          minute: 35,
        ),
      );
      expect(
        ScheduleGridLogic.matchTopOffset(match: match, gridStart: gridStart),
        ScheduleGridLogic.slotHeight * 3,
      );
    });

    test('matchTopOffset positions card by schedule time', () {
      final gridStart = nexagoEventDateTime(
        year: 2026,
        month: 6,
        day: 16,
        hour: 8,
      );
      final match = _match(
        scheduleTime: nexagoEventDateTime(
          year: 2026,
          month: 6,
          day: 16,
          hour: 9,
        ),
      );
      expect(
        ScheduleGridLogic.matchTopOffset(match: match, gridStart: gridStart),
        ScheduleGridLogic.slotHeight * 2,
      );
    });

    test('matchTopOffset aligns SP wall clock when scheduleTime is local', () {
      final gridStart = nexagoEventDateTime(
        year: 2026,
        month: 6,
        day: 16,
        hour: 8,
      );
      // Simula Timestamp.toDate() no fuso de São Paulo (14:30 local).
      final scheduleUtc = nexagoEventDateTime(
        year: 2026,
        month: 6,
        day: 16,
        hour: 14,
        minute: 30,
      );
      final scheduleLocal = scheduleUtc.toLocal();
      final match = _match(scheduleTime: scheduleLocal);
      expect(
        ScheduleGridLogic.matchTopOffset(match: match, gridStart: gridStart),
        ScheduleGridLogic.slotHeight * 13,
      );
      expect(
        ScheduleGridLogic.timeLabel(scheduleLocal),
        '14:30',
      );
    });

    test('matchTimeRange shows floored 30-minute window', () {
      final match = _match(
        scheduleTime: nexagoEventDateTime(
          year: 2026,
          month: 6,
          day: 16,
          hour: 9,
          minute: 35,
        ),
      );
      expect(
        ScheduleGridLogic.matchTimeRange(match, defaultDurationMin: 50),
        '09:30-10:00',
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
          scheduleTime: nexagoEventDateTime(
            year: 2026,
            month: 6,
            day: 16,
            hour: 8,
          ),
          courtId: 'Q1',
        ),
        _match(courtId: ''),
      ];
      expect(ScheduleGridLogic.unscheduledCount(matches), 1);
    });

    test('gridTimeSlotsForDay covers 07:00 through 23:30 SP', () {
      const dayKey = '2026-06-16';
      final slots = ScheduleGridLogic.gridTimeSlotsForDay(dayKey: dayKey);
      expect(slots.isNotEmpty, isTrue);
      expect(ScheduleGridLogic.timeLabel(slots.first), '07:00');
      expect(ScheduleGridLogic.timeLabel(slots.last), '23:30');
      expect(slots.length, 34);
    });

    test('matchCardHeader includes match number and phase label', () {
      final match = _match(
        matchNumber: 7,
        matchType: 'Group',
        poolId: 'A',
        isGroupMatch: true,
      );
      final header = ScheduleGridLogic.matchCardHeader(
        match: match,
        categoryCompactLabel: 'MASC · INICIANTE',
        categoryMatches: [match],
      );
      expect(header.eyebrow, '#7 · MASC · INICIANTE');
      expect(header.phaseLabel, contains('GRUPO'));
    });

    test('categoryAccentColors assigns stable distinct colors', () {
      final colors = ScheduleGridLogic.categoryAccentColors([
        'cat-b',
        'cat-a',
        'cat-c',
      ]);
      expect(colors.length, 3);
      expect(colors['cat-a'], isNotNull);
      expect(colors['cat-b'], isNotNull);
      expect(colors['cat-c'], isNotNull);
      expect(colors['cat-a'], isNot(colors['cat-b']));
      expect(
        ScheduleGridLogic.categoryAccentColors(['cat-a'])['cat-a'],
        colors['cat-a'],
      );
    });

    test('matchCardAccentColor attenuates finished matches', () {
      final colors = ScheduleGridLogic.categoryAccentColors(['cat1']);
      final live = ScheduleGridLogic.matchCardAccentColor(
        categoryId: 'cat1',
        categoryColors: colors,
        phase: ScheduleGridMatchPhase.live,
      );
      final finished = ScheduleGridLogic.matchCardAccentColor(
        categoryId: 'cat1',
        categoryColors: colors,
        phase: ScheduleGridMatchPhase.finished,
      );
      expect(finished.a, lessThan(live.a));
    });

    test('gridTimeSlotsForDay expands when match ends after 23:30', () {
      const dayKey = '2026-06-16';
      final lateMatch = _match(
        scheduleTime: nexagoEventDateTime(
          year: 2026,
          month: 6,
          day: 16,
          hour: 23,
          minute: 15,
        ),
        scheduleEndTime: nexagoEventDateTime(
          year: 2026,
          month: 6,
          day: 17,
          hour: 0,
          minute: 15,
        ),
      );
      final slots = ScheduleGridLogic.gridTimeSlotsForDay(
        dayKey: dayKey,
        dayMatches: [lateMatch],
        defaultDurationMin: 50,
      );
      expect(slots.length, greaterThan(34));
    });
  });
}

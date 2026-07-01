import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/schedule_logic.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String id = 'm1',
  String teamAId = 't1',
  String teamBId = 't2',
  DateTime? scheduleTime,
  DateTime? scheduleEndTime,
  String courtId = 'Q1',
  int round = 1,
  int matchNumber = 1,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 'tor1',
    categoryId: 'A',
    round: round,
    matchType: 'wb',
    poolId: '',
    teamAId: teamAId,
    teamBId: teamBId,
    status: TournamentMatchStatus.scheduled,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: matchNumber,
    scheduleTime: scheduleTime,
    scheduleEndTime: scheduleEndTime,
    courtId: courtId,
  );
}

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  group('ScheduleLogic', () {
    test('detectCourtOverlap finds overlapping slot', () {
      final start = DateTime(2026, 6, 14, 10, 0);
      final end = DateTime(2026, 6, 14, 11, 0);
      final overlap = ScheduleLogic.detectCourtOverlap(
        courtId: 'Q1',
        scheduleStart: DateTime(2026, 6, 14, 10, 30),
        scheduleEnd: DateTime(2026, 6, 14, 11, 30),
        allMatches: [
          _match(
            id: 'other',
            scheduleTime: start,
            scheduleEndTime: end,
          ),
        ],
      );
      expect(overlap, isNotNull);
      expect(overlap!.type, 'overlap');
    });

    test('matchOnCourt matches courtId or courtName', () {
      expect(
        ScheduleLogic.matchOnCourt(
          _match(courtId: 'Q1'),
          courtId: 'Q1',
          courtName: 'Quadra 1',
        ),
        isTrue,
      );
      expect(
        ScheduleLogic.matchOnCourt(
          TournamentMatch(
            id: 'm',
            tournamentId: 't',
            categoryId: 'c',
            round: 1,
            matchType: 'wb',
            poolId: '',
            teamAId: 'a',
            teamBId: 'b',
            status: TournamentMatchStatus.scheduled,
            resultA: '',
            resultB: '',
            isGroupMatch: false,
            matchNumber: 1,
            courtName: 'Quadra 1',
          ),
          courtId: 'Q1',
          courtName: 'Quadra 1',
        ),
        isTrue,
      );
      expect(
        ScheduleLogic.matchOnCourt(
          _match(courtId: 'Q2'),
          courtId: 'Q1',
          courtName: 'Quadra 1',
        ),
        isFalse,
      );
    });

    test('detectRestConflict warns on short rest', () {
      final target = _match(id: 'target', teamAId: 't1', teamBId: 't3');
      final conflicts = ScheduleLogic.detectRestConflict(
        target: target,
        scheduleStart: DateTime(2026, 6, 14, 12, 0),
        scheduleEnd: DateTime(2026, 6, 14, 13, 0),
        allMatches: [
          _match(
            id: 'prev',
            teamAId: 't1',
            teamBId: 't2',
            scheduleTime: DateTime(2026, 6, 14, 10, 0),
            scheduleEndTime: DateTime(2026, 6, 14, 11, 30),
          ),
        ],
        minRestMin: 45,
      );
      expect(conflicts, isNotEmpty);
      expect(conflicts.first.type, 'rest');
    });

    test('buildDaySchedule enforces min rest between same team matches', () {
      final courts = [const TournamentCourt(id: 'Q1', name: 'Q1', order: 1)];
      final slots = ScheduleLogic.buildDaySchedule(
        unscheduled: [
          _match(id: 'a', teamAId: 't1', teamBId: 't2', matchNumber: 1),
          _match(id: 'b', teamAId: 't1', teamBId: 't3', matchNumber: 2),
        ],
        courts: courts,
        dayStart: DateTime(2026, 6, 14, 8, 0),
        matchDurationMin: 30,
        minRestMin: 30,
        existingScheduled: const [],
        avoidAthleteConflict: true,
      );
      expect(slots.length, 2);
      final gap = slots[1].start.difference(slots[0].end).inMinutes;
      expect(gap, greaterThanOrEqualTo(30));
    });

    test('buildDaySchedule assigns courts', () {
      final courts = [
        const TournamentCourt(id: 'Q1', name: 'Q1', order: 1),
        const TournamentCourt(id: 'Q2', name: 'Q2', order: 2),
      ];
      final slots = ScheduleLogic.buildDaySchedule(
        unscheduled: [
          _match(id: 'a'),
          _match(id: 'b'),
        ],
        courts: courts,
        dayStart: DateTime(2026, 6, 14, 8, 0),
        matchDurationMin: 50,
        minRestMin: 0,
        existingScheduled: const [],
      );
      expect(slots.length, 2);
      expect(slots.map((s) => s.courtId).toSet().length, greaterThanOrEqualTo(1));
    });

    test('buildDaySchedule segue a sequência (round, matchNumber)', () {
      final courts = [const TournamentCourt(id: 'Q1', name: 'Q1', order: 1)];
      // Entrada embaralhada de propósito: grupos (round 0) + mata-mata (round 1
      // e 2) com matchNumber fora de ordem na lista.
      final unscheduled = [
        _match(id: 'sf2', round: 2, matchNumber: 6, teamAId: 't7', teamBId: 't8'),
        _match(id: 'qf3', round: 1, matchNumber: 3, teamAId: 't5', teamBId: 't6'),
        _match(id: 'g1', round: 0, matchNumber: 1, teamAId: 'a1', teamBId: 'a2'),
        _match(id: 'qf1', round: 1, matchNumber: 2, teamAId: 't1', teamBId: 't2'),
        _match(id: 'sf1', round: 2, matchNumber: 5, teamAId: 't3', teamBId: 't4'),
      ];
      final slots = ScheduleLogic.buildDaySchedule(
        unscheduled: unscheduled,
        courts: courts,
        dayStart: DateTime(2026, 6, 14, 8, 0),
        matchDurationMin: 50,
        minRestMin: 0,
        existingScheduled: const [],
        avoidAthleteConflict: false,
      );
      // Uma única quadra → a ordem dos slots reflete a sequência de jogos.
      expect(
        slots.map((s) => s.matchId).toList(),
        ['g1', 'qf1', 'qf3', 'sf1', 'sf2'],
      );
    });

    test('tournamentDayKeys spans start to end inclusive', () {
      final start = nexagoEventDateTime(year: 2026, month: 6, day: 30);
      final end = nexagoEventDateTime(year: 2026, month: 7, day: 2);
      final keys = ScheduleLogic.tournamentDayKeys(startAt: start, endAt: end);
      expect(keys, ['2026-06-30', '2026-07-01', '2026-07-02']);
    });

    test('resolveScheduleGridDayKey prefers activeDayKey when today differs', () {
      final keys = ['2026-06-14', '2026-06-15', '2026-06-16'];
      expect(
        ScheduleLogic.resolveScheduleGridDayKey(
          tournamentDays: keys,
          activeDayKey: '2026-06-14',
          todayDayKey: '2026-06-15',
        ),
        '2026-06-14',
      );
    });

    test('resolveScheduleGridDayKey uses today when no activeDayKey', () {
      final keys = ['2026-06-14', '2026-06-15', '2026-06-16'];
      expect(
        ScheduleLogic.resolveScheduleGridDayKey(
          tournamentDays: keys,
          todayDayKey: '2026-06-15',
        ),
        '2026-06-15',
      );
    });

    test('resolveScheduleGridDayKey falls back to activeDayKey', () {
      final keys = ['2026-06-14', '2026-06-15'];
      expect(
        ScheduleLogic.resolveScheduleGridDayKey(
          tournamentDays: keys,
          activeDayKey: '2026-06-14',
          todayDayKey: '2026-06-20',
        ),
        '2026-06-14',
      );
    });
  });
}

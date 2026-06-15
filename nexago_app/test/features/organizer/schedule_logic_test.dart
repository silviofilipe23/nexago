import 'package:flutter_test/flutter_test.dart';
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
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 'tor1',
    categoryId: 'A',
    round: 1,
    matchType: 'wb',
    poolId: '',
    teamAId: teamAId,
    teamBId: teamBId,
    status: TournamentMatchStatus.scheduled,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: 1,
    scheduleTime: scheduleTime,
    scheduleEndTime: scheduleEndTime,
    courtId: courtId,
  );
}

void main() {
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
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/schedule_time_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String id = 'm1',
  String courtId = '',
  DateTime? scheduleTime,
  DateTime? scheduleEndTime,
  String teamAId = 't1',
  String teamBId = 't2',
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 'tour',
    categoryId: 'cat',
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
    courtId: courtId,
    scheduleTime: scheduleTime,
    scheduleEndTime: scheduleEndTime,
  );
}

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  group('ScheduleTimeLogic', () {
    test('courtStatusAt returns busy when overlap exists', () {
      final slot = nexagoEventDateTime(
        year: 2026,
        month: 6,
        day: 16,
        hour: 10,
      );
      final status = ScheduleTimeLogic.courtStatusAt(
        courtId: 'Q1',
        slotStart: slot,
        durationMin: 50,
        allMatches: [
          _match(
            id: 'other',
            courtId: 'Q1',
            scheduleTime: nexagoEventDateTime(
              year: 2026,
              month: 6,
              day: 16,
              hour: 9,
              minute: 30,
            ),
            scheduleEndTime: nexagoEventDateTime(
              year: 2026,
              month: 6,
              day: 16,
              hour: 10,
              minute: 20,
            ),
          ),
        ],
        excludeMatchId: 'm1',
      );
      expect(status, ScheduleCourtSlotStatus.busy);
    });

    test('courtStatusAt returns busy for live match on court', () {
      final status = ScheduleTimeLogic.courtStatusAt(
        courtId: 'Q1',
        courtName: 'Quadra 1',
        slotStart: nexagoEventDateTime(
          year: 2026,
          month: 6,
          day: 16,
          hour: 18,
        ),
        durationMin: 50,
        allMatches: [
          TournamentMatch(
            id: 'live',
            tournamentId: 'tour',
            categoryId: 'cat',
            round: 1,
            matchType: 'wb',
            poolId: '',
            teamAId: 't1',
            teamBId: 't2',
            status: TournamentMatchStatus.inProgress,
            resultA: '',
            resultB: '',
            isGroupMatch: false,
            matchNumber: 1,
            courtId: 'Q1',
            scheduleTime: nexagoEventDateTime(
              year: 2026,
              month: 6,
              day: 16,
              hour: 8,
            ),
            queueStatus: 'on_court',
          ),
        ],
        excludeMatchId: 'm1',
      );
      expect(status, ScheduleCourtSlotStatus.busy);
    });

    test('hasBlockingConflict is true only for overlap', () {
      expect(
        ScheduleTimeLogic.hasBlockingConflict(const [
          ScheduleConflict(type: 'rest', message: 'rest'),
        ]),
        isFalse,
      );
      expect(
        ScheduleTimeLogic.hasBlockingConflict(const [
          ScheduleConflict(type: 'overlap', message: 'busy'),
        ]),
        isTrue,
      );
    });

    test('confirmLabel uses São Paulo wall clock', () {
      expect(
        ScheduleTimeLogic.confirmLabel(
          slotStart: nexagoEventDateTime(
            year: 2026,
            month: 6,
            day: 16,
            hour: 10,
          ),
        ),
        'Confirmar 10:00',
      );
    });

    test('conflictTitle maps rest and overlap', () {
      expect(
        ScheduleTimeLogic.conflictTitle(
          const ScheduleConflict(type: 'rest', message: ''),
        ),
        'Conflito de descanso',
      );
      expect(
        ScheduleTimeLogic.conflictTitle(
          const ScheduleConflict(type: 'overlap', message: ''),
        ),
        'Quadra ocupada',
      );
    });
  });
}

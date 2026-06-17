import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/schedule_time_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String id = 'm1',
  String courtId = '',
  DateTime? scheduleTime,
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
  );
}

void main() {
  group('ScheduleTimeLogic', () {
    test('courtStatusAt returns busy when overlap exists', () {
      final slot = DateTime(2026, 6, 16, 10);
      final status = ScheduleTimeLogic.courtStatusAt(
        courtId: 'Q1',
        slotStart: slot,
        durationMin: 50,
        allMatches: [
          _match(
            id: 'other',
            courtId: 'Q1',
            scheduleTime: DateTime(2026, 6, 16, 9, 30),
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

    test('confirmLabel uses time only', () {
      expect(
        ScheduleTimeLogic.confirmLabel(
          slotStart: DateTime(2026, 6, 16, 10),
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

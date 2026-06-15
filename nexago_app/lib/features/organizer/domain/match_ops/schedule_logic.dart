import '../../../tournaments/domain/tournament_match.dart';
import 'match_ops_models.dart';

/// Conflitos de agendamento e auto-programação (H1–H3).
abstract final class ScheduleLogic {
  ScheduleLogic._();

  static List<ScheduleConflict> detectRestConflict({
    required TournamentMatch target,
    required DateTime scheduleStart,
    required DateTime scheduleEnd,
    required List<TournamentMatch> allMatches,
    required int minRestMin,
  }) {
    final conflicts = <ScheduleConflict>[];
    final teamIds = {target.teamAId, target.teamBId}
        .where((id) => id.trim().isNotEmpty);

    for (final other in allMatches) {
      if (other.id == target.id) continue;
      if (other.scheduleTime == null) continue;

      final otherStart = other.scheduleTime!;
      final otherEnd = other.scheduleEndTime ??
          otherStart.add(const Duration(minutes: 50));

      final sharesTeam = teamIds.contains(other.teamAId) ||
          teamIds.contains(other.teamBId);
      if (!sharesTeam) continue;

      final gapBefore = scheduleStart.difference(otherEnd).inMinutes;
      final gapAfter = otherStart.difference(scheduleEnd).inMinutes;

      if (gapBefore >= 0 && gapBefore < minRestMin) {
        conflicts.add(
          ScheduleConflict(
            type: 'rest',
            message:
                'Descanso insuficiente (${gapBefore}min) após partida anterior.',
            matchId: other.id,
            teamId: teamIds.contains(other.teamAId)
                ? other.teamAId
                : other.teamBId,
          ),
        );
      }
      if (gapAfter >= 0 && gapAfter < minRestMin) {
        conflicts.add(
          ScheduleConflict(
            type: 'rest',
            message:
                'Descanso insuficiente (${gapAfter}min) antes da próxima partida.',
            matchId: other.id,
            teamId: teamIds.contains(other.teamAId)
                ? other.teamAId
                : other.teamBId,
          ),
        );
      }
    }

    return conflicts;
  }

  static ScheduleConflict? detectCourtOverlap({
    required String courtId,
    required DateTime scheduleStart,
    required DateTime scheduleEnd,
    required List<TournamentMatch> allMatches,
    String excludeMatchId = '',
  }) {
    for (final m in allMatches) {
      if (m.id == excludeMatchId) continue;
      if (m.courtId != courtId && m.effectiveCourtLabel != courtId) continue;
      if (m.scheduleTime == null) continue;

      final start = m.scheduleTime!;
      final end = m.scheduleEndTime ?? start.add(const Duration(minutes: 50));

      final overlaps = scheduleStart.isBefore(end) && scheduleEnd.isAfter(start);
      if (overlaps) {
        return ScheduleConflict(
          type: 'overlap',
          message: 'Quadra ocupada neste horário.',
          matchId: m.id,
        );
      }
    }
    return null;
  }

  /// Prévia de auto-programação para um dia (H3).
  static List<AutoScheduleSlot> buildDaySchedule({
    required List<TournamentMatch> unscheduled,
    required List<TournamentCourt> courts,
    required DateTime dayStart,
    required int matchDurationMin,
    required int minRestMin,
    required List<TournamentMatch> existingScheduled,
    bool avoidAthleteConflict = true,
  }) {
    final slots = <AutoScheduleSlot>[];
    final courtBusyUntil = <String, DateTime>{
      for (final c in courts) c.id: dayStart,
    };
    final teamBusyUntil = <String, DateTime>{};

    for (final m in existingScheduled) {
      if (m.courtId.isEmpty || m.scheduleTime == null) continue;
      final end = m.scheduleEndTime ??
          m.scheduleTime!.add(Duration(minutes: matchDurationMin));
      final prev = courtBusyUntil[m.courtId];
      if (prev == null || end.isAfter(prev)) {
        courtBusyUntil[m.courtId] = end;
      }
      for (final tid in [m.teamAId, m.teamBId]) {
        if (tid.isEmpty) continue;
        final tPrev = teamBusyUntil[tid];
        if (tPrev == null || end.isAfter(tPrev)) {
          teamBusyUntil[tid] = end.add(Duration(minutes: minRestMin));
        }
      }
    }

    final pending = [...unscheduled]
      ..sort((a, b) => a.round.compareTo(b.round));

    for (final match in pending) {
      TournamentCourt? chosenCourt;
      DateTime? chosenStart;

      for (final court in courts) {
        var start = courtBusyUntil[court.id] ?? dayStart;

        if (avoidAthleteConflict) {
          for (final tid in [match.teamAId, match.teamBId]) {
            if (tid.isEmpty) continue;
            final busy = teamBusyUntil[tid];
            if (busy != null && busy.isAfter(start)) {
              start = busy;
            }
          }
        }

        if (chosenStart == null || start.isBefore(chosenStart)) {
          chosenStart = start;
          chosenCourt = court;
        }
      }

      if (chosenCourt == null || chosenStart == null) continue;

      final end = chosenStart.add(Duration(minutes: matchDurationMin));
      slots.add(
        AutoScheduleSlot(
          matchId: match.id,
          courtId: chosenCourt.id,
          start: chosenStart,
          end: end,
        ),
      );

      courtBusyUntil[chosenCourt.id] =
          end.add(const Duration(minutes: 5));
      for (final tid in [match.teamAId, match.teamBId]) {
        if (tid.isEmpty) continue;
        teamBusyUntil[tid] = end.add(Duration(minutes: minRestMin));
      }
    }

    return slots;
  }

  static String dayKeyFromDate(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }
}

class AutoScheduleSlot {
  const AutoScheduleSlot({
    required this.matchId,
    required this.courtId,
    required this.start,
    required this.end,
  });

  final String matchId;
  final String courtId;
  final DateTime start;
  final DateTime end;
}

import '../../../../core/time/nexago_event_timezone.dart';
import '../../../tournaments/domain/tournament_match.dart';
import 'match_ops_models.dart';
import 'schedule_grid_logic.dart';
import 'schedule_logic.dart';
import 'schedule_pick_logic.dart';

enum ScheduleCourtSlotStatus { free, busy }

abstract final class ScheduleTimeLogic {
  ScheduleTimeLogic._();

  static List<DateTime> timeSlotsForDay({
    required String dayKey,
    required TournamentMatchOpsConfig config,
  }) {
    final anchor = _dayAnchor(dayKey, config);
    return ScheduleGridLogic.buildTimeSlots(
      day: anchor,
      dayStart: config.dayStart,
      dayEnd: config.dayEnd,
    );
  }

  static ScheduleCourtSlotStatus courtStatusAt({
    required String courtId,
    required DateTime slotStart,
    required int durationMin,
    required List<TournamentMatch> allMatches,
    required String excludeMatchId,
    String? courtName,
  }) {
    for (final m in allMatches) {
      if (m.id == excludeMatchId) continue;
      if (!ScheduleLogic.matchOnCourt(
        m,
        courtId: courtId,
        courtName: courtName,
      )) {
        continue;
      }
      if (m.isCompleted) continue;
      if (m.isInProgress || m.isOnCourt) {
        return ScheduleCourtSlotStatus.busy;
      }
    }

    final end = slotStart.add(Duration(minutes: durationMin));
    final overlap = ScheduleLogic.detectCourtOverlap(
      courtId: courtId,
      courtName: courtName,
      scheduleStart: slotStart,
      scheduleEnd: end,
      allMatches: allMatches,
      excludeMatchId: excludeMatchId,
    );
    return overlap == null
        ? ScheduleCourtSlotStatus.free
        : ScheduleCourtSlotStatus.busy;
  }

  static Map<String, ScheduleCourtSlotStatus> courtStatusByCourtId({
    required List<TournamentCourt> courts,
    required DateTime slotStart,
    required int durationMin,
    required List<TournamentMatch> allMatches,
    required String excludeMatchId,
  }) {
    return {
      for (final court in courts)
        court.id: courtStatusAt(
          courtId: court.id,
          courtName: court.name,
          slotStart: slotStart,
          durationMin: durationMin,
          allMatches: allMatches,
          excludeMatchId: excludeMatchId,
        ),
    };
  }

  static bool isSlotSelectable({
    required String courtId,
    required DateTime slotStart,
    required int durationMin,
    required List<TournamentMatch> allMatches,
    required String excludeMatchId,
    String? courtName,
  }) {
    return courtStatusAt(
          courtId: courtId,
          courtName: courtName,
          slotStart: slotStart,
          durationMin: durationMin,
          allMatches: allMatches,
          excludeMatchId: excludeMatchId,
        ) ==
        ScheduleCourtSlotStatus.free;
  }

  static List<ScheduleConflict> conflictsFor({
    required TournamentMatch match,
    required String courtId,
    required DateTime slotStart,
    required int durationMin,
    required List<TournamentMatch> allMatches,
    required int minRestMin,
    String? courtName,
  }) {
    final end = slotStart.add(Duration(minutes: durationMin));
    final overlap = ScheduleLogic.detectCourtOverlap(
      courtId: courtId,
      courtName: courtName,
      scheduleStart: slotStart,
      scheduleEnd: end,
      allMatches: allMatches,
      excludeMatchId: match.id,
    );
    final rest = ScheduleLogic.detectRestConflict(
      target: match,
      scheduleStart: slotStart,
      scheduleEnd: end,
      allMatches: allMatches,
      minRestMin: minRestMin,
    );
    return [
      if (overlap != null) overlap,
      ...rest,
    ];
  }

  static bool hasBlockingConflict(List<ScheduleConflict> conflicts) {
    return conflicts.any((c) => c.type == 'overlap');
  }

  static String confirmLabel({
    required DateTime slotStart,
  }) {
    return 'Confirmar ${ScheduleGridLogic.timeLabel(slotStart)}';
  }

  static String conflictTitle(ScheduleConflict conflict) {
    return switch (conflict.type) {
      'overlap' => 'Quadra ocupada',
      'rest' => 'Conflito de descanso',
      _ => 'Aviso de agendamento',
    };
  }

  static DateTime initialSlot({
    required TournamentMatch match,
    required List<TournamentMatch> dayMatches,
    required List<TournamentCourt> courts,
    required TournamentMatchOpsConfig config,
    required String dayKey,
    required List<DateTime> slots,
  }) {
    if (match.scheduleTime != null) return match.scheduleTime!;
    final suggestion = SchedulePickLogic.suggestSlotForMatch(
      match: match,
      dayMatches: dayMatches,
      courts: courts,
      config: config,
      dayKey: dayKey,
    );
    if (suggestion != null) return suggestion.start;
    return slots.isNotEmpty ? slots.first : _dayAnchor(dayKey, config);
  }

  static String initialCourtId({
    required TournamentMatch match,
    required List<TournamentCourt> courts,
    required List<TournamentMatch> dayMatches,
    required TournamentMatchOpsConfig config,
    required String dayKey,
  }) {
    if (match.courtId.isNotEmpty) return match.courtId;
    final suggestion = SchedulePickLogic.suggestSlotForMatch(
      match: match,
      dayMatches: dayMatches,
      courts: courts,
      config: config,
      dayKey: dayKey,
    );
    if (suggestion != null) return suggestion.courtId;
    return courts.firstOrNull?.id ?? 'Q1';
  }

  static DateTime slotOnDay({
    required DateTime slot,
    required String dayKey,
    required TournamentMatchOpsConfig config,
  }) {
    final parts = dayKey.split('-').map(int.tryParse).toList();
    if (parts.length == 3 && parts.every((p) => p != null)) {
      final local = toNexagoEventLocal(slot);
      return nexagoEventDateTime(
        year: parts[0]!,
        month: parts[1]!,
        day: parts[2]!,
        hour: local.hour,
        minute: local.minute,
      );
    }
    return slot;
  }

  static DateTime _dayAnchor(String dayKey, TournamentMatchOpsConfig config) {
    final parts = dayKey.split('-').map(int.tryParse).toList();
    if (parts.length == 3 && parts.every((p) => p != null)) {
      final hourMin = config.dayStart.split(':');
      final hour = int.tryParse(hourMin.first) ?? 8;
      final minute =
          hourMin.length > 1 ? int.tryParse(hourMin[1]) ?? 0 : 0;
      return nexagoEventDateTime(
        year: parts[0]!,
        month: parts[1]!,
        day: parts[2]!,
        hour: hour,
        minute: minute,
      );
    }
    return nexagoEventNow();
  }
}

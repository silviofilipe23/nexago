import '../../../../core/time/nexago_event_timezone.dart';
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
    String? courtName,
  }) {
    for (final m in allMatches) {
      if (m.id == excludeMatchId) continue;
      if (!matchOnCourt(
        m,
        courtId: courtId,
        courtName: courtName,
      )) {
        continue;
      }
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

  /// Partida vinculada à quadra por `courtId` ou `courtName` legado.
  static bool matchOnCourt(
    TournamentMatch match, {
    required String courtId,
    String? courtName,
  }) {
    final id = courtId.trim();
    if (id.isEmpty) return false;

    if (match.courtId.trim() == id) return true;

    final configuredName = (courtName ?? '').trim();
    final matchName = match.courtName?.trim() ?? '';
    if (configuredName.isNotEmpty && matchName == configuredName) return true;

    final label = match.effectiveCourtLabel.trim();
    if (label.isEmpty) return false;
    if (label == id) return true;
    if (configuredName.isNotEmpty && label == configuredName) return true;

    return false;
  }

  /// Partidas elegíveis para o auto-agendamento (H3). Quando
  /// [respectBracketDeps] é true, pula partidas cujo lado ainda é um
  /// placeholder de chave (ex.: "Vencedor Jogo #7") — só agenda quando as
  /// duas duplas já foram decididas pela partida anterior (winner/loser
  /// advance já aplicado). Partidas de grupo nunca são afetadas: já nascem
  /// com as duas duplas reais.
  static List<TournamentMatch> filterAutoSchedulable(
    List<TournamentMatch> matches, {
    required bool respectBracketDeps,
  }) {
    if (!respectBracketDeps) return matches;
    return matches
        .where((m) => m.teamAId.trim().isNotEmpty && m.teamBId.trim().isNotEmpty)
        .toList();
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

    // Sequência de jogos: matchNumber já é a numeração GLOBAL cronológica
    // (grupos intercalados 1..N, depois o mata-mata em ordem de dependência).
    // NÃO ordenar por `round` primeiro: em dupla eliminação, WB, LB, 3º lugar
    // e final têm cada um sua própria contagem de round reiniciando em 1, então
    // "round" não é uma sequência global — ordenar por ele antes do matchNumber
    // jogava a final e o 3º lugar (round 1 na sua chave) antes da WB/LB R2.
    final pending = [...unscheduled]
      ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));

    for (final match in pending) {
      TournamentCourt? chosenCourt;
      DateTime? chosenStart;

      for (final court in courts) {
        var start = courtBusyUntil[court.id] ?? dayStart;
        if (start.isBefore(dayStart)) start = dayStart;

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

      courtBusyUntil[chosenCourt.id] = end;
      for (final tid in [match.teamAId, match.teamBId]) {
        if (tid.isEmpty) continue;
        teamBusyUntil[tid] = end.add(Duration(minutes: minRestMin));
      }
    }

    return slots;
  }

  static String dayKeyFromDate(DateTime date) => nexagoEventDayKey(date);

  /// Dias do torneio no calendário SP (`startAt` → `endAt` inclusive).
  static List<String> tournamentDayKeys({
    DateTime? startAt,
    DateTime? endAt,
  }) {
    final start = startAt;
    if (start == null) return const [];

    final startLocal = toNexagoEventLocal(start);
    final endLocal = toNexagoEventLocal(endAt ?? start);
    var cursor = DateTime(startLocal.year, startLocal.month, startLocal.day);
    final last = DateTime(endLocal.year, endLocal.month, endLocal.day);
    if (last.isBefore(cursor)) return [nexagoEventDayKey(start)];

    final keys = <String>[];
    while (!cursor.isAfter(last)) {
      keys.add(
        nexagoEventDayKey(
          nexagoEventDateTime(
            year: cursor.year,
            month: cursor.month,
            day: cursor.day,
          ),
        ),
      );
      cursor = cursor.add(const Duration(days: 1));
    }
    return keys;
  }

  /// Dias disponíveis quando o torneio não tem `startAt` no documento.
  static List<String> tournamentDayKeysFromMatches(
    List<TournamentMatch> matches,
  ) {
    final keys = <String>{nexagoEventDayKey(nexagoEventNow())};
    for (final match in matches) {
      final dk = match.dayKey.trim();
      if (dk.isNotEmpty) {
        keys.add(dk);
        continue;
      }
      final scheduleTime = match.scheduleTime;
      if (scheduleTime != null) {
        keys.add(nexagoEventDayKey(scheduleTime));
      }
    }
    final sorted = keys.toList()..sort();
    return sorted;
  }

  /// Dia inicial da grade H1.
  static String resolveScheduleGridDayKey({
    required List<String> tournamentDays,
    String? activeDayKey,
    String? preferredDayKey,
    String? todayDayKey,
  }) {
    final today = todayDayKey ?? nexagoEventDayKey(nexagoEventNow());
    final pool = tournamentDays.isNotEmpty ? tournamentDays : [today];

    final preferred = preferredDayKey?.trim() ?? '';
    if (preferred.isNotEmpty && pool.contains(preferred)) return preferred;

    final active = activeDayKey?.trim() ?? '';
    if (active.isNotEmpty && pool.contains(active)) return active;

    if (pool.contains(today)) return today;

    return pool.first;
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

import '../../../../core/time/nexago_event_timezone.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'match_ops_models.dart';
import 'schedule_grid_logic.dart';
import 'schedule_logic.dart';

/// Abas da tela H1.2 — selecionar partida a agendar.
enum SchedulePickTab {
  unscheduled,
  ready,
  blocked;

  String get label => switch (this) {
        SchedulePickTab.unscheduled => 'Todas',
        SchedulePickTab.ready => 'Prontas',
        SchedulePickTab.blocked => 'Bloqueadas',
      };
}

/// Sugestão local de quadra e horário.
class SchedulePickSuggestion {
  const SchedulePickSuggestion({
    required this.courtId,
    required this.start,
    required this.end,
  });

  final String courtId;
  final DateTime start;
  final DateTime end;

  /// Quando a quadra ainda não foi escolhida (pré-reserva/parcial),
  /// mostra apenas o horário.
  String get label {
    final time = ScheduleGridLogic.timeLabel(start);
    final court = courtId.trim();
    if (court.isEmpty) return time;
    return '$court • $time';
  }
}

abstract final class SchedulePickLogic {
  SchedulePickLogic._();

  static const String blockedReason = 'Aguardando definição das duplas';
  static const String tentativeReason = 'Pré-reserva';
  static const String partialReason = 'Falta quadra';

  static bool isUnscheduled(TournamentMatch match) {
    if (TournamentMatchStatus.isCompleted(match.status)) return false;
    return match.scheduleTime == null ||
        (match.courtId.isEmpty && match.effectiveCourtLabel.isEmpty);
  }

  /// Partida já tem horário definido, mas ainda falta a quadra.
  /// O horário não deve ser descartado ao sugerir o slot (item 2).
  static bool isPartiallyScheduled(TournamentMatch match) {
    if (TournamentMatchStatus.isCompleted(match.status)) return false;
    return match.scheduleTime != null &&
        match.courtId.isEmpty &&
        match.effectiveCourtLabel.isEmpty;
  }

  /// Um lado está "resolvido" para fins de agendamento se tem dupla real
  /// ou — em chaves — um placeholder de vencedor (pré-reserva, item 3).
  static bool _sideResolvable(TournamentMatch match, {required bool sideA}) {
    final id = (sideA ? match.teamAId : match.teamBId).trim();
    if (id.isNotEmpty) return true;
    if (!match.isBracketMatch) return false;
    final desc =
        (sideA ? match.teamADescription : match.teamBDescription)?.trim() ?? '';
    return desc.isNotEmpty;
  }

  static bool _sideConfirmed(TournamentMatch match, {required bool sideA}) =>
      (sideA ? match.teamAId : match.teamBId).trim().isNotEmpty;

  /// As duas duplas já estão confirmadas (sem TBD).
  static bool isConfirmed(TournamentMatch match) =>
      _sideConfirmed(match, sideA: true) && _sideConfirmed(match, sideA: false);

  /// Partida agendável: ambos os lados resolvíveis (dupla real ou placeholder
  /// de chave). Inclui pré-reservas de fase eliminatória.
  static bool isReady(TournamentMatch match) {
    if (!isUnscheduled(match)) return false;
    return _sideResolvable(match, sideA: true) &&
        _sideResolvable(match, sideA: false);
  }

  /// Agendável, porém com ao menos um lado ainda TBD (pré-reserva).
  static bool isTentative(TournamentMatch match) =>
      isReady(match) && !isConfirmed(match);

  /// Bloqueada de fato: não dá para agendar (sem dupla nem placeholder).
  static bool isBlocked(TournamentMatch match) {
    return isUnscheduled(match) && !isReady(match);
  }

  static List<TournamentMatch> filterByCategory(
    List<TournamentMatch> matches, {
    String categoryId = '',
  }) {
    final id = categoryId.trim();
    if (id.isEmpty) return matches;
    return matches.where((m) => m.categoryId.trim() == id).toList();
  }

  static List<TournamentMatch> matchesForTab(
    List<TournamentMatch> matches,
    SchedulePickTab tab,
  ) {
    return switch (tab) {
      SchedulePickTab.unscheduled =>
        matches.where(isUnscheduled).toList(),
      SchedulePickTab.ready => matches.where(isReady).toList(),
      SchedulePickTab.blocked => matches.where(isBlocked).toList(),
    };
  }

  static SchedulePickTabCounts tabCounts(List<TournamentMatch> matches) {
    return SchedulePickTabCounts(
      unscheduled: matches.where(isUnscheduled).length,
      ready: matches.where(isReady).length,
      blocked: matches.where(isBlocked).length,
    );
  }

  static List<TournamentMatch> sortedForDisplay(List<TournamentMatch> matches) {
    final copy = [...matches];
    copy.sort((a, b) {
      final round = a.round.compareTo(b.round);
      if (round != 0) return round;
      return a.matchNumber.compareTo(b.matchNumber);
    });
    return copy;
  }

  /// Sugestões de quadra/horário para todas as partidas agendáveis do dia,
  /// calculadas em uma única passada (item 4 — evita recomputar a grade por
  /// card). Partidas que já têm horário definido mantêm esse horário (item 2).
  static Map<String, SchedulePickSuggestion> suggestSlotsForDay({
    required List<TournamentMatch> dayMatches,
    required List<TournamentCourt> courts,
    required TournamentMatchOpsConfig config,
    required String dayKey,
  }) {
    final result = <String, SchedulePickSuggestion>{};
    if (courts.isEmpty) return result;

    final duration = Duration(minutes: config.defaultMatchDurationMin);

    // Item 2: partidas com horário já definido (falta só a quadra) preservam
    // o horário escolhido — não são realocadas pela auto-programação.
    final needSlot = <TournamentMatch>[];
    for (final match in dayMatches) {
      if (!isReady(match)) continue;
      final start = match.scheduleTime;
      if (start == null) {
        needSlot.add(match);
        continue;
      }
      final end = match.scheduleEndTime ?? start.add(duration);
      final court = match.courtId.trim().isNotEmpty
          ? match.courtId.trim()
          : match.effectiveCourtLabel.trim();
      result[match.id] = SchedulePickSuggestion(
        courtId: court,
        start: start,
        end: end,
      );
    }

    if (needSlot.isEmpty) return result;

    final slots = ScheduleLogic.buildDaySchedule(
      unscheduled: needSlot,
      courts: courts,
      dayStart: _dayAnchor(dayKey, config),
      matchDurationMin: config.defaultMatchDurationMin,
      minRestMin: config.minRestBetweenMatchesMin,
      existingScheduled: ScheduleGridLogic.scheduledMatches(dayMatches),
      avoidAthleteConflict: config.avoidAthleteConflict,
    );
    for (final slot in slots) {
      result[slot.matchId] = SchedulePickSuggestion(
        courtId: slot.courtId,
        start: slot.start,
        end: slot.end,
      );
    }
    return result;
  }

  static SchedulePickSuggestion? suggestSlotForMatch({
    required TournamentMatch match,
    required List<TournamentMatch> dayMatches,
    required List<TournamentCourt> courts,
    required TournamentMatchOpsConfig config,
    required String dayKey,
  }) {
    if (!isReady(match)) return null;
    return suggestSlotsForDay(
      dayMatches: dayMatches,
      courts: courts,
      config: config,
      dayKey: dayKey,
    )[match.id];
  }

  static String scheduleCtaLabel({
    required TournamentMatch match,
    String teamLabel = '',
  }) {
    final label = teamLabel.trim();
    if (label.isNotEmpty) {
      final short = ScheduleGridLogic.teamLine(description: label);
      return 'Agendar • $short';
    }
    return 'Agendar partida';
  }

  static DateTime _dayAnchor(String dayKey, TournamentMatchOpsConfig config) {
    final parsed = nexagoEventDayKeyAnchor(dayKey);
    if (parsed == null) return nexagoEventNow();
    final local = toNexagoEventLocal(parsed);
    final parts = config.dayStart.split(':');
    final hour = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 7 : 7;
    final minute = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
    return nexagoEventDateTime(
      year: local.year,
      month: local.month,
      day: local.day,
      hour: hour,
      minute: minute,
    );
  }
}

class SchedulePickTabCounts {
  const SchedulePickTabCounts({
    required this.unscheduled,
    required this.ready,
    required this.blocked,
  });

  final int unscheduled;
  final int ready;
  final int blocked;

  int forTab(SchedulePickTab tab) => switch (tab) {
        SchedulePickTab.unscheduled => unscheduled,
        SchedulePickTab.ready => ready,
        SchedulePickTab.blocked => blocked,
      };
}

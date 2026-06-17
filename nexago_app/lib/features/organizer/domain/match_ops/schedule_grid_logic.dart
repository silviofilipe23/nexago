import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'match_ops_logic.dart';

/// Fase visual de um bloco na grade H1.
enum ScheduleGridMatchPhase { live, finished, upcoming }

abstract final class ScheduleGridLogic {
  ScheduleGridLogic._();

  static const int slotMinutes = 30;
  static const double slotHeight = 52;
  static const double courtColumnWidth = 112;
  static const double timeColumnWidth = 44;

  static List<DateTime> buildTimeSlots({
    required DateTime day,
    required String dayStart,
    required String dayEnd,
  }) {
    final start = _mergeTime(day, dayStart, fallbackHour: 8);
    final end = _mergeTime(day, dayEnd, fallbackHour: 18);
    if (!end.isAfter(start)) return [start];

    final slots = <DateTime>[];
    var cursor = start;
    while (cursor.isBefore(end)) {
      slots.add(cursor);
      cursor = cursor.add(const Duration(minutes: slotMinutes));
    }
    return slots;
  }

  static DateTime gridDayAnchor({
    required String dayKey,
    required List<DateTime> slots,
  }) {
    if (slots.isNotEmpty) return slots.first;
    final parsed = _parseDayKey(dayKey);
    return parsed ?? DateTime.now();
  }

  static double gridTotalHeight(List<DateTime> slots) =>
      slots.length * slotHeight;

  static double matchTopOffset({
    required TournamentMatch match,
    required DateTime gridStart,
  }) {
    final start = match.scheduleTime;
    if (start == null) return 0;
    final minutes = start.difference(gridStart).inMinutes;
    return (minutes / slotMinutes) * slotHeight;
  }

  static double matchBlockHeight({
    required TournamentMatch match,
    required int defaultDurationMin,
  }) {
    final start = match.scheduleTime;
    if (start == null) return slotHeight;
    final end = match.scheduleEndTime ??
        start.add(Duration(minutes: defaultDurationMin));
    final minutes = end.difference(start).inMinutes.clamp(slotMinutes, 240);
    return (minutes / slotMinutes) * slotHeight;
  }

  static ScheduleGridMatchPhase matchPhase(TournamentMatch match) {
    if (TournamentMatchStatus.isInProgress(match.status)) {
      return ScheduleGridMatchPhase.live;
    }
    if (TournamentMatchStatus.isCompleted(match.status)) {
      return ScheduleGridMatchPhase.finished;
    }
    return ScheduleGridMatchPhase.upcoming;
  }

  static bool showAlertIcon(TournamentMatch match) {
    if (matchPhase(match) != ScheduleGridMatchPhase.upcoming) return false;
    final start = match.scheduleTime;
    if (start == null) return false;
    return DateTime.now().isAfter(start.add(const Duration(minutes: 5)));
  }

  static String programDayLabel(String dayKey) {
    final parsed = _parseDayKey(dayKey);
    if (parsed == null) return 'HOJE';
    return 'DIA ${parsed.day}';
  }

  static String timeLabel(DateTime time) {
    final h = time.hour.toString().padLeft(2, '0');
    final m = time.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  static String matchTimeRange(
    TournamentMatch match, {
    required int defaultDurationMin,
  }) {
    final start = match.scheduleTime;
    if (start == null) return '';
    final end = match.scheduleEndTime ??
        start.add(Duration(minutes: defaultDurationMin));
    return '${timeLabel(start)}-${timeLabel(end)}';
  }

  static String matchMetaLabel({
    required TournamentMatch match,
    required String categoryLabel,
  }) {
    final category = _categoryShortLabel(categoryLabel);
    final round = roundShortLabel(match);
    if (category.isEmpty && round.isEmpty) return 'Partida';
    if (category.isEmpty) return round;
    if (round.isEmpty) return category;
    return '$category • $round';
  }

  static String roundShortLabel(TournamentMatch match) {
    final label = matchRoundLabel(match);
    final lower = label.toLowerCase();
    if (lower.contains('oitav')) return 'Oit';
    if (lower.contains('quart')) return 'QF';
    if (lower.contains('semi')) return 'SF';
    if (lower.contains('3') && lower.contains('lugar')) return '3º';
    if (lower == 'final' || lower.contains('grand final')) return 'F';
    if (label.length <= 4) return label.toUpperCase();
    return label.length > 6 ? '${label.substring(0, 5)}.' : label;
  }

  static String teamLine({
    String? description,
    String teamId = '',
  }) {
    final raw = description?.trim();
    final label = (raw != null && raw.isNotEmpty) ? raw : teamId.trim();
    if (label.isEmpty) return 'A definir';

    final parts = label
        .split('/')
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.length >= 2) {
      return '${_firstToken(parts[0])} / ${_initialToken(parts[1])}';
    }
    return _firstToken(parts.first);
  }

  static Map<String, List<TournamentMatch>> matchesByCourtId(
    List<TournamentMatch> matches,
  ) {
    final map = <String, List<TournamentMatch>>{};
    for (final match in matches) {
      if (match.scheduleTime == null) continue;
      final courtId = match.courtId.trim().isNotEmpty
          ? match.courtId.trim()
          : match.effectiveCourtLabel.trim();
      if (courtId.isEmpty) continue;
      map.putIfAbsent(courtId, () => []).add(match);
    }
    for (final list in map.values) {
      list.sort((a, b) {
        final ta = a.scheduleTime;
        final tb = b.scheduleTime;
        if (ta == null || tb == null) return 0;
        return ta.compareTo(tb);
      });
    }
    return map;
  }

  static List<TournamentMatch> scheduledMatches(List<TournamentMatch> matches) {
    return matches
        .where(
          (m) =>
              m.scheduleTime != null &&
              (m.courtId.isNotEmpty || m.effectiveCourtLabel.isNotEmpty),
        )
        .toList();
  }

  static int unscheduledCount(List<TournamentMatch> matches) =>
      matches
          .where(
            (m) =>
                !TournamentMatchStatus.isCompleted(m.status) &&
                (m.scheduleTime == null ||
                    (m.courtId.isEmpty && m.effectiveCourtLabel.isEmpty)),
          )
          .length;

  static TournamentMatch? nextUnscheduledMatch(List<TournamentMatch> matches) {
    for (final match in matches) {
      if (match.scheduleTime == null ||
          (match.courtId.isEmpty && match.effectiveCourtLabel.isEmpty)) {
        return match;
      }
    }
    return null;
  }

  static double? nowLineOffset({
    required DateTime gridStart,
    required DateTime gridEnd,
    DateTime? now,
  }) {
    final current = now ?? DateTime.now();
    if (current.isBefore(gridStart) || !current.isBefore(gridEnd)) return null;
    final minutes = current.difference(gridStart).inMinutes;
    return (minutes / slotMinutes) * slotHeight;
  }

  static DateTime slotDateTime({
    required DateTime gridStart,
    required DateTime slot,
  }) {
    return DateTime(
      gridStart.year,
      gridStart.month,
      gridStart.day,
      slot.hour,
      slot.minute,
    );
  }

  static String _categoryShortLabel(String categoryLabel) {
    final trimmed = categoryLabel.trim();
    if (trimmed.isEmpty) return '';
    final gender = MatchOpsLogic.categoryGenderShortLabel(trimmed);
    if (gender.isNotEmpty) {
      final lower = trimmed.toLowerCase();
      if (lower.startsWith(gender.toLowerCase())) {
        return _capitalize(gender);
      }
      if (lower.contains('masc')) return 'Masc';
      if (lower.contains('fem')) return 'Fem';
      if (lower.contains('misto')) return 'Misto';
      return _capitalize(gender);
    }
    final first = trimmed.split(RegExp(r'[·\s]+')).first;
    return _capitalize(first);
  }

  static String _capitalize(String value) {
    final v = value.trim();
    if (v.isEmpty) return '';
    if (v.length == 1) return v.toUpperCase();
    return '${v[0].toUpperCase()}${v.substring(1).toLowerCase()}';
  }

  static String _firstToken(String name) {
    final token = name.trim().split(RegExp(r'\s+')).first;
    return token.isEmpty ? '?' : token;
  }

  static String _initialToken(String name) {
    final token = _firstToken(name);
    if (token == '?') return token;
    return '${token[0].toUpperCase()}.';
  }

  static DateTime _mergeTime(
    DateTime day,
    String hhmm, {
    required int fallbackHour,
  }) {
    final parts = hhmm.split(':');
    final hour = parts.isNotEmpty ? int.tryParse(parts[0]) ?? fallbackHour : fallbackHour;
    final minute = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
    return DateTime(day.year, day.month, day.day, hour, minute);
  }

  static DateTime? _parseDayKey(String dayKey) {
    final key = dayKey.trim();
    if (key.isEmpty) return null;
    final parts = key.split('-');
    if (parts.length != 3) return null;
    final y = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    final d = int.tryParse(parts[2]);
    if (y == null || m == null || d == null) return null;
    return DateTime(y, m, d);
  }
}

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'match_ops_logic.dart';

/// Fase visual de um bloco na grade H1.
enum ScheduleGridMatchPhase { live, finished, upcoming }

abstract final class ScheduleGridLogic {
  ScheduleGridLogic._();

  static const int slotMinutes = 30;

  /// Altura visual de cada slot de 30 min na grade H1.
  /// 50 min de partida → ~133px de bloco (50/30 × 80).
  static const double slotHeight = 80;

  /// Largura de cada coluna de quadra na grade H1 (cards com #, fase e nomes).
  static const double courtColumnWidth = 152;
  static const double timeColumnWidth = 44;

  /// Paleta para diferenciar categorias na grade (ordem estável por `categoryId`).
  static const List<Color> categoryAccentPalette = [
    AppColors.brand,
    Color(0xFF3B82F6),
    Color(0xFFA855F7),
    Color(0xFF14B8A6),
    Color(0xFFEC4899),
    Color(0xFFF59E0B),
    Color(0xFF22C55E),
    Color(0xFF6366F1),
    Color(0xFF06B6D4),
    Color(0xFFF43F5E),
  ];

  /// Mapeia cada categoria a uma cor distinta (ids ordenados para estabilidade).
  static Map<String, Color> categoryAccentColors(Iterable<String> categoryIds) {
    final ids =
        categoryIds
            .map((id) => id.trim())
            .where((id) => id.isNotEmpty)
            .toSet()
            .toList()
          ..sort();
    return {
      for (var i = 0; i < ids.length; i++)
        ids[i]: categoryAccentPalette[i % categoryAccentPalette.length],
    };
  }

  /// Cor da barra lateral do card: categoria + leve atenuação se encerrada.
  static Color matchCardAccentColor({
    required String categoryId,
    required Map<String, Color> categoryColors,
    required ScheduleGridMatchPhase phase,
  }) {
    final base = categoryColors[categoryId.trim()] ?? AppColors.brand;
    return switch (phase) {
      ScheduleGridMatchPhase.finished => base.withValues(alpha: 0.45),
      ScheduleGridMatchPhase.live => base,
      ScheduleGridMatchPhase.upcoming => base,
    };
  }

  /// Janela padrão da grade H1 (parede SP).
  static const String gridDayStart = '07:00';
  static const String gridDayEnd = '24:00';

  /// Slots da grade: 07:00–23:30 SP, expandindo se partidas saírem da janela.
  static List<DateTime> gridTimeSlotsForDay({
    required String dayKey,
    List<TournamentMatch> dayMatches = const [],
    int defaultDurationMin = 30,
  }) {
    final anchor = _parseDayKey(dayKey) ?? nexagoEventDayKeyAnchor(dayKey);
    if (anchor == null) return const [];

    var startLabel = gridDayStart;
    var endLabel = gridDayEnd;
    DateTime? latestInstant;

    final baseStart = _mergeTime(anchor, gridDayStart, fallbackHour: 7);
    final baseEnd = _mergeTime(anchor, gridDayEnd, fallbackHour: 24);

    for (final match in dayMatches) {
      final scheduleStart = match.scheduleTime;
      if (scheduleStart == null) continue;
      final scheduleEnd =
          match.scheduleEndTime ??
          scheduleStart.add(Duration(minutes: defaultDurationMin));

      if (nexagoEventUtcInstant(scheduleStart).isBefore(baseStart)) {
        startLabel = timeLabel(_floorToSlot(scheduleStart));
      }

      final endUtc = nexagoEventUtcInstant(scheduleEnd);
      if (endUtc.isAfter(baseEnd)) {
        latestInstant = latestInstant == null || endUtc.isAfter(latestInstant)
            ? endUtc
            : latestInstant;
      }
    }

    var slots = buildTimeSlots(
      day: anchor,
      dayStart: startLabel,
      dayEnd: endLabel,
    );

    if (latestInstant != null && slots.isNotEmpty) {
      var cursor = slots.last.add(const Duration(minutes: slotMinutes));
      final target = _ceilToSlotEnd(latestInstant);
      while (cursor.isBefore(target)) {
        slots.add(cursor);
        cursor = cursor.add(const Duration(minutes: slotMinutes));
      }
    }

    return slots;
  }

  static List<DateTime> buildTimeSlots({
    required DateTime day,
    required String dayStart,
    required String dayEnd,
  }) {
    final start = _mergeTime(day, dayStart, fallbackHour: 7);
    final end = _mergeTime(day, dayEnd, fallbackHour: 24);
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
    return parsed ?? nexagoEventNow();
  }

  static double gridTotalHeight(List<DateTime> slots) =>
      slots.length * slotHeight;

  static double matchTopOffset({
    required TournamentMatch match,
    required DateTime gridStart,
  }) {
    final start = match.scheduleTime;
    if (start == null) return 0;
    final slotStart = _floorToSlot(start);
    final minutes = nexagoEventUtcInstant(
      slotStart,
    ).difference(nexagoEventUtcInstant(gridStart)).inMinutes;
    return (minutes / slotMinutes) * slotHeight;
  }

  /// Bloco visual na grade: sempre 1 slot (30 min), independente da duração real.
  static double matchBlockHeight({
    required TournamentMatch match,
    required int defaultDurationMin,
  }) {
    return slotHeight;
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
    return nexagoEventNow().isAfter(start.add(const Duration(minutes: 5)));
  }

  static String programDayLabel(String dayKey) {
    final parsed = _parseDayKey(dayKey);
    if (parsed == null) return 'HOJE';
    return 'DIA ${toNexagoEventLocal(parsed).day}';
  }

  /// Rótulo legível do dia para o header (ex. `Sáb, 26 jun`).
  static String programDayDateLabel(String dayKey) {
    final parsed = _parseDayKey(dayKey);
    if (parsed == null) return 'Hoje';
    final local = toNexagoEventLocal(parsed);
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const months = [
      'jan',
      'fev',
      'mar',
      'abr',
      'mai',
      'jun',
      'jul',
      'ago',
      'set',
      'out',
      'nov',
      'dez',
    ];
    final weekday = weekdays[local.weekday % 7];
    final month = months[local.month - 1];
    return '$weekday, ${local.day} $month';
  }

  /// Chip compacto (ex. `Sáb 26/06`).
  static String programDayChipLabel(String dayKey) {
    final parsed = _parseDayKey(dayKey);
    if (parsed == null) return 'Hoje';
    final local = toNexagoEventLocal(parsed);
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    final weekday = weekdays[local.weekday % 7];
    final d = local.day.toString().padLeft(2, '0');
    final m = local.month.toString().padLeft(2, '0');
    return '$weekday $d/$m';
  }

  static String timeLabel(DateTime time) {
    final local = toNexagoEventLocal(time);
    final h = local.hour.toString().padLeft(2, '0');
    final m = local.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  static String matchTimeRange(
    TournamentMatch match, {
    required int defaultDurationMin,
  }) {
    final start = match.scheduleTime;
    if (start == null) return '';
    final slotStart = _floorToSlot(start);
    final slotEnd = slotStart.add(const Duration(minutes: slotMinutes));
    return '${timeLabel(slotStart)}-${timeLabel(slotEnd)}';
  }

  /// Meta do card (`CATEGORIA · fase`). Com [phaseLabel] usa a fase completa
  /// (ex. `Quartas de final`); sem ela, cai no rótulo curto (`QF`).
  static String matchMetaLabel({
    required TournamentMatch match,
    required String categoryCompactLabel,
    String phaseLabel = '',
  }) {
    final category = categoryCompactLabel.trim();
    final round =
        phaseLabel.trim().isNotEmpty ? phaseLabel.trim() : roundShortLabel(match);
    if (category.isEmpty && round.isEmpty) return 'Partida';
    if (category.isEmpty) return round;
    if (round.isEmpty) return category;
    return '$category · $round';
  }

  /// Cabeçalho do card na grade: `#3 · MASC · INICIANTE` + fase legível.
  static ({String eyebrow, String phaseLabel}) matchCardHeader({
    required TournamentMatch match,
    required String categoryCompactLabel,
    List<TournamentMatch> categoryMatches = const [],
  }) {
    final category = categoryCompactLabel.trim();
    final number = matchNumberLabelForCard(match);
    final eyebrowParts = <String>[];
    if (number.isNotEmpty) eyebrowParts.add(number);
    if (category.isNotEmpty) eyebrowParts.add(category);
    final eyebrow = eyebrowParts.isEmpty ? 'Partida' : eyebrowParts.join(' · ');
    final phaseLabel = matchPhaseDisplayLabel(
      match,
      categoryMatches: categoryMatches,
    );
    return (eyebrow: eyebrow, phaseLabel: phaseLabel);
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

  static String teamLine({String? description, String teamId = ''}) {
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
    // Sem dupla ("A / B"): é placeholder de chave ("Vencedor Jogo #25",
    // "1º Grupo A") ou nome único de equipe. Manter o rótulo inteiro —
    // truncar no primeiro token deixava só "Vencedor"/"1º", impossível
    // saber quem é quem. Compactamos "Vencedor/Perdedor" para caber.
    return _compactBracketPlaceholder(parts.first);
  }

  static String _compactBracketPlaceholder(String label) {
    return label
        .replaceFirst(
          RegExp(r'^vencedor\b', caseSensitive: false),
          'Venc.',
        )
        .replaceFirst(
          RegExp(r'^perdedor\b', caseSensitive: false),
          'Perd.',
        );
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

  static int unscheduledCount(List<TournamentMatch> matches) => matches
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
    final current = nexagoEventUtcInstant(now ?? nexagoEventNow());
    final gridStartUtc = nexagoEventUtcInstant(gridStart);
    final gridEndUtc = nexagoEventUtcInstant(gridEnd);
    if (current.isBefore(gridStartUtc) || !current.isBefore(gridEndUtc)) {
      return null;
    }
    final minutes = current.difference(gridStartUtc).inMinutes;
    return (minutes / slotMinutes) * slotHeight;
  }

  static DateTime slotDateTime({
    required DateTime gridStart,
    required DateTime slot,
  }) {
    return nexagoEventUtcInstant(slot);
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
    final local = toNexagoEventLocal(day);
    final parts = hhmm.split(':');
    final hour = parts.isNotEmpty
        ? int.tryParse(parts[0]) ?? fallbackHour
        : fallbackHour;
    final minute = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
    return nexagoEventDateTime(
      year: local.year,
      month: local.month,
      day: local.day,
      hour: hour,
      minute: minute,
    );
  }

  static DateTime _floorToSlot(DateTime instant) {
    final local = toNexagoEventLocal(instant);
    final minute = local.minute - (local.minute % slotMinutes);
    return nexagoEventDateTime(
      year: local.year,
      month: local.month,
      day: local.day,
      hour: local.hour,
      minute: minute,
    );
  }

  static DateTime _ceilToSlotEnd(DateTime instant) {
    final local = toNexagoEventLocal(instant);
    final remainder = local.minute % slotMinutes;
    if (remainder == 0 && local.second == 0 && local.millisecond == 0) {
      return nexagoEventDateTime(
        year: local.year,
        month: local.month,
        day: local.day,
        hour: local.hour,
        minute: local.minute,
      ).add(const Duration(minutes: slotMinutes));
    }
    final addMin = remainder == 0 ? slotMinutes : slotMinutes - remainder;
    final floored = nexagoEventDateTime(
      year: local.year,
      month: local.month,
      day: local.day,
      hour: local.hour,
      minute: local.minute - (local.minute % slotMinutes),
    );
    return floored.add(Duration(minutes: addMin + slotMinutes));
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
    return nexagoEventDayKeyAnchor(key);
  }
}

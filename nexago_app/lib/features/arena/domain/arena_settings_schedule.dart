import 'package:flutter/material.dart';

/// Configuração de um dia civil (1 = segunda … 7 = domingo).
@immutable
class ArenaDayScheduleConfig {
  const ArenaDayScheduleConfig({
    required this.closed,
    this.open,
    this.close,
  });

  final bool closed;

  /// Se não [closed], horários do dia (null = usar padrão da arena).
  final TimeOfDay? open;
  final TimeOfDay? close;

  ArenaDayScheduleConfig copyWith({
    bool? closed,
    TimeOfDay? open,
    TimeOfDay? close,
    bool clearOpen = false,
    bool clearClose = false,
  }) {
    return ArenaDayScheduleConfig(
      closed: closed ?? this.closed,
      open: clearOpen ? null : (open ?? this.open),
      close: clearClose ? null : (close ?? this.close),
    );
  }
}

/// Estado editável da tela de ajustes (disponibilidade + dias).
@immutable
class ArenaSettingsScheduleState {
  const ArenaSettingsScheduleState({
    required this.defaultOpen,
    required this.defaultClose,
    required this.slotDurationMinutes,
    required this.perWeekday,
  });

  final TimeOfDay defaultOpen;
  final TimeOfDay defaultClose;

  /// 30, 60 ou 120.
  final int slotDurationMinutes;

  /// Índice = [DateTime.weekday] (1…7).
  final Map<int, ArenaDayScheduleConfig> perWeekday;

  ArenaSettingsScheduleState copyWith({
    TimeOfDay? defaultOpen,
    TimeOfDay? defaultClose,
    int? slotDurationMinutes,
    Map<int, ArenaDayScheduleConfig>? perWeekday,
  }) {
    return ArenaSettingsScheduleState(
      defaultOpen: defaultOpen ?? this.defaultOpen,
      defaultClose: defaultClose ?? this.defaultClose,
      slotDurationMinutes: slotDurationMinutes ?? this.slotDurationMinutes,
      perWeekday: perWeekday ?? this.perWeekday,
    );
  }

  ArenaSettingsScheduleState updateWeekday(
    int weekday,
    ArenaDayScheduleConfig config,
  ) {
    final next = Map<int, ArenaDayScheduleConfig>.from(perWeekday);
    next[weekday] = config;
    return copyWith(perWeekday: next);
  }

  /// Garante minutos zerados em todos os horários (grade hora a hora).
  ArenaSettingsScheduleState withWholeHoursOnly() {
    return ArenaSettingsScheduleState(
      defaultOpen: arenaScheduleWholeHour(defaultOpen),
      defaultClose: arenaScheduleWholeHour(defaultClose),
      slotDurationMinutes: slotDurationMinutes,
      perWeekday: {
        for (final e in perWeekday.entries)
          e.key: ArenaDayScheduleConfig(
            closed: e.value.closed,
            open: e.value.open != null
                ? arenaScheduleWholeHour(e.value.open!)
                : null,
            close: e.value.close != null
                ? arenaScheduleWholeHour(e.value.close!)
                : null,
          ),
      },
    );
  }

  factory ArenaSettingsScheduleState.initial() {
    return ArenaSettingsScheduleState(
      defaultOpen: const TimeOfDay(hour: 8, minute: 0),
      defaultClose: const TimeOfDay(hour: 22, minute: 0),
      slotDurationMinutes: 60,
      perWeekday: {
        for (var w = DateTime.monday; w <= DateTime.sunday; w++)
          w: const ArenaDayScheduleConfig(closed: false),
      },
    );
  }

  /// Chaves alinhadas ao `availabilitySchedule` da quadra (`monday`…`sunday`).
  Map<String, dynamic> toAvailabilityScheduleMap() {
    const keys = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];
    final out = <String, dynamic>{};
    for (var i = 0; i < 7; i++) {
      final wd = i + 1;
      final cfg = perWeekday[wd] ?? const ArenaDayScheduleConfig(closed: false);
      final key = keys[i];
      if (cfg.closed) {
        out[key] = <dynamic>[];
        continue;
      }
      final o = cfg.open ?? defaultOpen;
      final c = cfg.close ?? defaultClose;
      out[key] = [
        <String, String>{
          'start': _fmt(o),
          'end': _fmt(c),
        },
      ];
    }
    return out;
  }

  /// Preenche a partir do mapa Firestore (quando existir).
  factory ArenaSettingsScheduleState.fromFirestore({
    required Map<String, dynamic>? availabilitySchedule,
    int? slotDurationMinutes,
    TimeOfDay? fallbackOpen,
    TimeOfDay? fallbackClose,
  }) {
    final defOpen = fallbackOpen ?? const TimeOfDay(hour: 8, minute: 0);
    final defClose = fallbackClose ?? const TimeOfDay(hour: 22, minute: 0);
    final rawDur = slotDurationMinutes ?? 60;
    final dur = (rawDur == 30 || rawDur == 60 || rawDur == 120) ? rawDur : 60;
    const keys = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];
    final per = <int, ArenaDayScheduleConfig>{};
    if (availabilitySchedule == null || availabilitySchedule.isEmpty) {
      for (var wd = DateTime.monday; wd <= DateTime.sunday; wd++) {
        per[wd] = const ArenaDayScheduleConfig(closed: false);
      }
      return ArenaSettingsScheduleState(
        defaultOpen: defOpen,
        defaultClose: defClose,
        slotDurationMinutes: dur,
        perWeekday: per,
      );
    }

    for (var i = 0; i < 7; i++) {
      final wd = i + 1;
      final key = keys[i];
      final raw = availabilitySchedule[key];
      if (raw == null) {
        per[wd] = const ArenaDayScheduleConfig(closed: false);
        continue;
      }
      if (_rawIsClosed(raw)) {
        per[wd] = const ArenaDayScheduleConfig(closed: true);
        continue;
      }
      final range = _firstRange(raw);
      if (range == null) {
        per[wd] = const ArenaDayScheduleConfig(closed: true);
      } else {
        per[wd] = ArenaDayScheduleConfig(
          closed: false,
          open: range.$1,
          close: range.$2,
        );
      }
    }

    var resolvedOpen = defOpen;
    var resolvedClose = defClose;
    for (var wd = DateTime.monday; wd <= DateTime.sunday; wd++) {
      final c = per[wd];
      if (c != null && !c.closed && c.open != null && c.close != null) {
        resolvedOpen = c.open!;
        resolvedClose = c.close!;
        break;
      }
    }

    return ArenaSettingsScheduleState(
      defaultOpen: resolvedOpen,
      defaultClose: resolvedClose,
      slotDurationMinutes: dur,
      perWeekday: per,
    );
  }

  static bool _rawIsClosed(dynamic raw) {
    if (raw is String && raw.trim().toLowerCase() == 'closed') return true;
    if (raw is bool && raw == false) return true;
    if (raw is Map && raw['closed'] == true) return true;
    if (raw is List && raw.isEmpty) return true;
    return false;
  }

  static (TimeOfDay, TimeOfDay)? _firstRange(dynamic raw) {
    if (raw is List && raw.isNotEmpty) {
      final first = raw.first;
      if (first is Map) {
        final start = first['start'] ?? first['from'] ?? first['open'];
        final end = first['end'] ?? first['to'] ?? first['close'];
        final a = _parseTime(start);
        final b = _parseTime(end);
        if (a != null && b != null) return (a, b);
      }
    }
    if (raw is Map && raw['closed'] != true) {
      final start = raw['start'] ?? raw['from'];
      final end = raw['end'] ?? raw['to'];
      final a = _parseTime(start);
      final b = _parseTime(end);
      if (a != null && b != null) return (a, b);
    }
    return null;
  }

  static TimeOfDay? _parseTime(dynamic v) {
    if (v is! String) return null;
    final p = v.trim().split(':');
    if (p.length < 2) return null;
    final h = int.tryParse(p[0]) ?? 0;
    return TimeOfDay(hour: h.clamp(0, 23), minute: 0);
  }

  static String _fmt(TimeOfDay t) {
    return '${t.hour.toString().padLeft(2, '0')}:'
        '${t.minute.toString().padLeft(2, '0')}';
  }
}

/// Início da hora civil (minutos sempre 0).
TimeOfDay arenaScheduleWholeHour(TimeOfDay t) =>
    TimeOfDay(hour: t.hour.clamp(0, 23), minute: 0);

/// Minutos desde meia-noite para abertura.
int arenaScheduleOpenMinutes(TimeOfDay t) => t.hour * 60 + t.minute;

/// Fechamento às `00:00` = fim do dia civil (**24:00**), permitindo slot 23:00–00:00.
int arenaScheduleCloseMinutes(TimeOfDay t) {
  if (t.hour == 0 && t.minute == 0) return 24 * 60;
  return t.hour * 60 + t.minute;
}

bool isValidArenaSettingsSchedule(ArenaSettingsScheduleState s) {
  if (arenaScheduleOpenMinutes(s.defaultOpen) >=
      arenaScheduleCloseMinutes(s.defaultClose)) {
    return false;
  }
  for (var w = DateTime.monday; w <= DateTime.sunday; w++) {
    final c = s.perWeekday[w]!;
    if (c.closed) continue;
    final o = arenaScheduleOpenMinutes(c.open ?? s.defaultOpen);
    final cl = arenaScheduleCloseMinutes(c.close ?? s.defaultClose);
    if (o >= cl) return false;
  }
  return true;
}

const List<String> kArenaSettingsWeekdayLabels = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
];

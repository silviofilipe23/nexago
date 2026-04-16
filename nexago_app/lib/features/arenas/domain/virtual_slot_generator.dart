import 'arena_slot.dart';
import 'slots_query.dart';

/// Gera slots “virtuais” quando não há documentos em [arenaSlots] ou para preencher lacunas.
///
/// Lê `slotDurationMinutes` e `availabilitySchedule` do documento da quadra quando existirem;
/// caso contrário usa **08:00–22:00** a cada **60 min** (ajustável).
abstract final class VirtualSlotGenerator {
  VirtualSlotGenerator._();

  static const _defaultDurationMin = 60;
  static const _defaultStartMin = 8 * 60;
  static const _defaultEndMin = 22 * 60;

  static const _weekdayKeys = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];

  /// Mescla: para cada janela virtual, se existir documento com mesmo horário, mantém o persistido.
  static List<ArenaSlot> merge(
    List<ArenaSlot> persisted,
    List<ArenaSlot> virtual,
  ) {
    final byTime = <String, ArenaSlot>{};
    for (final p in persisted) {
      byTime[_timeKey(p)] = p;
    }
    final out = <ArenaSlot>[];
    final usedKeys = <String>{};
    for (final v in virtual) {
      final k = _timeKey(v);
      if (byTime.containsKey(k)) {
        out.add(byTime[k]!);
        usedKeys.add(k);
      } else {
        final overlap = persisted.firstWhere(
          (p) => _overlaps(p, v) && (p.isBooked || p.isBlocked),
          orElse: () => v,
        );
        if (!identical(overlap, v)) {
          out.add(
            v.copyWith(
              rawStatus: overlap.rawStatus,
              bookingId: overlap.bookingId,
              bookingAthleteId: overlap.bookingAthleteId,
            ),
          );
          usedKeys.add(_timeKey(overlap));
        } else {
          out.add(v);
        }
      }
    }
    for (final p in persisted) {
      final k = _timeKey(p);
      if (!usedKeys.contains(k)) out.add(p);
    }
    out.sort((a, b) => a.startTime.compareTo(b.startTime));
    return out;
  }

  static String _timeKey(ArenaSlot s) => '${s.startTime}_${s.endTime}';

  static bool _overlaps(ArenaSlot a, ArenaSlot b) {
    final aStart = _parseHm(a.startTime);
    final aEnd = _parseHm(a.endTime);
    final bStart = _parseHm(b.startTime);
    final bEnd = _parseHm(b.endTime);
    if (aStart == null || aEnd == null || bStart == null || bEnd == null) {
      return false;
    }
    final normAEnd = aEnd <= aStart ? aEnd + (24 * 60) : aEnd;
    final normBEnd = bEnd <= bStart ? bEnd + (24 * 60) : bEnd;
    return aStart < normBEnd && bStart < normAEnd;
  }

  static List<ArenaSlot> build({
    required SlotsQuery query,
    required Map<String, dynamic>? courtData,
    required DateTime date,
  }) {
    final duration = _readDuration(courtData);
    final ranges = _readRanges(courtData, date.weekday);
    final day = DateTime(date.year, date.month, date.day);

    final slots = <ArenaSlot>[];
    for (final range in ranges) {
      var cursor = range.startMin;
      while (cursor + duration <= range.endMin) {
        final start = _fmt(cursor);
        final end = _fmt(cursor + duration);
        slots.add(
          ArenaSlot.virtual(
            arenaId: query.arenaId,
            courtId: query.courtId,
            date: day,
            startTime: start,
            endTime: end,
            priceReais: query.fallbackPriceReais,
          ),
        );
        cursor += duration;
      }
    }
    return slots;
  }

  static int _readDuration(Map<String, dynamic>? courtData) {
    final v = courtData?['slotDurationMinutes'];
    final n = v is num ? v.toInt() : _defaultDurationMin;
    if (n < 15 || n > 240) return _defaultDurationMin;
    return n;
  }

  /// Faixas em minutos desde meia-noite para o dia da semana (1=seg … 7=dom).
  static List<_MinRange> _readRanges(Map<String, dynamic>? courtData, int weekday) {
    final sched = courtData?['availabilitySchedule'];
    if (sched is Map) {
      final key = _weekdayKeys[weekday - 1];
      final dayEntry = sched[key] ?? sched['$weekday'] ?? sched[weekday];
      if (dayEntry != null) {
        if (_isExplicitlyClosed(dayEntry)) return [];
        if (dayEntry is List && dayEntry.isEmpty) return [];
        final parsed = _parseDayEntry(dayEntry);
        if (parsed.isNotEmpty) return parsed;
        return [];
      }
    }
    if (sched is List) {
      for (final item in sched) {
        if (item is Map) {
          final wd = item['weekday'];
          final match = wd == weekday ||
              wd == _weekdayKeys[weekday - 1] ||
              wd == '$weekday';
          if (match) {
            final parsed = _parseDayEntry(item['ranges'] ?? item['slots'] ?? item);
            if (parsed.isNotEmpty) return parsed;
          }
        }
      }
    }
    return [
      _MinRange(_defaultStartMin, _defaultEndMin),
    ];
  }

  static bool _isExplicitlyClosed(dynamic dayEntry) {
    if (dayEntry is String && dayEntry.trim().toLowerCase() == 'closed') {
      return true;
    }
    if (dayEntry is bool && dayEntry == false) return true;
    if (dayEntry is Map && dayEntry['closed'] == true) return true;
    return false;
  }

  static List<_MinRange> _parseDayEntry(dynamic dayEntry) {
    if (dayEntry == null) return [];
    if (dayEntry is List) {
      final out = <_MinRange>[];
      for (final e in dayEntry) {
        if (e is Map) {
          final start = e['start'] ?? e['from'] ?? e['open'];
          final end = e['end'] ?? e['to'] ?? e['close'];
          final a = _parseHm(start);
          final b = _parseHm(end);
          final range = _rangeFromStartEnd(a, b);
          if (range != null) out.add(range);
        }
      }
      return out;
    }
    if (dayEntry is Map) {
      final start = dayEntry['start'] ?? dayEntry['from'];
      final end = dayEntry['end'] ?? dayEntry['to'];
      final a = _parseHm(start);
      final b = _parseHm(end);
      final range = _rangeFromStartEnd(a, b);
      if (range != null) return [range];
    }
    return [];
  }

  /// `00:00` como fechamento = meia-noite **final** do dia (24:00), p.ex. 23:00–00:00.
  static _MinRange? _rangeFromStartEnd(int? startMin, int? endMin) {
    if (startMin == null || endMin == null) return null;
    var end = endMin;
    if (end == 0 && startMin > 0) {
      end = 24 * 60;
    }
    if (end > startMin) return _MinRange(startMin, end);
    return null;
  }

  static int? _parseHm(dynamic v) {
    if (v is String) {
      final p = v.trim().split(':');
      if (p.length >= 2) {
        final h = int.tryParse(p[0]) ?? 0;
        final m = int.tryParse(p[1]) ?? 0;
        return h * 60 + m.clamp(0, 59);
      }
    }
    if (v is int) return v;
    return null;
  }

  static String _fmt(int minutes) {
    final w = minutes % (24 * 60);
    final h = w ~/ 60;
    final m = w % 60;
    return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}';
  }
}

class _MinRange {
  const _MinRange(this.startMin, this.endMin);
  final int startMin;
  final int endMin;
}

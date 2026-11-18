import 'package:flutter/foundation.dart';

import '../../arenas/domain/arena_slot.dart';
import 'arena_date_utils.dart';
import 'arena_now.dart';

/// Quantos dias o mapa de horários vazios cobre (hoje + 6).
const int arenaIdleMapDays = 7;

/// Ocupação até aqui conta como "vazio" na sugestão de promoção.
const double arenaIdleOccupancyThreshold = 0.25;

/// Uma célula do mapa: um dia × uma hora cheia.
@immutable
class ArenaIdleMapCell {
  const ArenaIdleMapCell({
    required this.hour,
    required this.total,
    required this.booked,
    required this.isPast,
  });

  final int hour;

  /// Horários da grade (sem os bloqueados) que começam nesta hora.
  final int total;
  final int booked;

  /// Hora que já passou (hoje): fora da sugestão.
  final bool isPast;

  /// Ocupação 0–1; `null` quando a arena não abre nesta hora.
  double? get occupancy => total == 0 ? null : booked / total;
  int get free => total - booked;
}

@immutable
class ArenaIdleMapDay {
  const ArenaIdleMapDay({required this.date, required this.cells});

  final DateTime date;

  /// Uma célula por hora de [ArenaIdleMap.hours], na mesma ordem.
  final List<ArenaIdleMapCell> cells;
}

/// O maior bloco vazio da semana, sugerido para promoção.
@immutable
class ArenaIdleHole {
  const ArenaIdleHole({
    required this.date,
    required this.startHour,
    required this.endHour,
    required this.freeSlots,
    required this.idleReais,
  });

  final DateTime date;
  final int startHour;

  /// Hora final, exclusiva (14 → 17 = das 14h às 17h).
  final int endHour;
  final int freeSlots;

  /// Soma do preço dos horários livres do bloco.
  final double idleReais;
}

@immutable
class ArenaIdleMap {
  const ArenaIdleMap({
    required this.hours,
    required this.days,
    required this.hole,
  });

  /// Horas em que a arena abre em algum dia da semana, em ordem.
  final List<int> hours;
  final List<ArenaIdleMapDay> days;
  final ArenaIdleHole? hole;

  bool get isEmpty => hours.isEmpty;
}

/// Monta o mapa dos próximos [arenaIdleMapDays] dias a partir da grade
/// (horários já mesclados, com status). Função pura.
ArenaIdleMap buildArenaIdleMap({
  required List<ArenaSlot> slots,
  required DateTime now,
}) {
  final today = arenaDateOnly(now);
  final dates = [
    for (var i = 0; i < arenaIdleMapDays; i++)
      DateTime(today.year, today.month, today.day + i),
  ];
  final keys = {for (final d in dates) arenaDateKey(d)};

  // dia → hora → (total, reservados)
  final grid = <String, Map<int, List<int>>>{};
  final hours = <int>{};
  for (final s in slots) {
    if (s.isBlocked) continue;
    final key = arenaDateKey(s.date);
    if (!keys.contains(key)) continue;
    final minutes = arenaNowMinutes(s.startTime);
    if (minutes == null) continue;
    final hour = minutes ~/ 60;
    hours.add(hour);
    final cell = grid
        .putIfAbsent(key, () => {})
        .putIfAbsent(hour, () => [0, 0]);
    cell[0] += 1;
    if (s.isBooked) cell[1] += 1;
  }

  final sortedHours = hours.toList()..sort();
  final todayKey = arenaDateKey(today);
  final days = [
    for (final d in dates)
      ArenaIdleMapDay(
        date: d,
        cells: [
          for (final h in sortedHours)
            ArenaIdleMapCell(
              hour: h,
              total: grid[arenaDateKey(d)]?[h]?[0] ?? 0,
              booked: grid[arenaDateKey(d)]?[h]?[1] ?? 0,
              isPast: arenaDateKey(d) == todayKey && h <= now.hour,
            ),
        ],
      ),
  ];

  return ArenaIdleMap(
    hours: sortedHours,
    days: days,
    hole: _biggestHole(days, slots),
  );
}

ArenaIdleHole? _biggestHole(List<ArenaIdleMapDay> days, List<ArenaSlot> slots) {
  ArenaIdleHole? best;
  for (final day in days) {
    var runStart = -1;
    var runFree = 0;
    void close(int endIndex) {
      if (runStart < 0) return;
      final cells = day.cells.sublist(runStart, endIndex);
      // Bloco de 2h ou mais com pelo menos 2 horários livres.
      if (cells.length >= 2 && runFree >= 2) {
        final hole = ArenaIdleHole(
          date: day.date,
          startHour: cells.first.hour,
          endHour: cells.last.hour + 1,
          freeSlots: runFree,
          idleReais: _idleReais(
            slots,
            day.date,
            cells.first.hour,
            cells.last.hour + 1,
          ),
        );
        if (best == null || hole.freeSlots > best!.freeSlots) best = hole;
      }
      runStart = -1;
      runFree = 0;
    }

    for (var i = 0; i < day.cells.length; i++) {
      final c = day.cells[i];
      final occ = c.occupancy;
      final idle =
          !c.isPast && occ != null && occ <= arenaIdleOccupancyThreshold;
      final contiguous = runStart >= 0 && c.hour == day.cells[i - 1].hour + 1;
      if (idle && (runStart < 0 || contiguous)) {
        if (runStart < 0) runStart = i;
        runFree += c.free;
      } else {
        close(i);
        if (idle) {
          runStart = i;
          runFree = c.free;
        }
      }
    }
    close(day.cells.length);
  }
  return best;
}

double _idleReais(List<ArenaSlot> slots, DateTime date, int from, int to) {
  final key = arenaDateKey(date);
  var sum = 0.0;
  for (final s in slots) {
    if (!s.isAvailable || arenaDateKey(s.date) != key) continue;
    final minutes = arenaNowMinutes(s.startTime);
    if (minutes == null) continue;
    final h = minutes ~/ 60;
    if (h >= from && h < to) sum += s.priceReais ?? 0;
  }
  return sum;
}

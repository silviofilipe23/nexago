import 'arena_slot.dart';
import 'arena_slot_block_reason.dart';
import 'arena_search_providers.dart';

/// Período do dia para filtro e agrupamento na grade.
enum SlotPeriodFilter {
  all,
  morning,
  afternoon,
  evening,
}

/// Disponibilidade resumida de um dia (calendário).
class SlotDayAvailability {
  const SlotDayAvailability({
    required this.hasAnyFree,
    required this.allPastOrFull,
  });

  final bool hasAnyFree;
  final bool allPastOrFull;
}

class SlotPeriodGroup {
  const SlotPeriodGroup({
    required this.period,
    required this.slots,
  });

  final SlotPeriodFilter period;
  final List<ArenaSlot> slots;

  String get sectionLabel => switch (period) {
        SlotPeriodFilter.morning => 'MANHÃ',
        SlotPeriodFilter.afternoon => 'TARDE',
        SlotPeriodFilter.evening => 'NOITE',
        SlotPeriodFilter.all => '',
      };
}

class DurationOption {
  const DurationOption({
    required this.minutes,
    required this.label,
    required this.slotCount,
    required this.priceReais,
  });

  final int minutes;
  final String label;
  final int slotCount;
  final double? priceReais;
}

const _bookingCutoffAfterStart = Duration(minutes: 5);
const defaultSlotDurationMinutes = 60;

int slotStartMinutes(String startTime) => arenaSlotTimeToMinutes(startTime);

DateTime slotDayOnly(DateTime d) => DateTime(d.year, d.month, d.day);

bool sameCalendarDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

DateTime slotBookingCutoff(ArenaSlot slot) {
  final d = slotDayOnly(slot.date);
  final startMin = slotStartMinutes(slot.startTime);
  return DateTime(
    d.year,
    d.month,
    d.day,
    startMin ~/ 60,
    startMin % 60,
  ).add(_bookingCutoffAfterStart);
}

DateTime slotEndDateTime(ArenaSlot slot) {
  final d = slotDayOnly(slot.date);
  final startMin = slotStartMinutes(slot.startTime);
  var endMin = slotStartMinutes(slot.endTime);
  if (endMin <= startMin) endMin += 24 * 60;
  return DateTime(d.year, d.month, d.day, endMin ~/ 60, endMin % 60);
}

/// Hoje: após cutoff de reserva ou slot já terminou.
bool isPastBookableSlot({
  required DateTime selectedDay,
  required ArenaSlot slot,
  required DateTime now,
}) {
  final day = slotDayOnly(selectedDay);
  final today = slotDayOnly(now);
  if (day.isBefore(today)) return true;
  if (day.isAfter(today)) return false;
  if (!slotBookingCutoff(slot).isAfter(now)) return true;
  return slotEndDateTime(slot).isBefore(now);
}

int countFreeSlotsForDay(
  List<ArenaSlot> slots,
  DateTime selectedDay, {
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  var count = 0;
  for (final slot in slots) {
    if (!slot.isAvailable) continue;
    if (isPastBookableSlot(selectedDay: selectedDay, slot: slot, now: n)) {
      continue;
    }
    count++;
  }
  return count;
}

SlotDayAvailability dayAvailabilityFromSlots(
  List<ArenaSlot> slots,
  DateTime selectedDay, {
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  if (slots.isEmpty) {
    return const SlotDayAvailability(hasAnyFree: false, allPastOrFull: true);
  }
  var anyFuture = false;
  var anyFree = false;
  for (final slot in slots) {
    if (isPastBookableSlot(selectedDay: selectedDay, slot: slot, now: n)) {
      continue;
    }
    anyFuture = true;
    if (slot.isAvailable) anyFree = true;
  }
  if (!anyFuture) {
    return const SlotDayAvailability(hasAnyFree: false, allPastOrFull: true);
  }
  return SlotDayAvailability(
    hasAnyFree: anyFree,
    allPastOrFull: !anyFree,
  );
}

SlotPeriodFilter periodOfSlot(String startTime) {
  final m = slotStartMinutes(startTime);
  if (m >= 6 * 60 && m < 12 * 60) return SlotPeriodFilter.morning;
  if (m >= 12 * 60 && m < 18 * 60) return SlotPeriodFilter.afternoon;
  return SlotPeriodFilter.evening;
}

List<ArenaSlot> filterSlotsByPeriod(
  List<ArenaSlot> slots,
  SlotPeriodFilter filter,
) {
  if (filter == SlotPeriodFilter.all) return slots;
  return slots
      .where((s) => periodOfSlot(s.startTime) == filter)
      .toList(growable: false);
}

Map<SlotPeriodFilter, int> periodCounts(
  List<ArenaSlot> slots,
  DateTime selectedDay, {
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  final counts = {
    SlotPeriodFilter.morning: 0,
    SlotPeriodFilter.afternoon: 0,
    SlotPeriodFilter.evening: 0,
  };
  for (final slot in slots) {
    if (isPastBookableSlot(selectedDay: selectedDay, slot: slot, now: n)) {
      continue;
    }
    if (!slot.isAvailable) continue;
    final p = periodOfSlot(slot.startTime);
    if (p != SlotPeriodFilter.all) counts[p] = (counts[p] ?? 0) + 1;
  }
  final total = counts.values.fold<int>(0, (a, b) => a + b);
  return {
    SlotPeriodFilter.all: total,
    ...counts,
  };
}

List<SlotPeriodGroup> groupSlotsByPeriod(List<ArenaSlot> slots) {
  final order = [
    SlotPeriodFilter.morning,
    SlotPeriodFilter.afternoon,
    SlotPeriodFilter.evening,
  ];
  final groups = <SlotPeriodGroup>[];
  for (final period in order) {
    final list = slots
        .where((s) => periodOfSlot(s.startTime) == period)
        .toList(growable: false);
    if (list.isNotEmpty) {
      groups.add(SlotPeriodGroup(period: period, slots: list));
    }
  }
  return groups;
}

int durationSlotCount(int durationMinutes, int slotDurationMinutes) {
  final d = slotDurationMinutes > 0 ? slotDurationMinutes : defaultSlotDurationMinutes;
  return (durationMinutes / d).ceil().clamp(1, 24);
}

bool _rangeSelectable(
  List<ArenaSlot> slots,
  int start,
  int end,
  DateTime selectedDay,
  DateTime now,
) {
  if (start < 0 || end >= slots.length || start > end) return false;
  for (var i = start; i <= end; i++) {
    final s = slots[i];
    if (isPastBookableSlot(selectedDay: selectedDay, slot: s, now: now)) {
      return false;
    }
    if (!s.isSelectable) return false;
  }
  return true;
}

/// Primeiro índice de início com [slotCount] slots contíguos selecionáveis.
int? findContiguousRangeStart({
  required List<ArenaSlot> slots,
  required int slotCount,
  required DateTime selectedDay,
  DateTime? now,
  int? preferStartIndex,
}) {
  final n = now ?? DateTime.now();
  if (slots.isEmpty || slotCount < 1) return null;

  int? tryFrom(int from) {
    for (var start = from; start <= slots.length - slotCount; start++) {
      if (_rangeSelectable(slots, start, start + slotCount - 1, selectedDay, n)) {
        return start;
      }
    }
    return null;
  }

  if (preferStartIndex != null) {
    final hit = tryFrom(preferStartIndex);
    if (hit != null) return hit;
  }
  return tryFrom(0);
}

/// Seleção a partir do próximo slot livre.
({int start, int end})? selectRangeForDuration({
  required List<ArenaSlot> slots,
  required int durationMinutes,
  required int slotDurationMinutes,
  required DateTime selectedDay,
  DateTime? now,
  int? anchorIndex,
}) {
  final count = durationSlotCount(durationMinutes, slotDurationMinutes);
  final start = findContiguousRangeStart(
    slots: slots,
    slotCount: count,
    selectedDay: selectedDay,
    now: now,
    preferStartIndex: anchorIndex,
  );
  if (start == null) return null;
  return (start: start, end: start + count - 1);
}

List<DurationOption> buildDurationOptions({
  required double? hourlyPrice,
  required int slotDurationMinutes,
}) {
  const presets = [60, 90, 120, 180];
  return presets.map((minutes) {
    final slots = durationSlotCount(minutes, slotDurationMinutes);
    final label = switch (minutes) {
      60 => '1h',
      90 => '1h30',
      120 => '2 h',
      180 => '3 h',
      _ => '${minutes}min',
    };
    double? price;
    if (hourlyPrice != null && hourlyPrice > 0) {
      price = hourlyPrice * (minutes / 60);
    }
    return DurationOption(
      minutes: minutes,
      label: label,
      slotCount: slots,
      priceReais: price,
    );
  }).toList(growable: false);
}

int? lastAvailableSlotIndex(
  List<ArenaSlot> slots,
  DateTime selectedDay, {
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  int? last;
  for (var i = 0; i < slots.length; i++) {
    final s = slots[i];
    if (!s.isAvailable) continue;
    if (isPastBookableSlot(selectedDay: selectedDay, slot: s, now: n)) continue;
    last = i;
  }
  return last;
}

int? mostPopularSlotIndex(
  List<ArenaSlot> slots,
  DateTime selectedDay, {
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  for (var i = 0; i < slots.length; i++) {
    final s = slots[i];
    if (!s.isAvailable) continue;
    if (isPastBookableSlot(selectedDay: selectedDay, slot: s, now: n)) continue;
    final m = slotStartMinutes(s.startTime);
    if (m >= 8 * 60 && m < 10 * 60) return i;
  }

  var bestIdx = -1;
  var bestScore = -1;
  for (var i = 0; i < slots.length; i++) {
    final s = slots[i];
    if (!s.isAvailable) continue;
    if (isPastBookableSlot(selectedDay: selectedDay, slot: s, now: n)) continue;
    var score = 0;
    if (i > 0 && slots[i - 1].isBooked) score++;
    if (i < slots.length - 1 && slots[i + 1].isBooked) score++;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx >= 0 ? bestIdx : null;
}

String? occupiedSlotSubtitle(ArenaSlot slot) {
  if (!slot.isBooked && !slot.isBlocked) return null;
  final parts = <String>[];
  final reason = slot.blockReason;
  if (reason != null) {
    parts.add(reason.displayLabel);
  }
  final note = slot.blockNote?.trim();
  if (note != null && note.isNotEmpty) {
    if (parts.isEmpty) {
      parts.add(note);
    } else {
      parts.add(note);
    }
  }
  if (parts.isEmpty) return null;
  return '· ${parts.join(' — ')}';
}

String formatSelectionDurationLabel(int slotCount, int slotDurationMinutes) {
  final totalMin = slotCount * (slotDurationMinutes > 0 ? slotDurationMinutes : 60);
  if (totalMin % 60 == 0) {
    final h = totalMin ~/ 60;
    return h == 1 ? '1h' : '${h}h';
  }
  if (totalMin == 90) return '1h30';
  return '${(totalMin / 60).toStringAsFixed(1)}h';
}

double? totalPriceForRange(List<ArenaSlot> slots, int start, int end) {
  var sum = 0.0;
  for (var i = start; i <= end; i++) {
    final p = slots[i].priceReais;
    if (p == null || p <= 0) return null;
    sum += p;
  }
  return sum;
}

int? indexForStartTime(List<ArenaSlot> slots, String startTime) {
  final t = startTime.trim();
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].startTime.trim() == t) return i;
  }
  return null;
}

int? indexAtOrAfterTime(List<ArenaSlot> slots, String hhmm) {
  final target = slotStartMinutes(hhmm);
  for (var i = 0; i < slots.length; i++) {
    if (slotStartMinutes(slots[i].startTime) >= target) return i;
  }
  return null;
}

/// Grade sem documentos/virtuais para o dia.
bool isDayWithoutSchedule(List<ArenaSlot> slots) => slots.isEmpty;

/// Dia com grade mas sem vagas livres (nem passadas-only).
bool isDayFullyBooked(
  List<ArenaSlot> slots,
  DateTime selectedDay, {
  DateTime? now,
}) {
  if (slots.isEmpty) return false;
  final n = now ?? DateTime.now();
  final avail = dayAvailabilityFromSlots(slots, selectedDay, now: n);
  if (avail.hasAnyFree) return false;
  for (final slot in slots) {
    if (!isPastBookableSlot(selectedDay: selectedDay, slot: slot, now: n)) {
      return true;
    }
  }
  return false;
}

/// Exibe empty state com sugestões (lotado ou sem grade).
bool shouldShowSlotsFullyBookedBody(
  List<ArenaSlot> slots,
  DateTime selectedDay, {
  DateTime? now,
}) =>
    isDayWithoutSchedule(slots) ||
    isDayFullyBooked(slots, selectedDay, now: now);

int? firstFreeSlotIndex(
  List<ArenaSlot> slots,
  DateTime selectedDay, {
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  for (var i = 0; i < slots.length; i++) {
    final slot = slots[i];
    if (!slot.isAvailable) continue;
    if (isPastBookableSlot(selectedDay: selectedDay, slot: slot, now: n)) {
      continue;
    }
    return i;
  }
  return null;
}

ArenaSlot? firstFreeSlot(
  List<ArenaSlot> slots,
  DateTime selectedDay, {
  DateTime? now,
}) {
  final idx = firstFreeSlotIndex(slots, selectedDay, now: now);
  if (idx == null) return null;
  return slots[idx];
}

/// `10:00` → `10h`; `10:30` → `10:30`.
String formatCompactSlotTime(String time) {
  final t = time.trim();
  if (t.endsWith(':00')) {
    final h = int.tryParse(t.split(':').first) ?? 0;
    return '${h}h';
  }
  return t;
}

String formatCompactTimeRange(String start, String end) {
  return '${formatCompactSlotTime(start)}–${formatCompactSlotTime(end)}';
}

import 'arena_peak_rule.dart';
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

/// Primeiro dia da faixa horizontal para que [selectedDay] apareça selecionável.
DateTime computeSlotsDayStripStart({
  required DateTime today,
  required DateTime selectedDay,
  int daysCount = 21,
}) {
  final todayOnly = slotDayOnly(today);
  final selectedOnly = slotDayOnly(selectedDay);
  final windowEnd = todayOnly.add(Duration(days: daysCount - 1));

  if (selectedOnly.isBefore(todayOnly) || selectedOnly.isAfter(windowEnd)) {
    return selectedOnly;
  }
  return todayOnly;
}

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
    // Apenas blocos de 1 hora: 1h, 2h e 3h.
  const presets = [60, 120, 180];
  return presets.map((minutes) {
    final slots = durationSlotCount(minutes, slotDurationMinutes);
    final label = switch (minutes) {
      60 => '1h',
      120 => '2h',
      180 => '3h',
      _ => '${minutes ~/ 60}h',
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

/// Resultado do predicado de pico para uma seleção [start..end].
class PeakSelectionCheck {
  const PeakSelectionCheck({required this.minSlots, this.rule});

  /// Mínimo de slots contíguos exigido (1 = livre).
  final int minSlots;
  final ArenaPeakRule? rule;
}

/// Predicado central do horário de pico (ver spec 2026-08-03): exige o mínimo
/// apenas quando existe cadeia contígua disponível que o cumpra; a janela de
/// antecedência (`releaseHoursBefore`) também libera.
PeakSelectionCheck peakCheckForRange({
  required List<ArenaPeakRule> rules,
  required String courtId,
  required List<ArenaSlot> slots,
  required DateTime selectedDay,
  required int start,
  required int end,
  required int slotDurationMinutes,
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  if (rules.isEmpty || start < 0 || end >= slots.length || start > end) {
    return const PeakSelectionCheck(minSlots: 1);
  }
  final selectionLength = end - start + 1;
  var demandedSlots = 1;
  ArenaPeakRule? demandedRule;

  for (var i = start; i <= end; i++) {
    final rule = _peakRestrictionFor(slots[i], rules, courtId, selectedDay, n);
    if (rule == null) continue;
    final minSlots = durationSlotCount(rule.minDurationMinutes, slotDurationMinutes);
    if (selectionLength >= minSlots) continue;
    if (!_peakChainExists(slots, i, minSlots, selectedDay, n)) continue;
    if (minSlots > demandedSlots) {
      demandedSlots = minSlots;
      demandedRule = rule;
    }
  }
  return PeakSelectionCheck(minSlots: demandedSlots, rule: demandedRule);
}

/// Mínimo a exibir no chip do slot (badge "mín. 2h"); 1 = sem badge.
int peakBadgeMinSlots({
  required List<ArenaPeakRule> rules,
  required String courtId,
  required List<ArenaSlot> slots,
  required DateTime selectedDay,
  required int index,
  required int slotDurationMinutes,
  DateTime? now,
}) {
  return peakCheckForRange(
    rules: rules,
    courtId: courtId,
    slots: slots,
    selectedDay: selectedDay,
    start: index,
    end: index,
    slotDurationMinutes: slotDurationMinutes,
    now: now,
  ).minSlots;
}

ArenaPeakRule? _peakRestrictionFor(
  ArenaSlot slot,
  List<ArenaPeakRule> rules,
  String courtId,
  DateTime day,
  DateTime now,
) {
  ArenaPeakRule? best;
  for (final r in rules) {
    if (!r.matches(
      courtId: courtId,
      date: day,
      slotStartTime: slot.startTime,
    )) {
      continue;
    }
    if (best == null || r.minDurationMinutes > best.minDurationMinutes) {
      best = r;
    }
  }
  final release = best?.releaseHoursBefore;
  if (best != null && release != null) {
    final startMin = slotStartMinutes(slot.startTime);
    final slotStart = DateTime(
      day.year, day.month, day.day, startMin ~/ 60, startMin % 60,
    );
    if (!now.isBefore(slotStart.subtract(Duration(hours: release)))) {
      return null;
    }
  }
  return best;
}

bool _peakChainExists(
  List<ArenaSlot> slots,
  int index,
  int minSlots,
  DateTime day,
  DateTime now,
) {
  return minimumChainContaining(
        slots: slots,
        selectionStart: index,
        selectionEnd: index,
        minSlots: minSlots,
        selectedDay: day,
        now: now,
      ) !=
      null;
}

/// Melhor cadeia contígua de [minSlots] slots selecionáveis que contém todo o
/// intervalo `[selectionStart..selectionEnd]`. Prefere a cadeia que começa na
/// própria seleção e só então recua o início — é o que o modal da regra de
/// pico oferece. `null` quando nenhuma cadeia é possível.
({int start, int end})? minimumChainContaining({
  required List<ArenaSlot> slots,
  required int selectionStart,
  required int selectionEnd,
  required int minSlots,
  required DateTime selectedDay,
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  if (minSlots < 1 || selectionStart < 0 || selectionEnd >= slots.length) {
    return null;
  }
  final selectionLength = selectionEnd - selectionStart + 1;
  if (minSlots < selectionLength) return null;
  final earliest = (selectionEnd - minSlots + 1).clamp(0, selectionStart);
  for (var start = selectionStart; start >= earliest; start--) {
    final end = start + minSlots - 1;
    if (end >= slots.length) continue;
    if (_peakChainBookable(slots, start, end, selectedDay, n)) {
      return (start: start, end: end);
    }
  }
  return null;
}

bool _peakChainBookable(
  List<ArenaSlot> slots,
  int start,
  int end,
  DateTime day,
  DateTime now,
) {
  for (var i = start; i <= end; i++) {
    final s = slots[i];
    if (!s.isAvailable || isPastBookableSlot(selectedDay: day, slot: s, now: now)) {
      return false;
    }
    if (i > start && slots[i - 1].endTime != s.startTime) return false;
  }
  return true;
}

/// Conteúdo do modal da regra de pico no app: a regra que restringe a seleção
/// e o intervalo mínimo que o botão primário aplica.
class PeakPrompt {
  const PeakPrompt({
    required this.rule,
    required this.start,
    required this.end,
    required this.minSlots,
  });

  final ArenaPeakRule rule;
  final int start;
  final int end;
  final int minSlots;
}

/// Decide se o toque num slot deve abrir o modal da regra de pico. `null`
/// quando não deve: seleção já cumpre o mínimo, slot fora de faixa de pico,
/// regra liberada (antecedência ou cadeia impossível).
PeakPrompt? peakPromptForSelection({
  required List<ArenaPeakRule> rules,
  required String courtId,
  required List<ArenaSlot> slots,
  required DateTime selectedDay,
  required int start,
  required int end,
  required int slotDurationMinutes,
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  final initialCheck = peakCheckForRange(
    rules: rules,
    courtId: courtId,
    slots: slots,
    selectedDay: selectedDay,
    start: start,
    end: end,
    slotDurationMinutes: slotDurationMinutes,
    now: n,
  );
  final initialRule = initialCheck.rule;
  if (initialCheck.minSlots <= (end - start + 1) || initialRule == null) return null;

  final firstChain = minimumChainContaining(
    slots: slots,
    selectionStart: start,
    selectionEnd: end,
    minSlots: initialCheck.minSlots,
    selectedDay: selectedDay,
    now: n,
  );
  // Sem cadeia que cubra a seleção inteira não há o que oferecer no modal.
  // Não é impossível: `peakCheckForRange` valida a janela em torno do slot
  // restrito, não do intervalo todo. Nesse caso o rodapé segue bloqueando a
  // seleção — o atleta só fica sem a explicação em modal.
  if (firstChain == null) return null;

  // Tipados não-nuláveis a partir daqui (via inferência de `var` sobre um
  // valor já promovido) para que a reatribuição dentro do loop não perca a
  // promoção de nulidade do Dart entre iterações.
  var rule = initialRule;
  var chain = firstChain;

  // Fixpoint: a cadeia oferecida pode cair na faixa de OUTRA regra com
  // mínimo maior (ex.: regra A 20:00–21:00 mín 2h vizinha da regra B
  // 21:00–22:00 mín 3h — tocar 20:00 oferece 20:00–22:00, que a regra B
  // ainda rejeita). Reavalia a própria cadeia até que nenhuma regra exija
  // mais do que ela já cobre. Limitado por `slots.length` como guarda
  // contra loop infinito — não deveria disparar na prática, já que cada
  // iteração só cresce a cadeia.
  for (var i = 0; i < slots.length; i++) {
    final check = peakCheckForRange(
      rules: rules,
      courtId: courtId,
      slots: slots,
      selectedDay: selectedDay,
      start: chain.start,
      end: chain.end,
      slotDurationMinutes: slotDurationMinutes,
      now: n,
    );
    final chainLength = chain.end - chain.start + 1;
    if (check.minSlots <= chainLength) {
      return PeakPrompt(
        rule: rule,
        start: chain.start,
        end: chain.end,
        minSlots: chainLength,
      );
    }
    // check.minSlots > chainLength > 0 implica check.rule != null (ver
    // peakCheckForRange: demandedRule só fica null quando demandedSlots
    // permanece no valor inicial 1).
    final nextRule = check.rule;
    if (nextRule != null) rule = nextRule;
    final nextChain = minimumChainContaining(
      slots: slots,
      selectionStart: chain.start,
      selectionEnd: chain.end,
      minSlots: check.minSlots,
      selectedDay: selectedDay,
      now: n,
    );
    if (nextChain == null) return null;
    chain = nextChain;
  }
  return null;
}

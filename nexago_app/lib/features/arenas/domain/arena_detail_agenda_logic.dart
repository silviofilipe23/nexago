import 'arena_booking_allocation.dart';
import 'arena_court.dart';
import 'arena_detail_logic.dart';
import 'arena_peak_rule.dart';
import 'arena_slot.dart';
import 'arena_sport_codes.dart';
import 'capacity_slots_logic.dart';
import 'slots_page_logic.dart';
import 'slots_page_providers.dart';

/// Agenda do perfil da arena: dia, horários livres por período e o horário
/// escolhido, juntando todas as quadras. A reserva sai daqui direto para a
/// confirmação; o que pede decisão (horário de pico) segue para a grade.

/// Um horário da agenda do perfil.
class AgendaTime {
  const AgendaTime({
    required this.startTime,
    required this.endTime,
    required this.freeCourts,
    required this.totalCourts,
    required this.slotStartTimes,
    this.courtId,
    this.priceReais,
  });

  final String startTime;
  final String endTime;

  /// Quadras com a duração inteira livre a partir de [startTime].
  final int freeCourts;
  final int totalCourts;

  /// Inícios dos slots cobertos (vão em `selectedSlotStartTimes`).
  final List<String> slotStartTimes;

  /// Quadra que recebe a reserva (a mais barata livre); `null` quando a arena
  /// define a quadra ou quando o horário lotou.
  final String? courtId;

  /// Preço da duração inteira; `null` quando lotou ou não há preço.
  final double? priceReais;

  bool get isFull => freeCourts == 0;

  SlotPeriodFilter get period => periodOfSlot(startTime);
}

/// Estado do dia na agenda.
enum AgendaDayState {
  /// Há horário livre.
  open,

  /// Tinha horário e lotou.
  full,

  /// A arena não abriu horário neste dia.
  noSchedule,
}

/// Esportes do filtro da agenda (rótulos das quadras abertas); vazio quando
/// só há um, e o filtro não aparece.
List<String> agendaCourtSportLabels(List<ArenaCourt> courts) {
  final labels = <String>[];
  for (final court in courts) {
    if (court.isMaintenance) continue;
    for (final label in courtSportLabelsOf(court)) {
      if (!labels.contains(label)) labels.add(label);
    }
  }
  return labels.length < 2 ? const [] : List.unmodifiable(labels);
}

/// Quadras que entram na agenda: abertas e do esporte escolhido (`null` =
/// todas), na ordem da arena.
List<ArenaCourt> agendaCourtCandidates(
  List<ArenaCourt> courts,
  String? sportLabel,
) {
  return List.unmodifiable(
    courts.where(
      (c) =>
          !c.isMaintenance &&
          (sportLabel == null || courtSportLabelsOf(c).contains(sportLabel)),
    ),
  );
}

int _toMinutes(String hm) => slotStartMinutes(hm);

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

Map<String, List<ArenaSlot>> _slotsByCourt(
  List<ArenaSlot> daySlots,
  List<ArenaCourt> candidates,
  DateTime day,
) {
  final byCourt = <String, List<ArenaSlot>>{
    for (final c in candidates) c.id: <ArenaSlot>[],
  };
  for (final slot in daySlots) {
    final list = byCourt[slot.courtId];
    if (list != null && _sameDay(slot.date, day)) list.add(slot);
  }
  for (final list in byCourt.values) {
    list.sort(
      (a, b) => _toMinutes(a.startTime).compareTo(_toMinutes(b.startTime)),
    );
  }
  return byCourt;
}

String _hm(String raw) {
  final t = raw.trim();
  return t.length >= 5 ? t.substring(0, 5) : t;
}

/// Horários do dia na arena em que o atleta escolhe a quadra: cada início com
/// quantas quadras têm a duração inteira livre e contígua **na mesma quadra**.
/// A reserva vai para a mais barata livre (empate: ordem da arena). Inícios
/// que já passaram do prazo de reserva ficam de fora, como na grade.
List<AgendaTime> buildCourtAgendaTimes({
  required List<ArenaSlot> daySlots,
  required List<ArenaCourt> candidates,
  required int durationMinutes,
  required DateTime day,
  required DateTime now,
}) {
  if (candidates.isEmpty) return const [];
  final byCourt = _slotsByCourt(daySlots, candidates, day);

  final starts = <String>{};
  for (final list in byCourt.values) {
    for (final slot in list) {
      if (isPastBookableSlot(selectedDay: day, slot: slot, now: now)) {
        continue;
      }
      starts.add(_hm(slot.startTime));
    }
  }

  final out = <AgendaTime>[];
  for (final start in starts) {
    var free = 0;
    SlotChain? sample;
    SlotChain? best;
    String? bestCourt;
    for (final court in candidates) {
      final chain = slotChainFrom(byCourt[court.id]!, start, durationMinutes);
      if (chain == null) continue;
      sample ??= chain;
      if (!chain.allAvailable) continue;
      free++;
      if (_cheaper(chain, best)) {
        best = chain;
        bestCourt = court.id;
      }
    }
    if (sample == null) continue;
    final chosen = best ?? sample;
    out.add(AgendaTime(
      startTime: start,
      endTime: chosen.endTime,
      freeCourts: free,
      totalCourts: candidates.length,
      slotStartTimes: List.unmodifiable(chosen.starts),
      courtId: bestCourt,
      priceReais: best?.priceReais,
    ));
  }
  out.sort(
      (a, b) => _toMinutes(a.startTime).compareTo(_toMinutes(b.startTime)));
  return List.unmodifiable(out);
}

/// [candidate] é melhor que [current]: tem preço e é menor (sem preço perde).
bool _cheaper(SlotChain candidate, SlotChain? current) {
  if (current == null) return true;
  final a = candidate.priceReais;
  final b = current.priceReais;
  if (a == null) return false;
  if (b == null) return true;
  return a < b;
}

/// Horários do dia na arena que define a quadra: a grade por horário do
/// esporte, com o preço da arena para ele (o servidor cota de novo).
List<AgendaTime> buildCapacityAgendaTimes({
  required List<ArenaSlot> daySlots,
  required ArenaBookingAllocation allocation,
  required List<ArenaCourt> courts,
  required String sport,
  required int durationMinutes,
  required DateTime day,
  required DateTime now,
}) {
  final candidates = capacityCandidateCourts(allocation, courts, sport);
  final price = capacityPriceFor(allocation, sport, durationMinutes);
  final times = buildCapacityTimes(
    daySlots: daySlots,
    candidates: candidates,
    durationMinutes: durationMinutes,
    day: day,
    now: now,
  );
  return List.unmodifiable([
    for (final t in times)
      AgendaTime(
        startTime: t.startTime,
        endTime: t.endTime,
        freeCourts: t.freeCourts,
        totalCourts: t.totalCourts,
        slotStartTimes: t.slotStartTimes,
        priceReais: t.isFull ? null : price,
      ),
  ]);
}

const _periodOrder = [
  SlotPeriodFilter.morning,
  SlotPeriodFilter.afternoon,
  SlotPeriodFilter.evening,
];

/// Horários separados em manhã, tarde e noite, nessa ordem, sem período vazio.
Map<SlotPeriodFilter, List<AgendaTime>> groupAgendaByPeriod(
  List<AgendaTime> times,
) {
  final groups = <SlotPeriodFilter, List<AgendaTime>>{};
  for (final period in _periodOrder) {
    final inPeriod = [
      for (final t in times)
        if (t.period == period) t
    ];
    if (inPeriod.isNotEmpty) groups[period] = List.unmodifiable(inPeriod);
  }
  return Map.unmodifiable(groups);
}

AgendaDayState agendaDayStateOf(List<AgendaTime> times) {
  if (times.isEmpty) return AgendaDayState.noSchedule;
  return times.every((t) => t.isFull)
      ? AgendaDayState.full
      : AgendaDayState.open;
}

/// Disponibilidade de cada dia da faixa, só nas quadras da agenda (mesma
/// régua da grade: slot livre e ainda dentro do prazo).
List<SlotsCalendarDayStatus> agendaCalendarStatuses({
  required List<ArenaSlot> rangeSlots,
  required Set<String> candidateIds,
  required DateTime startDay,
  required int days,
  required DateTime now,
}) {
  final first = slotDayOnly(startDay);
  return List.unmodifiable([
    for (var i = 0; i < days; i++)
      () {
        final day = DateTime(first.year, first.month, first.day + i);
        final slots = [
          for (final s in rangeSlots)
            if (candidateIds.contains(s.courtId) && _sameDay(s.date, day)) s,
        ];
        return SlotsCalendarDayStatus(
          date: day,
          availability: dayAvailabilityFromSlots(slots, day, now: now),
        );
      }(),
  ]);
}

/// Primeiro dia depois de [after] com horário livre na faixa; `null` se não há.
DateTime? nextOpenDay(
  List<SlotsCalendarDayStatus> statuses, {
  required DateTime after,
}) {
  final pivot = slotDayOnly(after);
  for (final status in statuses) {
    if (!status.date.isAfter(pivot)) continue;
    if (status.availability.hasAnyFree) return status.date;
  }
  return null;
}

/// O horário escolhido cai numa regra de pico que pede mais tempo? Aí a
/// reserva segue pela grade, que explica a regra e oferece o mínimo; sem isso
/// vai direto para a confirmação. [courtSlots] é a grade do dia da quadra.
bool agendaNeedsPeakFlow({
  required List<ArenaPeakRule> rules,
  required String courtId,
  required List<ArenaSlot> courtSlots,
  required DateTime day,
  required List<String> slotStartTimes,
  required int slotDurationMinutes,
  DateTime? now,
}) {
  if (rules.isEmpty || slotStartTimes.isEmpty) return false;
  final sorted = [
    ...courtSlots
  ]..sort((a, b) => _toMinutes(a.startTime).compareTo(_toMinutes(b.startTime)));
  final start =
      sorted.indexWhere((s) => _hm(s.startTime) == slotStartTimes.first);
  final end = sorted.indexWhere((s) => _hm(s.startTime) == slotStartTimes.last);
  if (start < 0 || end < start) return false;
  final check = peakCheckForRange(
    rules: rules,
    courtId: courtId,
    slots: sorted,
    selectedDay: day,
    start: start,
    end: end,
    slotDurationMinutes: slotDurationMinutes,
    now: now,
  );
  return end - start + 1 < check.minSlots;
}

/// Uma opção do filtro de esporte da agenda. Na arena em que o atleta escolhe
/// a quadra, [value] é o rótulo da quadra e `null` é "Todas"; na que define a
/// quadra, é o código do esporte.
class AgendaSportOption {
  const AgendaSportOption({required this.value, required this.label});

  final String? value;
  final String label;
}

/// Tudo que a agenda do perfil mostra para o dia escolhido.
class AgendaView {
  const AgendaView({
    required this.isCapacity,
    required this.sportOptions,
    required this.sport,
    required this.candidates,
    required this.durations,
    required this.durationMinutes,
    required this.times,
  });

  /// A arena define a quadra (reserva por horário, sem quadra).
  final bool isCapacity;

  /// Vazio quando não há o que filtrar.
  final List<AgendaSportOption> sportOptions;
  final String? sport;
  final List<ArenaCourt> candidates;
  final List<int> durations;
  final int durationMinutes;
  final List<AgendaTime> times;

  AgendaDayState get dayState => agendaDayStateOf(times);

  Map<SlotPeriodFilter, List<AgendaTime>> get periods =>
      groupAgendaByPeriod(times);

  /// Horário livre que começa em [startTime]; `null` se não há ou lotou.
  AgendaTime? freeTimeAt(String? startTime) {
    if (startTime == null) return null;
    for (final t in times) {
      if (t.startTime == startTime && !t.isFull) return t;
    }
    return null;
  }
}

/// Monta a agenda do dia: escolhe o modo pela arena, resolve esporte e
/// duração (a escolha do atleta, se ainda vale, ou o padrão) e calcula os
/// horários. [primarySport] é o esporte principal do atleta, que vem na frente
/// quando a arena define a quadra.
AgendaView buildAgendaView({
  required ArenaBookingAllocation allocation,
  required List<ArenaCourt> courts,
  required List<ArenaSlot> daySlots,
  required DateTime day,
  required DateTime now,
  String? sportChoice,
  int? durationChoice,
  String? primarySport,
}) {
  if (useCapacityGrid(allocation)) {
    final sports = capacitySportsForAthlete(
      capacitySports(allocation, courts),
      primarySport,
    );
    final sport = sports.contains(sportChoice)
        ? sportChoice
        : (sports.isEmpty ? null : sports.first);
    final candidates = sport == null
        ? const <ArenaCourt>[]
        : capacityCandidateCourts(allocation, courts, sport);
    final durations = capacityDurationOptions(candidates);
    final duration = _resolveDuration(durations, durationChoice);
    return AgendaView(
      isCapacity: true,
      sportOptions: sports.length < 2
          ? const []
          : [
              for (final s in sports)
                AgendaSportOption(value: s, label: courtSportLabel(s)),
            ],
      sport: sport,
      candidates: candidates,
      durations: durations,
      durationMinutes: duration,
      times: sport == null
          ? const []
          : buildCapacityAgendaTimes(
              daySlots: daySlots,
              allocation: allocation,
              courts: courts,
              sport: sport,
              durationMinutes: duration,
              day: day,
              now: now,
            ),
    );
  }

  final labels = agendaCourtSportLabels(courts);
  final sport = labels.contains(sportChoice) ? sportChoice : null;
  final candidates = agendaCourtCandidates(courts, sport);
  final durations = capacityDurationOptions(candidates);
  final duration = _resolveDuration(durations, durationChoice);
  return AgendaView(
    isCapacity: false,
    sportOptions: labels.isEmpty
        ? const []
        : [
            const AgendaSportOption(value: null, label: 'Todas'),
            for (final l in labels) AgendaSportOption(value: l, label: l),
          ],
    sport: sport,
    candidates: candidates,
    durations: durations,
    durationMinutes: duration,
    times: buildCourtAgendaTimes(
      daySlots: daySlots,
      candidates: candidates,
      durationMinutes: duration,
      day: day,
      now: now,
    ),
  );
}

int _resolveDuration(List<int> durations, int? choice) {
  if (choice != null && durations.contains(choice)) return choice;
  return durations.isEmpty ? 60 : durations.first;
}

import 'arena_booking_allocation.dart';
import 'arena_court.dart';
import 'arena_slot.dart';
import 'arena_sport_codes.dart';

/// Grade "por horário" da arena que define a quadra (`docs/product/reservas-por-capacidade.md`).
///
/// As quadras são as vagas: um horário tem vaga quando alguma quadra da distribuição, do esporte
/// escolhido, está livre nele pela duração inteira **na mesma quadra** (o servidor segura uma
/// quadra provisória só — ver `takeFirstFreeCourt`).

/// A grade é por horário? Arena "a arena define a quadra", salvo no modo misto quando o atleta
/// pediu para escolher a quadra (ou chegou com uma quadra já escolhida, ex.: lista de espera).
bool useCapacityGrid(
  ArenaBookingAllocation allocation, {
  String? initialCourtId,
  bool forceCourtChoice = false,
}) {
  if (!allocation.isCapacity) return false;
  if (!allocation.allowCourtChoice) return true;
  return !forceCourtChoice && (initialCourtId ?? '').trim().isEmpty;
}

/// Quadras que recebem a reserva do esporte: as da distribuição (na ordem da arena; sem lista,
/// todas por nome), fora de manutenção e do esporte (quadra sem esporte aceita). Espelha
/// `floatingCandidateCourts` das functions.
List<ArenaCourt> capacityCandidateCourts(
  ArenaBookingAllocation allocation,
  List<ArenaCourt> courts,
  String? sport,
) {
  final byId = {for (final c in courts) c.id: c};
  final ordered = allocation.courtIds.isNotEmpty
      ? [for (final id in allocation.courtIds) if (byId[id] != null) byId[id]!]
      : ([...courts]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase())));
  final code = bookingSportCode(sport);
  return [
    for (final c in ordered)
      if (!c.isMaintenance && _courtTakesSport(c, code)) c,
  ];
}

bool _courtTakesSport(ArenaCourt court, String? sport) {
  if (sport == null) return true;
  final codes = <String>[];
  for (final raw in court.sportTypes) {
    final code = bookingSportCode(raw);
    if (code != null && !codes.contains(code)) codes.add(code);
  }
  return codes.isEmpty || codes.contains(sport);
}

/// Esportes reserváveis por horário: com preço definido e ao menos uma quadra que os aceita.
List<String> capacitySports(ArenaBookingAllocation allocation, List<ArenaCourt> courts) {
  return [
    for (final sport in allocation.sports)
      if (capacityCandidateCourts(allocation, courts, sport).isNotEmpty) sport,
  ];
}

/// Esportes da grade na ordem do seletor: o esporte principal do atleta (`primarySportId` do
/// perfil, em qualquer grafia do catálogo) na frente — é o que vem selecionado —, os outros na
/// ordem da arena.
List<String> capacitySportsForAthlete(List<String> sports, String? primarySport) {
  final primary = bookingSportCode(primarySport);
  if (primary == null || !sports.contains(primary)) return sports;
  return [primary, for (final s in sports) if (s != primary) s];
}

/// Um horário da grade por horário.
class CapacityTime {
  const CapacityTime({
    required this.startTime,
    required this.endTime,
    required this.freeCourts,
    required this.totalCourts,
    required this.slotStartTimes,
  });

  final String startTime;
  final String endTime;

  /// Quadras livres pela duração inteira a partir de [startTime].
  final int freeCourts;
  final int totalCourts;

  /// Inícios dos slots cobertos (vão em `selectedSlotStartTimes` para o servidor cobrar).
  final List<String> slotStartTimes;

  bool get isFull => freeCourts == 0;

  /// Poucas vagas: até 2 quadras, ou 20% delas.
  bool get isLastSpots => !isFull && (freeCourts <= 2 || freeCourts * 5 <= totalCourts);

  int get minutes {
    final s = _toMinutes(startTime);
    var e = _toMinutes(endTime);
    if (e <= s) e += 24 * 60;
    return e - s;
  }
}

int _toMinutes(String hm) {
  final parts = hm.trim().split(':');
  final h = int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 0;
  final m = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0;
  return h * 60 + m;
}

/// Horários do dia para [durationMinutes]: cada início que alguma quadra candidata oferece, com
/// quantas quadras têm a duração inteira livre e contígua a partir dele. Horários já começados
/// (dia de hoje) ficam de fora.
List<CapacityTime> buildCapacityTimes({
  required List<ArenaSlot> daySlots,
  required List<ArenaCourt> candidates,
  required int durationMinutes,
  required DateTime day,
  required DateTime now,
}) {
  final total = candidates.length;
  if (total == 0) return const [];
  final byCourt = <String, List<ArenaSlot>>{};
  for (final c in candidates) {
    byCourt[c.id] = [];
  }
  for (final s in daySlots) {
    final list = byCourt[s.courtId];
    if (list != null && _sameDay(s.date, day)) list.add(s);
  }
  for (final list in byCourt.values) {
    list.sort((a, b) => _toMinutes(a.startTime).compareTo(_toMinutes(b.startTime)));
  }

  final isToday = _sameDay(day, now);
  final nowMin = now.hour * 60 + now.minute;
  final starts = <String>{};
  for (final list in byCourt.values) {
    for (final s in list) {
      if (isToday && _toMinutes(s.startTime) <= nowMin) continue;
      starts.add(_hm(s.startTime));
    }
  }

  final out = <CapacityTime>[];
  for (final start in starts) {
    var free = 0;
    _Chain? sample;
    for (final list in byCourt.values) {
      final chain = _chainFrom(list, start, durationMinutes);
      if (chain == null) continue;
      sample ??= chain;
      if (chain.allAvailable) free++;
    }
    if (sample == null) continue; // nenhuma quadra cobre a duração a partir daqui
    out.add(CapacityTime(
      startTime: start,
      endTime: sample.endTime,
      freeCourts: free,
      totalCourts: total,
      slotStartTimes: sample.starts,
    ));
  }
  out.sort((a, b) => _toMinutes(a.startTime).compareTo(_toMinutes(b.startTime)));
  return out;
}

class _Chain {
  _Chain(this.starts, this.endTime, this.allAvailable);
  final List<String> starts;
  final String endTime;
  final bool allAvailable;
}

/// Slots contíguos da quadra que somam [minutes] a partir de [start]; `null` se a grade da
/// quadra não fecha a duração (buraco, fim do dia ou passo diferente).
_Chain? _chainFrom(List<ArenaSlot> slots, String start, int minutes) {
  final index = slots.indexWhere((s) => _hm(s.startTime) == start);
  if (index < 0) return null;
  final starts = <String>[];
  var covered = 0;
  var available = true;
  var cursor = _toMinutes(start);
  for (var i = index; i < slots.length && covered < minutes; i++) {
    final s = slots[i];
    if (_toMinutes(s.startTime) != cursor) return null;
    var end = _toMinutes(s.endTime);
    if (end <= cursor) end += 24 * 60;
    starts.add(_hm(s.startTime));
    if (!s.isSelectable) available = false;
    covered += end - cursor;
    cursor = end % (24 * 60);
  }
  if (covered != minutes) return null;
  return _Chain(starts, _fmt(cursor), available);
}

String _hm(String raw) {
  final t = raw.trim();
  return t.length >= 5 ? t.substring(0, 5) : t;
}

String _fmt(int minutes) {
  final m = minutes % (24 * 60);
  return '${(m ~/ 60).toString().padLeft(2, '0')}:${(m % 60).toString().padLeft(2, '0')}';
}

bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// Durações oferecidas: múltiplos do passo da grade das quadras candidatas, até 3 h.
List<int> capacityDurationOptions(List<ArenaCourt> candidates) {
  var step = 60;
  for (final c in candidates) {
    if (c.slotDurationMinutes > 0 && c.slotDurationMinutes < step) step = c.slotDurationMinutes;
  }
  return [for (var m = step; m <= 180; m += step) m];
}

/// Preço do horário: o da arena para o esporte, proporcional à duração. O servidor cota de novo
/// (promoção, cupom) na confirmação.
double? capacityPriceFor(ArenaBookingAllocation allocation, String sport, int minutes) {
  final perHour = allocation.priceBySport[sport];
  if (perHour == null || perHour <= 0 || minutes <= 0) return null;
  return (perHour * minutes / 60 * 100).roundToDouble() / 100;
}

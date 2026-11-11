import 'arena_booking_allocation.dart';
import 'arena_court.dart';
import 'arena_search_metadata.dart';
import 'arena_search_providers.dart';
import 'arena_slot.dart';
import 'arena_sport_codes.dart';
import 'arena_list_item.dart';
import 'capacity_slots_logic.dart';

/// Resumo de disponibilidade de uma quadra no dia.
class ArenaCourtDaySummary {
  const ArenaCourtDaySummary({
    required this.court,
    required this.freeSlotsToday,
  });

  final ArenaCourt court;
  final int freeSlotsToday;

  bool get hasFreeSlotsToday => freeSlotsToday > 0;
}

/// Agregados do dia para a tela de detalhe.
class ArenaDetailTodaySummary {
  const ArenaDetailTodaySummary({
    required this.courts,
    required this.totalActiveCourts,
    required this.freeCourtsToday,
    required this.totalFreeSlotsToday,
  });

  static const empty = ArenaDetailTodaySummary(
    courts: [],
    totalActiveCourts: 0,
    freeCourtsToday: 0,
    totalFreeSlotsToday: 0,
  );

  final List<ArenaCourtDaySummary> courts;
  final int totalActiveCourts;
  final int freeCourtsToday;
  final int totalFreeSlotsToday;
}

/// Conta slots disponíveis e ainda reserváveis no dia [today] (date-only).
int countFreeSlotsToday(List<ArenaSlot> slots, DateTime today) {
  final day = DateTime(today.year, today.month, today.day);
  var count = 0;
  for (final slot in slots) {
    if (!slot.isAvailable) continue;
    if (isPastArenaSlot(day, slot.startTime)) continue;
    count++;
  }
  return count;
}

List<ArenaCourtDaySummary> buildCourtDaySummaries({
  required List<ArenaCourt> courts,
  required Map<String, List<ArenaSlot>> slotsByCourtId,
  required DateTime today,
}) {
  final summaries = <ArenaCourtDaySummary>[];
  for (final court in courts) {
    final slots = slotsByCourtId[court.id] ?? const [];
    final free = court.isMaintenance ? 0 : countFreeSlotsToday(slots, today);
    summaries.add(
      ArenaCourtDaySummary(
        court: court,
        freeSlotsToday: free,
      ),
    );
  }
  summaries.sort((a, b) {
    final aFree = a.hasFreeSlotsToday ? 0 : 1;
    final bFree = b.hasFreeSlotsToday ? 0 : 1;
    if (aFree != bFree) return aFree.compareTo(bFree);
    return a.court.name.toLowerCase().compareTo(b.court.name.toLowerCase());
  });
  return summaries;
}

ArenaDetailTodaySummary buildArenaDetailTodaySummary({
  required List<ArenaCourt> courts,
  required Map<String, List<ArenaSlot>> slotsByCourtId,
  required DateTime today,
}) {
  final summaries = buildCourtDaySummaries(
    courts: courts,
    slotsByCourtId: slotsByCourtId,
    today: today,
  );
  var freeCourts = 0;
  var totalFreeSlots = 0;
  for (final s in summaries) {
    if (s.hasFreeSlotsToday) freeCourts++;
    totalFreeSlots += s.freeSlotsToday;
  }
  final activeCourts = courts.where((c) => !c.isMaintenance).length;
  return ArenaDetailTodaySummary(
    courts: summaries,
    totalActiveCourts: activeCourts,
    freeCourtsToday: freeCourts,
    totalFreeSlotsToday: totalFreeSlots,
  );
}

/// Badge curto de superfície/esporte para o card da quadra.
String? courtSurfaceBadgeLabel(ArenaListItem arena, ArenaCourt court) {
  if (arena.surfaces.isNotEmpty) {
    return arena.surfaces.first.toUpperCase();
  }
  for (final type in court.sportTypes) {
    if (ArenaSearchMetadata.isSurfaceLabel(type)) {
      return type.toUpperCase();
    }
  }
  if (court.sportTypes.isNotEmpty) {
    return courtSportLabel(court.sportTypes.first).toUpperCase();
  }
  return null;
}

/// Acima disso a seção de quadras do perfil começa retraída ("Ver todas").
const kArenaDetailCourtsCollapsedCount = 4;

/// Selo curto da quadra na linha: o número do nome ("Quadra 12" → `12`); sem número, a inicial
/// ("Central" → `C`).
String courtBadgeLabel(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return '?';
  final number = RegExp(r'(\d+)\s*$').firstMatch(trimmed)?.group(1) ??
      RegExp(r'\d+').firstMatch(trimmed)?.group(0);
  if (number != null)
    return number.length > 3 ? number.substring(0, 3) : number;
  return trimmed.substring(0, 1).toUpperCase();
}

/// Esportes da quadra pelo catálogo, sem superfície legada ("Areia").
List<String> courtSportLabelsOf(ArenaCourt court) => arenaSportLabels(
      court.sportTypes.where((t) => !ArenaSearchMetadata.isSurfaceLabel(t)),
    );

/// Linha de apoio da quadra: esportes · coberta/aberta.
String courtMetaLine(ArenaListItem arena, ArenaCourt court) {
  final parts = <String>[...courtSportLabelsOf(court)];
  if (parts.isEmpty) {
    final surface = courtSurfaceBadgeLabel(arena, court);
    if (surface != null) parts.add(courtSportLabel(surface));
  }
  parts.add(arena.amenities.coveredCourt ? 'Coberta' : 'Aberta');
  return parts.join(' · ');
}

/// Filtro por esporte da seção de quadras: rótulo e quantas quadras têm o esporte.
class CourtSportFilterOption {
  const CourtSportFilterOption(this.label, this.count);

  final String label;
  final int count;
}

/// Opções de filtro por esporte, na ordem em que aparecem nas quadras. Vazio quando não ajuda:
/// até [kArenaDetailCourtsCollapsedCount] quadras ou um esporte só.
List<CourtSportFilterOption> courtSportFilterOptions(
  List<ArenaCourtDaySummary> courts,
) {
  if (courts.length <= kArenaDetailCourtsCollapsedCount) return const [];
  final counts = <String, int>{};
  for (final s in courts) {
    for (final label in courtSportLabelsOf(s.court)) {
      counts[label] = (counts[label] ?? 0) + 1;
    }
  }
  if (counts.length < 2) return const [];
  return [
    for (final e in counts.entries) CourtSportFilterOption(e.key, e.value),
  ];
}

/// Quadras do filtro [sport] (`null` = todas), na ordem recebida.
List<ArenaCourtDaySummary> filterCourtsBySport(
  List<ArenaCourtDaySummary> courts,
  String? sport,
) {
  if (sport == null) return courts;
  return [
    for (final s in courts)
      if (courtSportLabelsOf(s.court).contains(sport)) s,
  ];
}

/// Status do dia na linha da quadra.
String courtDayStatusLabel(ArenaCourtDaySummary summary) {
  if (summary.court.isMaintenance) return 'Em manutenção';
  final n = summary.freeSlotsToday;
  if (n <= 0) return 'Lotada hoje';
  return n == 1 ? '1 livre hoje' : '$n livres hoje';
}

/// Na arena que define a quadra, a estrutura (nomes das quadras) mostra só estas antes do "+N".
const kArenaDetailCourtTagsCollapsedCount = 6;

/// Uma linha "por esporte" da seção de quadras na arena que define a quadra.
class CapacitySportRow {
  const CapacitySportRow({
    required this.sport,
    required this.label,
    required this.courtCount,
    required this.freeCourtsToday,
    required this.pricePerHour,
  });

  /// Código do catálogo (vai para a grade por horário).
  final String sport;
  final String label;

  /// Quadras que recebem o esporte (fora de manutenção).
  final int courtCount;

  /// Dessas, quantas têm horário livre hoje.
  final int freeCourtsToday;
  final double? pricePerHour;
}

/// Esportes reserváveis por horário (com preço e quadra que aceita), na ordem da arena, com o
/// resumo do dia. Vazio fora do modo "a arena define a quadra" ou sem esporte configurado.
List<CapacitySportRow> capacitySportRows(
  ArenaBookingAllocation allocation,
  List<ArenaCourtDaySummary> courts,
) {
  if (!allocation.isCapacity) return const [];
  final plain = [for (final s in courts) s.court];
  final freeById = {for (final s in courts) s.court.id: s.hasFreeSlotsToday};
  return [
    for (final sport in capacitySports(allocation, plain))
      () {
        final candidates = capacityCandidateCourts(allocation, plain, sport);
        return CapacitySportRow(
          sport: sport,
          label: courtSportLabel(sport),
          courtCount: candidates.length,
          freeCourtsToday:
              candidates.where((c) => freeById[c.id] == true).length,
          pricePerHour: allocation.priceBySport[sport],
        );
      }(),
  ];
}

/// Status do dia na linha do esporte.
String capacitySportStatusLabel(CapacitySportRow row) {
  final n = row.freeCourtsToday;
  if (n <= 0) return 'Lotado hoje';
  return '$n com horário hoje';
}

/// Ordem natural do nome da quadra ("Quadra 2" antes de "Quadra 10").
int compareCourtNames(String a, String b) {
  final re = RegExp(r'^(.*?)(\d+)\s*$');
  final ma = re.firstMatch(a.trim().toLowerCase());
  final mb = re.firstMatch(b.trim().toLowerCase());
  if (ma != null && mb != null && ma.group(1) == mb.group(1)) {
    return int.parse(ma.group(2)!).compareTo(int.parse(mb.group(2)!));
  }
  return a.toLowerCase().compareTo(b.toLowerCase());
}

String formatRelativeReviewAge(DateTime? createdAt, DateTime now) {
  if (createdAt == null) return '';
  final diff = now.difference(createdAt);
  if (diff.inDays >= 1) return 'há ${diff.inDays}d';
  if (diff.inHours >= 1) return 'há ${diff.inHours}h';
  if (diff.inMinutes >= 1) return 'há ${diff.inMinutes}min';
  return 'agora';
}

String reviewerInitials(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.isEmpty || parts.first.isEmpty) return '?';
  if (parts.length == 1) {
    return parts.first.substring(0, 1).toUpperCase();
  }
  final a = parts.first.substring(0, 1);
  final b = parts.last.substring(0, 1);
  return '$a$b'.toUpperCase();
}

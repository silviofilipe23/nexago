import 'arena_court.dart';
import 'arena_search_metadata.dart';
import 'arena_search_providers.dart';
import 'arena_slot.dart';
import 'arena_list_item.dart';

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
    final free = court.isMaintenance
        ? 0
        : countFreeSlotsToday(slots, today);
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
    return court.sportTypes.first.toUpperCase();
  }
  return null;
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

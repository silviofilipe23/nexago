import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'arena_court.dart';
import 'arena_list_item.dart';
import 'slots_page_logic.dart';
import 'slots_providers.dart';
import 'slots_query.dart';
/// Resumo de uma quadra para o carrossel na escolha de horário.
class SlotsCourtSummary {
  const SlotsCourtSummary({
    required this.court,
    required this.freeSlotsCount,
  });

  final ArenaCourt court;
  final int freeSlotsCount;

  bool get hasFreeSlots => freeSlotsCount > 0;
}

class SlotsCalendarDayStatus {
  const SlotsCalendarDayStatus({
    required this.date,
    required this.availability,
  });

  final DateTime date;
  final SlotDayAvailability availability;
}

/// Parâmetros do calendário horizontal.
class SlotsCalendarParams {
  const SlotsCalendarParams({
    required this.arenaId,
    required this.courtId,
    required this.startDay,
    this.daysCount = 21,
    this.arenaFallbackPricePerHour,
  });

  final String arenaId;
  final String courtId;
  final DateTime startDay;
  final int daysCount;
  final double? arenaFallbackPricePerHour;

  @override
  bool operator ==(Object other) {
    return other is SlotsCalendarParams &&
        other.arenaId == arenaId &&
        other.courtId == courtId &&
        other.startDay == startDay &&
        other.daysCount == daysCount &&
        other.arenaFallbackPricePerHour == arenaFallbackPricePerHour;
  }

  @override
  int get hashCode => Object.hash(
        arenaId,
        courtId,
        slotDayOnly(startDay),
        daysCount,
        arenaFallbackPricePerHour,
      );
}

final slotsCourtDaySummaryProvider = FutureProvider.autoDispose
    .family<List<SlotsCourtSummary>, ({String arenaId, DateTime date, ArenaListItem arena})>(
        (ref, params) async {
  final aid = params.arenaId.trim();
  if (aid.isEmpty) return const [];

  final courts = await ref.watch(courtsStreamProvider(aid).future);
  final day = slotDayOnly(params.date);
  final fallback = params.arena.pricePerHourReais;
  final now = DateTime.now();

  final summaries = <SlotsCourtSummary>[];
  for (final court in courts) {
    if (court.isMaintenance) {
      summaries.add(SlotsCourtSummary(court: court, freeSlotsCount: 0));
      continue;
    }
    final query = SlotsQuery(
      arenaId: aid,
      courtId: court.id,
      date: day,
      arenaFallbackPricePerHourReais: fallback,
    );
    final slots = await ref.watch(slotsStreamProvider(query).future);
    final free = countFreeSlotsForDay(slots, day, now: now);
    summaries.add(SlotsCourtSummary(court: court, freeSlotsCount: free));
  }

  summaries.sort((a, b) {
    final aFree = a.hasFreeSlots ? 0 : 1;
    final bFree = b.hasFreeSlots ? 0 : 1;
    if (aFree != bFree) return aFree.compareTo(bFree);
    return a.court.name.toLowerCase().compareTo(b.court.name.toLowerCase());
  });
  return summaries;
});

final slotsCalendarAvailabilityProvider = FutureProvider.autoDispose
    .family<List<SlotsCalendarDayStatus>, SlotsCalendarParams>((ref, params) async {
  final aid = params.arenaId.trim();
  final cid = params.courtId.trim();
  if (aid.isEmpty || cid.isEmpty) return const [];

  final start = slotDayOnly(params.startDay);
  final now = DateTime.now();
  final out = <SlotsCalendarDayStatus>[];

  for (var i = 0; i < params.daysCount; i++) {
    final day = start.add(Duration(days: i));
    final query = SlotsQuery(
      arenaId: aid,
      courtId: cid,
      date: day,
      arenaFallbackPricePerHourReais: params.arenaFallbackPricePerHour,
    );
    final slots = await ref.watch(slotsStreamProvider(query).future);
    out.add(
      SlotsCalendarDayStatus(
        date: day,
        availability: dayAvailabilityFromSlots(slots, day, now: now),
      ),
    );
  }
  return out;
});

/// Duração da grade a partir do documento da quadra (cache por courtId).
final courtSlotDurationMinutesProvider =
    Provider.autoDispose.family<int, ({String arenaId, String courtId})>(
  (ref, params) {
    final courts = ref.watch(courtsStreamProvider(params.arenaId)).valueOrNull;
    if (courts == null) return defaultSlotDurationMinutes;
    for (final c in courts) {
      if (c.id == params.courtId) {
        return c.slotDurationMinutes;
      }
    }
    return defaultSlotDurationMinutes;
  },
);

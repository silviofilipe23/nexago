import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/location/user_location_providers.dart';
import '../../../core/location/user_location_snapshot.dart';
import '../../../core/theme/app_colors.dart';
import 'arena_detail_logic.dart';
import 'arena_list_item.dart';
import 'arena_search_providers.dart';
import 'arena_slot.dart';
import 'slots_page_logic.dart';
import 'slots_page_providers.dart';
import 'slots_providers.dart';
import 'slots_query.dart';
import 'slots_suggestion_models.dart';
import 'slots_suggestions_logic.dart';

/// Parâmetros para carregar sugestões inteligentes.
class SlotsSuggestionsParams {
  const SlotsSuggestionsParams({
    required this.arena,
    required this.courtId,
    required this.courtName,
    required this.selectedDay,
    required this.enabled,
  });

  final ArenaListItem arena;
  final String courtId;
  final String courtName;
  final DateTime selectedDay;
  final bool enabled;

  @override
  bool operator ==(Object other) {
    return other is SlotsSuggestionsParams &&
        other.arena.id == arena.id &&
        other.courtId == courtId &&
        other.courtName == courtName &&
        slotDayOnly(other.selectedDay) == slotDayOnly(selectedDay) &&
        other.enabled == enabled;
  }

  @override
  int get hashCode => Object.hash(
        arena.id,
        courtId,
        courtName,
        slotDayOnly(selectedDay),
        enabled,
      );
}

SlotsSuggestion _alternateCourtSuggestion({
  required ArenaListItem arena,
  required SlotsCourtSummary summary,
  required ArenaSlot slot,
}) {
  final surface = courtSurfaceBadgeLabel(arena, summary.court);
  final surfacePart = surface != null ? surface.toLowerCase() : 'mesma quadra';
  final price = slot.priceReais;
  final pricePart = price != null && price > 0
      ? ' · R\$ ${price.toStringAsFixed(0)}'
      : '';
  return SlotsSuggestion(
    kind: SlotsSuggestionKind.alternateCourt,
    title:
        '${summary.court.name} · ${formatCompactTimeRange(slot.startTime, slot.endTime)}',
    subtitle: 'Mesmo dia · $surfacePart$pricePart',
    actionLabel: 'Trocar',
    actionStyle: SlotsSuggestionActionStyle.primaryFilled,
    icon: Icons.sports_tennis_rounded,
    iconBackground: AppColors.brand,
    arenaId: arena.id,
    courtId: summary.court.id,
    date: slotDayOnly(slot.date),
    startTime: slot.startTime,
    endTime: slot.endTime,
    priceReais: price,
    arena: arena,
    slot: slot,
  );
}

SlotsSuggestion _nextDaySuggestion({
  required ArenaListItem arena,
  required String courtId,
  required String courtName,
  required DateTime day,
  required ArenaSlot slot,
}) {
  return SlotsSuggestion(
    kind: SlotsSuggestionKind.nextDay,
    title:
        '${formatSuggestionDayLabel(day)} · $courtName · ${formatCompactSlotTime(slot.startTime)}',
    subtitle: 'Próximo dia disponível na mesma quadra',
    actionLabel: 'Ir',
    actionStyle: SlotsSuggestionActionStyle.outlined,
    icon: Icons.calendar_month_rounded,
    iconBackground: AppColors.win.withValues(alpha: 0.25),
    arenaId: arena.id,
    courtId: courtId,
    date: day,
    startTime: slot.startTime,
    endTime: slot.endTime,
    priceReais: slot.priceReais,
    arena: arena,
    slot: slot,
  );
}

SlotsSuggestion _nearbyArenaSuggestion({
  required ArenaSearchResult result,
  required double? kmDistance,
  required int freeSlotsCount,
  required DateTime day,
}) {
  final slot = result.selectedSlot!;
  final kmPart = kmDistance != null
      ? 'A ${kmDistance.toStringAsFixed(1)} km · '
      : '';
  final weekday = formatWeekdayShort(day);
  final slotsLabel = freeSlotsCount == 1
      ? '1 horário no $weekday'
      : '$freeSlotsCount horários no $weekday';
  return SlotsSuggestion(
    kind: SlotsSuggestionKind.nearbyArena,
    title: '${result.arena.name} · ${formatCompactSlotTime(slot.startTime)}',
    subtitle: '$kmPart$slotsLabel',
    actionLabel: 'Ver',
    actionStyle: SlotsSuggestionActionStyle.outlined,
    icon: Icons.place_rounded,
    iconBackground: AppColors.pending.withValues(alpha: 0.35),
    arenaId: result.arena.id,
    courtId: slot.courtId,
    date: day,
    startTime: slot.startTime,
    endTime: slot.endTime,
    priceReais: slot.priceReais,
    kmDistance: kmDistance,
    arena: result.arena,
    slot: slot,
    freeSlotsOnDay: freeSlotsCount,
  );
}

final slotsAlternativeCourtSuggestionProvider = FutureProvider.autoDispose
    .family<SlotsSuggestion?, SlotsSuggestionsParams>((ref, params) async {
  if (!params.enabled) return null;

  final summaries = await ref.watch(
    slotsCourtDaySummaryProvider((
      arenaId: params.arena.id,
      date: params.selectedDay,
      arena: params.arena,
    )).future,
  );

  final picked = pickAlternateCourtSummary(
    summaries: summaries,
    selectedCourtId: params.courtId,
  );
  if (picked == null) return null;

  final day = slotDayOnly(params.selectedDay);
  final query = SlotsQuery(
    arenaId: params.arena.id,
    courtId: picked.court.id,
    date: day,
    arenaFallbackPricePerHourReais: params.arena.pricePerHourReais,
  );
  final slots = await ref.watch(slotsStreamProvider(query).future);
  final slot = firstFreeSlot(slots, day);
  if (slot == null) return null;

  return _alternateCourtSuggestion(
    arena: params.arena,
    summary: picked,
    slot: slot,
  );
});

final slotsNextDaySuggestionProvider = FutureProvider.autoDispose
    .family<SlotsSuggestion?, SlotsSuggestionsParams>((ref, params) async {
  if (!params.enabled) return null;

  final calParams = SlotsCalendarParams(
    arenaId: params.arena.id,
    courtId: params.courtId,
    startDay: slotDayOnly(DateTime.now()),
    daysCount: 21,
    arenaFallbackPricePerHour: params.arena.pricePerHourReais,
  );
  final calendar =
      await ref.watch(slotsCalendarAvailabilityProvider(calParams).future);

  final nextDay = pickNextAvailableDayAfter(
    calendar: calendar,
    selectedDay: params.selectedDay,
  );
  if (nextDay == null) return null;

  final query = SlotsQuery(
    arenaId: params.arena.id,
    courtId: params.courtId,
    date: nextDay,
    arenaFallbackPricePerHourReais: params.arena.pricePerHourReais,
  );
  final slots = await ref.watch(slotsStreamProvider(query).future);
  final slot = firstFreeSlot(slots, nextDay);
  if (slot == null) return null;

  return _nextDaySuggestion(
    arena: params.arena,
    courtId: params.courtId,
    courtName: params.courtName,
    day: nextDay,
    slot: slot,
  );
});

Future<int> _countArenaFreeSlotsOnDay(
  Ref ref,
  ArenaListItem arena,
  DateTime day,
) async {
  final courts = await ref.watch(courtsStreamProvider(arena.id).future);
  final dayOnly = slotDayOnly(day);
  final now = DateTime.now();
  var total = 0;
  for (final court in courts) {
    if (court.isMaintenance) continue;
    final query = SlotsQuery(
      arenaId: arena.id,
      courtId: court.id,
      date: dayOnly,
      arenaFallbackPricePerHourReais: arena.pricePerHourReais,
    );
    final slots = await ref.watch(slotsStreamProvider(query).future);
    total += countFreeSlotsForDay(slots, dayOnly, now: now);
  }
  return total;
}

final slotsNearbyArenaSuggestionsProvider = FutureProvider.autoDispose
    .family<List<SlotsSuggestion>, SlotsSuggestionsParams>((ref, params) async {
  if (!params.enabled) return const [];

  final day = slotDayOnly(params.selectedDay);
  final slotFilters = ArenaSearchSlotFilters(
    date: day,
    requestedTime: const TimeOfDay(hour: 10, minute: 0),
    flexibleTime: true,
  );

  final allResults =
      await ref.watch(arenaSearchResultsProvider(slotFilters).future);
  final user = ref.watch(userLocationProvider).valueOrNull ??
      const UserLocationSnapshot(source: UserLocationSource.none);

  final ranked = rankNearbyArenaSuggestions(
    results: allResults,
    excludeArenaId: params.arena.id,
    user: user,
    limit: 3,
  );

  final out = <SlotsSuggestion>[];
  for (final entry in ranked) {
    final freeCount =
        await _countArenaFreeSlotsOnDay(ref, entry.result.arena, day);
    out.add(
      _nearbyArenaSuggestion(
        result: entry.result,
        kmDistance: entry.kmDistance,
        freeSlotsCount: freeCount > 0 ? freeCount : 1,
        day: day,
      ),
    );
  }
  return out;
});

final slotsSmartSuggestionsProvider = FutureProvider.autoDispose
    .family<List<SlotsSuggestion>, SlotsSuggestionsParams>((ref, params) async {
  if (!params.enabled) return const [];

  final alternate =
      await ref.watch(slotsAlternativeCourtSuggestionProvider(params).future);
  final nextDay =
      await ref.watch(slotsNextDaySuggestionProvider(params).future);
  final nearby =
      await ref.watch(slotsNearbyArenaSuggestionsProvider(params).future);

  return mergeSmartSuggestions(
    alternateCourt: alternate,
    nextDay: nextDay,
    nearby: nearby,
  );
});

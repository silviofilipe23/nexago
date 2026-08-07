import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/location/user_location_providers.dart';
import '../../../core/location/user_location_snapshot.dart';
import '../../../features/athlete/domain/athlete_profile_providers.dart';
import '../../../features/athlete/domain/favorites_providers.dart';
import 'arena_court.dart';
import 'arena_list_item.dart';
import 'arena_search_filter_logic.dart';
import 'arena_search_filters.dart';
import 'arena_slot.dart';
import 'arenas_providers.dart';
import 'court_pricing.dart';
import 'nearby_arenas_logic.dart';
import 'slots_providers.dart';
import 'slots_query.dart';

export 'arena_search_filters.dart';

class ArenaSearchResult {
  const ArenaSearchResult({
    required this.arena,
    required this.selectedSlot,
    required this.courtName,
    required this.isExactMatch,
    required this.minutesDistance,
    required this.displayPricePerHourReais,
    this.showStartingFrom = false,
    this.availableCourtsCount = 0,
  });

  final ArenaListItem arena;
  final ArenaSlot? selectedSlot;
  final String? courtName;
  final bool isExactMatch;
  final int? minutesDistance;
  final double displayPricePerHourReais;
  final bool showStartingFrom;
  final int availableCourtsCount;

  bool get hasAvailability => selectedSlot != null;
}

final arenaSearchResultsProvider = FutureProvider.autoDispose
    .family<List<ArenaSearchResult>, ArenaSearchSlotFilters>(
  (ref, slotFilters) async {
    // Única leitura que inclui pré-cadastro: a busca é onde a arena não
    // parceira existe para ser descoberta e receber o clique de contato.
    final arenas =
        await ref.watch(arenasIncludingUnclaimedStreamProvider.future);
    final results = await Future.wait(
      arenas.map((arena) => buildArenaSearchResult(ref, slotFilters, arena)),
    );
    results.sort(compareArenaSearchResults);
    return results;
  },
);

final arenaSearchFilteredProvider = Provider.autoDispose
    .family<List<FilteredArenaSearchResult>, ArenaSearchFilters>((ref, filters) {
  final slotAsync = ref.watch(arenaSearchResultsProvider(filters.slot));
  final location = ref.watch(userLocationProvider).valueOrNull ??
      const UserLocationSnapshot(source: UserLocationSource.none);
  final favorites =
      ref.watch(favoriteArenaIdsProvider).valueOrNull ?? const <String>[];

  return slotAsync.maybeWhen(
    data: (slotResults) => filterAndSortArenaResults(
      results: slotResults,
      filters: filters,
      userLocation: location,
      favoriteIds: favorites.toSet(),
    ),
    orElse: () => const <FilteredArenaSearchResult>[],
  );
});

Future<ArenaSearchResult> buildArenaSearchResult(
  Ref ref,
  ArenaSearchSlotFilters filters,
  ArenaListItem arena,
) async {
  // Pré-cadastrada não tem quadra nem slot: assinar `courtsStreamProvider` seria
  // um listener por arena à toa em cada busca. Sai sem disponibilidade e sem preço.
  if (arena.isUnclaimed) {
    return ArenaSearchResult(
      arena: arena,
      selectedSlot: null,
      courtName: null,
      isExactMatch: false,
      minutesDistance: null,
      displayPricePerHourReais: 0,
    );
  }

  final courts = await ref.watch(courtsStreamProvider(arena.id).future);
  final minCourtPrice = CourtPricing.minHourlyPriceAmongCourts(courts);
  final displayPrice = minCourtPrice ?? arena.pricePerHourReais;
  final showStartingFrom = minCourtPrice != null;

  if (courts.isEmpty) {
    return ArenaSearchResult(
      arena: arena,
      selectedSlot: null,
      courtName: null,
      isExactMatch: false,
      minutesDistance: null,
      displayPricePerHourReais: displayPrice,
    );
  }

  final allSlots = <({ArenaSlot slot, ArenaCourt court})>[];
  for (final court in courts) {
    final query = SlotsQuery(
      arenaId: arena.id,
      courtId: court.id,
      date: filters.dateOnly,
      arenaFallbackPricePerHourReais: arena.pricePerHourReais,
    );
    final slots = await ref.watch(slotsStreamProvider(query).future);
    for (final slot in slots) {
      if (!slot.isAvailable) continue;
      if (isPastArenaSlot(filters.dateOnly, slot.startTime)) continue;
      allSlots.add((slot: slot, court: court));
    }
  }

  final availableCourtsCount =
      allSlots.map((e) => e.court.id).toSet().length;

  if (allSlots.isEmpty) {
    return ArenaSearchResult(
      arena: arena,
      selectedSlot: null,
      courtName: null,
      isExactMatch: false,
      minutesDistance: null,
      displayPricePerHourReais: displayPrice,
      showStartingFrom: showStartingFrom,
    );
  }

  if (filters.flexibleTime) {
    allSlots.sort(
      (a, b) => arenaSlotTimeToMinutes(a.slot.startTime)
          .compareTo(arenaSlotTimeToMinutes(b.slot.startTime)),
    );
    final picked = allSlots.first;
    final startMinutes = arenaSlotTimeToMinutes(picked.slot.startTime);
    final delta = (startMinutes - filters.requestedMinutes).abs();
    return ArenaSearchResult(
      arena: arena,
      selectedSlot: picked.slot,
      courtName: picked.court.name,
      isExactMatch: false,
      minutesDistance: delta,
      displayPricePerHourReais: displayPrice,
      showStartingFrom: showStartingFrom,
      availableCourtsCount: availableCourtsCount,
    );
  }

  ({ArenaSlot slot, ArenaCourt court})? exact;
  ({ArenaSlot slot, ArenaCourt court})? nearest;
  int? nearestDistance;
  int? nearestSignedDelta;
  final requested = filters.requestedMinutes;

  for (final entry in allSlots) {
    final startMinutes = arenaSlotTimeToMinutes(entry.slot.startTime);
    if (startMinutes == requested) {
      exact = entry;
      break;
    }

    final signedDelta = startMinutes - requested;
    final distance = signedDelta.abs();
    final replaceCurrent = nearestDistance == null ||
        distance < nearestDistance ||
        (distance == nearestDistance &&
            preferArenaSlotSignedDelta(signedDelta, nearestSignedDelta));
    if (replaceCurrent) {
      nearest = entry;
      nearestDistance = distance;
      nearestSignedDelta = signedDelta;
    }
  }

  final picked = exact ?? nearest;
  return ArenaSearchResult(
    arena: arena,
    selectedSlot: picked?.slot,
    courtName: picked?.court.name,
    isExactMatch: exact != null,
    minutesDistance: exact != null ? 0 : nearestDistance,
    displayPricePerHourReais: displayPrice,
    showStartingFrom: showStartingFrom,
    availableCourtsCount: availableCourtsCount,
  );
}

bool preferArenaSlotSignedDelta(int candidate, int? current) {
  if (current == null) return true;
  if (candidate >= 0 && current < 0) return true;
  return false;
}

/// Pré-cadastrada nunca disputa lugar com parceira: não dá para reservar nela.
int _arenaSearchRank(ArenaSearchResult r) {
  if (r.arena.isUnclaimed) return 3;
  return r.isExactMatch ? 0 : (r.hasAvailability ? 1 : 2);
}

int compareArenaSearchResults(ArenaSearchResult a, ArenaSearchResult b) {
  final aRank = _arenaSearchRank(a);
  final bRank = _arenaSearchRank(b);
  if (aRank != bRank) return aRank.compareTo(bRank);

  final aDist = a.minutesDistance ?? 99999;
  final bDist = b.minutesDistance ?? 99999;
  if (aDist != bDist) return aDist.compareTo(bDist);
  return a.arena.name.toLowerCase().compareTo(b.arena.name.toLowerCase());
}

bool isPastArenaSlot(DateTime selectedDate, String startTime) {
  final now = DateTime.now();
  final day = DateTime(selectedDate.year, selectedDate.month, selectedDate.day);
  final today = DateTime(now.year, now.month, now.day);
  if (day.isAfter(today)) return false;
  if (day.isBefore(today)) return true;
  final minutes = arenaSlotTimeToMinutes(startTime);
  final startAt =
      DateTime(day.year, day.month, day.day, minutes ~/ 60, minutes % 60);
  return startAt.isBefore(now);
}

int arenaSlotTimeToMinutes(String value) {
  final parts = value.split(':');
  final hh = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
  final mm = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return hh * 60 + mm;
}

ArenaSearchResult placeholderArenaSearchResult(ArenaListItem arena) {
  return ArenaSearchResult(
    arena: arena,
    selectedSlot: null,
    courtName: null,
    isExactMatch: false,
    minutesDistance: null,
    displayPricePerHourReais: arena.pricePerHourReais,
  );
}

final myBookingsNearbyTodayProvider =
    FutureProvider.autoDispose<MyBookingsNearbySnapshot>((ref) async {
  ref.watch(athleteProfileProvider);
  final now = DateTime.now();
  final slotFilters = ArenaSearchSlotFilters(
    date: DateTime(now.year, now.month, now.day),
    requestedTime: TimeOfDay(hour: now.hour, minute: now.minute),
  );
  final userLocation = await ref.watch(userLocationProvider.future);
  final arenas = await ref.watch(partnerArenasStreamProvider.future);
  final nearbyItems = filterArenasByProximity(
    arenas: arenas,
    user: userLocation,
  );

  final searchById = <String, ArenaSearchResult>{};
  try {
    final searchResults =
        await ref.watch(arenaSearchResultsProvider(slotFilters).future);
    for (final r in searchResults) {
      searchById[r.arena.id] = r;
    }
  } catch (_) {}

  final inRegion = nearbyItems
      .map((a) => searchById[a.id] ?? placeholderArenaSearchResult(a))
      .toList(growable: false);

  final available =
      inRegion.where((r) => r.hasAvailability).toList(growable: false);
  final rankedWithSlots = rankAvailableArenasByProximity(
    available: available,
    user: userLocation,
  );
  final rankedInRegion = rankAvailableArenasByProximity(
    available: inRegion,
    user: userLocation,
  );
  final displayRanked =
      rankedWithSlots.isNotEmpty ? rankedWithSlots : rankedInRegion;
  final top =
      displayRanked.take(3).map((e) => e.result).toList(growable: false);
  return MyBookingsNearbySnapshot(
    totalAvailableToday: rankedWithSlots.length,
    topArenas: top,
    rankedArenas: displayRanked,
    slotFilters: slotFilters,
    userLocation: userLocation,
  );
});

class MyBookingsNearbySnapshot {
  const MyBookingsNearbySnapshot({
    required this.totalAvailableToday,
    required this.topArenas,
    required this.rankedArenas,
    required this.slotFilters,
    required this.userLocation,
  });

  final int totalAvailableToday;
  final List<ArenaSearchResult> topArenas;
  final List<RankedArenaSearchResult> rankedArenas;
  final ArenaSearchSlotFilters slotFilters;
  final UserLocationSnapshot userLocation;

  String get proximityPhrase => userLocation.proximityPhrase;

  String get sectionTitlePrefix => userLocation.sectionTitlePrefix;
}

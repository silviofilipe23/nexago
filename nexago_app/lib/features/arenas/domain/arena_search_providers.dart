import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/location/user_location_providers.dart';
import '../../../core/location/user_location_snapshot.dart';
import '../../../features/athlete/domain/athlete_profile_providers.dart';
import 'arena_court.dart';
import 'arena_list_item.dart';
import 'arena_slot.dart';
import 'arenas_providers.dart';
import 'court_pricing.dart';
import 'nearby_arenas_logic.dart';
import 'slots_providers.dart';
import 'slots_query.dart';

@immutable
class ArenaSearchFilters {
  const ArenaSearchFilters({
    required this.date,
    required this.requestedTime,
  });

  final DateTime date;
  final TimeOfDay requestedTime;

  int get requestedMinutes => requestedTime.hour * 60 + requestedTime.minute;

  DateTime get dateOnly => DateTime(date.year, date.month, date.day);

  String get requestedTimeLabel {
    final hh = requestedTime.hour.toString().padLeft(2, '0');
    final mm = requestedTime.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ArenaSearchFilters &&
        other.dateOnly.year == dateOnly.year &&
        other.dateOnly.month == dateOnly.month &&
        other.dateOnly.day == dateOnly.day &&
        other.requestedMinutes == requestedMinutes;
  }

  @override
  int get hashCode => Object.hash(
        dateOnly.year,
        dateOnly.month,
        dateOnly.day,
        requestedMinutes,
      );
}

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

  /// Quadras com pelo menos um slot livre no dia filtrado.
  final int availableCourtsCount;

  bool get hasAvailability => selectedSlot != null;
}

final arenaSearchResultsProvider = FutureProvider.autoDispose
    .family<List<ArenaSearchResult>, ArenaSearchFilters>(
  (ref, filters) async {
    final arenas = await ref.watch(arenasStreamProvider.future);
    final results = await Future.wait(
      arenas.map((arena) => buildArenaSearchResult(ref, filters, arena)),
    );
    results.sort(compareArenaSearchResults);
    return results;
  },
);

Future<ArenaSearchResult> buildArenaSearchResult(
  Ref ref,
  ArenaSearchFilters filters,
  ArenaListItem arena,
) async {
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

int compareArenaSearchResults(ArenaSearchResult a, ArenaSearchResult b) {
  final aRank = a.isExactMatch ? 0 : (a.hasAvailability ? 1 : 2);
  final bRank = b.isExactMatch ? 0 : (b.hasAvailability ? 1 : 2);
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

/// Resultado mínimo quando a busca de horários falha ou ainda não carregou.
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

/// Arenas próximas para empty state de Minhas reservas.
final myBookingsNearbyTodayProvider =
    FutureProvider.autoDispose<MyBookingsNearbySnapshot>((ref) async {
  ref.watch(athleteProfileProvider);
  final now = DateTime.now();
  final filters = ArenaSearchFilters(
    date: DateTime(now.year, now.month, now.day),
    requestedTime: TimeOfDay(hour: now.hour, minute: now.minute),
  );
  final userLocation = await ref.watch(userLocationProvider.future);
  final arenas = await ref.watch(arenasStreamProvider.future);
  final nearbyItems = filterArenasByProximity(
    arenas: arenas,
    user: userLocation,
  );

  final searchById = <String, ArenaSearchResult>{};
  try {
    final searchResults =
        await ref.watch(arenaSearchResultsProvider(filters).future);
    for (final r in searchResults) {
      searchById[r.arena.id] = r;
    }
  } catch (_) {
    // Horários indisponíveis — ainda listamos arenas da região.
  }

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
    filters: filters,
    userLocation: userLocation,
  );
});

class MyBookingsNearbySnapshot {
  const MyBookingsNearbySnapshot({
    required this.totalAvailableToday,
    required this.topArenas,
    required this.rankedArenas,
    required this.filters,
    required this.userLocation,
  });

  final int totalAvailableToday;
  final List<ArenaSearchResult> topArenas;
  final List<RankedArenaSearchResult> rankedArenas;
  final ArenaSearchFilters filters;
  final UserLocationSnapshot userLocation;

  String get proximityPhrase => userLocation.proximityPhrase;

  String get sectionTitlePrefix => userLocation.sectionTitlePrefix;
}

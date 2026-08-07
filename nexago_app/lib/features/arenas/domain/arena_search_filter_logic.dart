import '../../../core/location/user_location_snapshot.dart';
import 'arena_list_item.dart';
import 'arena_search_metadata.dart';
import 'arena_search_providers.dart';
import 'nearby_arenas_logic.dart';

class FilteredArenaSearchResult {
  const FilteredArenaSearchResult({required this.result, this.kmDistance});

  final ArenaSearchResult result;
  final double? kmDistance;
}

bool isSearchDateToday(DateTime date) {
  final now = DateTime.now();
  final d = DateTime(date.year, date.month, date.day);
  final today = DateTime(now.year, now.month, now.day);
  return d == today;
}

int countActiveSearchFilters(ArenaSearchFilters filters) {
  var n = 0;
  if (filters.usesRadiusLimit &&
      filters.radiusKm != ArenaSearchFilters.defaultRadiusKm) {
    n++;
  }
  if (filters.priceBand != ArenaPriceBand.any) n++;
  if (filters.surfaces.isNotEmpty) n++;
  if (filters.requiredAmenities.hasAny) n++;
  if (filters.paymentMethods.isNotEmpty) n++;
  if (filters.minReputationScore > 0) n++;
  if (filters.sportChip != ArenaSportChip.all &&
      filters.sportChip != ArenaSearchFilters.defaultSportChip) {
    n++;
  }
  return n;
}

Set<String> bestPriceArenaIds(Iterable<ArenaSearchResult> results) {
  final withSlot = results
      .where((r) => r.hasAvailability)
      .toList(growable: false);
  if (withSlot.isEmpty) return const {};

  var minPrice = withSlot.first.displayPricePerHourReais;
  for (final r in withSlot) {
    if (r.displayPricePerHourReais < minPrice) {
      minPrice = r.displayPricePerHourReais;
    }
  }

  return withSlot
      .where((r) => r.displayPricePerHourReais == minPrice)
      .map((r) => r.arena.id)
      .toSet();
}

/// `courtTypes` ainda não sincronizado ou só com rótulos legados → não filtrar por esporte.
bool arenaHasIndexedSportMetadata(ArenaListItem arena) {
  if (arena.courtTypes.isEmpty) return false;
  for (final raw in arena.courtTypes) {
    final t = raw.toLowerCase();
    for (final label in ArenaSearchMetadata.sportLabels) {
      final key = label.toLowerCase();
      if (t.contains(key) || key.contains(t)) return true;
    }
    if (ArenaSearchMetadata.isSurfaceLabel(raw)) return true;
  }
  return false;
}

bool arenaMatchesSportChip(ArenaListItem arena, ArenaSportChip chip) {
  if (chip == ArenaSportChip.all) return true;
  if (arena.courtTypes.isEmpty) return true;
  if (!arenaHasIndexedSportMetadata(arena)) return true;
  final types = arena.courtTypes.map((t) => t.toLowerCase()).join(' ');
  final name = arena.name.toLowerCase();
  final blob = '$types $name';

  return switch (chip) {
    ArenaSportChip.beachTennis =>
      blob.contains('beach') ||
          blob.contains('praia') ||
          blob.contains('areia') ||
          blob.contains('tênis') ||
          blob.contains('tenis'),
    ArenaSportChip.beachVolleyball =>
      blob.contains('beach') ||
          blob.contains('praia') ||
          blob.contains('areia') ||
          blob.contains('vôlei') ||
          blob.contains('volei') ||
          blob.contains('volleyball') ||
          blob.contains('futevôlei') ||
          blob.contains('futevolei'),
    ArenaSportChip.tennis =>
      blob.contains('tênis') ||
          blob.contains('tenis') ||
          blob.contains('tennis'),
    ArenaSportChip.padel =>
      blob.contains('padel') || blob.contains('pádel') || blob.contains('pickle'),
    ArenaSportChip.volleyball =>
      blob.contains('vôlei') || blob.contains('volleyball'),
    ArenaSportChip.football =>
      blob.contains('futebol') || blob.contains('football'),
    ArenaSportChip.all => true,
  };
}

bool arenaMatchesSurface(ArenaListItem arena, Set<String> surfaces) {
  if (surfaces.isEmpty) return true;
  final labels = arena.surfaces.isNotEmpty
      ? arena.surfaces
      : arena.courtTypes;
  final types = labels.map((t) => t.toLowerCase()).toList();
  for (final surface in surfaces) {
    final key = surface.toLowerCase();
    final match = types.any((t) {
      if (key == 'areia') {
        return t.contains('areia') || t.contains('praia') || t.contains('sand');
      }
      if (key == 'sintética' || key == 'sintetica') {
        return t.contains('sintét') ||
            t.contains('sintet') ||
            t.contains('synthetic');
      }
      if (key == 'saibro') return t.contains('saibro') || t.contains('clay');
      if (key == 'grama') {
        return t.contains('grama') ||
            t.contains('grass') ||
            t.contains('natural');
      }
      if (key == 'concreto') {
        return t.contains('concreto') ||
            t.contains('cimento') ||
            t.contains('hard');
      }
      return t.contains(key);
    });
    if (match) return true;
  }
  return false;
}

bool arenaMatchesPriceBand(double price, ArenaPriceBand band) {
  return switch (band) {
    ArenaPriceBand.any => true,
    ArenaPriceBand.upTo60 => price <= 60,
    ArenaPriceBand.band60_100 => price > 60 && price <= 100,
    ArenaPriceBand.band100_150 => price > 100 && price <= 150,
    ArenaPriceBand.plus150 => price > 150,
  };
}

bool arenaMatchesPayment(ArenaListItem arena, ArenaPaymentFilter payment) {
  return switch (payment) {
    ArenaPaymentFilter.any => true,
    ArenaPaymentFilter.pix => arena.onlinePaymentEnabled,
    ArenaPaymentFilter.onsite => arena.onsitePaymentEnabled,
    ArenaPaymentFilter.card => arena.onlinePaymentEnabled,
  };
}

bool arenaMatchesPaymentMethods(
  ArenaListItem arena,
  Set<ArenaPaymentFilter> methods,
) {
  if (methods.isEmpty) return true;
  for (final method in methods) {
    if (method == ArenaPaymentFilter.any) continue;
    if (arenaMatchesPayment(arena, method)) return true;
  }
  return false;
}

bool arenaMatchesQuery(ArenaListItem arena, String query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return true;
  final place = arenaPlaceFields(arena);
  final haystack = [
    arena.name,
    arena.locationLabel,
    place.city,
    place.state,
    arena.addressLine ?? '',
  ].join(' ').toLowerCase();
  return haystack.contains(q);
}

/// Filtros que são uma promessa da arena parceira (preço, forma de pagamento,
/// comodidade, reputação). A pré-cadastrada não faz nenhuma dessas promessas —
/// só temos nome, endereço, esporte e WhatsApp dela — então listá-la aqui seria
/// afirmar algo que não sabemos. Fora esses, ela concorre normal: busca por
/// texto, esporte e superfície funcionam com o que foi semeado.
bool _unclaimedSurvivesFilters(ArenaSearchFilters filters) {
  return filters.priceBand == ArenaPriceBand.any &&
      filters.paymentMethods.isEmpty &&
      !filters.requiredAmenities.hasAny &&
      filters.minReputationScore <= 0;
}

List<FilteredArenaSearchResult> filterAndSortArenaResults({
  required List<ArenaSearchResult> results,
  required ArenaSearchFilters filters,
  required UserLocationSnapshot userLocation,
  required Set<String> favoriteIds,
}) {
  final filtered = <FilteredArenaSearchResult>[];

  for (final result in results) {
    final arena = result.arena;
    if (arena.isUnclaimed && !_unclaimedSurvivesFilters(filters)) {
      continue;
    }
    if (filters.showOnlyFavorites && !favoriteIds.contains(arena.id)) {
      continue;
    }
    if (!arenaMatchesQuery(arena, filters.query)) continue;
    if (!arenaMatchesSportChip(arena, filters.sportChip)) continue;
    if (!arenaMatchesSurface(arena, filters.surfaces)) continue;
    if (!arenaMatchesPriceBand(
      result.displayPricePerHourReais,
      filters.priceBand,
    )) {
      continue;
    }
    if (!arena.amenities.matchesRequirements(filters.requiredAmenities)) {
      continue;
    }
    if (!arenaMatchesPaymentMethods(arena, filters.paymentMethods)) continue;
    if (arena.reputationScore < filters.minReputationScore) continue;

    final km = kmFromUserToArena(arena, userLocation);
    if (filters.usesRadiusLimit && km != null && km > filters.radiusKm) {
      continue;
    }

    filtered.add(FilteredArenaSearchResult(result: result, kmDistance: km));
  }

  filtered.sort((a, b) => _compareFiltered(a, b, filters.sortBy));
  return filtered;
}

int _compareFiltered(
  FilteredArenaSearchResult a,
  FilteredArenaSearchResult b,
  ArenaSearchSortBy sortBy,
) {
  return switch (sortBy) {
    ArenaSearchSortBy.distance => _compareNullableDouble(
      a.kmDistance,
      b.kmDistance,
      fallback: () => compareArenaSearchResults(a.result, b.result),
    ),
    ArenaSearchSortBy.price => a.result.displayPricePerHourReais.compareTo(
      b.result.displayPricePerHourReais,
    ),
    ArenaSearchSortBy.rating => b.result.arena.ratingAverage.compareTo(
      a.result.arena.ratingAverage,
    ),
    ArenaSearchSortBy.score => b.result.arena.reputationScore.compareTo(
      a.result.arena.reputationScore,
    ),
  };
}

int _compareNullableDouble(
  double? a,
  double? b, {
  required int Function() fallback,
}) {
  if (a == null && b == null) return fallback();
  if (a == null) return 1;
  if (b == null) return -1;
  final c = a.compareTo(b);
  return c != 0 ? c : fallback();
}

/// Estima ganho de opções com horário flexível (para banner).
int estimateFlexibleOptionsBoostPercent({
  required List<ArenaSearchResult> strictResults,
  required List<ArenaSearchResult> flexibleResults,
}) {
  final strictCount = strictResults.where((r) => r.hasAvailability).length;
  final flexCount = flexibleResults.where((r) => r.hasAvailability).length;
  if (strictCount == 0) return flexCount > 0 ? 35 : 0;
  final pct = ((flexCount - strictCount) / strictCount * 100).round();
  return pct.clamp(0, 99);
}

ArenaSportChip defaultSportChipFromProfile({
  String? primarySport,
  String? sport,
}) {
  final firestore = (primarySport ?? '').trim().toUpperCase();
  if (firestore.isNotEmpty) {
    return switch (firestore) {
      'VOLEI_PRAIA' || 'BEACH_VOLLEYBALL' => ArenaSportChip.beachVolleyball,
      'VOLEI_QUADRA' || 'INDOOR_VOLLEYBALL' => ArenaSportChip.volleyball,
      'BEACH_TENNIS' => ArenaSportChip.beachTennis,
      'TENIS' => ArenaSportChip.tennis,
      'FUTEBOL' || 'FOOTBALL' => ArenaSportChip.football,
      _ =>
        _sportChipFromLabel(sport ?? primarySport ?? '') ??
            ArenaSportChip.beachVolleyball,
    };
  }

  final fromLabel = _sportChipFromLabel(sport ?? '');
  return fromLabel ?? ArenaSportChip.beachVolleyball;
}

ArenaSportChip? _sportChipFromLabel(String raw) {
  final v = raw.toLowerCase();
  if (v.isEmpty) return null;
  if (v.contains('vôlei de praia') ||
      v.contains('volei de praia') ||
      v.contains('beach_volleyball') ||
      v.contains('volei_praia')) {
    return ArenaSportChip.beachVolleyball;
  }
  if (v.contains('beach') &&
      (v.contains('tênis') || v.contains('tenis') || v.contains('tennis'))) {
    return ArenaSportChip.beachTennis;
  }
  if (v.contains('vôlei') || v.contains('volei') || v.contains('volleyball')) {
    return v.contains('praia') || v.contains('beach')
        ? ArenaSportChip.beachVolleyball
        : ArenaSportChip.volleyball;
  }
  if (v.contains('padel') || v.contains('pádel')) {
    return ArenaSportChip.padel;
  }
  if (v.contains('tênis') || v.contains('tenis')) {
    return ArenaSportChip.tennis;
  }
  if (v.contains('futebol') || v.contains('football')) {
    return ArenaSportChip.football;
  }
  if (v.contains('beach') || v.contains('praia')) {
    return ArenaSportChip.beachVolleyball;
  }
  return null;
}

import '../../../core/location/br_locations_data.dart';
import '../../../core/location/geo_distance.dart';
import '../../../core/location/user_location_snapshot.dart';
import 'arena_list_item.dart';
import 'arena_search_providers.dart';

/// Raio padrão para considerar arena "perto" (GPS).
const defaultNearbyRadiusKm = 40.0;

class RankedArenaSearchResult {
  const RankedArenaSearchResult({
    required this.result,
    this.kmDistance,
  });

  final ArenaSearchResult result;
  final double? kmDistance;
}

/// Extrai cidade e UF de campos separados ou legado (`Goiânia · GO` no `city`).
({String city, String state}) arenaPlaceFields(ArenaListItem arena) {
  var city = arena.city?.trim() ?? '';
  var state = BrLocationsData.resolveStateSigla(arena.state);

  if (city.contains(',') && !city.contains('·')) {
    city = city.replaceFirst(',', ' · ');
  }
  if (city.isNotEmpty) {
    final parsed = BrLocationsData.parseLegacyLocation(city);
    if (parsed.city.isNotEmpty &&
        (city.contains('·') || city.contains(',') || state.isEmpty)) {
      city = parsed.city;
    }
    if (state.isEmpty && parsed.state.isNotEmpty) {
      state = BrLocationsData.resolveStateSigla(parsed.state);
    }
  }

  if (city.isNotEmpty || state.isNotEmpty) {
    return (city: city, state: state);
  }

  var raw = arena.locationLabel.trim();
  if (raw.contains(',') && !raw.contains('·')) {
    raw = raw.replaceFirst(',', ' · ');
  }
  final parsed = BrLocationsData.parseLegacyLocation(raw);
  return (
    city: parsed.city,
    state: BrLocationsData.resolveStateSigla(parsed.state),
  );
}

bool arenaMatchesProfilePlace(ArenaListItem arena, UserLocationSnapshot user) {
  if (!user.hasProfilePlace) return false;

  final userCity = BrLocationsData.normalizeLocationToken(user.city);
  final userState = BrLocationsData.resolveStateSigla(user.state);
  final arenaPlace = arenaPlaceFields(arena);
  final arenaCity = BrLocationsData.normalizeLocationToken(arenaPlace.city);
  final arenaState = BrLocationsData.resolveStateSigla(arenaPlace.state);

  if (userState.isNotEmpty && arenaState.isNotEmpty && arenaState != userState) {
    return false;
  }
  if (userCity.isNotEmpty && arenaCity.isNotEmpty) {
    return arenaCity == userCity;
  }
  if (userCity.isNotEmpty && arenaCity.isEmpty) {
    final label = BrLocationsData.normalizeLocationToken(arena.locationLabel);
    return label.contains(userCity);
  }
  return userState.isNotEmpty &&
      arenaState.isNotEmpty &&
      arenaState == userState;
}

double? kmFromUserToArena(ArenaListItem arena, UserLocationSnapshot user) {
  if (!user.hasCoordinates) return null;
  final lat = arena.latitude;
  final lng = arena.longitude;
  if (lat == null || lng == null) return null;
  return haversineDistanceKm(
    lat1: user.latitude!,
    lon1: user.longitude!,
    lat2: lat,
    lon2: lng,
  );
}

bool isArenaNearUser({
  required ArenaListItem arena,
  required UserLocationSnapshot user,
  double maxRadiusKm = defaultNearbyRadiusKm,
}) {
  if (user.hasProfilePlace && arenaMatchesProfilePlace(arena, user)) {
    return true;
  }

  switch (user.source) {
    case UserLocationSource.gps:
      final km = kmFromUserToArena(arena, user);
      if (km != null) return km <= maxRadiusKm;
      return false;
    case UserLocationSource.profile:
      return false;
    case UserLocationSource.none:
      return true;
  }
}

/// Filtra e ordena resultados com disponibilidade pela proximidade do usuário.
List<RankedArenaSearchResult> rankAvailableArenasByProximity({
  required List<ArenaSearchResult> available,
  required UserLocationSnapshot user,
  double maxRadiusKm = defaultNearbyRadiusKm,
}) {
  if (user.source == UserLocationSource.none) {
    final sorted = List<ArenaSearchResult>.from(available)
      ..sort(compareArenaSearchResults);
    return sorted
        .map((r) => RankedArenaSearchResult(result: r))
        .toList(growable: false);
  }

  final near = <RankedArenaSearchResult>[];
  for (final result in available) {
    if (!isArenaNearUser(
      arena: result.arena,
      user: user,
      maxRadiusKm: maxRadiusKm,
    )) {
      continue;
    }
    near.add(
      RankedArenaSearchResult(
        result: result,
        kmDistance: kmFromUserToArena(result.arena, user),
      ),
    );
  }

  near.sort((a, b) {
    final aKm = a.kmDistance;
    final bKm = b.kmDistance;
    if (aKm != null && bKm != null) {
      final cmp = aKm.compareTo(bKm);
      if (cmp != 0) return cmp;
    } else if (aKm != null) {
      return -1;
    } else if (bKm != null) {
      return 1;
    }
    return compareArenaSearchResults(a.result, b.result);
  });

  return near;
}

/// Filtra documentos de arena pela mesma regra de proximidade.
List<ArenaListItem> filterArenasByProximity({
  required List<ArenaListItem> arenas,
  required UserLocationSnapshot user,
  double maxRadiusKm = defaultNearbyRadiusKm,
}) {
  if (user.source == UserLocationSource.none) {
    return List<ArenaListItem>.from(arenas);
  }
  return arenas
      .where(
        (a) => isArenaNearUser(
          arena: a,
          user: user,
          maxRadiusKm: maxRadiusKm,
        ),
      )
      .toList(growable: false);
}

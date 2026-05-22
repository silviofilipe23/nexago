import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/location/geo_distance.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/nearby_arenas_logic.dart';

ArenaSearchResult _result({
  required String id,
  String? city,
  String? state,
  double? lat,
  double? lng,
}) {
  final arena = ArenaListItem(
    id: id,
    name: 'Arena $id',
    locationLabel: city ?? 'Local',
    pricePerHourReais: 80,
    city: city,
    state: state,
    latitude: lat,
    longitude: lng,
  );
  return ArenaSearchResult(
    arena: arena,
    selectedSlot: ArenaSlot(
      id: 's1',
      arenaId: id,
      courtId: 'c1',
      date: DateTime(2026, 5, 21),
      startTime: '10:00',
      endTime: '11:00',
      rawStatus: 'available',
      priceReais: 80,
    ),
    courtName: 'Q1',
    isExactMatch: true,
    minutesDistance: 0,
    displayPricePerHourReais: 80,
  );
}

void main() {
  test('haversineDistanceKm calcula distância conhecida', () {
    // ~1 km entre dois pontos próximos em SP
    final km = haversineDistanceKm(
      lat1: -23.5505,
      lon1: -46.6333,
      lat2: -23.5595,
      lon2: -46.6333,
    );
    expect(km, greaterThan(0.5));
    expect(km, lessThan(2.0));
  });

  test('arenaMatchesProfilePlace compara cidade e UF', () {
    const user = UserLocationSnapshot(
      source: UserLocationSource.profile,
      city: 'Goiânia',
      state: 'GO',
    );
    expect(
      arenaMatchesProfilePlace(
        _result(id: 'a', city: 'Goiânia', state: 'GO').arena,
        user,
      ),
      isTrue,
    );
    expect(
      arenaMatchesProfilePlace(
        _result(id: 'b', city: 'Brasília', state: 'DF').arena,
        user,
      ),
      isFalse,
    );
  });

  test('rankAvailableArenasByProximity filtra por raio GPS', () {
    const user = UserLocationSnapshot(
      source: UserLocationSource.gps,
      latitude: -16.6869,
      longitude: -49.2648,
    );
    final near = _result(
      id: 'near',
      lat: -16.6900,
      lng: -49.2600,
    );
    final far = _result(
      id: 'far',
      lat: -23.5505,
      lng: -46.6333,
    );
    final ranked = rankAvailableArenasByProximity(
      available: [far, near],
      user: user,
      maxRadiusKm: 40,
    );
    expect(ranked.length, 1);
    expect(ranked.first.result.arena.id, 'near');
    expect(ranked.first.kmDistance, isNotNull);
  });

  test('GPS com cidade do perfil inclui arena na mesma cidade fora do raio', () {
    const user = UserLocationSnapshot(
      source: UserLocationSource.gps,
      latitude: 37.3346,
      longitude: -122.0090,
      city: 'Goiânia',
      state: 'GO',
    );
    final local = _result(
      id: 'local',
      city: 'Goiânia',
      state: 'GO',
      lat: -16.6900,
      lng: -49.2600,
    );
    expect(
      isArenaNearUser(arena: local.arena, user: user, maxRadiusKm: 40),
      isTrue,
    );
  });

  test('arena com cidade legada no campo city', () {
    const user = UserLocationSnapshot(
      source: UserLocationSource.profile,
      city: 'Goiânia',
      state: 'GO',
    );
    final arena = ArenaListItem(
      id: 'x',
      name: 'Arena X',
      locationLabel: 'Goiânia, GO',
      pricePerHourReais: 80,
      city: 'Goiânia · GO',
    );
    expect(arenaMatchesProfilePlace(arena, user), isTrue);
  });

  test('arenaMatchesProfilePlace aceita UF por nome do estado', () {
    const user = UserLocationSnapshot(
      source: UserLocationSource.profile,
      city: 'Goiânia',
      state: 'GO',
    );
    final arena = ArenaListItem(
      id: 'x',
      name: 'Arena X',
      locationLabel: 'Goiânia, Goiás',
      pricePerHourReais: 80,
      city: 'Goiânia',
      state: 'Goiás',
    );
    expect(arenaMatchesProfilePlace(arena, user), isTrue);
  });

  test('arena casa locationLabel com vírgula', () {
    const user = UserLocationSnapshot(
      source: UserLocationSource.profile,
      city: 'Goiânia',
      state: 'GO',
    );
    final arena = ArenaListItem(
      id: 'x',
      name: 'Arena X',
      locationLabel: 'Goiânia, GO',
      pricePerHourReais: 80,
    );
    expect(arenaMatchesProfilePlace(arena, user), isTrue);
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/features/arenas/domain/arena_amenities.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filter_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filters.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_providers.dart';

ArenaListItem _arena({
  required String id,
  String name = 'Arena',
  String city = 'Goiânia',
  String state = 'GO',
  double price = 80,
  double lat = -16.68,
  double lng = -49.26,
  List<String> courtTypes = const ['Areia'],
  List<String> surfaces = const [],
  ArenaAmenities amenities = ArenaAmenities.empty,
  int reputationScore = 90,
  double rating = 4.5,
  bool online = true,
  bool onsite = true,
}) {
  return ArenaListItem(
    id: id,
    name: name,
    locationLabel: '$city · $state',
    pricePerHourReais: price,
    city: city,
    state: state,
    latitude: lat,
    longitude: lng,
    courtTypes: courtTypes,
    surfaces: surfaces,
    amenities: amenities,
    reputationScore: reputationScore,
    ratingAverage: rating,
    reviewsCount: 10,
    onlinePaymentEnabled: online,
    onsitePaymentEnabled: onsite,
  );
}

ArenaSearchResult _result(ArenaListItem arena, {double display = 80}) {
  return ArenaSearchResult(
    arena: arena,
    selectedSlot: null,
    courtName: null,
    isExactMatch: false,
    minutesDistance: null,
    displayPricePerHourReais: display,
  );
}

void main() {
  group('ArenaAmenities.fromMap', () {
    test('parses amenities map', () {
      final a = ArenaAmenities.fromMap({
        'parking': true,
        'lockerRoom': true,
        'bar': false,
      });
      expect(a.parking, isTrue);
      expect(a.lockerRoom, isTrue);
      expect(a.bar, isFalse);
    });
  });

  group('levelTitle equivalent', () {
    test('isSearchDateToday detects today', () {
      expect(isSearchDateToday(DateTime.now()), isTrue);
      expect(
        isSearchDateToday(DateTime.now().subtract(const Duration(days: 1))),
        isFalse,
      );
    });
  });

  group('filterAndSortArenaResults', () {
    final user = UserLocationSnapshot(
      source: UserLocationSource.profile,
      city: 'Goiânia',
      state: 'GO',
      latitude: -16.68,
      longitude: -49.26,
    );

    test('unlimited radius does not filter by distance', () {
      final near = _arena(id: 'near', lat: -16.68, lng: -49.26);
      final far = _arena(
        id: 'far',
        lat: -10.0,
        lng: -40.0,
      );
      final filters = ArenaSearchFilters.showAll(
        slot: ArenaSearchFilters.defaults().slot,
      );

      final out = filterAndSortArenaResults(
        results: [_result(near), _result(far)],
        filters: filters,
        userLocation: user,
        favoriteIds: const {},
      );

      expect(out, hasLength(2));
    });

    test('filters by radius and min score', () {
      final near = _arena(id: 'near', reputationScore: 85);
      final far = _arena(
        id: 'far',
        lat: -15.0,
        lng: -48.0,
        reputationScore: 50,
      );
      final filters = ArenaSearchFilters.defaults().copyWith(
        radiusKm: 15,
        minReputationScore: 80,
      );

      final out = filterAndSortArenaResults(
        results: [_result(near), _result(far)],
        filters: filters,
        userLocation: user,
        favoriteIds: const {},
      );

      expect(out, hasLength(1));
      expect(out.first.result.arena.id, 'near');
    });

    test('filters by required amenity parking', () {
      final withParking = _arena(
        id: 'p',
        amenities: const ArenaAmenities(parking: true),
      );
      final without = _arena(id: 'n');
      final filters = ArenaSearchFilters.defaults().copyWith(
        requiredAmenities: const ArenaAmenities(parking: true),
        radiusKm: 30,
      );

      final out = filterAndSortArenaResults(
        results: [_result(withParking), _result(without)],
        filters: filters,
        userLocation: user,
        favoriteIds: const {},
      );

      expect(out.single.result.arena.id, 'p');
    });

    test('filters by payment methods (OR)', () {
      final pixOnly = _arena(id: 'pix', online: true, onsite: false);
      final onsiteOnly = _arena(id: 'onsite', online: false, onsite: true);
      final neither = _arena(id: 'none', online: false, onsite: false);
      final filters = ArenaSearchFilters.defaults().copyWith(
        paymentMethods: {
          ArenaPaymentFilter.pix,
          ArenaPaymentFilter.onsite,
        },
        radiusKm: 30,
      );

      final out = filterAndSortArenaResults(
        results: [
          _result(pixOnly),
          _result(onsiteOnly),
          _result(neither),
        ],
        filters: filters,
        userLocation: user,
        favoriteIds: const {},
      );

      expect(out.map((e) => e.result.arena.id), containsAll(['pix', 'onsite']));
      expect(out.map((e) => e.result.arena.id), isNot(contains('none')));
    });

    test('sorts by price ascending', () {
      final cheap = _result(_arena(id: 'c'), display: 60);
      final expensive = _result(_arena(id: 'e'), display: 120);
      final filters = ArenaSearchFilters.defaults().copyWith(
        sortBy: ArenaSearchSortBy.price,
        radiusKm: 30,
      );

      final out = filterAndSortArenaResults(
        results: [expensive, cheap],
        filters: filters,
        userLocation: user,
        favoriteIds: const {},
      );

      expect(out.first.result.arena.id, 'c');
    });
  });

  group('countActiveSearchFilters', () {
    test('counts non-default filters', () {
      final filters = ArenaSearchFilters.defaults().copyWith(
        priceBand: ArenaPriceBand.band60_100,
        minReputationScore: 80,
      );
      expect(countActiveSearchFilters(filters), 2);
    });
  });

  group('arenaMatchesSportChip', () {
    test('beach tennis matches areia court type', () {
      final arena = _arena(id: 'b', courtTypes: const ['Areia premium']);
      expect(
        arenaMatchesSportChip(arena, ArenaSportChip.beachTennis),
        isTrue,
      );
    });

    test('beach volleyball matches volei label', () {
      final arena = _arena(id: 'v', courtTypes: const ['Vôlei de praia']);
      expect(
        arenaMatchesSportChip(arena, ArenaSportChip.beachVolleyball),
        isTrue,
      );
    });

    test('surface filter uses surfaces field', () {
      final arena = _arena(
        id: 's',
        courtTypes: const ['Vôlei de praia'],
        surfaces: const ['Areia'],
      );
      expect(
        arenaMatchesSurface(arena, {'Areia'}),
        isTrue,
      );
      expect(
        arenaMatchesSurface(arena, {'Saibro'}),
        isFalse,
      );
    });

    test('empty court types pass any sport chip', () {
      final arena = _arena(id: 'e', courtTypes: const []);
      expect(
        arenaMatchesSportChip(arena, ArenaSportChip.beachVolleyball),
        isTrue,
      );
    });

    test('unindexed court types pass sport chip', () {
      final arena = _arena(id: 'u', courtTypes: const ['Quadra coberta']);
      expect(
        arenaMatchesSportChip(arena, ArenaSportChip.beachVolleyball),
        isTrue,
      );
    });

    test('all chip always matches', () {
      final arena = _arena(id: 'a', courtTypes: const ['Tênis']);
      expect(arenaMatchesSportChip(arena, ArenaSportChip.all), isTrue);
    });
  });

  group('defaultSportChipFromProfile', () {
    test('defaults to beach volleyball', () {
      expect(
        defaultSportChipFromProfile(),
        ArenaSportChip.beachVolleyball,
      );
    });

    test('maps VOLEI_PRAIA firestore code', () {
      expect(
        defaultSportChipFromProfile(primarySport: 'VOLEI_PRAIA'),
        ArenaSportChip.beachVolleyball,
      );
    });

    test('maps beach tennis profile label', () {
      expect(
        defaultSportChipFromProfile(sport: 'Beach tennis'),
        ArenaSportChip.beachTennis,
      );
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_map_opening_camera.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filter_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_providers.dart';

ArenaListItem _arena({
  required String id,
  String city = 'Goiânia',
  String state = 'GO',
  String locationLabel = 'Goiânia · GO',
  double? lat = -16.68,
  double? lng = -49.26,
}) {
  return ArenaListItem(
    id: id,
    name: 'Arena $id',
    locationLabel: locationLabel,
    pricePerHourReais: 80,
    city: city,
    state: state,
    latitude: lat,
    longitude: lng,
  );
}

FilteredArenaSearchResult _item(ArenaListItem arena) {
  return FilteredArenaSearchResult(
    result: ArenaSearchResult(
      arena: arena,
      selectedSlot: null,
      courtName: null,
      isExactMatch: false,
      minutesDistance: null,
      displayPricePerHourReais: 80,
    ),
  );
}

void main() {
  group('resolveArenaMapOpeningCenter', () {
    test('usa o GPS do atleta quando existe', () {
      final center = resolveArenaMapOpeningCenter(
        user: const UserLocationSnapshot(
          source: UserLocationSource.gps,
          latitude: -23.55,
          longitude: -46.63,
        ),
        results: [_item(_arena(id: 'a'))],
      );

      expect(center, isNotNull);
      expect(center!.latitude, closeTo(-23.55, 0.0001));
      expect(center.longitude, closeTo(-46.63, 0.0001));
    });

    test('sem GPS, centraliza nas arenas da cidade do perfil', () {
      final center = resolveArenaMapOpeningCenter(
        user: const UserLocationSnapshot(
          source: UserLocationSource.profile,
          city: 'Goiânia',
          state: 'GO',
        ),
        results: [
          _item(_arena(id: 'goiania-1', lat: -16.70, lng: -49.30)),
          _item(_arena(id: 'goiania-2', lat: -16.60, lng: -49.20)),
          _item(
            _arena(
              id: 'sp',
              city: 'São Paulo',
              state: 'SP',
              locationLabel: 'São Paulo · SP',
              lat: -23.55,
              lng: -46.63,
            ),
          ),
        ],
      );

      expect(center, isNotNull);
      expect(center!.latitude, closeTo(-16.65, 0.0001));
      expect(center.longitude, closeTo(-49.25, 0.0001));
    });

    test('GPS tem prioridade sobre a cidade do perfil', () {
      final center = resolveArenaMapOpeningCenter(
        user: const UserLocationSnapshot(
          source: UserLocationSource.profile,
          latitude: -23.55,
          longitude: -46.63,
          city: 'Goiânia',
          state: 'GO',
        ),
        results: [_item(_arena(id: 'goiania-1'))],
      );

      expect(center!.latitude, closeTo(-23.55, 0.0001));
    });

    test('ignora arena sem coordenada utilizável', () {
      final center = resolveArenaMapOpeningCenter(
        user: const UserLocationSnapshot(
          source: UserLocationSource.profile,
          city: 'Goiânia',
          state: 'GO',
        ),
        results: [
          _item(_arena(id: 'zerada', lat: 0, lng: 0)),
          _item(_arena(id: 'valida', lat: -16.70, lng: -49.30)),
        ],
      );

      expect(center!.latitude, closeTo(-16.70, 0.0001));
      expect(center.longitude, closeTo(-49.30, 0.0001));
    });

    test('sem GPS e sem arena na cidade do perfil, não força centro', () {
      final center = resolveArenaMapOpeningCenter(
        user: const UserLocationSnapshot(
          source: UserLocationSource.profile,
          city: 'Goiânia',
          state: 'GO',
        ),
        results: [
          _item(
            _arena(
              id: 'sp',
              city: 'São Paulo',
              state: 'SP',
              locationLabel: 'São Paulo · SP',
            ),
          ),
        ],
      );

      expect(center, isNull);
    });

    test('sem localização nenhuma, não há centro de abertura', () {
      final center = resolveArenaMapOpeningCenter(
        user: const UserLocationSnapshot(source: UserLocationSource.none),
        results: [_item(_arena(id: 'a'))],
      );

      expect(center, isNull);
    });
  });

  group('shouldApplyLateOpeningCenter', () {
    test('aplica a localização que chegou depois do enquadramento automático',
        () {
      expect(
        shouldApplyLateOpeningCenter(
          hasCenter: true,
          alreadyApplied: false,
          athleteMovedCamera: false,
        ),
        isTrue,
      );
    });

    test('não reaplica quando o centro já posicionou a câmera', () {
      expect(
        shouldApplyLateOpeningCenter(
          hasCenter: true,
          alreadyApplied: true,
          athleteMovedCamera: false,
        ),
        isFalse,
      );
    });

    test('não arranca a câmera da mão do atleta', () {
      expect(
        shouldApplyLateOpeningCenter(
          hasCenter: true,
          alreadyApplied: false,
          athleteMovedCamera: true,
        ),
        isFalse,
      );
    });

    test('sem centro não há o que aplicar', () {
      expect(
        shouldApplyLateOpeningCenter(
          hasCenter: false,
          alreadyApplied: false,
          athleteMovedCamera: false,
        ),
        isFalse,
      );
    });
  });
}

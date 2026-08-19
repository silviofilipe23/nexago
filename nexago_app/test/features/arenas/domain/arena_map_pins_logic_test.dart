import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_map_pin.dart';
import 'package:nexago_app/features/arenas/domain/arena_map_pins_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filter_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

ArenaListItem _arena({
  required String id,
  String name = 'Arena',
  double? lat = -16.68,
  double? lng = -49.26,
  bool unclaimed = false,
}) {
  return ArenaListItem(
    id: id,
    name: name,
    locationLabel: 'Goiânia · GO',
    pricePerHourReais: 80,
    city: 'Goiânia',
    state: 'GO',
    latitude: lat,
    longitude: lng,
    isUnclaimed: unclaimed,
  );
}

ArenaSlot _slot(String arenaId) {
  return ArenaSlot(
    id: 'slot-$arenaId',
    arenaId: arenaId,
    courtId: 'court-1',
    date: DateTime(2026, 8, 20),
    startTime: '19:00',
    endTime: '20:00',
    rawStatus: 'available',
    priceReais: 80,
  );
}

FilteredArenaSearchResult _item(
  ArenaListItem arena, {
  double display = 80,
  bool available = true,
  double? km,
}) {
  return FilteredArenaSearchResult(
    result: ArenaSearchResult(
      arena: arena,
      selectedSlot: available ? _slot(arena.id) : null,
      courtName: available ? 'Quadra 1' : null,
      isExactMatch: available,
      minutesDistance: null,
      displayPricePerHourReais: display,
    ),
    kmDistance: km,
  );
}

void main() {
  group('splitArenaMapResults', () {
    test('arena com coordenada vira pino e não entra em offMap', () {
      final split = splitArenaMapResults(
        results: [_item(_arena(id: 'a'))],
      );

      expect(split.pins, hasLength(1));
      expect(split.pins.single.arenaId, 'a');
      expect(split.offMap, isEmpty);
    });

    test('arena sem coordenada sai do mapa mas sobrevive em offMap', () {
      final split = splitArenaMapResults(
        results: [
          _item(_arena(id: 'com-coord')),
          _item(_arena(id: 'sem-coord', lat: null, lng: null)),
        ],
      );

      expect(split.pins.map((p) => p.arenaId), ['com-coord']);
      expect(split.offMap.map((e) => e.result.arena.id), ['sem-coord']);
    });

    test('latitude sem longitude não vira pino', () {
      final split = splitArenaMapResults(
        results: [_item(_arena(id: 'meia', lng: null))],
      );

      expect(split.pins, isEmpty);
      expect(split.offMap, hasLength(1));
    });

    // (0, 0) é o golfo da Guiné: é o que sobra quando alguém salva o formulário
    // com os campos zerados. Um pino no meio do Atlântico estraga o
    // enquadramento da câmera de todas as outras arenas.
    test('coordenada (0, 0) é tratada como ausente', () {
      final split = splitArenaMapResults(
        results: [_item(_arena(id: 'nulo', lat: 0, lng: 0))],
      );

      expect(split.pins, isEmpty);
      expect(split.offMap.map((e) => e.result.arena.id), ['nulo']);
    });

    test('coordenada fora do intervalo válido é tratada como ausente', () {
      final split = splitArenaMapResults(
        results: [
          _item(_arena(id: 'lat-alta', lat: 91)),
          _item(_arena(id: 'lng-baixa', lng: -181)),
          _item(_arena(id: 'nan', lat: double.nan)),
        ],
      );

      expect(split.pins, isEmpty);
      expect(split.offMap, hasLength(3));
    });

    test('arena com horário livre é do tipo disponível', () {
      final split = splitArenaMapResults(
        results: [_item(_arena(id: 'a'))],
      );

      expect(split.pins.single.kind, ArenaMapPinKind.available);
    });

    test('arena sem disponibilidade é do tipo indisponível', () {
      final split = splitArenaMapResults(
        results: [_item(_arena(id: 'a'), available: false)],
      );

      expect(split.pins.single.kind, ArenaMapPinKind.unavailable);
    });

    test('arena pré-cadastrada tem tipo próprio', () {
      final split = splitArenaMapResults(
        results: [
          _item(_arena(id: 'a', unclaimed: true), available: false),
        ],
      );

      expect(split.pins.single.kind, ArenaMapPinKind.unclaimed);
    });

    test('o melhor preço é apurado para a lista, mesmo sem ir ao pino', () {
      final split = splitArenaMapResults(
        results: [
          _item(_arena(id: 'cara'), display: 120),
          _item(_arena(id: 'barata'), display: 60),
          _item(_arena(id: 'empatada'), display: 60),
        ],
      );

      expect(split.bestPriceArenaIds, {'barata', 'empatada'});
    });

    // A lista mostra arena sem coordenada, então o cálculo tem que enxergar
    // além dos pinos: olhando só quem tem pino, o card apontaria a arena
    // errada como a mais barata.
    test('melhor preço considera também arena que ficou fora do mapa', () {
      final split = splitArenaMapResults(
        results: [
          _item(_arena(id: 'com-pino'), display: 100),
          _item(_arena(id: 'sem-coord', lat: null, lng: null), display: 50),
        ],
      );

      expect(split.bestPriceArenaIds, {'sem-coord'});
    });

    test('preserva a ordem da lista filtrada', () {
      final split = splitArenaMapResults(
        results: [
          _item(_arena(id: 'primeira')),
          _item(_arena(id: 'sem-coord', lat: null, lng: null)),
          _item(_arena(id: 'segunda')),
        ],
      );

      expect(split.pins.map((p) => p.arenaId), ['primeira', 'segunda']);
    });

    test('lista vazia não quebra', () {
      final split = splitArenaMapResults(results: const []);

      expect(split.pins, isEmpty);
      expect(split.offMap, isEmpty);
      expect(split.bestPriceArenaIds, isEmpty);
    });
  });

  group('arenaMapPinsToGeoJson', () {
    test('gera FeatureCollection com um Point por pino', () {
      final split = splitArenaMapResults(
        results: [_item(_arena(id: 'a', name: 'Arena Um'))],
      );
      final geo = arenaMapPinsToGeoJson(split.pins);

      expect(geo['type'], 'FeatureCollection');
      final features = geo['features'] as List<dynamic>;
      expect(features, hasLength(1));

      final feature = features.single as Map<String, dynamic>;
      expect(feature['type'], 'Feature');

      final geometry = feature['geometry'] as Map<String, dynamic>;
      expect(geometry['type'], 'Point');
      // GeoJSON é [longitude, latitude] — nessa ordem. Trocar põe o Brasil
      // no meio do oceano Índico.
      expect(geometry['coordinates'], [-49.26, -16.68]);

      final props = feature['properties'] as Map<String, dynamic>;
      expect(props['arenaId'], 'a');
      expect(props['kind'], 'available');
    });

    // O estilo decide a opacidade por `kind`. Se o nome ou o valor mudar aqui
    // sem mudar lá, todo pino nasce apagado e nada denuncia o erro.
    test('o tipo vai como o mesmo texto que o estilo compara', () {
      final split = splitArenaMapResults(
        results: [
          _item(_arena(id: 'com'), available: true),
          _item(_arena(id: 'sem', lat: -10, lng: -40), available: false),
        ],
      );
      final features =
          arenaMapPinsToGeoJson(split.pins)['features'] as List<dynamic>;
      final kinds = features
          .map((f) => ((f as Map<String, dynamic>)['properties']
              as Map<String, dynamic>)['kind'])
          .toList();

      expect(kinds, ['available', 'unavailable']);
    });

    test('sem pinos gera coleção vazia, não nula', () {
      final geo = arenaMapPinsToGeoJson(const []);

      expect(geo['type'], 'FeatureCollection');
      expect(geo['features'], isEmpty);
    });
  });

  group('arenaMapPinsBounds', () {
    test('devolve nulo sem pinos', () {
      expect(arenaMapPinsBounds(const []), isNull);
    });

    test('envolve todos os pinos', () {
      final split = splitArenaMapResults(
        results: [
          _item(_arena(id: 'norte', lat: -10, lng: -50)),
          _item(_arena(id: 'sul', lat: -20, lng: -40)),
        ],
      );

      final bounds = arenaMapPinsBounds(split.pins)!;
      expect(bounds.minLatitude, -20);
      expect(bounds.maxLatitude, -10);
      expect(bounds.minLongitude, -50);
      expect(bounds.maxLongitude, -40);
    });

    test('um pino só gera caixa degenerada, com centro nele', () {
      final split = splitArenaMapResults(
        results: [_item(_arena(id: 'unica', lat: -16.68, lng: -49.26))],
      );

      final bounds = arenaMapPinsBounds(split.pins)!;
      expect(bounds.centerLatitude, closeTo(-16.68, 1e-9));
      expect(bounds.centerLongitude, closeTo(-49.26, 1e-9));
      expect(bounds.isSinglePoint, isTrue);
    });
  });

  group('arenaMapZoomFloorOverride', () {
    const bounds = ArenaMapBounds(
      minLatitude: -20,
      minLongitude: -50,
      maxLatitude: -10,
      maxLongitude: -40,
    );
    const atleta = (latitude: -16.68, longitude: -49.26);

    test('enquadramento confortável passa direto', () {
      expect(
        arenaMapZoomFloorOverride(
          fittedZoom: 13.5,
          minZoom: 12,
          bounds: bounds,
          athlete: atleta,
        ),
        isNull,
      );
    });

    test('exatamente no piso ainda passa direto', () {
      expect(
        arenaMapZoomFloorOverride(
          fittedZoom: 12,
          minZoom: 12,
          bounds: bounds,
          athlete: atleta,
        ),
        isNull,
      );
    });

    test('afastado demais volta para o piso, centrado no atleta', () {
      // O centro da caixa fica entre as cidades distantes — pasto. O único
      // ponto que interessa ao atleta é onde ele está.
      final alvo = arenaMapZoomFloorOverride(
        fittedZoom: 4,
        minZoom: 12,
        bounds: bounds,
        athlete: atleta,
      );

      expect(alvo, isNotNull);
      expect(alvo!.zoom, 12);
      expect(alvo.latitude, atleta.latitude);
      expect(alvo.longitude, atleta.longitude);
    });

    test('sem posição do atleta, cai no centro dos pinos', () {
      final alvo = arenaMapZoomFloorOverride(
        fittedZoom: 4,
        minZoom: 12,
        bounds: bounds,
        athlete: null,
      );

      expect(alvo!.latitude, bounds.centerLatitude);
      expect(alvo.longitude, bounds.centerLongitude);
    });

    test('zoom ausente ou inválido não inventa câmera', () {
      // Vem do cálculo do Mapbox: sem número utilizável, mexer na câmera seria
      // um salto sem motivo.
      for (final z in <double?>[null, double.nan, double.infinity]) {
        expect(
          arenaMapZoomFloorOverride(
            fittedZoom: z,
            minZoom: 12,
            bounds: bounds,
            athlete: atleta,
          ),
          isNull,
          reason: 'zoom $z',
        );
      }
    });
  });
}

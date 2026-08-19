import 'arena_map_pin.dart';
import 'arena_search_filter_logic.dart';

/// Resultado da busca partido em duas metades: o que o mapa desenha e o que
/// só a lista consegue mostrar.
class ArenaMapSplit {
  const ArenaMapSplit({
    required this.pins,
    required this.offMap,
    required this.bestPriceArenaIds,
  });

  /// Arenas com coordenada utilizável, na ordem da busca.
  final List<ArenaMapPin> pins;

  /// Arenas sem coordenada. Não somem: a lista as mostra em seção própria.
  final List<FilteredArenaSearchResult> offMap;

  /// Ids de melhor preço, calculados sobre **toda** a busca — mapa e lista
  /// precisam concordar sobre quem é a mais barata.
  final Set<String> bestPriceArenaIds;
}

/// Coordenada que dá para confiar.
///
/// `(0, 0)` cai no golfo da Guiné e é o que sobra quando alguém salva o
/// cadastro com os campos zerados: um pino lá arrasta o enquadramento da
/// câmera para o meio do Atlântico e esconde todas as arenas reais.
bool _isUsableCoordinate(double? latitude, double? longitude) {
  if (latitude == null || longitude == null) return false;
  if (!latitude.isFinite || !longitude.isFinite) return false;
  if (latitude.abs() > 90 || longitude.abs() > 180) return false;
  if (latitude == 0 && longitude == 0) return false;
  return true;
}

/// Converte o resultado já filtrado da busca em pinos de mapa.
ArenaMapSplit splitArenaMapResults({
  required List<FilteredArenaSearchResult> results,
}) {
  final bestPriceIds = bestPriceArenaIds(results.map((e) => e.result));

  final pins = <ArenaMapPin>[];
  final offMap = <FilteredArenaSearchResult>[];

  for (final item in results) {
    final result = item.result;
    final arena = result.arena;

    if (!_isUsableCoordinate(arena.latitude, arena.longitude)) {
      offMap.add(item);
      continue;
    }

    final kind = arena.isUnclaimed
        ? ArenaMapPinKind.unclaimed
        : result.hasAvailability
            ? ArenaMapPinKind.available
            : ArenaMapPinKind.unavailable;

    pins.add(
      ArenaMapPin(
        arenaId: arena.id,
        latitude: arena.latitude!,
        longitude: arena.longitude!,
        kind: kind,
      ),
    );
  }

  return ArenaMapSplit(
    pins: List.unmodifiable(pins),
    offMap: List.unmodifiable(offMap),
    bestPriceArenaIds: bestPriceIds,
  );
}

/// Serializa os pinos no GeoJSON que alimenta o `GeoJsonSource` do Mapbox.
Map<String, dynamic> arenaMapPinsToGeoJson(List<ArenaMapPin> pins) {
  return <String, dynamic>{
    'type': 'FeatureCollection',
    'features': [
      for (final pin in pins)
        <String, dynamic>{
          'type': 'Feature',
          'id': pin.arenaId,
          'geometry': <String, dynamic>{
            'type': 'Point',
            // GeoJSON é [longitude, latitude], nessa ordem.
            'coordinates': <double>[pin.longitude, pin.latitude],
          },
          'properties': <String, dynamic>{
            'arenaId': pin.arenaId,
            // Única propriedade que o estilo lê: escolhe entre pino cheio e
            // pino apagado.
            'kind': pin.kind.name,
          },
        },
    ],
  };
}

/// Caixa que envolve todos os pinos, para o enquadramento inicial da câmera.
ArenaMapBounds? arenaMapPinsBounds(List<ArenaMapPin> pins) {
  if (pins.isEmpty) return null;

  var minLat = pins.first.latitude;
  var maxLat = pins.first.latitude;
  var minLng = pins.first.longitude;
  var maxLng = pins.first.longitude;

  for (final pin in pins.skip(1)) {
    if (pin.latitude < minLat) minLat = pin.latitude;
    if (pin.latitude > maxLat) maxLat = pin.latitude;
    if (pin.longitude < minLng) minLng = pin.longitude;
    if (pin.longitude > maxLng) maxLng = pin.longitude;
  }

  return ArenaMapBounds(
    minLatitude: minLat,
    minLongitude: minLng,
    maxLatitude: maxLat,
    maxLongitude: maxLng,
  );
}

/// Para onde a câmera deve ir quando o enquadramento afastaria demais.
///
/// Devolve nulo quando o enquadramento calculado serve como está.
///
/// Enquadrar todos os pinos é bom com arenas na mesma cidade e péssimo quando
/// há uma em outro estado: o mapa abre em escala continental e o atleta não vê
/// rua nenhuma. Abaixo de [minZoom] vale mais ficar perto de um ponto só.
///
/// [fallbackCenter] é esse ponto, e quem chama decide qual é: na abertura, a
/// posição do atleta; numa busca, a arena que melhor casou com o texto. O
/// centro da caixa não serve para nenhum dos dois — entre duas cidades
/// distantes ele é literalmente pasto — e fica só como último recurso.
({double latitude, double longitude, double zoom})? arenaMapZoomFloorOverride({
  required double? fittedZoom,
  required double minZoom,
  required ArenaMapBounds bounds,
  ({double latitude, double longitude})? fallbackCenter,
}) {
  if (fittedZoom == null || !fittedZoom.isFinite) return null;
  if (fittedZoom >= minZoom) return null;

  return (
    latitude: fallbackCenter?.latitude ?? bounds.centerLatitude,
    longitude: fallbackCenter?.longitude ?? bounds.centerLongitude,
    zoom: minZoom,
  );
}

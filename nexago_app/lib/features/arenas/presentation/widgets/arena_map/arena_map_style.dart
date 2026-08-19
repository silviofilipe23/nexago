import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import '../../../../../core/map/mapbox_config.dart';

import '../../../domain/arena_map_pin.dart';
import '../../../domain/arena_map_pins_logic.dart';
import 'arena_map_pin_art.dart';

/// Ids das peças de estilo do mapa de arenas.
///
/// Ficam em constantes porque a camada de toque referencia o mesmo id do
/// `SymbolLayer` — errar a string aqui vira um mapa que não responde ao dedo,
/// sem nenhum erro visível.
class ArenaMapIds {
  const ArenaMapIds._();

  static const source = 'nexago-arenas';
  static const pinLayer = 'nexago-arena-pins';

  static const pinImage = 'nexago-arena-pin';
}

/// Opacidade do pino conforme o estado da arena.
///
/// Números crus podem ir direto numa expressão; **cor não** (precisaria de
/// string CSS). Opacidade é número, então aqui está correto.
List<Object> arenaPinOpacityExpression() {
  return <Object>[
    'case',
    [
      '==',
      ['get', 'kind'],
      'available',
    ],
    1.0,
    ArenaPinAsset.mutedOpacity,
  ];
}

/// Monta fonte, imagens e camadas do mapa de arenas.
///
/// **Sempre reescreve imagens e camadas**, em vez de pular o que já existe.
/// Isso não é desperdício: num *hot restart* o mapa nativo sobrevive ao
/// reinício do Dart, então imagem e camada da execução anterior continuam
/// registradas. Pulando-as, qualquer mudança de arte ou de configuração só
/// apareceria depois de parar e rodar o app do zero — e o desenho antigo
/// ficaria na tela mentindo que nada mudou.
///
/// Roda a cada `onStyleLoaded` porque o Mapbox descarta fonte e camadas do
/// app a cada troca de estilo.
Future<void> installArenaMapStyle(
  MapboxMap map, {
  required List<ArenaMapPin> pins,
}) async {
  final style = map.style;

  final pinImage = await loadArenaPinImage();
  if (pinImage != null) {
    // `addStyleImage` substitui a imagem quando o id já existe: é o que mantém
    // a arte em dia sem precisar removê-la antes.
    //
    // Listas de esticamento vazias e `content` nulo de propósito: o pino é
    // arte fixa, não uma pastilha que cresce com texto.
    await style.addStyleImage(
      ArenaMapIds.pinImage,
      ArenaPinAsset.scale,
      pinImage,
      false,
      const <ImageStretches?>[],
      const <ImageStretches?>[],
      null,
    );
  }

  if (await style.styleSourceExists(ArenaMapIds.source)) {
    await updateArenaMapPins(map, pins);
  } else {
    await style.addSource(
      // Sem agrupamento: cada arena é um pino, em qualquer zoom. Em troca, o
      // mapa nunca esconde uma arena atrás de uma bolha com número.
      GeoJsonSource(
        id: ArenaMapIds.source,
        data: jsonEncode(arenaMapPinsToGeoJson(pins)),
      ),
    );
  }

  await _replaceLayer(
    style,
    ArenaMapIds.pinLayer,
    () => SymbolLayer(
      id: ArenaMapIds.pinLayer,
      sourceId: ArenaMapIds.source,
      // Sem slot, o Standard pode empilhar o pino atrás de um prédio 3D.
      slot: mapboxPinSlot,
      iconImage: ArenaMapIds.pinImage,
      // Sem texto no pino, `icon-anchor` volta a mandar na posição — era o
      // `icon-text-fit` que o anulava. BOTTOM põe a ponta da gota na
      // coordenada da arena, que é o ponto todo de um marcador.
      iconAnchor: IconAnchor.BOTTOM,
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      iconOpacityExpression: arenaPinOpacityExpression(),
      // Arena com horário fica por cima quando dois pinos se sobrepõem.
      symbolSortKeyExpression: <Object>[
        'case',
        [
          '==',
          ['get', 'kind'],
          'available',
        ],
        0,
        1,
      ],
    ),
  );
}

/// Recria a camada do zero, para mudança de configuração sempre valer.
///
/// Uma recusa aqui não derruba o resto da instalação, e o log nomeia a camada.
/// Sem isso, a exceção subia e levava junto tudo que viesse depois — foi o que
/// escondeu um erro de expressão e deixou o mapa sem pino nenhum.
Future<void> _replaceLayer(
  StyleManager style,
  String layerId,
  Layer Function() build,
) async {
  try {
    if (await style.styleLayerExists(layerId)) {
      await style.removeStyleLayer(layerId);
    }
    await style.addLayer(build());
  } catch (error, stackTrace) {
    debugPrint('[mapa de arenas] camada "$layerId" recusada: $error');
    FlutterError.reportError(
      FlutterErrorDetails(
        exception: error,
        stack: stackTrace,
        library: 'nexago/arena map',
        context: ErrorDescription('instalando a camada "$layerId"'),
      ),
    );
  }
}

/// Troca só os dados da fonte — sem recriar camadas nem reprocessar imagens.
Future<void> updateArenaMapPins(MapboxMap map, List<ArenaMapPin> pins) async {
  if (!await map.style.styleSourceExists(ArenaMapIds.source)) return;
  await map.style.setStyleSourceProperty(
    ArenaMapIds.source,
    'data',
    jsonEncode(arenaMapPinsToGeoJson(pins)),
  );
}

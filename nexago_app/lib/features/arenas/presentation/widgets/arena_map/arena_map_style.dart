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

/// Imagem própria de um pino (ex.: a logo de um parceiro do clube), já em PNG.
///
/// [scale] é a densidade do PNG: 3 = arte exportada com o triplo das medidas
/// de tela, como o pino da quadra.
class ArenaMapPinImage {
  const ArenaMapPinImage({
    required this.id,
    required this.image,
    this.scale = 3,
  });

  final String id;
  final MbxImage image;
  final double scale;
}

/// Tamanho do pino com imagem própria; o tocado cresce.
const double customPinIconSize = 1.0;
const double customPinSelectedIconSize = 1.25;

/// Imagem do pino: a própria (`icon`) quando já registrada, senão a quadra.
///
/// `coalesce` + `image` cai na quadra também enquanto a imagem própria ainda
/// não foi registrada: o pino nunca some.
List<Object> mapPinImageExpression() {
  return <Object>[
    'coalesce',
    [
      'image',
      ['get', 'icon'],
    ],
    ['image', ArenaMapIds.pinImage],
  ];
}

/// Tamanho: pino com imagem própria segue o seu tamanho (maior se tocado);
/// a arena segue [arenaPinSizeExpression], sem mudança.
List<Object> mapPinSizeExpression() {
  return <Object>[
    'case',
    ['has', 'icon'],
    [
      'case',
      [
        '==',
        ['get', 'selected'],
        true,
      ],
      customPinSelectedIconSize,
      customPinIconSize,
    ],
    arenaPinSizeExpression(),
  ];
}

/// Quem fica por cima: o pino tocado; depois a ordem das arenas (com horário,
/// parceira sem horário, pré-cadastrada).
List<Object> mapPinSortKeyExpression() {
  return <Object>[
    'case',
    [
      '==',
      ['get', 'selected'],
      true,
    ],
    -1,
    <Object>[
      'match',
      ['get', 'kind'],
      'available',
      0,
      'unavailable',
      1,
      2,
    ],
  ];
}

/// Registra (ou troca) as imagens próprias dos pinos. Uma imagem recusada não
/// derruba as outras: o pino dela cai na arte da quadra.
Future<void> installArenaMapPinImages(
  MapboxMap map,
  List<ArenaMapPinImage> images,
) async {
  for (final image in images) {
    try {
      await map.style.addStyleImage(
        image.id,
        image.scale,
        image.image,
        false,
        const <ImageStretches?>[],
        const <ImageStretches?>[],
        null,
      );
    } catch (error) {
      debugPrint('[mapa] imagem do pino "${image.id}" recusada: $error');
    }
  }
}

/// Opacidade do pino conforme o vínculo da arena.
///
/// Só a pré-cadastrada apaga: parceira fica cheia mesmo sem horário livre.
///
/// Números crus podem ir direto numa expressão; **cor não** (precisaria de
/// string CSS). Opacidade é número, então aqui está correto.
List<Object> arenaPinOpacityExpression() {
  return <Object>[
    'case',
    [
      '==',
      ['get', 'kind'],
      'unclaimed',
    ],
    ArenaPinAsset.mutedOpacity,
    1.0,
  ];
}

/// Tamanho do pino: arena parceira maior que a pré-cadastrada.
List<Object> arenaPinSizeExpression() {
  return <Object>[
    'case',
    [
      '==',
      ['get', 'kind'],
      'unclaimed',
    ],
    1.0,
    ArenaPinAsset.partnerIconSize,
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
  List<ArenaMapPinImage> pinImages = const [],
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

  await installArenaMapPinImages(map, pinImages);

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
      // A quadra, ou a imagem própria do pino quando ele tem uma.
      iconImageExpression: mapPinImageExpression(),
      // CENTER, não BOTTOM: a arte é uma quadra apoiada, sem ponta. Ancorar
      // pela base deixaria a coordenada na borda da frente e a quadra inteira
      // acima dela — como se a arena estivesse atrás do ponto. Centrada, a
      // quadra fica sobre o lugar que ela representa.
      //
      // (`icon-anchor` só volta a mandar porque o pino não tem texto: com
      // `icon-text-fit` o ícone é encaixado em volta do texto e a âncora é
      // ignorada.)
      iconAnchor: IconAnchor.CENTER,
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      iconOpacityExpression: arenaPinOpacityExpression(),
      iconSizeExpression: mapPinSizeExpression(),
      // Quando dois pinos se sobrepõem: o tocado por cima; depois com horário,
      // a parceira sem horário, e a pré-cadastrada embaixo.
      symbolSortKeyExpression: mapPinSortKeyExpression(),
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

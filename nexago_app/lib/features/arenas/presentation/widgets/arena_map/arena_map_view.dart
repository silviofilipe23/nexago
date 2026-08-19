import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import '../../../../../core/map/mapbox_config.dart';
import '../../../domain/arena_map_pin.dart';
import '../../../domain/arena_map_pins_logic.dart';
import 'arena_map_style.dart';

/// Zoom usado quando não dá para enquadrar por caixa (uma arena só, ou o
/// atleta pedindo a própria posição).
const double _singlePointZoom = 14;

/// O mapa nunca abre mais afastado que isto.
///
/// Escala de bairro. Sem esse piso, uma única arena cadastrada em outro estado
/// abria o mapa em escala continental para todo mundo.
const double _minFitZoom = 12;

/// Comanda a câmera de fora do widget.
///
/// Existe para os botões flutuantes e o toque na lista mexerem no mapa sem que
/// a página precise segurar o `MapboxMap` — a página fala em intenção
/// ("centraliza aqui"), não em API de mapa.
class ArenaMapController {
  Future<void> Function(double latitude, double longitude, {double? zoom})?
      _flyTo;
  Future<void> Function()? _resetNorth;
  Future<void> Function(
    List<ArenaMapPin> pins,
    ({double latitude, double longitude})? fallbackCenter,
  )? _fitPins;

  bool get isReady => _flyTo != null;

  Future<void> flyTo(double latitude, double longitude, {double? zoom}) async {
    await _flyTo?.call(latitude, longitude, zoom: zoom);
  }

  Future<void> resetNorth() async => _resetNorth?.call();

  /// Enquadra os pinos.
  ///
  /// [fallbackCenter] é para onde a câmera vai quando enquadrar tudo afastaria
  /// demais — numa busca, a arena que melhor casou; na abertura, o atleta.
  Future<void> fitPins(
    List<ArenaMapPin> pins, {
    ({double latitude, double longitude})? fallbackCenter,
  }) async =>
      _fitPins?.call(pins, fallbackCenter);

  void _detach() {
    _flyTo = null;
    _resetNorth = null;
    _fitPins = null;
  }
}

/// O mapa da busca de arenas.
///
/// Só sabe desenhar pinos e avisar quem foi tocado. Nada de filtro, preço,
/// favorito ou GPS entra aqui — chega tudo resolvido em [pins].
class ArenaMapView extends StatefulWidget {
  const ArenaMapView({
    super.key,
    required this.pins,
    required this.onPinTap,
    this.controller,
    this.initialCenter,
    this.logoPadding = EdgeInsets.zero,
    this.showUserLocation = false,
  });

  final List<ArenaMapPin> pins;

  /// Recebe o `arenaId` do pino tocado.
  final ValueChanged<String> onPinTap;

  final ArenaMapController? controller;

  /// Onde a câmera abre antes de existir qualquer pino (cidade do perfil).
  final ({double latitude, double longitude})? initialCenter;

  /// Empurra a marca d'água e a atribuição do Mapbox para cima do sheet.
  /// Esconder qualquer um dos dois viola os termos de uso do Mapbox.
  final EdgeInsets logoPadding;

  /// Mostra o marcador com a posição do atleta.
  ///
  /// Só deve vir `true` com a permissão de localização JÁ concedida: o Mapbox
  /// dispara o próprio pedido ao ligar o componente, e o atleta veria um
  /// pedido de permissão surgir sozinho ao abrir a aba, fora de qualquer
  /// ação dele.
  final bool showUserLocation;

  @override
  State<ArenaMapView> createState() => _ArenaMapViewState();
}

class _ArenaMapViewState extends State<ArenaMapView> {
  MapboxMap? _map;
  bool _styleInstalled = false;
  bool _didInitialFit = false;
  bool _appliedInitialCenter = false;

  @override
  void initState() {
    super.initState();
    _attachController(widget.controller);
  }

  @override
  void didUpdateWidget(covariant ArenaMapView oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.controller != widget.controller) {
      oldWidget.controller?._detach();
      _attachController(widget.controller);
    }

    if (!identical(oldWidget.pins, widget.pins)) {
      _syncPins();
    }

    if (oldWidget.showUserLocation != widget.showUserLocation) {
      _syncUserLocation();
    }

    // A localização costuma resolver depois que o mapa já nasceu. Aplicar aqui
    // só vale enquanto nada mais posicionou a câmera: passado esse ponto, ela
    // é do atleta e mexer seria justamente o salto que queremos evitar.
    final center = widget.initialCenter;
    if (center != null &&
        oldWidget.initialCenter == null &&
        !_appliedInitialCenter &&
        !_didInitialFit) {
      _appliedInitialCenter = true;
      unawaited(_flyTo(center.latitude, center.longitude, zoom: _minFitZoom));
    }
  }

  /// Põe a câmera no lugar de partida — uma vez.
  ///
  /// Depois disso, só o próprio atleta e ações explícitas dele (enquadrar os
  /// pinos, "minha localização") mexem na câmera.
  void _applyInitialCamera(MapboxMap map) {
    final center = widget.initialCenter;
    if (center != null) _appliedInitialCenter = true;

    map.setCamera(
      CameraOptions(
        center: center == null
            ? null
            : Point(coordinates: Position(center.longitude, center.latitude)),
        zoom: center == null ? 3 : _minFitZoom,
        pitch: mapboxDefaultPitch,
      ),
    );
  }

  Future<void> _syncUserLocation() async {
    final map = _map;
    if (map == null) return;
    await map.location.updateSettings(
      LocationComponentSettings(
        enabled: widget.showUserLocation,
        // O anel mostra a incerteza do GPS. Sem ele o ponto afirma uma
        // precisão que o aparelho não tem.
        showAccuracyRing: true,
        puckBearingEnabled: true,
      ),
    );
  }

  @override
  void dispose() {
    widget.controller?._detach();
    super.dispose();
  }

  void _attachController(ArenaMapController? controller) {
    if (controller == null) return;
    controller._flyTo = _flyTo;
    controller._resetNorth = _resetNorth;
    controller._fitPins = _fitPins;
  }

  void _onMapCreated(MapboxMap map) {
    _map = map;
    _applyInitialCamera(map);

    // A bússola nativa some: a tela tem controles próprios, no lugar certo
    // em relação ao sheet.
    map.compass.updateSettings(CompassSettings(enabled: false));
    map.scaleBar.updateSettings(ScaleBarSettings(enabled: false));

    // A marca d'água e a atribuição do Mapbox NÃO podem ser escondidas — é
    // termo de uso. O que dá é tirá-las de trás do sheet.
    final bottomInset = widget.logoPadding.bottom;
    map.logo.updateSettings(
      LogoSettings(marginBottom: bottomInset, marginLeft: 8),
    );
    map.attribution.updateSettings(
      AttributionSettings(marginBottom: bottomInset),
    );

    map.addInteraction(
      TapInteraction(
        FeaturesetDescriptor(layerId: ArenaMapIds.pinLayer),
        (feature, _) {
          final arenaId = feature.properties['arenaId'];
          if (arenaId is String && arenaId.isNotEmpty) {
            widget.onPinTap(arenaId);
          }
        },
      ),
      interactionID: 'nexago-arena-pin-tap',
    );

    unawaited(_syncUserLocation());
  }

  /// O Mapbox joga fora fonte e camadas do app a cada carga de estilo, então
  /// a instalação roda aqui — e não uma vez só na criação do mapa.
  Future<void> _onStyleLoaded(StyleLoadedEventData _) async {
    final map = _map;
    if (map == null) return;

    await installArenaMapStyle(map, pins: widget.pins);
    if (!mounted) return;

    _styleInstalled = true;
    if (kDebugMode) await _reportStyleState(map);
    await _maybeInitialFit();
  }

  /// Diz, em debug, se as peças do mapa realmente entraram no estilo.
  ///
  /// Sem isso, uma camada recusada ou uma imagem que não registrou dão o mesmo
  /// resultado na tela — um mapa sem pino nenhum — e não dá para distinguir
  /// "não instalou" de "instalou e não tem arena com coordenada".
  Future<void> _reportStyleState(MapboxMap map) async {
    final style = map.style;
    debugPrint(
      '[mapa de arenas] pinos=${widget.pins.length} '
      'imagem=${await style.hasStyleImage(ArenaMapIds.pinImage)} '
      'fonte=${await style.styleSourceExists(ArenaMapIds.source)} '
      'camadaPinos=${await style.styleLayerExists(ArenaMapIds.pinLayer)}',
    );
  }

  /// Dispara quando o motor pede uma imagem que não está registrada — é o
  /// sintoma exato de um id trocado entre a expressão e o registro.
  void _onStyleImageMissing(StyleImageMissingEventData event) {
    debugPrint('[mapa de arenas] imagem faltando no estilo: ${event.id}');
  }

  Future<void> _syncPins() async {
    final map = _map;
    if (map == null || !_styleInstalled) return;
    await updateArenaMapPins(map, widget.pins);
    if (!mounted) return;
    await _maybeInitialFit();
  }

  /// Enquadra uma vez, quando os primeiros pinos chegam. Depois disso a câmera
  /// é do atleta: refazer o enquadramento a cada refiltro arrancaria o mapa da
  /// mão dele.
  Future<void> _maybeInitialFit() async {
    if (_didInitialFit || widget.pins.isEmpty) return;
    _didInitialFit = true;
    await _fitPins(widget.pins);
  }

  Future<void> _fitPins(
    List<ArenaMapPin> pins, [
    ({double latitude, double longitude})? fallbackCenter,
  ]) async {
    final map = _map;
    if (map == null) return;

    final bounds = arenaMapPinsBounds(pins);
    if (bounds == null) return;

    if (bounds.isSinglePoint) {
      await _flyTo(
        bounds.centerLatitude,
        bounds.centerLongitude,
        zoom: _singlePointZoom,
      );
      return;
    }

    final camera = await map.cameraForCoordinateBounds(
      CoordinateBounds(
        southwest: Point(
          coordinates: Position(bounds.minLongitude, bounds.minLatitude),
        ),
        northeast: Point(
          coordinates: Position(bounds.maxLongitude, bounds.maxLatitude),
        ),
        infiniteBounds: false,
      ),
      MbxEdgeInsets(
        top: 140,
        left: 48,
        // Folga só para os controles flutuantes e a atribuição do Mapbox. A
        // lista não entra na conta: o enquadramento roda uma vez, na abertura,
        // quando ainda não houve busca e o sheet não está na tela.
        bottom: 120,
        right: 48,
      ),
      null,
      // A inclinação entra no cálculo: enquadrar como se fosse vista de cima
      // e depois inclinar joga os pinos do topo para fora da tela.
      mapboxDefaultPitch,
      _singlePointZoom + 1,
      null,
    );

    final floor = arenaMapZoomFloorOverride(
      fittedZoom: camera.zoom,
      minZoom: _minFitZoom,
      bounds: bounds,
      fallbackCenter: fallbackCenter ?? widget.initialCenter,
    );
    if (floor != null) {
      await _flyTo(floor.latitude, floor.longitude, zoom: floor.zoom);
      return;
    }

    await map.flyTo(camera, MapAnimationOptions(duration: 700));
  }

  Future<void> _flyTo(double latitude, double longitude, {double? zoom}) async {
    final map = _map;
    if (map == null) return;
    await map.flyTo(
      CameraOptions(
        center: Point(coordinates: Position(longitude, latitude)),
        zoom: zoom,
        pitch: mapboxDefaultPitch,
      ),
      MapAnimationOptions(duration: 600),
    );
  }

  /// Volta ao norte mantendo a inclinação.
  ///
  /// Zerar o pitch aqui achataria o mapa 3D a cada toque na bússola — o
  /// atleta pediu o norte, não a vista de cima.
  Future<void> _resetNorth() async {
    final map = _map;
    if (map == null) return;
    await map.flyTo(
      CameraOptions(bearing: 0, pitch: mapboxDefaultPitch),
      MapAnimationOptions(duration: 400),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Sem `viewport`: ele é declarativo e `CameraViewportState` não tem
    // igualdade por valor, então cada rebuild parecia um viewport novo e
    // arrancava a câmera de volta para a posição inicial — ao fechar o card
    // de uma arena, ao digitar na busca, ao trocar um filtro. A câmera passa
    // a ser definida uma vez e, daí em diante, pertence ao atleta.
    return MapWidget(
      key: const ValueKey('arena-map'),
      styleUri: mapboxStyleUri,
      mapOptions: MapOptions(
        pixelRatio: MediaQuery.devicePixelRatioOf(context),
      ),
      onMapCreated: _onMapCreated,
      onStyleLoadedListener: _onStyleLoaded,
      onStyleImageMissingListener: _onStyleImageMissing,
    );
  }
}

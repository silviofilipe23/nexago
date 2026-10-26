import 'dart:ui' as ui;

import 'package:flutter/services.dart' show rootBundle;
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

/// O pino do mapa de arenas.
///
/// É arte pronta, não desenho em código: o PNG já vem com o brilho e o
/// relevo do render 3D, que canvas não reproduz. Por isso aqui só há
/// carregamento e medidas — nada de `Canvas`.
class ArenaPinAsset {
  const ArenaPinAsset._();

  static const String path = 'assets/images/arena_map_pin.png';

  /// Largura do pino na tela, em pontos.
  ///
  /// A medida é a LARGURA e não a altura porque a arte é uma quadra deitada,
  /// mais larga que alta. É a largura que determina quanto duas arenas
  /// vizinhas se cobrem — dimensionar pela altura esconderia esse custo.
  ///
  /// Abaixo disso a rede e as linhas da quadra viram mancha.
  ///
  /// **Mudar este número exige reexportar o PNG** na largura nova vezes
  /// [scale] — o arquivo é rasterizado no tamanho final, não redimensionado
  /// em tempo de execução.
  static const double displayWidth = 56;

  /// O PNG é exportado com o triplo das medidas de tela.
  static const double scale = 3;

  /// Opacidade da arena pré-cadastrada, sem vínculo com a nexaGO.
  ///
  /// Parceira nunca apaga, nem sem horário livre no filtro: ela é onde o
  /// atleta reserva pelo app, e sumir com ela por causa do horário escolhido
  /// esconde justamente quem importa.
  static const double mutedOpacity = 0.45;

  /// Escala do pino de arena parceira, sobre [displayWidth].
  ///
  /// Maior que a pré-cadastrada (1.0) para a parceira saltar no mapa. O PNG
  /// a 3x aguenta esse aumento sem borrar a rede da quadra; passando muito
  /// disso, reexportar a arte maior.
  static const double partnerIconSize = 1.3;
}

/// Carrega o PNG do pino já pronto para o Mapbox.
///
/// Devolve nulo em vez de estourar: sem o pino o mapa fica sem marcador, o que
/// é ruim, mas derrubar a aba inteira por causa de um asset é pior.
Future<MbxImage?> loadArenaPinImage() async {
  try {
    final data = await rootBundle.load(ArenaPinAsset.path);
    final bytes = data.buffer.asUint8List();

    // As medidas vão para o lado nativo junto com os bytes e precisam bater
    // com o PNG de verdade — declarar errado desenha lixo, sem erro nenhum.
    final descriptor = await ui.ImageDescriptor.encoded(
      await ui.ImmutableBuffer.fromUint8List(bytes),
    );
    final width = descriptor.width;
    final height = descriptor.height;
    descriptor.dispose();

    return MbxImage(width: width, height: height, data: bytes);
  } catch (_) {
    return null;
  }
}

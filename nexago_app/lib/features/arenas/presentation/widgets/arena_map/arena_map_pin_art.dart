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

  /// Altura do pino na tela, em pontos.
  ///
  /// Escolhido pela sobreposição, não pela legibilidade: acima disso as arenas
  /// de um mesmo bairro começam a se cobrir. Aqui a palavra "nexaGO" fica no
  /// limite do legível e o pino se identifica pela cor e pela silhueta.
  ///
  /// **Mudar este número exige reexportar o PNG** na altura nova vezes
  /// [scale] — o arquivo é rasterizado no tamanho final, não redimensionado
  /// em tempo de execução.
  static const double displayHeight = 44;

  /// O PNG é exportado com o triplo das medidas de tela.
  static const double scale = 3;

  /// Opacidade de quem não tem horário livre no filtro atual.
  ///
  /// Mesma arte, apagada: sem preço no pino, é o que deixa o atleta ver de
  /// longe onde dá para jogar hoje.
  static const double mutedOpacity = 0.45;
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

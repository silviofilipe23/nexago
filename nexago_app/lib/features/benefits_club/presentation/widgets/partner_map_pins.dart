import 'dart:async';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/painting.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/benefits_club_logic.dart';
import '../../domain/partner.dart';
import 'partner_visuals.dart';

/// Pino do parceiro no mapa da busca do clube: um círculo de [diameter] pt
/// com aro na cor da marca. Com logo, a logo sobre fundo branco; sem logo (ou
/// enquanto ela baixa, ou se falhar), as iniciais sobre a cor da marca — como
/// a logo da lista.
///
/// É desenhado no app porque cada parceiro tem a sua imagem: o Mapbox recebe
/// um PNG por parceiro e escolhe pelo `icon` do pino.
abstract final class PartnerMapPin {
  PartnerMapPin._();

  /// Tamanho do pino na tela, em pontos.
  static const double diameter = 44;

  /// O PNG sai com o triplo das medidas, como o pino da quadra.
  static const double scale = 3;

  /// Espessura do aro na cor da marca, em pontos.
  static const double ring = 3;

  /// Respiro entre o aro e a logo, em pontos.
  static const double logoPadding = 5;

  /// Quanto esperar a logo antes de desistir e ficar nas iniciais.
  static const Duration logoTimeout = Duration(seconds: 10);

  static int get pixels => (diameter * scale).round();
}

/// Id da imagem do pino no estilo do mapa.
String partnerPinImageId(String partnerId) => 'nexago-partner-pin-$partnerId';

/// Desenha o pino e devolve o PNG ([PartnerMapPin.pixels] de lado).
Future<MbxImage> renderPartnerPinImage({
  required Color brand,
  required String initials,
  ui.Image? logo,
}) async {
  final size = PartnerMapPin.pixels.toDouble();
  final center = Offset(size / 2, size / 2);
  final ring = PartnerMapPin.ring * PartnerMapPin.scale;
  final innerRadius = size / 2 - ring;

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder, Rect.fromLTWH(0, 0, size, size));

  // Aro na cor da marca (e o fundo das iniciais).
  canvas.drawCircle(center, size / 2, Paint()..color = brand);

  if (logo != null) {
    canvas.drawCircle(center, innerRadius, Paint()..color = AppColors.white);
    final pad = PartnerMapPin.logoPadding * PartnerMapPin.scale;
    final box = Rect.fromCircle(center: center, radius: innerRadius - pad);
    canvas.save();
    canvas.clipPath(
      Path()..addOval(Rect.fromCircle(center: center, radius: innerRadius)),
    );
    paintImage(
      canvas: canvas,
      rect: box,
      image: logo,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.medium,
    );
    canvas.restore();
  } else {
    final painter = TextPainter(
      text: TextSpan(
        text: initials,
        style: TextStyle(
          color: onPartnerBrand(brand),
          fontSize: size * 0.34,
          fontWeight: FontWeight.w800,
          height: 1,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    painter.paint(
      canvas,
      center - Offset(painter.width / 2, painter.height / 2),
    );
  }

  final image = await recorder.endRecording().toImage(
    PartnerMapPin.pixels,
    PartnerMapPin.pixels,
  );
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  return MbxImage(
    width: PartnerMapPin.pixels,
    height: PartnerMapPin.pixels,
    data: bytes!.buffer.asUint8List(),
  );
}

/// Pino de iniciais do parceiro (o que aparece até a logo chegar).
Future<MbxImage> renderPartnerInitialsPin(Partner partner) =>
    renderPartnerPinImage(
      brand: partnerBrandColor(partner),
      initials: partnerInitials(partner.name),
    );

/// Baixa a logo pelo mesmo cache das telas do clube; `null` se não houver
/// logo, falhar ou demorar além de [PartnerMapPin.logoTimeout].
Future<ui.Image?> loadPartnerLogoImage(String? url) async {
  final trimmed = url?.trim() ?? '';
  if (trimmed.isEmpty) return null;
  final completer = Completer<ui.Image?>();
  final stream = ResizeImage(
    CachedNetworkImageProvider(trimmed),
    width: PartnerMapPin.pixels,
    allowUpscaling: false,
  ).resolve(ImageConfiguration.empty);
  late final ImageStreamListener listener;
  listener = ImageStreamListener(
    (info, _) {
      if (!completer.isCompleted) completer.complete(info.image.clone());
      stream.removeListener(listener);
    },
    onError: (_, __) {
      if (!completer.isCompleted) completer.complete(null);
      stream.removeListener(listener);
    },
  );
  stream.addListener(listener);
  return completer.future.timeout(
    PartnerMapPin.logoTimeout,
    onTimeout: () {
      stream.removeListener(listener);
      return null;
    },
  );
}

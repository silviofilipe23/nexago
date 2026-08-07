import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../../domain/match_history/match_share_poster_data.dart';
import 'match_share_poster_painter.dart';

/// Resolve as fotos dos atletas em [ui.Image] — o painter é síncrono, então
/// elas precisam estar prontas antes do primeiro traço. Foto que não carrega
/// (ou demora demais) fica de fora e o círculo cai nas iniciais: a arte nunca
/// quebra por causa de um avatar, mesma decisão do portal.
Future<Map<String, ui.Image>> loadMatchSharePosterPhotos(
  MatchSharePosterData data,
) async {
  final loaded = await Future.wait(
    data.photoUrls.map((url) async => (url: url, image: await _loadImage(url))),
  );
  return {
    for (final entry in loaded)
      if (entry.image != null) entry.url: entry.image!,
  };
}

Future<ui.Image?> _loadImage(String url) {
  final completer = Completer<ui.Image?>();
  final stream = CachedNetworkImageProvider(
    url,
  ).resolve(ImageConfiguration.empty);

  late final ImageStreamListener listener;
  void finish(ui.Image? image) {
    if (!completer.isCompleted) completer.complete(image);
    stream.removeListener(listener);
  }

  listener = ImageStreamListener(
    (info, _) => finish(info.image),
    onError: (error, stackTrace) {
      debugPrint('share poster photo skipped ($url): $error');
      finish(null);
    },
  );
  stream.addListener(listener);

  return completer.future.timeout(
    const Duration(seconds: 8),
    onTimeout: () {
      stream.removeListener(listener);
      return null;
    },
  );
}

/// Gera o PNG do pôster fora da árvore de widgets: o artboard sai sempre em
/// 1080×1920 reais, independentemente do tamanho do preview em tela.
Future<File?> captureMatchSharePosterPng(
  MatchSharePosterData data,
  Map<String, ui.Image> photos,
) async {
  final recorder = ui.PictureRecorder();
  drawMatchSharePoster(
    Canvas(
      recorder,
      const Rect.fromLTWH(0, 0, matchSharePosterWidth, matchSharePosterHeight),
    ),
    data,
    photos,
  );

  final picture = recorder.endRecording();
  try {
    final image = await picture.toImage(
      matchSharePosterWidth.toInt(),
      matchSharePosterHeight.toInt(),
    );
    try {
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      if (bytes == null) return null;
      final file = File(
        '${Directory.systemTemp.path}/nexago_partida_'
        '${DateTime.now().millisecondsSinceEpoch}.png',
      );
      await file.writeAsBytes(bytes.buffer.asUint8List());
      return file;
    } finally {
      image.dispose();
    }
  } finally {
    picture.dispose();
  }
}

/// Origem do popover no iOS/iPadOS (evita `PlatformException` no share sheet).
Rect matchSharePosterOrigin(BuildContext context) {
  final size = MediaQuery.sizeOf(context);
  const side = 2.0;
  return Rect.fromLTWH(
    (size.width - side) / 2,
    (size.height - side) / 2,
    side,
    side,
  );
}

Future<ShareResult> shareMatchSharePosterPng(
  File file,
  MatchSharePosterData data, {
  Rect? sharePositionOrigin,
}) {
  // Mesmos título e texto do `navigator.share` do portal.
  return Share.shareXFiles(
    [XFile(file.path, mimeType: 'image/png', name: 'nexago_partida.png')],
    subject: '${data.teamA.name} x ${data.teamB.name}',
    text:
        '${data.teamA.name} ${data.setWinsA}–${data.setWinsB} ${data.teamB.name}',
    sharePositionOrigin: sharePositionOrigin,
  );
}

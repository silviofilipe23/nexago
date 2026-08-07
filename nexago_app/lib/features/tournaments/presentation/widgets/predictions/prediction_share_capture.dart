import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import 'package:nexago_app/core/ui/nexa_share.dart';

import '../../../domain/predictions/prediction_share_text.dart';
import 'prediction_share_card_painter.dart';

/// Gera o PNG do ranking de palpites e abre a folha nativa.
///
/// Diferente de `sand_rank_share_capture.dart` e `match_detail_share_capture.dart`,
/// não há `GlobalKey` nem `RepaintBoundary`: o card é pintado direto num canvas
/// (ver `prediction_share_card_painter.dart`), então não depende de estar
/// montado na árvore nem de esperar o fim do frame.
Future<File?> capturePredictionSharePng(PredictionShareData data) async {
  final image = await renderPredictionShareCard(data);
  try {
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) return null;

    final file = File(
      '${Directory.systemTemp.path}/nexago_palpites_'
      '${DateTime.now().millisecondsSinceEpoch}.png',
    );
    await file.writeAsBytes(bytes.buffer.asUint8List());
    return file;
  } finally {
    image.dispose();
  }
}

/// Compartilha a imagem + a legenda com o link. No celular a folha nativa é
/// quem oferece WhatsApp, Stories e o resto — por isso não há um botão por
/// destino.
Future<ShareResult> sharePredictionRankingPng(
  BuildContext context,
  File file,
  String text,
) {
  return Share.shareXFiles(
    [XFile(file.path, mimeType: 'image/png', name: 'nexago_palpites.png')],
    text: text,
    sharePositionOrigin: nexaSharePositionOrigin(context),
  );
}

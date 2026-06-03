import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:share_plus/share_plus.dart';

import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_share_card.dart';

/// Gera PNG do [MatchDetailShareCard] a partir de um [GlobalKey] em [RepaintBoundary].
Future<File?> captureMatchDetailShareCardPng(
  GlobalKey boundaryKey, {
  double pixelRatio = 3,
}) async {
  final renderObject = boundaryKey.currentContext?.findRenderObject();
  if (renderObject is! RenderRepaintBoundary) return null;

  final image = await renderObject.toImage(pixelRatio: pixelRatio);
  final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
  if (byteData == null) return null;

  final file = File(
    '${Directory.systemTemp.path}/nexago_partida_'
    '${DateTime.now().millisecondsSinceEpoch}.png',
  );
  await file.writeAsBytes(byteData.buffer.asUint8List());
  return file;
}

Future<void> shareMatchDetailShareCardPng(
  File file, {
  MatchDetailShareVariant variant = MatchDetailShareVariant.victory,
}) {
  return Share.shareXFiles(
    [XFile(file.path, mimeType: 'image/png')],
    subject: shareSubjectForVariant(variant),
  );
}

String shareSubjectForVariant(MatchDetailShareVariant variant) {
  return switch (variant) {
    MatchDetailShareVariant.victory => 'Minha vitória · nexaGO',
    MatchDetailShareVariant.defeat => 'Resultado da partida · nexaGO',
    MatchDetailShareVariant.live => 'Jogo ao vivo · nexaGO',
    MatchDetailShareVariant.scheduled => 'Próximo jogo · nexaGO',
    MatchDetailShareVariant.spectator => 'Partida · nexaGO',
  };
}

/// Largura máxima do preview na UI (o artboard exportável permanece [MatchDetailShareCard.designWidth]).
const matchDetailSharePreviewMaxWidth = 172.0;

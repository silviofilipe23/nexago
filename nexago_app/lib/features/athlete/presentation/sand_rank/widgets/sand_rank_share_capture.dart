import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:share_plus/share_plus.dart';

/// Gera PNG de um widget do Sand Rank (card/emblema) a partir de um
/// [GlobalKey] em [RepaintBoundary]. Mesma técnica de
/// `match_detail_share_capture.dart`.
Future<File?> captureSandRankSharePng(
  GlobalKey boundaryKey, {
  double pixelRatio = 3,
}) async {
  final context = boundaryKey.currentContext;
  if (context == null) {
    debugPrint('captureSandRankSharePng: boundary context is null');
    return null;
  }

  final renderObject = context.findRenderObject();
  if (renderObject is! RenderRepaintBoundary) {
    debugPrint(
      'captureSandRankSharePng: expected RenderRepaintBoundary, '
      'got ${renderObject.runtimeType}',
    );
    return null;
  }

  if (renderObject.debugNeedsPaint) {
    await Future<void>.delayed(Duration.zero);
    await WidgetsBinding.instance.endOfFrame;
  }

  final image = await renderObject.toImage(pixelRatio: pixelRatio);
  final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
  if (byteData == null) return null;

  final file = File(
    '${Directory.systemTemp.path}/nexago_elo_'
    '${DateTime.now().millisecondsSinceEpoch}.png',
  );
  await file.writeAsBytes(byteData.buffer.asUint8List());
  return file;
}

/// Compartilha o PNG capturado + texto do degrau atual/alcançado.
Future<ShareResult> shareSandRankPng(
  File file,
  String text, {
  Rect? sharePositionOrigin,
}) {
  return Share.shareXFiles(
    [XFile(file.path, mimeType: 'image/png', name: 'nexago_elo.png')],
    text: text,
    sharePositionOrigin: sharePositionOrigin,
  );
}

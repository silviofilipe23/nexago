import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../brand/nexa_hashtag.dart';

/// Origem do popover no iOS/iPadOS (evita `PlatformException` no share sheet).
Rect nexaSharePositionOrigin(BuildContext context) {
  final size = MediaQuery.sizeOf(context);
  const side = 2.0;
  return Rect.fromLTWH(
    (size.width - side) / 2,
    (size.height - side) / 2,
    side,
    side,
  );
}

Future<ShareResult> nexaShareUri(BuildContext context, Uri uri) {
  return Share.shareUri(
    uri,
    sharePositionOrigin: nexaSharePositionOrigin(context),
  );
}

/// Compartilha [text] com a hashtag da campanha no fim.
///
/// A hashtag é acrescentada AQUI, no funil, e não em cada chamada: são dezenas
/// de pontos de compartilhamento no app (perfil, torneio, liga, indicação,
/// reserva) e qualquer um esquecido sai sem a campanha.
Future<ShareResult> nexaShareText(
  BuildContext context,
  String text, {
  String? subject,
}) {
  return Share.share(
    withNexaHashtag(text),
    subject: subject,
    sharePositionOrigin: nexaSharePositionOrigin(context),
  );
}

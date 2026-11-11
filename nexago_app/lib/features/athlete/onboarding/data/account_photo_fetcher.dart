import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Baixa a foto da conta (login com Google) para já entrar como foto de
/// perfil no onboarding. É só um ponto de partida: o atleta pode trocar, e os
/// bytes sobem pro Storage no "Concluir" como qualquer foto escolhida.
///
/// Devolve `null` em qualquer falha: sem foto pré-preenchida, o passo pede a
/// foto como sempre pediu.
typedef AccountPhotoFetcher = Future<Uint8List?> Function(Uri uri);

const kAccountPhotoFetchTimeout = Duration(seconds: 8);
const kAccountPhotoMaxBytes = 5 * 1024 * 1024;

/// Lado da foto pedida ao Google (a URL do login vem com 96 px).
const kAccountPhotoSize = 512;

final accountPhotoFetcherProvider = Provider<AccountPhotoFetcher>(
  (ref) => fetchAccountPhoto,
);

/// URL da foto da conta pronta para baixar, ou `null` se não houver. A foto do
/// Google (`…googleusercontent.com/…=s96-c`) é pedida em [kAccountPhotoSize]:
/// 96 px fica borrada no perfil, nas listas e no card de compartilhar.
Uri? accountPhotoUri(String? photoUrl) {
  final raw = photoUrl?.trim() ?? '';
  if (raw.isEmpty) return null;
  final uri = Uri.tryParse(raw);
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return null;
  if (!uri.host.endsWith('googleusercontent.com')) return uri;
  final sized = raw.replaceFirst(
    RegExp(r'=s\d+(-c)?$'),
    '=s$kAccountPhotoSize-c',
  );
  return Uri.parse(sized);
}

/// Tipo da imagem pelos primeiros bytes. Só JPEG e PNG: são os formatos que o
/// Storage e o recorte do app já tratam.
String? imageContentTypeOf(Uint8List bytes) {
  if (bytes.length >= 3 &&
      bytes[0] == 0xFF &&
      bytes[1] == 0xD8 &&
      bytes[2] == 0xFF) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4E &&
      bytes[3] == 0x47) {
    return 'image/png';
  }
  return null;
}

Future<Uint8List?> fetchAccountPhoto(Uri uri) async {
  final client = HttpClient()..connectionTimeout = kAccountPhotoFetchTimeout;
  try {
    final request = await client.getUrl(uri).timeout(kAccountPhotoFetchTimeout);
    final response = await request.close().timeout(kAccountPhotoFetchTimeout);
    if (response.statusCode != HttpStatus.ok) return null;
    final builder = BytesBuilder(copy: false);
    await for (final chunk in response.timeout(kAccountPhotoFetchTimeout)) {
      builder.add(chunk);
      if (builder.length > kAccountPhotoMaxBytes) return null;
    }
    return builder.takeBytes();
  } catch (_) {
    return null;
  } finally {
    client.close(force: true);
  }
}

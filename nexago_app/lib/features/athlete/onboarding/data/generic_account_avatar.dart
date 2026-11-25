import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Quem não pôs foto na conta Google recebe um avatar gerado: a inicial em
/// branco sobre um fundo de cor só. A URL é igual à de uma foto de verdade, então
/// só a imagem denuncia. Pré-preenchido no onboarding, ele cumpria a foto
/// obrigatória sem identificar ninguém.
///
/// Regra: um fundo liso cobre quase tudo, e todo pixel está na mistura entre
/// esse fundo e o branco (a letra e a borda suavizada dela). Foto nenhuma tem
/// isso. Um logo de duas cores não tem fundo tão dominante. Uma imagem lisa
/// também cai aqui, e tudo bem: ela também não identifica ninguém.
///
/// Calibrado no avatar real (fundo em 94%, 100% na mistura) contra fotos,
/// logos e avatares de sistema (nenhum passou de 64% de fundo nesses casos).
/// Espelho de `isGenericAccountAvatar` no portal do atleta
/// (`frontend/projects/athlete/src/app/data/account-photo.ts`).
const kGenericAvatarSampleSide = 64;
const kGenericAvatarMinBackgroundShare = 0.8;
const kGenericAvatarMinBlendShare = 0.99;

/// Quanto um canal pode se afastar da cor de fundo e ainda contar como fundo
/// (ruído de JPEG).
const _backgroundTolerance = 8;

/// Quanto um canal pode se afastar da linha fundo→branco.
const _blendTolerance = 16;

/// `true` quando os bytes são o avatar genérico de inicial. Bytes que não
/// decodificam devolvem `false`: na dúvida, não se descarta a foto.
bool isGenericAccountAvatar(Uint8List bytes) {
  final img.Image? decoded;
  try {
    decoded = img.decodeImage(bytes);
  } on Exception {
    return false;
  }
  if (decoded == null) return false;
  final sample = img.copyResize(
    decoded,
    width: kGenericAvatarSampleSide,
    height: kGenericAvatarSampleSide,
    interpolation: img.Interpolation.average,
  );
  final pixels = [
    for (final p in sample) (p.r.toInt(), p.g.toInt(), p.b.toInt()),
  ];
  return isMonogramPixels(pixels);
}

typedef Rgb = (int, int, int);

/// O núcleo da regra, sobre os pixels já reduzidos.
bool isMonogramPixels(List<Rgb> pixels) {
  if (pixels.isEmpty) return false;
  final background = _mostCommon(pixels);
  var onBackground = 0;
  var onBlend = 0;
  for (final pixel in pixels) {
    if (_maxChannelGap(pixel, background) <= _backgroundTolerance) {
      onBackground++;
    }
    if (_distanceToBlend(pixel, background) <= _blendTolerance) onBlend++;
  }
  return onBackground / pixels.length >= kGenericAvatarMinBackgroundShare &&
      onBlend / pixels.length >= kGenericAvatarMinBlendShare;
}

Rgb _mostCommon(List<Rgb> pixels) {
  final counts = <Rgb, int>{};
  for (final pixel in pixels) {
    counts[pixel] = (counts[pixel] ?? 0) + 1;
  }
  return counts.entries.reduce((a, b) => b.value > a.value ? b : a).key;
}

int _maxChannelGap(Rgb a, Rgb b) => [
      (a.$1 - b.$1).abs(),
      (a.$2 - b.$2).abs(),
      (a.$3 - b.$3).abs(),
    ].reduce((x, y) => x > y ? x : y);

/// Maior desvio por canal entre o pixel e o ponto mais próximo do segmento
/// fundo→branco.
double _distanceToBlend(Rgb pixel, Rgb background) {
  final dr = 255 - background.$1;
  final dg = 255 - background.$2;
  final db = 255 - background.$3;
  final length = dr * dr + dg * dg + db * db;
  final t = length == 0
      ? 0.0
      : (((pixel.$1 - background.$1) * dr +
                  (pixel.$2 - background.$2) * dg +
                  (pixel.$3 - background.$3) * db) /
              length)
          .clamp(0.0, 1.0);
  final gaps = [
    (pixel.$1 - (background.$1 + t * dr)).abs(),
    (pixel.$2 - (background.$2 + t * dg)).abs(),
    (pixel.$3 - (background.$3 + t * db)).abs(),
  ];
  return gaps.reduce((x, y) => x > y ? x : y);
}

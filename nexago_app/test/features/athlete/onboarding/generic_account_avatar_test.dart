import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:nexago_app/features/athlete/onboarding/data/generic_account_avatar.dart';

/// Quem não pôs foto na conta Google recebe um avatar gerado: a inicial em
/// branco sobre um fundo de cor só. Pré-preenchido no onboarding, ele passava
/// como "foto" e o atleta concluía o cadastro sem rosto nenhum.

/// Igual ao do Google: letra branca, borda suavizada, fundo liso, 512 px.
Uint8List monogramPng({img.Color? background}) {
  final small = img.Image(width: 128, height: 128);
  img.fill(small, color: background ?? img.ColorRgb8(120, 144, 156));
  img.drawString(
    small,
    'A',
    font: img.arial48,
    x: 50,
    y: 40,
    color: img.ColorRgb8(255, 255, 255),
  );
  final big = img.copyResize(
    small,
    width: 512,
    height: 512,
    interpolation: img.Interpolation.linear,
  );
  return img.encodePng(big);
}

/// Foto de verdade: cor varia pela imagem toda.
Uint8List photoLikePng() {
  final image = img.Image(width: 256, height: 256);
  for (final p in image) {
    p
      ..r = p.x
      ..g = p.y
      ..b = (p.x * p.y) % 256;
  }
  return img.encodePng(image);
}

void main() {
  test('reconhece o avatar de inicial que o Google gera', () {
    expect(isGenericAccountAvatar(monogramPng()), isTrue);
    expect(
      isGenericAccountAvatar(
        monogramPng(background: img.ColorRgb8(239, 108, 0)),
      ),
      isTrue,
    );
  });

  test('o mesmo avatar em JPEG (com ruído de compressão) também', () {
    final jpg = img.encodeJpg(img.decodePng(monogramPng())!, quality: 85);
    expect(isGenericAccountAvatar(jpg), isTrue);
  });

  test('foto de verdade passa', () {
    expect(isGenericAccountAvatar(photoLikePng()), isFalse);
  });

  test('imagem de duas cores sem fundo dominante (logo) passa', () {
    final image = img.Image(width: 200, height: 200);
    img.fill(image, color: img.ColorRgb8(30, 60, 200));
    img.fillRect(
      image,
      x1: 100,
      y1: 0,
      x2: 199,
      y2: 199,
      color: img.ColorRgb8(255, 255, 255),
    );
    expect(isGenericAccountAvatar(img.encodePng(image)), isFalse);
  });

  test('bytes que não decodificam não são julgados genéricos', () {
    expect(
      isGenericAccountAvatar(Uint8List.fromList(const [0xFF, 0xD8, 0xFF])),
      isFalse,
    );
    expect(isGenericAccountAvatar(Uint8List(0)), isFalse);
  });
}

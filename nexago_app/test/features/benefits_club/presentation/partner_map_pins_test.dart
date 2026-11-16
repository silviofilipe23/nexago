import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/features/benefits_club/domain/partner.dart';
import 'package:nexago_app/features/benefits_club/presentation/widgets/benefits_discovery.dart';
import 'package:nexago_app/features/benefits_club/presentation/widgets/partner_map_pins.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' show MbxImage;

const _brand = Color(0xFF5E1E7A);

/// Pixels RGBA do PNG do pino.
Future<({ByteData data, int size})> _pixels(MbxImage image) async {
  final codec = await ui.instantiateImageCodec(image.data);
  final frame = await codec.getNextFrame();
  final data = await frame.image.toByteData(format: ui.ImageByteFormat.rawRgba);
  final size = frame.image.width;
  frame.image.dispose();
  return (data: data!, size: size);
}

Color _at(({ByteData data, int size}) px, int x, int y) {
  final i = (y * px.size + x) * 4;
  return Color.fromARGB(
    px.data.getUint8(i + 3),
    px.data.getUint8(i),
    px.data.getUint8(i + 1),
    px.data.getUint8(i + 2),
  );
}

/// Uma "logo" de teste: um quadrado sólido verde.
Future<ui.Image> _greenLogo() async {
  final recorder = ui.PictureRecorder();
  Canvas(recorder).drawRect(
    const Rect.fromLTWH(0, 0, 40, 40),
    Paint()..color = const Color(0xFF00C853),
  );
  return recorder.endRecording().toImage(40, 40);
}

Partner _partner(String id, {List<PartnerLocation> locations = const []}) =>
    Partner(
      id: id,
      name: 'Parceiro $id',
      category: PartnerCategory.food,
      benefitHighlight: '10% OFF',
      benefitTitle: 'Desconto',
      ctaLabel: 'Usar',
      active: true,
      locations: locations,
    );

const _loc = PartnerLocation(
  name: 'Loja',
  address: 'Rua 1',
  latitude: -16.7,
  longitude: -49.2,
);

void main() {
  testWidgets('sem logo: PNG do tamanho do pino, aro e fundo na cor da marca', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final image = await renderPartnerPinImage(brand: _brand, initials: 'FA');
      expect(image.width, PartnerMapPin.pixels);
      expect(image.height, PartnerMapPin.pixels);
      expect(image.data.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);
      expect(
        PartnerMapPin.pixels / PartnerMapPin.scale,
        PartnerMapPin.diameter,
      );

      final px = await _pixels(image);
      final s = px.size;
      // Canto: fora do círculo, transparente.
      expect(_at(px, 0, 0).a, 0);
      // Aro (borda de cima) e fundo perto da borda interna: a marca.
      expect(_at(px, s ~/ 2, 2), _brand);
      expect(_at(px, s ~/ 2, (s * 0.15).round()), _brand);
    });
  });

  testWidgets('com logo: aro da marca, fundo branco e a logo no meio', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final logo = await _greenLogo();
      final image = await renderPartnerPinImage(
        brand: _brand,
        initials: 'FA',
        logo: logo,
      );
      final px = await _pixels(image);
      final s = px.size;
      expect(_at(px, s ~/ 2, 2), _brand, reason: 'aro');
      // Entre o aro e a logo: fundo branco.
      final ring = (PartnerMapPin.ring * PartnerMapPin.scale).round();
      expect(_at(px, s ~/ 2, ring + 3), AppColors.white, reason: 'fundo');
      expect(_at(px, s ~/ 2, s ~/ 2), const Color(0xFF00C853), reason: 'logo');
    });
  });

  test('pinos do mapa: imagem própria só para quem já tem e o tocado em '
      'destaque', () {
    final pins = benefitsMapPins(
      [
        _partner('fast', locations: const [_loc]),
        _partner('linq', locations: const [_loc, _loc]),
      ],
      withImage: {'fast'},
      selectedId: 'linq',
    );
    expect(pins, hasLength(3));
    expect(pins[0].iconImageId, partnerPinImageId('fast'));
    expect(pins[0].selected, isFalse);
    // A LinQ ainda não tem imagem pronta: cai na arte padrão até chegar.
    expect(pins[1].iconImageId, isNull);
    expect(pins.where((p) => p.selected).map((p) => p.arenaId), [
      'linq#0',
      'linq#1',
    ]);
  });

  test('sem logo cadastrada não tenta baixar', () async {
    expect(await loadPartnerLogoImage(null), isNull);
    expect(await loadPartnerLogoImage('  '), isNull);
  });
}

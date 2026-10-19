import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/store/domain/store_customize_rules.dart';
import 'package:nexago_app/features/store/domain/store_customize_service.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';

/// Cabeçalho de PNG com IHDR [w] × [h] (o resto do arquivo não importa).
Uint8List _png(int w, int h) {
  final bytes = Uint8List(33);
  bytes.setAll(0, const [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  final data = ByteData.sublistView(bytes);
  data.setUint32(8, 13);
  bytes.setAll(12, ascii.encode('IHDR'));
  data.setUint32(16, w);
  data.setUint32(20, h);
  return bytes;
}

/// JPEG mínimo: SOI, um APP0 qualquer e o SOF0 com [w] × [h].
Uint8List _jpg(int w, int h) {
  final app0 = [0xFF, 0xE0, 0x00, 0x06, 0x4A, 0x46, 0x49, 0x46];
  final sof = [0xFF, 0xC0, 0x00, 0x11, 0x08];
  final out = BytesBuilder()
    ..add(const [0xFF, 0xD8])
    ..add(app0)
    ..add(sof)
    ..add([h >> 8, h & 0xFF, w >> 8, w & 0xFF])
    ..add(List.filled(12, 0));
  return out.toBytes();
}

const _peito = StoreCustomArea(
  id: 'peito_esquerdo',
  name: 'Peito esquerdo',
  widthCm: 9,
  heightCm: 9,
);

const _centro = StoreCustomArea(
  id: 'centro_frente',
  name: 'Centro da frente',
  widthCm: 25,
  heightCm: 30,
);

const _imageOptions = StoreCustomImageOptions(
  enabled: true,
  formats: ['png', 'jpg', 'svg'],
  maxSizeMb: 10,
  minWidthPx: 1000,
  minHeightPx: 1000,
  areas: [_peito, _centro],
);

void main() {
  group('nome ao digitar', () {
    test('vira maiúsculas e mantém acento, número, ponto e hífen', () {
      final r = formatStoreCustomNameInput('joão-p. 10', 20);
      expect(r.text, 'JOÃO-P. 10');
      expect(r.rejected, isFalse);
    });

    test('caractere inválido não entra e marca a recusa', () {
      final r = formatStoreCustomNameInput('ana@!😀', 12);
      expect(r.text, 'ANA');
      expect(r.rejected, isTrue);
    });

    test(
        'sem espaço no começo nem duplo; um no fim fica para a próxima '
        'palavra', () {
      expect(formatStoreCustomNameInput('  ana   maria', 20).text, 'ANA MARIA');
      expect(formatStoreCustomNameInput('ana ', 20).text, 'ANA ');
      expect(formatStoreCustomNameInput('ana\tbia', 20).text, 'ANA BIA');
    });

    test('corta em maxChars sem acusar caractere inválido', () {
      final r = formatStoreCustomNameInput('antunesantunes', 12);
      expect(r.text, 'ANTUNESANTUN');
      expect(storeCustomNameLength(r.text), 12);
      expect(r.rejected, isFalse);
    });

    test('normalizado como o servidor grava', () {
      expect(normalizeStoreCustomName(' ana  maria '), 'ANA MARIA');
      expect(normalizeStoreCustomName('ANTUNES '), 'ANTUNES');
    });

    test('hint laranja a partir de max − 2', () {
      expect(storeCustomNameNearLimit(9, 12), isFalse);
      expect(storeCustomNameNearLimit(10, 12), isTrue);
      expect(storeCustomNameNearLimit(12, 12), isTrue);
    });

    test('problema do servidor', () {
      expect(StoreNameProblem.from('blocked'), StoreNameProblem.blocked);
      expect(StoreNameProblem.from('disabled'), StoreNameProblem.disabled);
      expect(StoreNameProblem.from('outro'), isNull);
    });

    test('título e lado pelo placement', () {
      expect(
          storeNameStepTitle(StoreNamePlacement.backUpper), 'Nome nas costas');
      expect(
          storeNameStepTitle(StoreNamePlacement.backLower), 'Nome nas costas');
      expect(storeNameStepTitle(StoreNamePlacement.front), 'Nome na frente');
      expect(storeNameStepTitle(StoreNamePlacement.sleeve), 'Nome na manga');
      expect(storeNameSide(StoreNamePlacement.backLower), StorePhotoView.back);
      expect(storeNameSide(StoreNamePlacement.sleeve), StorePhotoView.front);
    });
  });

  group('preço', () {
    const price = StoreCustomPrice(
      nameOnlyCents: 1490,
      imageOnlyCents: 1990,
      bothCents: 2490,
    );

    test('nome, imagem, os dois ou nada', () {
      expect(
          storeCustomExtraCents(price, hasName: true, hasImage: false), 1490);
      expect(
          storeCustomExtraCents(price, hasName: false, hasImage: true), 1990);
      expect(storeCustomExtraCents(price, hasName: true, hasImage: true), 2490);
      expect(storeCustomExtraCents(price, hasName: false, hasImage: false), 0);
    });

    test('total = SKU + adicional, por unidade', () {
      expect(
          storeCustomTotalCents(skuPriceCents: 12990, extraCents: 2490), 15480);
      expect(
        storeCustomTotalCents(skuPriceCents: 12990, extraCents: 1490, qty: 2),
        28960,
      );
    });
  });

  group('cor padrão do nome (contraste WCAG)', () {
    const colors = ['#ffffff', '#111111', '#ff6a1a', '#e3b85c'];

    test('razão de contraste do WCAG', () {
      expect(storeContrastRatio('#000000', '#ffffff'), closeTo(21, 0.01));
      expect(storeContrastRatio('#777777', '#777777'), closeTo(1, 0.001));
      expect(storeContrastRatio('lixo', '#ffffff'), 1);
    });

    test('camiseta preta → branco; branca → preto', () {
      expect(storeDefaultNameColor(colors, '#111111'), '#ffffff');
      expect(storeDefaultNameColor(colors, '#F1ECE2'), '#111111');
    });

    test('mockup: texto escuro só sobre peça clara', () {
      expect(storePrefersDarkText('#F1ECE2'), isTrue);
      expect(storePrefersDarkText('#ffffff'), isTrue);
      expect(storePrefersDarkText('#111111'), isFalse);
      expect(storePrefersDarkText('#ff6a1a'), isTrue);
      expect(storePrefersDarkText(null), isFalse);
      expect(storePrefersDarkText(kStoreMockupBaseHex), isFalse);
    });

    test('SKU sem cor conhecida → a 1ª; sem cor na config → null', () {
      expect(storeDefaultNameColor(colors, null), '#ffffff');
      expect(storeDefaultNameColor(colors, 'azul'), '#ffffff');
      expect(storeDefaultNameColor(const [], '#111111'), isNull);
    });

    test('hex da cor escolhida', () {
      const p = StoreProduct(
        id: 'c',
        name: 'Camiseta',
        priceCents: 100,
        minPriceCents: 100,
        maxPriceCents: 100,
        axes: [
          StoreAxis(id: 'cor', label: 'Cor', values: [
            StoreAxisValue(id: 'preto', label: 'Preta', hex: '#111111'),
          ]),
          StoreAxis(id: 'tam', label: 'Tamanho', values: [
            StoreAxisValue(id: 'm', label: 'M'),
          ]),
        ],
      );
      expect(storeSelectedColorHex(p, const {'cor': 'preto'}), '#111111');
      expect(storeSelectedColorHex(p, const {}), isNull);
      expect(storeCustomizeSubtitle(p, const {'cor': 'preto', 'tam': 'm'}),
          'Camiseta · Preta M');
      expect(storeCustomizeSubtitle(p, const {}), 'Camiseta');
    });
  });

  group('qualidade da imagem', () {
    test('dpi efetivo no lado mais fraco', () {
      // 9 cm = 3,543 pol: 2400 px → 677 dpi; 1000 px → 282 dpi.
      expect(
        storeEffectiveDpi(widthPx: 2400, heightPx: 2400, area: _peito),
        closeTo(677.3, 0.1),
      );
      expect(
        storeEffectiveDpi(widthPx: 4000, heightPx: 1000, area: _peito),
        closeTo(282.2, 0.1),
      );
      expect(
        storeEffectiveDpi(widthPx: null, heightPx: null, area: _peito),
        double.infinity,
      );
    });

    test('≥ 300 boa; abaixo aviso; recalcula pela área', () {
      final peito =
          storeEffectiveDpi(widthPx: 2400, heightPx: 2400, area: _peito);
      final centro =
          storeEffectiveDpi(widthPx: 2400, heightPx: 2400, area: _centro);
      expect(storeImageQuality(peito), StoreImageQuality.good);
      expect(storeImageQuality(centro), StoreImageQuality.warn);
      expect(storeImageQuality(300), StoreImageQuality.good);
      expect(storeImageQuality(299.9), StoreImageQuality.warn);
    });
  });

  group('formato, medida e validação', () {
    test('formato pela assinatura; senão pela extensão', () {
      expect(storeImageFormat(_png(10, 10)), 'png');
      expect(storeImageFormat(_jpg(10, 10)), 'jpg');
      expect(
        storeImageFormat(utf8.encode('<?xml version="1.0"?><svg width="1">')),
        'svg',
      );
      expect(storeImageFormat(Uint8List(4), fileName: 'logo.JPEG'), 'jpg');
      expect(storeImageFormat(Uint8List(4), fileName: 'foto.heic'), isNull);
      expect(storeImageContentType('jpg'), 'image/jpeg');
      expect(storeImageContentType('svg'), 'image/svg+xml');
    });

    test('mede PNG, JPEG e SVG como o servidor', () {
      expect(storeImageSizeFromBytes(_png(2400, 1800)),
          (width: 2400, height: 1800));
      expect(
          storeImageSizeFromBytes(_jpg(1200, 900)), (width: 1200, height: 900));
      expect(
        storeImageSizeFromBytes(
          utf8.encode('<svg xmlns="x" width="300" height="150"></svg>'),
        ),
        (width: 300, height: 150),
      );
      expect(
        storeImageSizeFromBytes(
          utf8.encode('<svg viewBox="0 0 640 480"></svg>'),
        ),
        (width: 640, height: 480),
      );
      expect(storeImageSizeFromBytes(Uint8List(8)), isNull);
    });

    test('reprova formato, peso e resolução; SVG não tem mínimo', () {
      StoreImageProblem? check(String? format, int size, [int? w, int? h]) =>
          storeCustomImageProblem(
            options: _imageOptions,
            format: format,
            sizeBytes: size,
            widthPx: w,
            heightPx: h,
          );
      expect(check('png', 1000, 2400, 2400), isNull);
      expect(check(null, 1000), StoreImageProblem.format);
      expect(
          check('png', 11 * 1024 * 1024, 2400, 2400), StoreImageProblem.size);
      expect(check('jpg', 1000, 999, 2000), StoreImageProblem.resolution);
      expect(check('jpg', 1000), StoreImageProblem.unreadable);
      expect(check('svg', 1000), isNull);
      expect(
        storeCustomImageProblem(
          options: const StoreCustomImageOptions(
            enabled: true,
            formats: ['png'],
            areas: [_peito],
          ),
          format: 'jpg',
          sizeBytes: 10,
          widthPx: 2000,
          heightPx: 2000,
        ),
        StoreImageProblem.format,
      );
    });

    test('mensagens com a regra', () {
      expect(
        storeImageProblemMessage(StoreImageProblem.format, _imageOptions),
        'Formato não aceito · use PNG, JPG ou SVG',
      );
      expect(
        storeImageProblemMessage(StoreImageProblem.size, _imageOptions),
        'Arquivo maior que 10 MB',
      );
      expect(
        storeImageProblemMessage(StoreImageProblem.resolution, _imageOptions),
        'Imagem pequena demais · mínimo 1000 × 1000 px',
      );
    });

    test('compressão leve nunca desce do mínimo', () {
      expect(
        storeCustomResizeTarget(
          width: 6000,
          height: 4000,
          minWidthPx: 1000,
          minHeightPx: 1000,
        ),
        (width: 3000, height: 2000),
      );
      // O mínimo manda mais que o teto do lado maior.
      expect(
        storeCustomResizeTarget(
          width: 8000,
          height: 1200,
          minWidthPx: 1000,
          minHeightPx: 1000,
        ),
        (width: 6667, height: 1000),
      );
      expect(
        storeCustomResizeTarget(
          width: 2400,
          height: 2400,
          minWidthPx: 1000,
          minHeightPx: 1000,
        ),
        isNull,
      );
    });
  });

  group('prévia', () {
    test('centros das áreas conhecidas e da faixa do nome', () {
      expect(storeCustomAreaCenter('peito_esquerdo'), (x: 0.68, y: 0.30));
      expect(storeCustomAreaCenter('centro_frente'), (x: 0.50, y: 0.45));
      expect(storeCustomAreaCenter('manga'), (x: 0.88, y: 0.24));
      expect(storeCustomAreaCenter('costas_total'), (x: 0.50, y: 0.40));
      expect(storeNameCenter(StoreNamePlacement.backUpper), (x: 0.5, y: 0.24));
      expect(storeNameCenter(StoreNamePlacement.backLower), (x: 0.5, y: 0.62));
      expect(storeNameCenter(StoreNamePlacement.front), (x: 0.5, y: 0.30));
      expect(storeNameCenter(StoreNamePlacement.sleeve), (x: 0.88, y: 0.24));
      expect(storeNameBandWidth(StoreNamePlacement.backUpper), 0.6);
      expect(storeNameBandWidth(StoreNamePlacement.sleeve), 0.18);
    });

    test('título do passo da imagem pela área', () {
      expect(storeImageStepTitle(_peito), 'Imagem na frente');
      expect(
        storeImageStepTitle(
          const StoreCustomArea(
            id: 'manga',
            name: 'Manga',
            widthCm: 7,
            heightCm: 7,
          ),
        ),
        'Imagem na manga',
      );
      expect(storeImageStepTitle(null), 'Imagem na frente');
    });

    test('caixa da área na peça de 60 × 70 cm', () {
      final box = storeCustomAreaBox(_centro);
      expect(box.width, closeTo(25 / 60, 1e-9));
      expect(box.height, closeTo(30 / 70, 1e-9));
    });

    test('foto do lado na cor; senão a sem cor; senão a de outra cor', () {
      const p = StoreProduct(
        id: 'c',
        name: 'Camiseta',
        priceCents: 100,
        minPriceCents: 100,
        maxPriceCents: 100,
        axes: [
          StoreAxis(id: 'cor', label: 'Cor', values: [
            StoreAxisValue(id: 'preto', label: 'Preta', hex: '#111111'),
            StoreAxisValue(id: 'branco', label: 'Branca', hex: '#ffffff'),
            StoreAxisValue(id: 'azul', label: 'Azul', hex: '#0000ff'),
          ]),
        ],
        photos: [
          StorePhoto(url: 'capa'),
          StorePhoto(
            url: 'preto-frente',
            colorValueId: 'preto',
            view: StorePhotoView.front,
          ),
          StorePhoto(url: 'costas', view: StorePhotoView.back),
          StorePhoto(
            url: 'branco-costas',
            colorValueId: 'branco',
            view: StorePhotoView.back,
          ),
        ],
      );
      expect(
        storeCustomPreviewPhoto(p, const {'cor': 'preto'}, StorePhotoView.front)
            ?.url,
        'preto-frente',
      );
      expect(
        storeCustomPreviewPhoto(p, const {'cor': 'branco'}, StorePhotoView.back)
            ?.url,
        'branco-costas',
      );
      expect(
        storeCustomPreviewPhoto(p, const {'cor': 'preto'}, StorePhotoView.back)
            ?.url,
        'costas',
      );
      // Frente só tem foto da preta (o caso do DEV): azul mostra a peça e a
      // tela avisa a cor da foto.
      expect(
        storeCustomPreviewPhoto(p, const {'cor': 'azul'}, StorePhotoView.front)
            ?.url,
        'preto-frente',
      );
      expect(
        storeCustomPreviewPhotoNote(
          p,
          const {'cor': 'azul'},
          StorePhotoView.front,
        ),
        'Foto em Preta · a sua sai em Azul',
      );
      expect(
        storeCustomPreviewPhotoNote(
          p,
          const {'cor': 'preto'},
          StorePhotoView.front,
        ),
        isNull,
      );
      // Foto sem cor vale pra qualquer cor: sem aviso.
      expect(
        storeCustomPreviewPhotoNote(
          p,
          const {'cor': 'azul'},
          StorePhotoView.back,
        ),
        isNull,
      );
      // Nenhuma foto do lado: listrado.
      expect(
        storeCustomPreviewPhoto(
          const StoreProduct(
            id: 'c2',
            name: 'Camiseta',
            priceCents: 100,
            minPriceCents: 100,
            maxPriceCents: 100,
            photos: [StorePhoto(url: 'capa')],
          ),
          const {'cor': 'azul'},
          StorePhotoView.front,
        ),
        isNull,
      );
    });
  });

  group('ajuste fino da imagem', () {
    test('imagem nova: centralizada e do maior tamanho que cabe', () {
      // Quadrada numa área quadrada: largura toda.
      expect(
        storeDefaultImageTransform(imageAspect: 1, areaAspect: 1),
        const StoreImageTransform(x: 0.5, y: 0.5, scale: 1),
      );
      // Quadrada numa área 25 × 30 (mais alta): largura toda.
      expect(
        storeDefaultImageTransform(imageAspect: 1, areaAspect: 25 / 30).scale,
        1,
      );
      // Retrato 1:2 numa área quadrada: metade da largura.
      expect(
        storeDefaultImageTransform(imageAspect: 0.5, areaAspect: 1).scale,
        0.5,
      );
    });

    test('escala entre 0,1 e a maior que cabe', () {
      final big = clampStoreImageTransform(
        const StoreImageTransform(x: 0.5, y: 0.5, scale: 3),
        imageAspect: 0.5,
        areaAspect: 1,
      );
      expect(big.scale, 0.5);
      final small = clampStoreImageTransform(
        const StoreImageTransform(x: 0.5, y: 0.5, scale: 0.01),
        imageAspect: 1,
        areaAspect: 1,
      );
      expect(small.scale, kStoreMinImageScale);
    });

    test('arrastar não deixa a imagem vazar da área', () {
      final t = clampStoreImageTransform(
        const StoreImageTransform(x: 0, y: 2, scale: 0.4),
        imageAspect: 1,
        areaAspect: 1,
      );
      expect(t.x, closeTo(0.2, 1e-9));
      expect(t.y, closeTo(0.8, 1e-9));
      // Do tamanho da área: só cabe no centro.
      final full = clampStoreImageTransform(
        const StoreImageTransform(x: 0.9, y: 0.1, scale: 1),
        imageAspect: 1,
        areaAspect: 1,
      );
      expect(full, const StoreImageTransform(x: 0.5, y: 0.5, scale: 1));
    });

    test('proporção inválida não quebra', () {
      final t = clampStoreImageTransform(
        const StoreImageTransform(x: double.nan, y: 0.5, scale: double.nan),
        imageAspect: 0,
        areaAspect: double.infinity,
      );
      expect(t, const StoreImageTransform(x: 0.5, y: 0.5, scale: 1));
      expect(t.toMap(), {'x': 0.5, 'y': 0.5, 'scale': 1.0});
    });
  });

  group('costas (abaixo do nome)', () {
    const back = StoreCustomBackOptions(
      enabled: true,
      allowNumber: true,
      allowImage: true,
      numberMaxDigits: 2,
      widthCm: 25,
      heightCm: 25,
    );
    const price = StoreCustomPrice(
      nameOnlyCents: 1490,
      imageOnlyCents: 1990,
      bothCents: 2490,
      backCents: 990,
    );

    test('preço: costas somam backCents por cima de nome/imagem', () {
      int extra({bool name = false, bool image = false, bool costas = false}) =>
          storeCustomExtraCents(
            price,
            hasName: name,
            hasImage: image,
            hasBack: costas,
          );
      expect(extra(costas: true), 990);
      expect(extra(name: true, costas: true), 1490 + 990);
      expect(extra(image: true, costas: true), 1990 + 990);
      expect(extra(name: true, image: true, costas: true), 2490 + 990);
      // Sem costas, a conta de antes.
      expect(extra(name: true, image: true), 2490);
      expect(extra(), 0);
      // Espelho antigo sem backCents: costas não mudam o preço.
      expect(
        storeCustomExtraCents(
          const StoreCustomPrice(nameOnlyCents: 1490),
          hasName: true,
          hasImage: false,
          hasBack: true,
        ),
        1490,
      );
    });

    test('número: só dígitos, até numberMaxDigits (o backNumberOk)', () {
      expect(storeBackNumberOk('10', 2), isTrue);
      expect(storeBackNumberOk('7', 2), isTrue);
      expect(storeBackNumberOk('0', 1), isTrue);
      expect(storeBackNumberOk('07', 2), isTrue);
      expect(storeBackNumberOk('123', 3), isTrue);
      expect(storeBackNumberOk('100', 2), isFalse);
      expect(storeBackNumberOk('', 2), isFalse);
      expect(storeBackNumberOk('1a', 2), isFalse);
      expect(storeBackNumberOk(' 1', 2), isFalse);
      expect(storeBackNumberOk('-1', 2), isFalse);
      expect(storeBackNumberOk('1.5', 3), isFalse);
    });

    test('tipo: o escolhido se liberado; padrão Número', () {
      expect(storeBackTypeOf(back, null), StoreBackType.number);
      expect(storeBackTypeOf(back, StoreBackType.image), StoreBackType.image);
      const onlyImage = StoreCustomBackOptions(enabled: true, allowImage: true);
      expect(storeBackTypeOf(onlyImage, null), StoreBackType.image);
      expect(
        storeBackTypeOf(onlyImage, StoreBackType.number),
        StoreBackType.image,
      );
      const onlyNumber =
          StoreCustomBackOptions(enabled: true, allowNumber: true);
      expect(
        storeBackTypeOf(onlyNumber, StoreBackType.image),
        StoreBackType.number,
      );
      expect(StoreBackType.number.id, 'numero');
      expect(StoreBackType.image.id, 'imagem');
    });

    test('título pelo lugar do nome', () {
      expect(
        storeBackStepTitle(StoreNamePlacement.backUpper),
        'Costas · abaixo do nome',
      );
      expect(
        storeBackStepTitle(StoreNamePlacement.backLower),
        'Costas · acima do nome',
      );
      expect(storeBackStepTitle(StoreNamePlacement.front), 'Costas');
      expect(storeBackStepTitle(null), 'Costas');
    });

    test('caixa: abaixo do nome em cima', () {
      final box = storeBackBox(back, StoreNamePlacement.backUpper);
      final h = 25 / 70;
      expect(box.x, 0.5);
      expect(box.width, closeTo(25 / 60, 1e-9));
      expect(box.height, closeTo(h, 1e-9));
      // 0,24 + 0,075 + 0,03 + h/2: o topo da caixa encosta 0,03 abaixo da
      // faixa do nome.
      expect(box.y, closeTo(0.24 + 0.075 + 0.03 + h / 2, 1e-9));
      expect(box.y - h / 2, closeTo(0.24 + 0.075 + 0.03, 1e-9));
    });

    test('caixa: acima do nome em costas_inferior', () {
      final box = storeBackBox(back, StoreNamePlacement.backLower);
      final h = 25 / 70;
      expect(box.y, closeTo(0.62 - 0.075 - 0.03 - h / 2, 1e-9));
      expect(box.y + h / 2, closeTo(0.62 - 0.075 - 0.03, 1e-9));
    });

    test('caixa: sem nome nas costas fica em 0,45', () {
      for (final placement in [
        null,
        StoreNamePlacement.front,
        StoreNamePlacement.sleeve,
      ]) {
        final box = storeBackBox(back, placement);
        expect(box.y, 0.45, reason: '$placement');
        expect(box.x, 0.5);
      }
    });

    test('caixa: sempre dentro do quadro', () {
      // 40 × 60 cm abaixo do nome passaria do pé da peça.
      const tall = StoreCustomBackOptions(
        enabled: true,
        allowNumber: true,
        widthCm: 40,
        heightCm: 60,
      );
      final box = storeBackBox(tall, StoreNamePlacement.backUpper);
      expect(box.y + box.height / 2, closeTo(1, 1e-9));
      final above = storeBackBox(tall, StoreNamePlacement.backLower);
      expect(above.y - above.height / 2, closeTo(0, 1e-9));
      // Maior que a peça: a caixa é o quadro inteiro.
      const huge = StoreCustomBackOptions(
        enabled: true,
        allowNumber: true,
        widthCm: 90,
        heightCm: 90,
      );
      final full = storeBackBox(huge, StoreNamePlacement.backUpper);
      expect(full.width, 1);
      expect(full.height, 1);
      expect(full.y, 0.5);
    });

    test('qualidade da imagem pela área das costas', () {
      // 25 cm = 9,84 pol: 2400 px → 243 dpi (aviso); 3000 px → 305 dpi.
      expect(
        storeBackImageQuality(widthPx: 2400, heightPx: 2400, back: back),
        StoreImageQuality.warn,
      );
      expect(
        storeBackImageQuality(widthPx: 3000, heightPx: 3000, back: back),
        StoreImageQuality.good,
      );
      // Vetor não tem limite.
      expect(
        storeBackImageQuality(widthPx: null, heightPx: null, back: back),
        StoreImageQuality.good,
      );
      // A mesma imagem no peito (9 × 9 cm) seria boa: conta a área das costas.
      expect(
        storeImageQuality(
          storeEffectiveDpi(widthPx: 2400, heightPx: 2400, area: _peito),
        ),
        StoreImageQuality.good,
      );
      final area = storeBackArea(back);
      expect(area.widthCm, 25);
      expect(area.heightCm, 25);
    });

    test('cor do número: a do nome; sem nome, contraste com a peça', () {
      expect(
        storeBackNumberColor(nameColor: '#ff6a1a', garmentHex: '#111111'),
        '#ff6a1a',
      );
      expect(storeBackNumberColor(garmentHex: '#111111'), '#ffffff');
      expect(storeBackNumberColor(garmentHex: '#F1ECE2'), '#000000');
      // Sem cor de peça: o mockup é escuro.
      expect(storeBackNumberColor(), '#ffffff');
    });

    test('callable recebe back número ou imagem', () {
      expect(
        const StoreCustomCartRequest(
          productId: 'cam',
          skuId: 'preto_m',
          back: StoreCustomBackChoice.number('10'),
        ).toMap(),
        {
          'productId': 'cam',
          'skuId': 'preto_m',
          'qty': 1,
          'back': {'type': 'numero', 'number': '10'},
        },
      );
      expect(
        const StoreCustomBackChoice.image(
          path: 'store/custom-uploads/u1/a.png',
          transform: StoreImageTransform(x: 0.5, y: 0.5, scale: 1),
        ).toMap(),
        {
          'type': 'imagem',
          'path': 'store/custom-uploads/u1/a.png',
          'transform': {'x': 0.5, 'y': 0.5, 'scale': 1.0},
        },
      );
      // Sem costas, a chave nem vai.
      expect(
        const StoreCustomCartRequest(productId: 'cam', skuId: 'preto_m')
            .toMap()
            .containsKey('back'),
        isFalse,
      );
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/store/domain/store_customize_rules.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_product_rules.dart';

// Tipo do eixo (`axes[].kind`) e o eixo de estampa — loja-produto.md,
// "Eixos e seleção" e "Galeria".

const _estampa = StoreAxis(
  id: 'est',
  label: 'Estampa',
  kind: StoreAxisKind.pattern,
  values: [
    StoreAxisValue(id: 'folhas', label: 'Folhas'),
    StoreAxisValue(id: 'ondas', label: 'Ondas'),
    StoreAxisValue(id: 'liso', label: 'Liso'),
  ],
);

const _cor = StoreAxis(
  id: 'cor',
  label: 'Cor',
  values: [
    StoreAxisValue(id: 'branco', label: 'Branco', hex: '#ffffff'),
    StoreAxisValue(id: 'preto', label: 'Preto', hex: '#111111'),
  ],
);

const _tam = StoreAxis(
  id: 'tam',
  label: 'Tamanho',
  kind: StoreAxisKind.size,
  values: [
    StoreAxisValue(id: 'p', label: 'P'),
    StoreAxisValue(id: 'm', label: 'M'),
  ],
);

StoreVariant _sku(Map<String, String> values, int stock) => StoreVariant(
  id: values.values.join('_'),
  values: values,
  priceCents: 8990,
  inStock: stock > 0,
  maxQty: stock < 10 ? stock : 10,
  lowStock: stock > 0 && stock <= 3,
);

StoreProduct _product({
  required List<StoreAxis> axes,
  required List<StoreVariant> variants,
  List<StorePhoto> photos = const [],
}) => StoreProduct(
  id: 'toalha',
  name: 'Toalha de praia',
  priceCents: 8990,
  minPriceCents: 8990,
  maxPriceCents: 8990,
  axes: axes,
  variants: variants,
  photos: photos,
);

/// Toalha numa cor só, em estampas: folhas esgotada, ondas com 2, liso com 8.
StoreProduct _toalha({List<StorePhoto> photos = const []}) => _product(
  axes: const [_estampa],
  variants: [
    _sku({'est': 'folhas'}, 0),
    _sku({'est': 'ondas'}, 2),
    _sku({'est': 'liso'}, 8),
  ],
  photos: photos,
);

void main() {
  group('tipo do eixo', () {
    test('vale o kind gravado', () {
      expect(storeAxisKind(_estampa), StoreAxisKind.pattern);
      expect(storeAxisKind(_tam), StoreAxisKind.size);
      // O kind manda mesmo com hex nos valores.
      const outro = StoreAxis(
        id: 'mod',
        label: 'Modelo',
        kind: StoreAxisKind.other,
        values: [StoreAxisValue(id: 'a', label: 'A', hex: '#000000')],
      );
      expect(storeAxisKind(outro), StoreAxisKind.other);
      expect(isStoreColorAxis(outro), isFalse);
    });

    test('sem kind (doc antigo): cor se algum valor tem hex, senão outro', () {
      expect(_cor.kind, isNull);
      expect(storeAxisKind(_cor), StoreAxisKind.color);
      const tamLegado = StoreAxis(
        id: 'tam',
        label: 'Tamanho',
        values: [StoreAxisValue(id: 'p', label: 'P')],
      );
      expect(storeAxisKind(tamLegado), StoreAxisKind.other);
      expect(isStoreColorAxis(_cor), isTrue);
      expect(isStoreColorAxis(tamLegado), isFalse);
    });

    test('cor e estampa são de aparência; tamanho e outro, não', () {
      expect(isStoreLookAxis(_cor), isTrue);
      expect(isStoreLookAxis(_estampa), isTrue);
      expect(isStoreLookAxis(_tam), isFalse);
      expect(isStoreColorAxis(_estampa), isFalse);
    });

    test('kind ↔ id gravado no espelho', () {
      expect(StoreAxisKind.from('cor'), StoreAxisKind.color);
      expect(StoreAxisKind.from('estampa'), StoreAxisKind.pattern);
      expect(StoreAxisKind.from('tamanho'), StoreAxisKind.size);
      expect(StoreAxisKind.from('outro'), StoreAxisKind.other);
      expect(StoreAxisKind.from('xadrez'), isNull);
      expect(StoreAxisKind.from(null), isNull);
    });
  });

  group('estampa', () {
    test('pré-seleciona a 1ª estampa com saldo', () {
      expect(storeProductInitialSelection(_toalha()), {'est': 'ondas'});
    });

    test(
      'tudo esgotado: ainda escolhe a 1ª estampa (para mostrar as fotos)',
      () {
        final p = _product(
          axes: const [_estampa],
          variants: [
            _sku({'est': 'folhas'}, 0),
            _sku({'est': 'ondas'}, 0),
          ],
        );
        expect(storeProductInitialSelection(p), {'est': 'folhas'});
      },
    );

    test('estampa + tamanho: só a estampa vem escolhida', () {
      final p = _product(
        axes: const [_estampa, _tam],
        variants: [
          _sku({'est': 'folhas', 'tam': 'p'}, 0),
          _sku({'est': 'ondas', 'tam': 'm'}, 4),
        ],
      );
      expect(storeProductInitialSelection(p), {'est': 'ondas'});
    });

    test('estampa fora do 1º eixo não é pré-escolhida', () {
      final p = _product(
        axes: const [_tam, _estampa],
        variants: [
          _sku({'tam': 'p', 'est': 'ondas'}, 4),
        ],
      );
      expect(storeProductInitialSelection(p), isEmpty);
    });

    test('mensagens: escolha, últimas unidades e estoque que acabou', () {
      expect(storeChooseAxisMessage(_estampa), 'Escolha uma estampa');
      expect(storeChooseAxisMessage(_tam), 'Escolha um tamanho');
      const corKind = StoreAxis(
        id: 'c',
        label: 'Tom',
        kind: StoreAxisKind.color,
      );
      expect(storeChooseAxisMessage(corKind), 'Escolha uma cor');
      const outro = StoreAxis(
        id: 'm',
        label: 'Modelo',
        kind: StoreAxisKind.other,
      );
      expect(storeChooseAxisMessage(outro), 'Escolha modelo');

      final p = _toalha();
      expect(
        storeLowStockCaption(p, {'est': 'ondas'}),
        'Só 2 na estampa Ondas',
      );
      expect(
        storeSoldOutMessage(p, p.variants.first),
        'Acabou o estoque da estampa Folhas · escolha outra estampa',
      );
    });

    test('tamanho com kind (rótulo qualquer) fala "no tamanho"', () {
      const tamanho = StoreAxis(
        id: 'num',
        label: 'Numeração',
        kind: StoreAxisKind.size,
        values: [StoreAxisValue(id: '40', label: '40')],
      );
      final p = _product(
        axes: const [tamanho],
        variants: [
          _sku({'num': '40'}, 2),
        ],
      );
      expect(storeLowStockCaption(p, {'num': '40'}), 'Só 2 no tamanho 40');
      expect(storeChooseAxisMessage(tamanho), 'Escolha um tamanho');
    });

    test('miniatura: a 1ª foto ligada ao valor, só no 1º eixo', () {
      const photos = [
        StorePhoto(url: 'geral'),
        StorePhoto(url: 'ondas-1', colorValueId: 'ondas'),
        StorePhoto(url: 'ondas-2', colorValueId: 'ondas'),
      ];
      final p = _toalha(photos: photos);
      expect(storeAxisValuePhotoUrl(p, _estampa, 'ondas'), 'ondas-1');
      expect(storeAxisValuePhotoUrl(p, _estampa, 'liso'), isNull);

      final segundo = _product(
        axes: const [_tam, _estampa],
        variants: const [],
        photos: photos,
      );
      expect(storeAxisValuePhotoUrl(segundo, _estampa, 'ondas'), isNull);
    });

    test('galeria e prévia usam a estampa escolhida (1º eixo)', () {
      const photos = [
        StorePhoto(
          url: 'folhas-f',
          colorValueId: 'folhas',
          view: StorePhotoView.front,
        ),
        StorePhoto(
          url: 'ondas-f',
          colorValueId: 'ondas',
          view: StorePhotoView.front,
        ),
        StorePhoto(url: 'geral'),
      ];
      final p = _toalha(photos: photos);
      expect(
        [
          for (final ph in storeGalleryPhotos(p, {'est': 'ondas'})) ph.url,
        ],
        ['ondas-f', 'geral'],
      );
      expect(
        storeCustomPreviewPhoto(p, {'est': 'ondas'}, StorePhotoView.front)?.url,
        'ondas-f',
      );
    });

    test('hex da peça só vem de eixo de cor, nunca da estampa', () {
      final p = _product(
        axes: const [_estampa, _cor],
        variants: [
          _sku({'est': 'ondas', 'cor': 'preto'}, 3),
        ],
      );
      expect(
        storeSelectedColorHex(p, {'est': 'ondas', 'cor': 'preto'}),
        '#111111',
      );
      expect(storeSelectedColorHex(_toalha(), {'est': 'ondas'}), isNull);
    });
  });
}

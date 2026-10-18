import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_product_rules.dart';
import 'package:nexago_app/features/store/domain/store_rules.dart';

// Mesmos casos de `store-product-model.spec.ts` (portal): as regras são uma
// só nas duas superfícies.

const _cor = StoreAxis(
  id: 'cor',
  label: 'Cor',
  values: [
    StoreAxisValue(id: 'branco', label: 'Branco areia', hex: '#f1ece2'),
    StoreAxisValue(id: 'laranja', label: 'Laranja', hex: '#ff6a1a'),
    StoreAxisValue(id: 'preto', label: 'Preto', hex: '#111111'),
  ],
);

const _tam = StoreAxis(
  id: 'tam',
  label: 'Tamanho',
  values: [
    StoreAxisValue(id: 'p', label: 'P'),
    StoreAxisValue(id: 'm', label: 'M'),
    StoreAxisValue(id: 'g', label: 'G'),
  ],
);

StoreVariant _sku(
  String cor,
  String tam,
  int stock, {
  int price = 12990,
  bool? lowStock,
}) {
  return StoreVariant(
    id: '${cor}_$tam',
    values: {'cor': cor, 'tam': tam},
    priceCents: price,
    inStock: stock > 0,
    maxQty: stock < kStoreMaxQtyPerItem ? stock : kStoreMaxQtyPerItem,
    lowStock: lowStock ?? (stock > 0 && stock <= 3),
  );
}

/// Camiseta: branco P/M/G (G com 2), laranja só M, preto esgotado.
StoreProduct _camiseta({
  List<StoreVariant>? variants,
  int maxPrice = 12990,
  int? compareAt,
  List<StorePhoto> photos = const [],
  String? coverUrl,
}) {
  return StoreProduct(
    id: 'cam',
    name: 'Camiseta Dry UV50 Areia',
    category: 'vestuario',
    priceCents: 12990,
    minPriceCents: 12990,
    maxPriceCents: maxPrice,
    compareAtPriceCents: compareAt,
    coverUrl: coverUrl,
    photos: photos,
    axes: const [_cor, _tam],
    variants: variants ??
        [
          _sku('branco', 'p', 8),
          _sku('branco', 'm', 12),
          _sku('branco', 'g', 2),
          _sku('laranja', 'p', 0),
          _sku('laranja', 'm', 5),
          _sku('preto', 'm', 0),
        ],
  );
}

StoreProduct _simple(
  String id, {
  String category = 'vestuario',
  int soldLast30 = 0,
  bool soldOut = false,
  String slug = '',
}) {
  return StoreProduct(
    id: id,
    name: id,
    slug: slug,
    category: category,
    priceCents: 100,
    minPriceCents: 100,
    maxPriceCents: 100,
    soldLast30: soldLast30,
    soldOut: soldOut,
    publishedAt: DateTime.utc(2026, 9, 1),
    variants: [StoreVariant(id: 'unico', priceCents: 100, inStock: !soldOut)],
  );
}

void main() {
  group('catálogo', () {
    test('acha por id e, sem id, pelo slug do link do portal', () {
      final products = [
        _simple('a', slug: 'bola-pro'),
        _simple('bola-pro'),
      ];
      expect(findStoreProduct(products, 'bola-pro')?.id, 'bola-pro');
      expect(findStoreProduct([_simple('a', slug: 'bola-pro')], 'bola-pro')?.id,
          'a');
      expect(findStoreProduct(products, 'x'), isNull);
      expect(findStoreProduct(products, ' '), isNull);
    });
  });

  group('seleção', () {
    test('eixo com hex é cor', () {
      expect(isStoreColorAxis(_cor), isTrue);
      expect(isStoreColorAxis(_tam), isFalse);
    });

    test('pré-seleciona a primeira cor com saldo e nunca o tamanho', () {
      expect(storeProductInitialSelection(_camiseta()), {'cor': 'branco'});
      final semBranco = _camiseta(
        variants: [_sku('branco', 'm', 0), _sku('laranja', 'm', 3)],
      );
      expect(storeProductInitialSelection(semBranco), {'cor': 'laranja'});
    });

    test('tudo esgotado: ainda escolhe a primeira cor (para mostrar as fotos)',
        () {
      final p = _camiseta(
        variants: [_sku('branco', 'm', 0), _sku('preto', 'm', 0)],
      );
      expect(storeProductInitialSelection(p), {'cor': 'branco'});
    });

    test('eixo de um valor só já vem escolhido', () {
      const p = StoreProduct(
        id: 'v',
        name: 'Viseira',
        priceCents: 6990,
        minPriceCents: 6990,
        maxPriceCents: 6990,
        axes: [
          StoreAxis(
            id: 'tam',
            label: 'Tamanho',
            values: [StoreAxisValue(id: 'u', label: 'Único')],
          ),
        ],
        variants: [
          StoreVariant(
            id: 'u',
            values: {'tam': 'u'},
            priceCents: 6990,
            inStock: true,
          ),
        ],
      );
      expect(storeProductInitialSelection(p), {'tam': 'u'});
      expect(storeVariantFor(p, storeProductInitialSelection(p))?.id, 'u');
    });

    test('disponibilidade em cascata: cor só riscada sem saldo nenhum', () {
      final p = _camiseta();
      expect(storeAxisValueAvailable(p, 0, 'laranja', {'tam': 'g'}), isTrue);
      expect(storeAxisValueAvailable(p, 0, 'preto', {}), isFalse);
      expect(storeAxisValueAvailable(p, 1, 'p', {'cor': 'laranja'}), isFalse);
      expect(storeAxisValueAvailable(p, 1, 'p', {'cor': 'branco'}), isTrue);
      expect(storeAxisValueAvailable(p, 1, 'm', {'cor': 'preto'}), isFalse);
      expect(storeAxisValueAvailable(p, 5, 'm', {}), isFalse);
    });

    test('trocar a cor solta o tamanho que ficou sem saldo e mantém o outro',
        () {
      final p = _camiseta();
      expect(
        selectStoreAxisValue(
            p, {'cor': 'branco', 'tam': 'p'}, 'cor', 'laranja'),
        {'cor': 'laranja'},
      );
      expect(
        selectStoreAxisValue(
            p, {'cor': 'branco', 'tam': 'm'}, 'cor', 'laranja'),
        {'cor': 'laranja', 'tam': 'm'},
      );
    });

    test('SKU só com todos os eixos; produto sem eixo é o SKU único', () {
      final p = _camiseta();
      expect(storeVariantFor(p, {'cor': 'branco'}), isNull);
      expect(storeVariantFor(p, {'cor': 'branco', 'tam': 'g'})?.id, 'branco_g');
      expect(storeVariantFor(_simple('bola'), const {})?.id, 'unico');
    });

    test('eixo que falta e a mensagem dele', () {
      final p = _camiseta();
      expect(storeMissingAxis(p, {'cor': 'branco'})?.id, 'tam');
      expect(storeMissingAxis(p, {'cor': 'branco', 'tam': 'm'}), isNull);
      expect(storeChooseAxisMessage(_tam), 'Escolha um tamanho');
      expect(storeChooseAxisMessage(_cor), 'Escolha uma cor');
      expect(
        storeChooseAxisMessage(
          const StoreAxis(id: 'mod', label: 'Modelo'),
        ),
        'Escolha modelo',
      );
    });

    test('rótulos da variação e aviso de estoque que acabou', () {
      final p = _camiseta();
      final v = storeVariantFor(p, {'cor': 'branco', 'tam': 'm'})!;
      expect(storeVariantLabel(p, v), 'Branco areia · M');
      expect(storeSelectedValueLabel(_cor, {'cor': 'branco'}), 'Branco areia');
      expect(storeSelectedValueLabel(_tam, {'cor': 'branco'}), '');
      expect(
        storeSoldOutMessage(p, v),
        'Acabou o estoque do M · escolha outro tamanho',
      );
      final bola = _simple('bola');
      expect(
        storeSoldOutMessage(bola, bola.variants.single),
        'Esse produto acabou de esgotar',
      );
    });
  });

  group('preço e quantidade', () {
    test('SKU escolhido manda; antes disso, "a partir de" quando varia', () {
      final p = _camiseta(
        maxPrice: 14990,
        variants: [
          _sku('branco', 'p', 3),
          _sku('branco', 'm', 3),
          _sku('branco', 'g', 3, price: 14990),
        ],
      );
      expect(
        storeSelectionPrice(p, {'cor': 'branco'}),
        const StoreSelectionPrice(cents: 12990, from: true),
      );
      expect(
        storeSelectionPrice(p, {'cor': 'branco', 'tam': 'g'}),
        const StoreSelectionPrice(cents: 14990),
      );
    });

    test('faixa ignora o SKU sem saldo enquanto houver algum com saldo', () {
      final p = _camiseta(
        variants: [
          _sku('branco', 'p', 0, price: 9990),
          _sku('branco', 'm', 3),
        ],
      );
      expect(storeSelectionPrice(p, {'cor': 'branco'}).cents, 12990);
      expect(storeSelectionPrice(p, {'cor': 'branco'}).from, isFalse);
    });

    test('nenhum com saldo: a faixa vem de todos que batem', () {
      final p = _camiseta(
        variants: [
          _sku('branco', 'p', 0, price: 9990),
          _sku('branco', 'm', 0),
        ],
      );
      expect(
        storeSelectionPrice(p, {'cor': 'branco'}),
        const StoreSelectionPrice(cents: 9990, from: true),
      );
    });

    test('preço "de" riscado só quando maior e sem "a partir de"', () {
      final p = _camiseta(compareAt: 15990);
      expect(storeSelectionPrice(p, {'cor': 'branco'}).strikeCents, 15990);
      final varia = _camiseta(
        compareAt: 15990,
        maxPrice: 14990,
        variants: [
          _sku('branco', 'p', 3),
          _sku('branco', 'g', 3, price: 14990)
        ],
      );
      expect(storeSelectionPrice(varia, {'cor': 'branco'}).strikeCents, isNull);
    });

    test('quantidade vai até o saldo do SKU (teto 10); sem SKU, 10', () {
      final p = _camiseta();
      expect(storeMaxQuantity(p, {'cor': 'branco'}), 10);
      expect(storeMaxQuantity(p, {'cor': 'branco', 'tam': 'g'}), 2);
      expect(storeMaxQuantity(p, {'cor': 'branco', 'tam': 'm'}), 10);
    });

    test('estoque baixo: "Só N no tamanho M"; acima do teto, "Últimas"', () {
      final p = _camiseta();
      expect(
        storeLowStockCaption(p, {'cor': 'branco', 'tam': 'g'}),
        'Só 2 no tamanho G',
      );
      expect(storeLowStockCaption(p, {'cor': 'branco', 'tam': 'm'}), isNull);
      expect(storeLowStockCaption(p, {'cor': 'branco'}), isNull);
      final alto = _camiseta(
        variants: [_sku('branco', 'm', 12, lowStock: true)],
      );
      expect(
        storeLowStockCaption(alto, {'cor': 'branco', 'tam': 'm'}),
        'Últimas unidades no tamanho M',
      );
    });

    test('estoque baixo com cor por último, outro eixo e sem eixo', () {
      const soCor = StoreProduct(
        id: 'b',
        name: 'Boné',
        priceCents: 5000,
        minPriceCents: 5000,
        maxPriceCents: 5000,
        axes: [_cor],
        variants: [
          StoreVariant(
            id: 'preto',
            values: {'cor': 'preto'},
            priceCents: 5000,
            inStock: true,
            maxQty: 1,
            lowStock: true,
          ),
        ],
      );
      expect(
        storeLowStockCaption(soCor, {'cor': 'preto'}),
        'Só 1 na cor Preto',
      );
      const modelo = StoreProduct(
        id: 'r',
        name: 'Raquete',
        priceCents: 5000,
        minPriceCents: 5000,
        maxPriceCents: 5000,
        axes: [
          StoreAxis(
            id: 'mod',
            label: 'Modelo',
            values: [StoreAxisValue(id: 'pro', label: 'Pro')],
          ),
        ],
        variants: [
          StoreVariant(
            id: 'pro',
            values: {'mod': 'pro'},
            priceCents: 5000,
            inStock: true,
            maxQty: 3,
            lowStock: true,
          ),
        ],
      );
      expect(storeLowStockCaption(modelo, {'mod': 'pro'}), 'Só 3 em Pro');
      const bola = StoreProduct(
        id: 'bola',
        name: 'Bola',
        priceCents: 5000,
        minPriceCents: 5000,
        maxPriceCents: 5000,
        variants: [
          StoreVariant(
            id: 'unico',
            priceCents: 5000,
            inStock: true,
            maxQty: 2,
            lowStock: true,
          ),
        ],
      );
      expect(storeLowStockCaption(bola, const {}), 'Só 2 em estoque');
    });

    test('maxQty ausente: 10 com saldo, 0 sem', () {
      const com = StoreVariant(id: 'a', priceCents: 1, inStock: true);
      const sem = StoreVariant(id: 'b', priceCents: 1, inStock: false);
      expect(com.maxQty, kStoreMaxQtyPerItem);
      expect(sem.maxQty, 0);
    });

    test('unidades do SKU já no carrinho', () {
      const items = [
        StoreCartItem(productId: 'cam', skuId: 'branco_m', qty: 3),
      ];
      expect(
        storeCartQtyOf(items, productId: 'cam', skuId: 'branco_m'),
        3,
      );
      expect(storeCartQtyOf(items, productId: 'cam', skuId: 'branco_g'), 0);
    });
  });

  group('carrinho com teto do SKU', () {
    const base = [StoreCartItem(productId: 'cam', skuId: 'branco_m', qty: 8)];

    test('soma no mesmo SKU sem passar do saldo; no teto, fica igual', () {
      final out = mergeStoreCartItem(
        base,
        productId: 'cam',
        skuId: 'branco_m',
        qty: 5,
        maxQty: 10,
      )!;
      expect(out, const [
        StoreCartItem(productId: 'cam', skuId: 'branco_m', qty: 10),
      ]);
      expect(
        mergeStoreCartItem(
          out,
          productId: 'cam',
          skuId: 'branco_m',
          maxQty: 10,
        ),
        out,
      );
    });

    test('linha acima do saldo novo não diminui', () {
      final out = mergeStoreCartItem(
        base,
        productId: 'cam',
        skuId: 'branco_m',
        maxQty: 2,
      );
      expect(out?.single.qty, 8);
    });

    test('linha nova respeita o saldo; 30 linhas recusa', () {
      final out = mergeStoreCartItem(
        base,
        productId: 'cam',
        skuId: 'branco_g',
        qty: 3,
        maxQty: 2,
      )!;
      expect(
        out[1],
        const StoreCartItem(productId: 'cam', skuId: 'branco_g', qty: 2),
      );
      final full = [
        for (var i = 0; i < kStoreMaxCartLines; i++)
          StoreCartItem(productId: 'p$i', skuId: 'u', qty: 1),
      ];
      expect(
        mergeStoreCartItem(full, productId: 'novo', skuId: 'u', maxQty: 10),
        isNull,
      );
    });

    test('teto do SKU: saldo exposto, mínimo 1, até o teto da compra', () {
      expect(storeVariantCap(_sku('branco', 'g', 2)), 2);
      expect(storeVariantCap(_sku('branco', 'm', 12)), kStoreMaxQtyPerItem);
      expect(storeVariantCap(_sku('preto', 'm', 0)), 1);
    });

    test('antes de gravar: linha no teto ou carrinho sem lugar', () {
      expect(
        storeCartAddBlock(base, productId: 'cam', skuId: 'branco_m', cap: 10),
        isNull,
      );
      expect(
        storeCartAddBlock(base, productId: 'cam', skuId: 'branco_m', cap: 8),
        StoreCartAddBlock.lineAtMax,
      );
      final full = [
        for (var i = 0; i < kStoreMaxCartLines; i++)
          StoreCartItem(productId: 'p$i', skuId: 'u', qty: 1),
      ];
      expect(
        storeCartAddBlock(full, productId: 'novo', skuId: 'u', cap: 10),
        StoreCartAddBlock.cartFull,
      );
      // Linha que já existe soma mesmo com 30 linhas.
      expect(
        storeCartAddBlock(full, productId: 'p0', skuId: 'u', cap: 10),
        isNull,
      );
      // Linha personalizada do mesmo SKU não conta pro teto da comum.
      const custom = [
        StoreCartItem(
          productId: 'cam',
          skuId: 'branco_m',
          qty: 10,
          lineId: 'l1',
          customization: {'name': 'SILVIO'},
        ),
      ];
      expect(
        storeCartAddBlock(custom, productId: 'cam', skuId: 'branco_m', cap: 10),
        isNull,
      );
    });
  });

  group('galeria', () {
    const fotos = [
      StorePhoto(url: 'branco-1', colorValueId: 'branco'),
      StorePhoto(url: 'laranja-1', colorValueId: 'laranja'),
      StorePhoto(url: 'geral'),
      StorePhoto(url: 'branco-2', colorValueId: 'branco'),
    ];

    List<String> urls(List<StorePhoto> photos) =>
        [for (final p in photos) p.url];

    test('fotos da cor seguidas das sem cor; cor sem foto → as sem cor', () {
      final p = _camiseta(photos: fotos);
      expect(
        urls(storeGalleryPhotos(p, {'cor': 'branco'})),
        ['branco-1', 'branco-2', 'geral'],
      );
      expect(urls(storeGalleryPhotos(p, {'cor': 'preto'})), ['geral']);
      expect(storeGalleryPhotos(p, const {}).length, 4);
    });

    test('sem nenhuma sem cor, mostra todas; sem galeria, a capa', () {
      final p = _camiseta(
        photos: fotos.where((f) => f.colorValueId != null).toList(),
      );
      expect(storeGalleryPhotos(p, {'cor': 'preto'}).length, 3);
      final capa = _camiseta(coverUrl: 'https://cdn/capa.jpg');
      expect(
        storeGalleryPhotos(capa, {'cor': 'branco'}),
        const [StorePhoto(url: 'https://cdn/capa.jpg')],
      );
      expect(storeGalleryPhotos(_camiseta(), {'cor': 'branco'}), isEmpty);
    });
  });

  group('relacionados', () {
    test('mais vendidos da mesma categoria primeiro, sem o próprio e esgotados',
        () {
      final self = _simple('self', soldLast30: 99);
      final catalog = [
        self,
        _simple('bola', category: 'bolas', soldLast30: 80),
        _simple('bone', soldLast30: 5),
        _simple('regata', soldLast30: 20),
        _simple('short', soldLast30: 50, soldOut: true),
        _simple('oculos', category: 'acessorios', soldLast30: 40),
      ];
      expect(
        [for (final p in storeRelatedProducts(self, catalog, 3)) p.id],
        ['regata', 'bone', 'bola'],
      );
      expect(storeRelatedProducts(self, catalog, 8).length, 4);
    });
  });

  group('como receber', () {
    // 2026-10-16 é sexta-feira.
    test('arredonda pra hora cheia e diz o dia', () {
      expect(
        storePickupReadyLabel(24, DateTime.utc(2026, 10, 16, 18, 20)),
        'Pronto amanhã a partir das 16h',
      );
      expect(
        storePickupReadyLabel(2, DateTime.utc(2026, 10, 16, 13)),
        'Pronto hoje a partir das 12h',
      );
    });

    test('antes das 8h vira 8h; depois das 20h, 8h do dia seguinte', () {
      expect(
        storePickupReadyLabel(4, DateTime.utc(2026, 10, 16, 5)),
        'Pronto hoje a partir das 8h',
      );
      expect(
        storePickupReadyLabel(2, DateTime.utc(2026, 10, 16, 22, 30)),
        'Pronto amanhã a partir das 8h',
      );
      // 20h em ponto ainda vale.
      expect(
        storePickupReadyLabel(1, DateTime.utc(2026, 10, 16, 22)),
        'Pronto hoje a partir das 20h',
      );
    });

    test('dia da semana até 6 dias; depois a data', () {
      expect(
        storePickupReadyLabel(48, DateTime.utc(2026, 10, 16, 15)),
        'Pronto domingo a partir das 12h',
      );
      expect(
        storePickupReadyLabel(24 * 9, DateTime.utc(2026, 10, 16, 15)),
        'Pronto 25/10 a partir das 12h',
      );
      final ready = storePickupReady(48, DateTime.utc(2026, 10, 16, 15));
      expect(ready.day, 'domingo');
      expect(ready.hour, 12);
    });

    test('virada de mês e de ano', () {
      expect(
        storePickupReadyLabel(2, DateTime.utc(2026, 12, 31, 23, 30)),
        'Pronto amanhã a partir das 8h',
      );
    });

    test('entrega grátis a partir do frete grátis; sem preço = no checkout',
        () {
      const expressa = StoreDeliveryMode(
        id: 'expressa',
        name: 'Expressa',
        priceCents: 3490,
      );
      expect(storeDeliveryPriceCents(expressa, 12990, 39900), 3490);
      expect(storeDeliveryPriceCents(expressa, 39900, 39900), 0);
      expect(
        storeDeliveryPriceCents(
          const StoreDeliveryMode(id: 'calc', name: 'Calculada'),
          100,
          null,
        ),
        isNull,
      );
    });

    test('menor preço entre as modalidades', () {
      const delivery = StoreDelivery(
        freeAboveCents: 39900,
        modes: [
          StoreDeliveryMode(id: 'exp', name: 'Expressa', priceCents: 3490),
          StoreDeliveryMode(id: 'pac', name: 'PAC', priceCents: 1990),
          StoreDeliveryMode(id: 'calc', name: 'Calculada'),
        ],
      );
      expect(storeDeliveryFromCents(delivery, 12990), 1990);
      expect(storeDeliveryFromCents(delivery, 40000), 0);
      expect(
        storeDeliveryFromCents(
          const StoreDelivery(
            modes: [StoreDeliveryMode(id: 'calc', name: 'Calculada')],
          ),
          100,
        ),
        isNull,
      );
      expect(storeDeliveryFromCents(StoreDelivery.none, 100), isNull);
    });
  });
}

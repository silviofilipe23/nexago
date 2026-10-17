import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_rules.dart';

final _now = DateTime.utc(2026, 10, 16, 18);

StoreProduct _product(
  String id, {
  String? name,
  String category = 'bolas',
  String? collection,
  int price = 10000,
  int? min,
  int? max,
  int? compareAt,
  StoreBadge? badge,
  DateTime? badgeExpiresAt,
  bool soldOut = false,
  bool customizable = false,
  bool pickup = true,
  int soldLast30 = 0,
  DateTime? publishedAt,
  double? ratingAvg,
  int ratingCount = 0,
  List<StoreAxis> axes = const [],
  List<StoreVariant>? variants,
}) {
  return StoreProduct(
    id: id,
    name: name ?? 'Produto $id',
    category: category,
    collection: collection,
    priceCents: price,
    compareAtPriceCents: compareAt,
    minPriceCents: min ?? price,
    maxPriceCents: max ?? min ?? price,
    badge: badge,
    badgeExpiresAt: badgeExpiresAt,
    soldOut: soldOut,
    customizable: customizable,
    pickup: pickup,
    soldLast30: soldLast30,
    publishedAt: publishedAt ?? DateTime.utc(2026, 9, 1),
    ratingAvg: ratingAvg,
    ratingCount: ratingCount,
    axes: axes,
    variants: variants ??
        [StoreVariant(id: 'unico', priceCents: price, inStock: !soldOut)],
  );
}

const _config = StoreShowcaseConfig(
  categories: [
    StoreLabel(id: 'bolas', label: 'Bolas'),
    StoreLabel(id: 'vestuario', label: 'Vestuário'),
    StoreLabel(id: 'acessorios', label: 'Acessórios'),
    StoreLabel(id: 'rede-quadra', label: 'Rede & quadra'),
  ],
  collections: [StoreLabel(id: 'verao-2026', label: 'Verão 2026')],
);

List<String> _ids(List<StoreProduct> list) => [for (final p in list) p.id];

void main() {
  group('pixPriceCents (mesma conta do servidor)', () {
    test('arredonda ao centavo, meio centavo sobe', () {
      expect(pixPriceCents(28990, 5), 27541);
      expect(pixPriceCents(12990, 5), 12341);
      expect(pixPriceCents(6990, 5), 6641);
      expect(pixPriceCents(10000, 5), 9500);
    });
  });

  group('preço exibido', () {
    test('é o menor preço; com variação de preço vira "a partir de"', () {
      final p = _product('a', price: 12990, min: 12990, max: 14990);
      expect(displayPriceCents(p), 12990);
      expect(priceVaries(p), isTrue);
    });

    test('"de" riscado só sem variação de preço e quando é maior', () {
      expect(
        strikePriceCents(_product('a', price: 12990, compareAt: 15990)),
        15990,
      );
      // Preço varia: "a partir de" e "de" brigariam — some o "de".
      expect(
        strikePriceCents(
          _product('b', price: 12990, max: 14990, compareAt: 15990),
        ),
        isNull,
      );
      // Variação mais cara que o "de" não ganha preço riscado.
      expect(
        strikePriceCents(_product('c', price: 16990, compareAt: 15990)),
        isNull,
      );
    });
  });

  group('selo do card', () {
    test('esgotado manda, mesmo com selo', () {
      final b = storeCardBadge(
        _product('a', soldOut: true, badge: StoreBadge.bestSeller),
        _now,
      );
      expect(b?.label, 'Esgotado');
      expect(b?.tone, StoreBadgeTone.dark);
    });

    test('"mais vendida" vira "Top" laranja no app', () {
      final b = storeCardBadge(_product('a', badge: StoreBadge.bestSeller), _now);
      expect(b?.label, 'Top');
      expect(b?.tone, StoreBadgeTone.orange);
    });

    test('"nova" vale até vencer; vencida cai no -X% (ou some)', () {
      final valid = _product(
        'a',
        badge: StoreBadge.isNew,
        badgeExpiresAt: _now.add(const Duration(days: 1)),
      );
      expect(storeCardBadge(valid, _now)?.label, 'Nova');
      expect(storeCardBadge(valid, _now)?.tone, StoreBadgeTone.dark);

      final expired = _product(
        'b',
        badge: StoreBadge.isNew,
        badgeExpiresAt: _now.subtract(const Duration(minutes: 1)),
      );
      expect(storeCardBadge(expired, _now), isNull);

      final expiredOnSale = _product(
        'c',
        price: 12990,
        compareAt: 15990,
        badge: StoreBadge.isNew,
        badgeExpiresAt: _now.subtract(const Duration(days: 1)),
      );
      expect(storeCardBadge(expiredOnSale, _now)?.label, '-19%');
    });

    test('edição limitada é escura', () {
      final b = storeCardBadge(
        _product('a', badge: StoreBadge.limitedEdition),
        _now,
      );
      expect(b?.label, 'Edição limitada');
      expect(b?.tone, StoreBadgeTone.dark);
    });

    test('sem selo e com "de": -X% = round((1 − preço/de) × 100)', () {
      // 1 − 12990/15990 = 0,1876 → 19
      final b = storeCardBadge(_product('a', price: 12990, compareAt: 15990), _now);
      expect(b?.label, '-19%');
      expect(b?.tone, StoreBadgeTone.orange);
      expect(storeCardBadge(_product('b'), _now), isNull);
    });
  });

  group('ordenação', () {
    final older = DateTime.utc(2026, 8, 1);
    final newer = DateTime.utc(2026, 10, 1);

    test('mais vendidos: soldLast30 desc, empate pela publicação mais nova', () {
      final list = [
        _product('a', soldLast30: 5, publishedAt: older),
        _product('b', soldLast30: 9),
        _product('c', soldLast30: 5, publishedAt: newer),
      ];
      expect(_ids(sortStoreProducts(list, StoreSort.bestSellers)), ['b', 'c', 'a']);
    });

    test('mais vendidos: empate total cai no nome', () {
      final list = [
        _product('x', name: 'Viseira', publishedAt: older),
        _product('y', name: 'Bola', publishedAt: older),
      ];
      expect(_ids(sortStoreProducts(list, StoreSort.bestSellers)), ['y', 'x']);
    });

    test('preço usa o preço exibido (menor), empate pelo nome', () {
      final list = [
        _product('a', name: 'C', price: 9000),
        _product('b', name: 'B', price: 5000, max: 20000),
        _product('c', name: 'A', price: 9000),
      ];
      expect(_ids(sortStoreProducts(list, StoreSort.priceAsc)), ['b', 'c', 'a']);
      expect(_ids(sortStoreProducts(list, StoreSort.priceDesc)), ['c', 'a', 'b']);
    });

    test('novidades: publicação desc', () {
      final list = [
        _product('a', publishedAt: older),
        _product('b', publishedAt: newer),
      ];
      expect(_ids(sortStoreProducts(list, StoreSort.newest)), ['b', 'a']);
    });

    test('melhor avaliados: nota desc, nulo no fim, depois quantidade', () {
      final list = [
        _product('a'),
        _product('b', ratingAvg: 4.5, ratingCount: 3),
        _product('c', ratingAvg: 4.9, ratingCount: 4),
        _product('d', ratingAvg: 4.5, ratingCount: 10),
      ];
      expect(
        _ids(sortStoreProducts(list, StoreSort.topRated)),
        ['c', 'd', 'b', 'a'],
      );
    });
  });

  group('busca', () {
    final oculos = _product(
      'oculos',
      name: 'Óculos Polarizado Sunline',
      category: 'acessorios',
    );
    final bola = _product(
      'bola',
      name: 'Bola NexaGO Pro Beach',
      collection: 'verao-2026',
    );
    final camiseta = _product(
      'camiseta',
      name: 'Camiseta Dry UV50',
      category: 'vestuario',
    );

    test('normaliza acento, caixa e espaços', () {
      expect(normalizeStoreSearch('  Óculos   POLARIZADO '), 'oculos polarizado');
      expect(normalizeStoreSearch('Ação Vôlei'), 'acao volei');
    });

    test('sem acento e sem caixa casa o nome', () {
      expect(matchesStoreSearch(oculos, 'OCULOS', _config), isTrue);
      expect(matchesStoreSearch(oculos, 'óculos', _config), isTrue);
    });

    test('todo termo precisa casar (nome, categoria ou coleção)', () {
      expect(matchesStoreSearch(bola, 'bola pro', _config), isTrue);
      expect(matchesStoreSearch(bola, 'bola verao', _config), isTrue);
      expect(matchesStoreSearch(bola, 'bola rede', _config), isFalse);
      expect(matchesStoreSearch(camiseta, 'vestuario dry', _config), isTrue);
      expect(matchesStoreSearch(oculos, 'acessorios', _config), isTrue);
    });

    test('busca vazia casa tudo', () {
      expect(matchesStoreSearch(bola, '   ', _config), isTrue);
    });
  });

  group('sugestões', () {
    final products = [
      for (var i = 0; i < 7; i++)
        _product('b$i', name: 'Bola $i', soldLast30: i),
      _product('v', name: 'Viseira Dry', category: 'acessorios'),
    ];

    test('menos de 2 caracteres não sugere nada', () {
      expect(storeSearchSuggestions(products, _config, 'b').isEmpty, isTrue);
      expect(storeSearchSuggestions(products, _config, ' ').isEmpty, isTrue);
    });

    test('até 5 produtos, mais vendidos primeiro', () {
      final s = storeSearchSuggestions(products, _config, 'bo');
      expect(_ids(s.products), ['b6', 'b5', 'b4', 'b3', 'b2']);
    });

    test('categorias só com produto à venda, até 3', () {
      final s = storeSearchSuggestions(products, _config, 'ACESS');
      expect([for (final c in s.categories) c.id], ['acessorios']);
      // "Rede & quadra" casa o texto mas não tem produto.
      expect(storeSearchSuggestions(products, _config, 'rede').categories, isEmpty);
    });
  });

  group('buscas recentes', () {
    test('vai pro topo sem repetir (ignorando caixa) e corta em 5', () {
      expect(withRecentSearch(['rede', 'Bola'], 'bola'), ['bola', 'rede']);
      expect(
        withRecentSearch(['a', 'b', 'c', 'd', 'e'], 'f'),
        ['f', 'a', 'b', 'c', 'd'],
      );
      expect(withRecentSearch(['a'], '  '), ['a']);
      expect(withRecentSearch(const [], '  viseira '), ['viseira']);
    });
  });

  group('chips', () {
    test('Tudo + categorias da config, na ordem dela, com produto', () {
      final chips = visibleStoreCategories(_config, [
        _product('a', category: 'acessorios'),
        _product('b', category: 'bolas'),
        _product('c', category: 'sem-config'),
      ]);
      expect([for (final c in chips) c.id], ['bolas', 'acessorios']);
    });
  });

  group('banners por data civil de São Paulo', () {
    const banners = [
      StoreBanner(id: 'sem-limite', title: 'A', collectionId: 'c'),
      StoreBanner(
        id: 'termina-hoje',
        title: 'B',
        collectionId: 'c',
        endDate: '2026-10-16',
      ),
      StoreBanner(
        id: 'comeca-amanha',
        title: 'C',
        collectionId: 'c',
        startDate: '2026-10-17',
      ),
      StoreBanner(
        id: 'acabou',
        title: 'D',
        collectionId: 'c',
        endDate: '2026-10-15',
      ),
      StoreBanner(
        id: 'janela',
        title: 'E',
        collectionId: 'c',
        startDate: '2026-10-16',
        endDate: '2026-10-31',
      ),
      StoreBanner(id: 'quarto', title: 'F', collectionId: 'c'),
    ];

    test('início e fim inclusivos, vazio = sem limite, até 3', () {
      final live = liveStoreBanners(banners, '2026-10-16');
      expect([for (final b in live) b.id], ['sem-limite', 'termina-hoje', 'janela']);
      expect(
        [for (final b in liveStoreBanners(banners, '2026-10-17')) b.id],
        ['sem-limite', 'comeca-amanha', 'janela'],
      );
    });

    test('a data é a de São Paulo, não a UTC', () {
      // 02:00 UTC do dia 17 ainda é 23:00 do dia 16 em São Paulo.
      expect(storeSaoPauloDateKey(DateTime.utc(2026, 10, 17, 2)), '2026-10-16');
      expect(storeSaoPauloDateKey(DateTime.utc(2026, 10, 17, 3)), '2026-10-17');
    });
  });

  group('filtros', () {
    final products = [
      _product('barata', price: 4990),
      _product('media', price: 12990, compareAt: 15990),
      _product('cara', price: 34990, pickup: false),
      _product('vest', category: 'vestuario', price: 8990, collection: 'verao-2026'),
    ];

    List<String> browse(StoreBrowse b, {bool arena = true}) => _ids(
          browseStoreProducts(products, _config, b, hasPickupArena: arena),
        );

    test('"Filtrar · N" conta cada escolha fora do padrão', () {
      expect(StoreFilters.none.activeCount, 0);
      expect(const StoreFilters(sort: StoreSort.priceAsc).activeCount, 1);
      expect(
        const StoreFilters(
          sort: StoreSort.newest,
          priceBand: StorePriceBand.upTo50,
          onlyMyArenaPickup: true,
          onlyOnSale: true,
        ).activeCount,
        4,
      );
    });

    test('faixa de preço pelo preço exibido', () {
      expect(
        browse(
          const StoreBrowse(
            filters: StoreFilters(priceBand: StorePriceBand.upTo50),
          ),
        ),
        ['barata'],
      );
      expect(
        browse(
          const StoreBrowse(
            filters: StoreFilters(priceBand: StorePriceBand.above300),
          ),
        ),
        ['cara'],
      );
      expect(StorePriceBand.upTo50.contains(5000), isTrue);
      expect(StorePriceBand.from50To150.contains(5000), isFalse);
    });

    test('em promoção = tem preço "de"', () {
      expect(
        browse(const StoreBrowse(filters: StoreFilters(onlyOnSale: true))),
        ['media'],
      );
    });

    test('retirada na minha arena exige pickup E arena definida', () {
      const b = StoreBrowse(filters: StoreFilters(onlyMyArenaPickup: true));
      expect(browse(b).toSet(), {'barata', 'media', 'vest'});
      expect(browse(b, arena: false), isEmpty);
    });

    test('chip, coleção e busca recortam juntos', () {
      expect(browse(const StoreBrowse(categoryId: 'vestuario')), ['vest']);
      expect(browse(const StoreBrowse(collectionId: 'verao-2026')), ['vest']);
      expect(
        browse(const StoreBrowse(categoryId: 'bolas', query: 'vest')),
        isEmpty,
      );
    });

    test('ordenação escolhida vale na grade', () {
      expect(
        browse(const StoreBrowse(filters: StoreFilters(sort: StoreSort.priceAsc))),
        ['barata', 'vest', 'media', 'cara'],
      );
    });

    test('copyWith limpa campos anuláveis', () {
      const b = StoreBrowse(
        categoryId: 'bolas',
        filters: StoreFilters(priceBand: StorePriceBand.upTo50),
      );
      expect(b.copyWith(categoryId: null).categoryId, isNull);
      expect(b.copyWith(query: 'x').categoryId, 'bolas');
      expect(b.filters.copyWith(priceBand: null).priceBand, isNull);
      expect(b.isNarrowed, isTrue);
      expect(StoreBrowse.initial.isNarrowed, isFalse);
    });

    test('título: busca → coleção → ordenação', () {
      expect(
        storeGridTitle(const StoreBrowse(query: ' bola '), _config),
        'Resultados para "bola"',
      );
      expect(
        storeGridTitle(const StoreBrowse(collectionId: 'verao-2026'), _config),
        'Verão 2026',
      );
      expect(storeGridTitle(StoreBrowse.initial, _config), 'Mais vendidos');
      expect(
        storeGridTitle(
          const StoreBrowse(filters: StoreFilters(sort: StoreSort.newest)),
          _config,
        ),
        'Novidades',
      );
    });
  });

  group('carrinho', () {
    const items = [
      StoreCartItem(productId: 'bola', skuId: 'unico', qty: 2),
      StoreCartItem(productId: 'camiseta', skuId: 'branco_m', qty: 1),
    ];

    test('contador = soma das unidades, não das linhas', () {
      expect(storeCartUnits(items), 3);
      expect(storeCartUnits(const []), 0);
    });

    test('mesmo produto+SKU soma na linha', () {
      final merged = mergeStoreCartItem(items, productId: 'bola', skuId: 'unico');
      expect(merged, const [
        StoreCartItem(productId: 'bola', skuId: 'unico', qty: 3),
        StoreCartItem(productId: 'camiseta', skuId: 'branco_m', qty: 1),
      ]);
    });

    test('SKU diferente vira linha nova no fim', () {
      final merged = mergeStoreCartItem(
        items,
        productId: 'camiseta',
        skuId: 'preto_g',
        qty: 2,
      );
      expect(merged?.length, 3);
      expect(
        merged?.last,
        const StoreCartItem(productId: 'camiseta', skuId: 'preto_g', qty: 2),
      );
    });

    test('30 linhas: linha nova não cabe, a existente ainda soma', () {
      final full = [
        for (var i = 0; i < kStoreMaxCartLines; i++)
          StoreCartItem(productId: 'p$i', skuId: 'unico', qty: 1),
      ];
      expect(mergeStoreCartItem(full, productId: 'novo', skuId: 'unico'), isNull);
      expect(
        mergeStoreCartItem(full, productId: 'p0', skuId: 'unico')?.first.qty,
        2,
      );
    });

    test('quantidade por linha tem teto', () {
      final merged = mergeStoreCartItem(
        const [StoreCartItem(productId: 'a', skuId: 'u', qty: 98)],
        productId: 'a',
        skuId: 'u',
        qty: 5,
      );
      expect(merged?.single.qty, kStoreMaxQtyPerLine);
    });
  });

  group('"+" do card', () {
    const axes = [
      StoreAxis(
        id: 'cor',
        label: 'Cor',
        values: [
          StoreAxisValue(id: 'branco', label: 'Branco', hex: '#FFFFFF'),
          StoreAxisValue(id: 'preto', label: 'Preto', hex: '#000000'),
        ],
      ),
      StoreAxis(
        id: 'tam',
        label: 'Tamanho',
        values: [
          StoreAxisValue(id: 'm', label: 'M'),
          StoreAxisValue(id: 'g', label: 'G'),
        ],
      ),
    ];
    final camiseta = _product(
      'camiseta',
      axes: axes,
      variants: const [
        StoreVariant(
          id: 'branco_m',
          values: {'cor': 'branco', 'tam': 'm'},
          priceCents: 12990,
          inStock: true,
        ),
        StoreVariant(
          id: 'branco_g',
          values: {'cor': 'branco', 'tam': 'g'},
          priceCents: 12990,
          inStock: false,
        ),
        StoreVariant(
          id: 'preto_g',
          values: {'cor': 'preto', 'tam': 'g'},
          priceCents: 12990,
          inStock: true,
        ),
      ],
    );

    test('sem variação: adiciona direto o SKU único', () {
      final q = storeQuickAdd(_product('bola'));
      expect(q.kind, StoreQuickAddKind.addDirect);
      expect(q.skuId, 'unico');
    });

    test('com variação abre a folha; personalizável abre o produto', () {
      expect(storeQuickAdd(camiseta).kind, StoreQuickAddKind.pickVariant);
      expect(
        storeQuickAdd(_product('nome', customizable: true)).kind,
        StoreQuickAddKind.openProduct,
      );
    });

    test('esgotado vira "Avise-me"', () {
      expect(
        storeQuickAdd(_product('x', soldOut: true)).kind,
        StoreQuickAddKind.notifyMe,
      );
    });

    test('combinação sem saldo fica desabilitada', () {
      // Com branco escolhido, G não tem saldo.
      expect(
        storeVariantValueAvailable(
          camiseta,
          axisId: 'tam',
          valueId: 'g',
          selected: const {'cor': 'branco'},
        ),
        isFalse,
      );
      expect(
        storeVariantValueAvailable(
          camiseta,
          axisId: 'tam',
          valueId: 'g',
          selected: const {'cor': 'preto'},
        ),
        isTrue,
      );
      // O próprio eixo não se restringe: dá pra trocar de cor com M escolhido.
      expect(
        storeVariantValueAvailable(
          camiseta,
          axisId: 'cor',
          valueId: 'preto',
          selected: const {'cor': 'branco', 'tam': 'g'},
        ),
        isTrue,
      );
    });

    test('SKU só com todos os eixos escolhidos', () {
      expect(storeVariantFor(camiseta, const {'cor': 'branco'}), isNull);
      expect(
        storeVariantFor(camiseta, const {'cor': 'preto', 'tam': 'g'})?.id,
        'preto_g',
      );
    });

    test('eixo com um valor possível já vem escolhido', () {
      final soPreto = _product(
        'p',
        axes: axes,
        variants: const [
          StoreVariant(
            id: 'preto_m',
            values: {'cor': 'preto', 'tam': 'm'},
            priceCents: 100,
            inStock: true,
          ),
          StoreVariant(
            id: 'preto_g',
            values: {'cor': 'preto', 'tam': 'g'},
            priceCents: 100,
            inStock: true,
          ),
        ],
      );
      expect(storeInitialVariantSelection(soPreto), {'cor': 'preto'});
    });
  });
}

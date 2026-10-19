import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/store/application/store_providers.dart';
import 'package:nexago_app/features/store/application/store_review_providers.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_repository.dart';
import 'package:nexago_app/features/store/presentation/store_copy.dart';
import 'package:nexago_app/features/store/presentation/store_product_page.dart';

import 'store_review_test_kit.dart';

/// Repositório em memória: nada de Firestore no teste.
class _FakeStoreRepository implements StoreRepository {
  _FakeStoreRepository({
    required this.catalog,
    this.config = StoreShowcaseConfig.empty,
    this.shopper = StoreShopper.empty,
  });

  final StoreCatalog catalog;
  final StoreShowcaseConfig config;
  final StoreShopper shopper;

  final List<StoreCartItem> cart = [];
  final _cartChanges = StreamController<List<StoreCartItem>>.broadcast();
  final List<StoreCartItem> added = [];
  final List<int?> addedMaxQty = [];
  final List<(String, bool)> favorites = [];

  @override
  Stream<bool> watchEnabled() => Stream.value(true);

  @override
  Stream<StoreCatalog> watchCatalog() => Stream.value(catalog);

  @override
  Stream<StoreShowcaseConfig> watchShowcaseConfig() => Stream.value(config);

  @override
  Stream<StoreShopper> watchShopper(String uid) => Stream.value(shopper);

  @override
  Stream<List<StoreCartItem>> watchCart(String uid) async* {
    yield List.of(cart);
    yield* _cartChanges.stream;
  }

  @override
  Future<bool> addToCart(
    String uid, {
    required String productId,
    required String skuId,
    int qty = 1,
    int? maxQty,
  }) async {
    final item = StoreCartItem(productId: productId, skuId: skuId, qty: qty);
    added.add(item);
    addedMaxQty.add(maxQty);
    cart.add(item);
    _cartChanges.add(List.of(cart));
    return true;
  }

  @override
  Future<void> setPickupArena(String uid, String arenaId) async {}

  @override
  Future<void> setRecentSearches(String uid, List<String> searches) async {}

  @override
  Future<void> setFavorite(String uid, String productId, bool on) async {
    favorites.add((productId, on));
  }
}

class _RecordingAnalytics implements AnalyticsService {
  final List<Invocation> calls = [];

  bool logged(Symbol method, [Map<Symbol, Object?> args = const {}]) =>
      calls.any(
        (c) =>
            c.memberName == method &&
            args.entries.every((e) => c.namedArguments[e.key] == e.value),
      );

  @override
  dynamic noSuchMethod(Invocation invocation) {
    calls.add(invocation);
    return Future<void>.value();
  }
}

final _published = DateTime.utc(2026, 9, 1);

StoreVariant _sku(String cor, String tam, int stock) => StoreVariant(
      id: '${cor}_$tam',
      values: {'cor': cor, 'tam': tam},
      priceCents: 12990,
      inStock: stock > 0,
      maxQty: stock < 10 ? stock : 10,
      lowStock: stock > 0 && stock <= 3,
    );

/// Branco P/M/G (G com 2), laranja só M, preto esgotado.
final _camiseta = StoreProduct(
  id: 'camiseta',
  name: 'Camiseta Dry UV50 Areia',
  slug: 'camiseta-dry-uv50-areia',
  category: 'vestuario',
  collection: 'verao-2026',
  badge: StoreBadge.isNew,
  priceCents: 12990,
  minPriceCents: 12990,
  maxPriceCents: 12990,
  pickup: true,
  soldLast30: 20,
  publishedAt: _published,
  description: 'Tecido leve com proteção UV50.',
  details: const [StoreDetail(label: 'Tecido', value: 'Poliamida dry')],
  axes: const [
    StoreAxis(
      id: 'cor',
      label: 'Cor',
      values: [
        StoreAxisValue(id: 'branco', label: 'Branco areia', hex: '#F1ECE2'),
        StoreAxisValue(id: 'laranja', label: 'Laranja', hex: '#FF6A1A'),
        StoreAxisValue(id: 'preto', label: 'Preto', hex: '#111111'),
      ],
    ),
    StoreAxis(
      id: 'tam',
      label: 'Tamanho',
      values: [
        StoreAxisValue(id: 'p', label: 'P'),
        StoreAxisValue(id: 'm', label: 'M'),
        StoreAxisValue(id: 'g', label: 'G'),
      ],
    ),
  ],
  variants: [
    _sku('branco', 'p', 8),
    _sku('branco', 'm', 12),
    _sku('branco', 'g', 2),
    _sku('laranja', 'p', 0),
    _sku('laranja', 'm', 5),
    _sku('preto', 'm', 0),
  ],
);

final _bola = StoreProduct(
  id: 'bola',
  name: 'Bola NexaGO Pro Beach',
  category: 'bolas',
  priceCents: 28990,
  minPriceCents: 28990,
  maxPriceCents: 28990,
  soldLast30: 40,
  publishedAt: _published,
  variants: const [StoreVariant(id: 'unico', priceCents: 28990, inStock: true)],
);

final _viseira = StoreProduct(
  id: 'viseira',
  name: 'Viseira Dry Fit',
  category: 'acessorios',
  priceCents: 6990,
  minPriceCents: 6990,
  maxPriceCents: 6990,
  soldOut: true,
  soldLast30: 5,
  publishedAt: _published,
  variants: const [StoreVariant(id: 'unico', priceCents: 6990, inStock: false)],
);

const _config = StoreShowcaseConfig(
  benefits: StoreBenefits(pixDiscountPct: 5, pickupReadyHours: 24),
  pickupArenas: [
    StorePickupArena(
      arenaId: 'errejota',
      name: 'Arena Errejota',
      readyHours: 24,
    ),
  ],
);

_FakeStoreRepository _repo() => _FakeStoreRepository(
      catalog: StoreCatalog(products: [_viseira, _camiseta, _bola]),
      config: _config,
      shopper: const StoreShopper(pickupArenaId: 'errejota'),
    );

Future<_RecordingAnalytics> _open(
  WidgetTester tester,
  _FakeStoreRepository repo,
  String productId, {
  FakeStoreReviewRepository? reviews,
}) async {
  // Tela alta: painel, eixos e "Combina com" cabem sem rolar.
  tester.view.physicalSize = const Size(390, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final analytics = _RecordingAnalytics();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        storeRepositoryProvider.overrideWithValue(repo),
        storeUidProvider.overrideWith((ref) => 'u1'),
        storeUserPositionProvider.overrideWith((ref) => null),
        storeBookingVisitsProvider.overrideWith((ref) => const []),
        analyticsServiceProvider.overrideWithValue(analytics),
        storeReviewRepositoryProvider.overrideWithValue(
          reviews ?? FakeStoreReviewRepository(),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(390, 2400),
            disableAnimations: true,
          ),
          child: StoreProductPage(
            productId: productId,
            origin: 'vitrine',
            // Sexta, 16/10 às 12h de São Paulo.
            clock: () => DateTime.utc(2026, 10, 16, 15),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return analytics;
}

Finder _cta() => find.byKey(const ValueKey('store-product-cta'));

void main() {
  testWidgets('renderiza nome, selo, preço, Pix, eixos e como receber', (
    tester,
  ) async {
    final analytics = await _open(tester, _repo(), 'camiseta');

    expect(find.text('Camiseta Dry UV50 Areia'), findsWidgets);
    expect(find.text('NOVA'), findsOneWidget);
    expect(find.text('VERÃO 2026'), findsOneWidget);
    expect(find.text(formatBRLFromCents(12990)), findsOneWidget);
    // Pix com a mesma conta do servidor: 12990 × 0,95 → 12341.
    expect(
      find.textContaining(formatBRLFromCents(12341), findRichText: true),
      findsOneWidget,
    );
    // Primeira cor com saldo vem escolhida; tamanho nunca.
    expect(find.text('COR · BRANCO AREIA'), findsOneWidget);
    expect(find.text('TAMANHO'), findsOneWidget);
    expect(find.text(StoreCopy.addCta(12990)), findsOneWidget);
    // Retirada na arena resolvida, pronta amanhã (24h depois das 12h).
    expect(find.text(StoreCopy.pickupSummary('amanhã')), findsOneWidget);
    expect(find.text('Arena Errejota'), findsOneWidget);
    // Detalhes, descrição e "Combina com".
    expect(find.text('Poliamida dry'), findsOneWidget);
    expect(find.text('Tecido leve com proteção UV50.'), findsOneWidget);
    expect(find.text(StoreCopy.relatedTitle), findsOneWidget);
    expect(find.byKey(const ValueKey('store-related-bola')), findsOneWidget);
    // Esgotado fica fora dos relacionados.
    expect(find.byKey(const ValueKey('store-related-viseira')), findsNothing);

    expect(
      analytics.logged(#logStoreProductView, {
        #productId: 'camiseta',
        #origin: 'vitrine',
      }),
      isTrue,
    );
  });

  // Regressão vista no simulador: `Container(alignment:)` dentro do Wrap
  // esticava cada tamanho (e a pílula da coleção) na largura toda.
  testWidgets('tamanhos lado a lado e pílula do tamanho do texto', (
    tester,
  ) async {
    await _open(tester, _repo(), 'camiseta');

    final p = tester.getRect(find.byKey(const ValueKey('store-axis-tam-p')));
    final m = tester.getRect(find.byKey(const ValueKey('store-axis-tam-m')));
    expect(p.width, lessThan(120));
    expect(m.top, p.top, reason: 'M fica na mesma linha do P');
    expect(m.left, greaterThan(p.right));
    expect(tester.getSize(find.text('VERÃO 2026')).width, lessThan(200));
    final pill = find
        .ancestor(of: find.text('VERÃO 2026'), matching: find.byType(Container))
        .first;
    expect(tester.getSize(pill).width, lessThan(200));
  });

  testWidgets('trocar a cor atualiza o rótulo "COR · X" e loga', (
    tester,
  ) async {
    final analytics = await _open(tester, _repo(), 'camiseta');

    await tester.tap(find.byKey(const ValueKey('store-axis-cor-laranja')));
    await tester.pump();

    expect(find.text('COR · LARANJA'), findsOneWidget);
    expect(find.text('COR · BRANCO AREIA'), findsNothing);
    expect(
      analytics.logged(#logStoreVariantSelect, {#color: 'laranja'}),
      isTrue,
    );
  });

  testWidgets('adicionar sem tamanho pede o tamanho e não grava', (
    tester,
  ) async {
    final repo = _repo();
    await _open(tester, repo, 'camiseta');

    await tester.tap(_cta());
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Escolha um tamanho'), findsOneWidget);
    expect(repo.added, isEmpty);

    // Escolher o tamanho tira o aviso.
    await tester.tap(find.byKey(const ValueKey('store-axis-tam-p')));
    await tester.pump();
    expect(find.text('Escolha um tamanho'), findsNothing);
  });

  testWidgets('com tamanho adiciona o SKU e a quantidade escolhidos', (
    tester,
  ) async {
    final repo = _repo();
    final analytics = await _open(tester, repo, 'camiseta');

    await tester.tap(find.byKey(const ValueKey('store-axis-tam-m')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('store-qty-more')));
    await tester.pump();
    expect(find.text(StoreCopy.addCta(25980)), findsOneWidget);

    await tester.tap(_cta());
    await tester.pump();
    await tester.pump();

    expect(repo.added, const [
      StoreCartItem(productId: 'camiseta', skuId: 'branco_m', qty: 2),
    ]);
    expect(repo.addedMaxQty, [10]);
    expect(find.text(StoreCopy.addedCta), findsOneWidget);
    expect(find.text(StoreCopy.addedToCart), findsOneWidget);
    expect(find.text(StoreCopy.see), findsOneWidget);
    expect(
      analytics.logged(#logStoreAddToCart, {
        #sku: 'branco_m',
        #qty: 2,
        #priceCents: 12990,
      }),
      isTrue,
    );

    // Volta a "Adicionar" depois de 1,5 s.
    await tester.pump(const Duration(milliseconds: 1600));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text(StoreCopy.addedCta), findsNothing);
    expect(find.text(StoreCopy.addCta(25980)), findsOneWidget);
  });

  testWidgets('quantidade vai até o saldo do SKU e mostra o estoque baixo', (
    tester,
  ) async {
    await _open(tester, _repo(), 'camiseta');

    await tester.tap(find.byKey(const ValueKey('store-axis-tam-g')));
    await tester.pump();
    expect(find.text('Só 2 no tamanho G'), findsOneWidget);

    final more = find.byKey(const ValueKey('store-qty-more'));
    await tester.tap(more);
    await tester.pump();
    expect(tester.widget<IconButton>(more).onPressed, isNull);
    expect(find.text('2'), findsWidgets);
  });

  testWidgets('tamanho sem saldo avisa que o Avise-me vem aí', (tester) async {
    final repo = _repo();
    final analytics = await _open(tester, repo, 'camiseta');

    await tester.tap(find.byKey(const ValueKey('store-axis-cor-laranja')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('store-axis-tam-p')));
    await tester.pump();

    expect(find.text(StoreCopy.waitlistSoon), findsOneWidget);
    expect(analytics.logged(#logStoreNotifyMe, {#sku: 'laranja_p'}), isTrue);
    expect(repo.added, isEmpty);
  });

  testWidgets('favoritar é otimista e grava no shopper', (tester) async {
    final repo = _repo();
    await _open(tester, repo, 'camiseta');

    expect(find.byIcon(Icons.favorite_border_rounded), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('store-product-favorite')));
    await tester.pump();

    expect(find.byIcon(Icons.favorite_rounded), findsOneWidget);
    expect(repo.favorites, [('camiseta', true)]);
  });

  testWidgets('produto inexistente: indisponível + mais vendidos', (
    tester,
  ) async {
    await _open(tester, _repo(), 'nao-existe');

    expect(find.text(StoreCopy.unavailableTitle), findsOneWidget);
    expect(find.byKey(const ValueKey('store-product-bola')), findsOneWidget);
    expect(
      find.byKey(const ValueKey('store-product-camiseta')),
      findsOneWidget,
    );
  });

  testWidgets('acha o produto pelo slug do link do portal', (tester) async {
    await _open(tester, _repo(), 'camiseta-dry-uv50-areia');

    expect(find.text('COR · BRANCO AREIA'), findsOneWidget);
    expect(find.text(StoreCopy.unavailableTitle), findsNothing);
  });

  testWidgets('esgotado: "Avise-me quando chegar" no lugar do Adicionar', (
    tester,
  ) async {
    final repo = _repo();
    final analytics = await _open(tester, repo, 'viseira');

    expect(find.text(StoreCopy.notifyMeCta), findsOneWidget);
    expect(find.text('ESGOTADO'), findsOneWidget);
    expect(find.textContaining('Adicionar'), findsNothing);

    await tester.tap(_cta());
    await tester.pump();

    expect(find.text(StoreCopy.waitlistSoon), findsOneWidget);
    expect(analytics.logged(#logStoreNotifyMe), isTrue);
    expect(repo.added, isEmpty);
  });

  testWidgets('Personalizar sem tamanho treme e pede o tamanho', (
    tester,
  ) async {
    final custom = StoreProduct(
      id: 'camiseta-custom',
      name: 'Camiseta Personalizável',
      category: 'vestuario',
      priceCents: 12990,
      minPriceCents: 12990,
      maxPriceCents: 12990,
      customizable: true,
      customization: const StoreCustomization(
        fromCents: 1490,
        leadDays: 5,
        name: StoreCustomNameOptions(
          enabled: true,
          fonts: [StoreCustomFont.bloco],
          colors: ['#ffffff'],
        ),
      ),
      axes: _camiseta.axes,
      variants: _camiseta.variants,
    );
    final repo = _FakeStoreRepository(
      catalog: StoreCatalog(products: [custom, _bola]),
      config: _config,
    );
    await _open(tester, repo, 'camiseta-custom');

    await tester.tap(find.byKey(const ValueKey('store-customize-open')));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Escolha um tamanho'), findsOneWidget);
    expect(repo.added, isEmpty);
  });

  testWidgets('personalização sem opções (espelho antigo) esconde o botão', (
    tester,
  ) async {
    final legacy = StoreProduct(
      id: 'camiseta-legacy',
      name: 'Camiseta Antiga',
      category: 'vestuario',
      priceCents: 12990,
      minPriceCents: 12990,
      maxPriceCents: 12990,
      customizable: true,
      customization: const StoreCustomization(fromCents: 1490, leadDays: 5),
      axes: _camiseta.axes,
      variants: _camiseta.variants,
    );
    await _open(
      tester,
      _FakeStoreRepository(
        catalog: StoreCatalog(products: [legacy, _bola]),
        config: _config,
      ),
      'camiseta-legacy',
    );

    expect(find.text(StoreCopy.customizeTitle), findsOneWidget);
    expect(find.byKey(const ValueKey('store-customize-open')), findsNothing);
  });

  testWidgets('catálogo do cache: "Sem conexão" e o CTA desabilitado', (
    tester,
  ) async {
    final repo = _FakeStoreRepository(
      catalog: StoreCatalog(products: [_camiseta, _bola], fromCache: true),
      config: _config,
    );
    await _open(tester, repo, 'bola');
    await tester.pump(const Duration(seconds: 2));

    expect(find.text(StoreCopy.offlineCta), findsOneWidget);
    await tester.tap(_cta());
    await tester.pump();
    expect(repo.added, isEmpty);
  });

  testWidgets('seção "Avaliações" depois dos detalhes (vazia: como avaliar)', (
    tester,
  ) async {
    await _open(tester, _repo(), 'camiseta');
    expect(find.byKey(const ValueKey('store-product-reviews')), findsOneWidget);
    expect(find.text('Avaliações'), findsOneWidget);
    expect(find.text('Ainda sem avaliações'), findsOneWidget);
  });

  testWidgets('avaliações sem leitura (rule não publicada): sem a seção', (
    tester,
  ) async {
    await _open(
      tester,
      _repo(),
      'camiseta',
      reviews: FakeStoreReviewRepository(productError: StateError('denied')),
    );
    expect(find.byKey(const ValueKey('store-product-reviews')), findsNothing);
    expect(find.text('Poliamida dry'), findsOneWidget);
  });
}

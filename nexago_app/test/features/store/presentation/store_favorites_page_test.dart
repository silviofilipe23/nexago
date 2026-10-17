import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/store/application/store_providers.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_repository.dart';
import 'package:nexago_app/features/store/domain/store_rules.dart';
import 'package:nexago_app/features/store/presentation/store_copy.dart';
import 'package:nexago_app/features/store/presentation/store_favorites_page.dart';
import 'package:nexago_app/features/store/presentation/widgets/store_skeleton.dart';

/// Repositório em memória: nada de Firestore no teste.
class _FakeStoreRepository implements StoreRepository {
  _FakeStoreRepository({
    this.products = const [],
    this.favoriteIds = const [],
    this.catalogError,
    this.catalogNeverArrives = false,
    List<StoreCartItem> cart = const [],
  }) : cart = List.of(cart);

  final List<StoreProduct> products;
  final List<String> favoriteIds;
  final Object? catalogError;
  final bool catalogNeverArrives;

  final List<StoreCartItem> cart;
  final _cartChanges = StreamController<List<StoreCartItem>>.broadcast();
  final List<StoreCartItem> added = [];
  final List<int?> addedMaxQty = [];
  final List<(String, bool)> favorites = [];

  /// Resposta do servidor ao coração; `null` = confirma na hora.
  Future<void> Function()? onSetFavorite;

  @override
  Stream<bool> watchEnabled() => Stream.value(true);

  @override
  Stream<StoreCatalog> watchCatalog() {
    if (catalogNeverArrives) return const Stream.empty();
    final error = catalogError;
    if (error != null) return Stream.error(error);
    return Stream.value(StoreCatalog(products: products));
  }

  @override
  Stream<StoreShowcaseConfig> watchShowcaseConfig() => Stream.value(
        const StoreShowcaseConfig(benefits: StoreBenefits(pixDiscountPct: 5)),
      );

  @override
  Stream<StoreShopper> watchShopper(String uid) =>
      Stream.value(StoreShopper(favoriteIds: favoriteIds));

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
    await onSetFavorite?.call();
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

StoreProduct _single(
  String id,
  String name, {
  required int price,
  int? compareAt,
  bool soldOut = false,
  int stock = 10,
  bool lowStock = false,
  StoreCustomization? customization,
}) {
  return StoreProduct(
    id: id,
    name: name,
    priceCents: price,
    compareAtPriceCents: compareAt,
    minPriceCents: price,
    maxPriceCents: price,
    soldOut: soldOut,
    customizable: customization != null,
    customization: customization,
    variants: [
      StoreVariant(
        id: 'unico',
        priceCents: price,
        inStock: !soldOut && stock > 0,
        maxQty: soldOut ? 0 : stock,
        lowStock: lowStock,
      ),
    ],
  );
}

/// −R$ 30 (redondo).
final _bola =
    _single('bola', 'Bola NexaGO Pro Beach', price: 28990, compareAt: 31990);

/// −R$ 20,50 (com centavos).
final _oculos = _single(
  'oculos',
  'Óculos Polarizado Sunline',
  price: 19940,
  compareAt: 21990,
);

/// Esgotado, com "de" (não entra no destaque).
final _mochila = _single(
  'mochila',
  'Mochila Praia Impermeável',
  price: 23990,
  compareAt: 29990,
  soldOut: true,
);

final _squeeze = _single(
  'squeeze',
  'Garrafa Térmica 750 ml',
  price: 8990,
  stock: 3,
  lowStock: true,
);

final _custom = _single(
  'custom',
  'Camiseta Personalizável',
  price: 12990,
  customization: const StoreCustomization(
    name: StoreCustomNameOptions(enabled: true),
  ),
);

const _tam = StoreAxis(
  id: 'tam',
  label: 'Tamanho',
  values: [
    StoreAxisValue(id: 'm', label: 'M'),
    StoreAxisValue(id: 'g', label: 'G'),
  ],
);

const _camiseta = StoreProduct(
  id: 'camiseta',
  name: 'Camiseta Dry UV50 Areia',
  priceCents: 12990,
  minPriceCents: 12990,
  maxPriceCents: 12990,
  axes: [_tam],
  variants: [
    StoreVariant(
      id: 'm',
      values: {'tam': 'm'},
      priceCents: 12990,
      inStock: true,
    ),
    StoreVariant(
      id: 'g',
      values: {'tam': 'g'},
      priceCents: 12990,
      inStock: true,
    ),
  ],
);

/// Favoritado por último primeiro: bola, óculos, mochila, camiseta, custom,
/// squeeze. `sumiu` saiu do catálogo do canal.
_FakeStoreRepository _repo({List<StoreCartItem> cart = const []}) =>
    _FakeStoreRepository(
      products: [_camiseta, _squeeze, _bola, _custom, _mochila, _oculos],
      favoriteIds: const [
        'sumiu',
        'squeeze',
        'custom',
        'camiseta',
        'mochila',
        'oculos',
        'bola',
      ],
      cart: cart,
    );

GoRouter _router() => GoRouter(
      initialLocation: AppRoutes.storeFavorites,
      routes: [
        GoRoute(
          path: AppRoutes.store,
          name: AppRouteNames.store,
          builder: (_, _) => const Scaffold(body: Text('vitrine')),
        ),
        GoRoute(
          path: AppRoutes.storeFavorites,
          name: AppRouteNames.storeFavorites,
          builder: (_, _) => const StoreFavoritesPage(),
        ),
        GoRoute(
          path: AppRoutes.storeSearch,
          name: AppRouteNames.storeSearch,
          builder: (_, _) => const Scaffold(body: Text('busca')),
        ),
        GoRoute(
          path: AppRoutes.storeProduct,
          name: AppRouteNames.storeProduct,
          builder: (_, state) => Scaffold(
            body: Text(
              'produto ${state.pathParameters['productId']} '
              '${state.uri.queryParameters['origem']}',
            ),
          ),
        ),
        GoRoute(
          path: AppRoutes.storeCustomize,
          name: AppRouteNames.storeCustomize,
          builder: (context, state) => Scaffold(
            body: Column(
              children: [
                Text(
                  'personalizar ${state.pathParameters['productId']} '
                  'sku=${state.uri.queryParameters['sku']}',
                ),
                TextButton(
                  onPressed: () => context.pop(true),
                  child: const Text('concluir'),
                ),
              ],
            ),
          ),
        ),
        GoRoute(
          path: AppRoutes.storeCart,
          name: AppRouteNames.storeCart,
          builder: (_, _) => const Scaffold(body: Text('carrinho')),
        ),
      ],
    );

Future<_RecordingAnalytics> _open(
  WidgetTester tester,
  _FakeStoreRepository repo,
) async {
  // Tela alta: as 3 linhas da grade montam sem rolar.
  tester.view.physicalSize = const Size(390, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final analytics = _RecordingAnalytics();
  final router = _router();
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        storeRepositoryProvider.overrideWithValue(repo),
        storeUidProvider.overrideWith((ref) => 'u1'),
        analyticsServiceProvider.overrideWithValue(analytics),
      ],
      child: MaterialApp.router(
        theme: AppTheme.dark,
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: true),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return analytics;
}

/// Troca de página (transição do Material, ida ou volta) sem
/// `pumpAndSettle`.
Future<void> _settleRoute(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump(const Duration(milliseconds: 400));
}

Finder _card(String id) => find.byKey(ValueKey('store-favorite-$id'));

Finder _in(String id, Finder matching) =>
    find.descendant(of: _card(id), matching: matching);

Finder _action(String id) => find.byKey(ValueKey('store-favorite-action-$id'));

Finder _heart(String id) => find.byKey(ValueKey('store-favorite-heart-$id'));

String _chip(String label) => label.toUpperCase();

void main() {
  testWidgets('último favoritado primeiro, sem o que saiu do catálogo', (
    tester,
  ) async {
    final analytics = await _open(tester, _repo());

    expect(find.text(StoreCopy.favoritesTitle), findsOneWidget);
    expect(find.text(StoreCopy.favoritesCount(6)), findsOneWidget);
    for (final id in [
      'bola',
      'oculos',
      'mochila',
      'camiseta',
      'custom',
      'squeeze',
    ]) {
      expect(_card(id), findsOneWidget, reason: id);
    }
    expect(_card('sumiu'), findsNothing);

    final bola = tester.getTopLeft(_card('bola'));
    final oculos = tester.getTopLeft(_card('oculos'));
    final mochila = tester.getTopLeft(_card('mochila'));
    expect(oculos.dy, bola.dy, reason: 'óculos ao lado da bola');
    expect(oculos.dx, greaterThan(bola.dx));
    expect(mochila.dy, greaterThan(bola.dy), reason: 'mochila na 2ª linha');

    expect(
      analytics.logged(#logStoreFavoritesView, {#total: 6}),
      isTrue,
    );
  });

  testWidgets('selos, tag e linha de preço de cada caso', (tester) async {
    await _open(tester, _repo());

    // Desconto redondo sem centavos; com centavos, completo.
    expect(
      _in('bola', find.text(_chip('−${formatBRLWhole(30)}'))),
      findsOneWidget,
    );
    expect(
      _in('oculos', find.text(_chip('−${formatBRLFromCents(2050)}'))),
      findsOneWidget,
    );
    // "de" riscado e Pix (12990 × 0,95 com meio centavo subindo).
    expect(
      _in(
        'bola',
        find.textContaining(formatBRLFromCents(31990), findRichText: true),
      ),
      findsOneWidget,
    );
    expect(
      _in(
        'bola',
        find.textContaining(
          formatBRLFromCents(pixPriceCents(28990, 5)),
          findRichText: true,
        ),
      ),
      findsOneWidget,
    );

    // Esgotado manda no selo, apaga a foto e troca a linha do Pix.
    expect(_in('mochila', find.text(_chip('Esgotado'))), findsOneWidget);
    expect(
      _in('mochila', find.text(StoreCopy.favoritesSoldOutFoot)),
      findsOneWidget,
    );
    final opacity = tester.widget<Opacity>(
      _in('mochila', find.byType(Opacity)).first,
    );
    expect(opacity.opacity, 0.55);
    expect(
      _in('mochila', find.byIcon(Icons.notifications_none_rounded)),
      findsOneWidget,
    );

    // Fim de estoque: soma do maxQty.
    expect(_in('squeeze', find.text(_chip('Últimas 3'))), findsOneWidget);

    // Personalizável: tag + "Personalize com seu nome".
    expect(
      _in('custom', find.text(_chip(StoreCopy.favoritesCustomizableTag))),
      findsOneWidget,
    );
    expect(
      _in('custom', find.text(StoreCopy.favoritesCustomizeFoot)),
      findsOneWidget,
    );

    // Sem selo.
    expect(
      _in('camiseta',
          find.byKey(const ValueKey('store-favorite-badge-camiseta'))),
      findsNothing,
    );
  });

  testWidgets('destaque: maior desconto, sem centavos, abre o produto', (
    tester,
  ) async {
    await _open(tester, _repo());

    final strip = find.byKey(const ValueKey('store-favorites-highlight'));
    expect(strip, findsOneWidget);
    expect(
      find.descendant(
        of: strip,
        matching: find.textContaining(
          'Bola NexaGO Pro Beach${StoreCopy.favoritesCheaper(formatBRLWhole(30))}',
          findRichText: true,
        ),
      ),
      findsOneWidget,
    );

    await tester.tap(strip);
    await _settleRoute(tester);
    expect(find.text('produto bola favoritos'), findsOneWidget);
  });

  testWidgets('sem desconto entre os favoritos à venda: sem faixa', (
    tester,
  ) async {
    await _open(
      tester,
      _FakeStoreRepository(
        products: [_camiseta, _mochila],
        favoriteIds: const ['camiseta', 'mochila'],
      ),
    );

    expect(_card('mochila'), findsOneWidget);
    expect(
        find.byKey(const ValueKey('store-favorites-highlight')), findsNothing);
  });

  testWidgets('vazio (09b): texto e "Explorar a loja" volta à vitrine', (
    tester,
  ) async {
    final analytics = await _open(
      tester,
      _FakeStoreRepository(
        products: [_bola],
        favoriteIds: const ['sumiu'],
      ),
    );

    expect(find.text(StoreCopy.favoritesEmptyTitle), findsOneWidget);
    expect(find.text(StoreCopy.favoritesEmptyHint), findsOneWidget);
    expect(find.text(StoreCopy.favoritesCount(0)), findsNothing);
    expect(analytics.logged(#logStoreFavoritesView, {#total: 0}), isTrue);

    await tester.tap(find.text(StoreCopy.favoritesExplore));
    await _settleRoute(tester);
    expect(find.text('vitrine'), findsOneWidget);
  });

  testWidgets('SKU único: adiciona 1 com o teto do SKU, avisa e conta', (
    tester,
  ) async {
    final repo = _repo();
    final analytics = await _open(tester, repo);
    expect(find.byKey(const ValueKey('store-cart-badge')), findsNothing);

    await tester.tap(_action('squeeze'));
    await tester.pump();
    await tester.pump();

    expect(repo.added, const [
      StoreCartItem(productId: 'squeeze', skuId: 'unico', qty: 1),
    ]);
    expect(repo.addedMaxQty, [3]);
    expect(find.text(StoreCopy.addedToCart), findsOneWidget);
    expect(find.text(StoreCopy.see), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('store-cart-badge')),
        matching: find.text('1'),
      ),
      findsOneWidget,
    );
    expect(
      analytics.logged(#logStoreAddToCart, {
        #sku: 'unico',
        #qty: 1,
        #priceCents: 8990,
        #origin: 'favoritos',
      }),
      isTrue,
    );

    // "Ver" abre o carrinho (depois da entrada do aviso).
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.text(StoreCopy.see));
    await _settleRoute(tester);
    expect(find.text('carrinho'), findsOneWidget);
  });

  testWidgets('linha já no teto do SKU: avisa e não grava', (tester) async {
    final repo = _repo(
      cart: const [StoreCartItem(productId: 'squeeze', skuId: 'unico', qty: 3)],
    );
    await _open(tester, repo);

    await tester.tap(_action('squeeze'));
    await tester.pump();

    expect(find.text(StoreCopy.cartLineAtMax(3)), findsOneWidget);
    expect(repo.added, isEmpty);
  });

  testWidgets('com escolha a fazer: "Ver opções" e o card abrem o produto', (
    tester,
  ) async {
    await _open(tester, _repo());

    expect(find.byTooltip(StoreCopy.favoritesViewOptions), findsOneWidget);
    await tester.tap(_action('camiseta'));
    await _settleRoute(tester);
    expect(find.text('produto camiseta favoritos'), findsOneWidget);

    GoRouter.of(tester.element(find.text('produto camiseta favoritos'))).pop();
    await _settleRoute(tester);
    await tester.tap(_in('oculos', find.text('Óculos Polarizado Sunline')));
    await _settleRoute(tester);
    expect(find.text('produto oculos favoritos'), findsOneWidget);
  });

  testWidgets('personalizável: abre sem sku e, ao voltar com a linha, avisa', (
    tester,
  ) async {
    final repo = _repo();
    await _open(tester, repo);

    expect(find.byTooltip(StoreCopy.customizeButton), findsOneWidget);
    await tester.tap(_action('custom'));
    await _settleRoute(tester);
    expect(find.text('personalizar custom sku=null'), findsOneWidget);

    await tester.tap(find.text('concluir'));
    await _settleRoute(tester);
    expect(_card('custom'), findsOneWidget);
    expect(find.text(StoreCopy.addedToCart), findsOneWidget);
    expect(repo.added, isEmpty, reason: 'a linha nasce na callable');
  });

  testWidgets('esgotado: o sino mostra o aviso e loga o avise-me', (
    tester,
  ) async {
    final repo = _repo();
    final analytics = await _open(tester, repo);

    expect(find.byTooltip(StoreCopy.notifyMeCta), findsOneWidget);
    await tester.tap(_action('mochila'));
    await tester.pump();

    expect(find.text(StoreCopy.waitlistSoon), findsOneWidget);
    expect(
      analytics.logged(#logStoreNotifyMe, {#productId: 'mochila'}),
      isTrue,
    );
    expect(repo.added, isEmpty);
  });

  testWidgets('coração tira na hora: o card some antes do servidor', (
    tester,
  ) async {
    final repo = _repo();
    final server = Completer<void>();
    repo.onSetFavorite = () => server.future;
    final analytics = await _open(tester, repo);

    await tester.tap(_heart('bola'));
    await tester.pump();

    expect(_card('bola'), findsNothing);
    expect(find.text(StoreCopy.favoritesCount(5)), findsOneWidget);
    expect(repo.favorites, [('bola', false)]);
    expect(
      analytics.logged(#logStoreFavorite, {#productId: 'bola', #on: false}),
      isTrue,
    );
    // O destaque passa pro próximo maior desconto (com centavos).
    expect(
      find.textContaining(
        StoreCopy.favoritesCheaper(formatBRLFromCents(2050)),
        findRichText: true,
      ),
      findsOneWidget,
    );

    server.complete();
    await tester.pump();
    expect(_card('bola'), findsNothing);
    expect(find.text(StoreCopy.favoriteError), findsNothing);
  });

  testWidgets('servidor recusa: o card volta e aparece o erro', (
    tester,
  ) async {
    final repo = _repo();
    final server = Completer<void>();
    repo.onSetFavorite = () => server.future;
    await _open(tester, repo);

    await tester.tap(_heart('oculos'));
    await tester.pump();
    expect(_card('oculos'), findsNothing);

    server.completeError(Exception('permission-denied'));
    await tester.pump();
    await tester.pump();

    expect(_card('oculos'), findsOneWidget);
    expect(find.text(StoreCopy.favoritesCount(6)), findsOneWidget);
    expect(find.text(StoreCopy.favoriteError), findsOneWidget);
  });

  testWidgets('erro ao carregar: mensagem e "Tentar de novo"', (tester) async {
    await _open(
      tester,
      _FakeStoreRepository(catalogError: Exception('permission-denied')),
    );
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text(StoreCopy.favoritesErrorTitle), findsOneWidget);
    expect(find.text(StoreCopy.retry), findsOneWidget);
    expect(find.text(StoreCopy.favoritesEmptyTitle), findsNothing);
  });

  testWidgets('carregando: esqueleto da grade, sem vazio', (tester) async {
    await _open(tester, _FakeStoreRepository(catalogNeverArrives: true));

    expect(find.byType(StoreProductCardSkeleton), findsWidgets);
    expect(find.text(StoreCopy.favoritesEmptyTitle), findsNothing);
    expect(find.text(StoreCopy.favoritesCount(0)), findsNothing);
  });
}

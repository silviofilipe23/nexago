import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/store/application/store_providers.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_repository.dart';
import 'package:nexago_app/features/store/presentation/store_copy.dart';
import 'package:nexago_app/features/store/presentation/store_page.dart';

/// Repositório em memória: nada de Firestore no teste.
class _FakeStoreRepository implements StoreRepository {
  _FakeStoreRepository({
    this.catalog,
    this.catalogError,
    this.config = StoreShowcaseConfig.empty,
    this.shopper = StoreShopper.empty,
  });

  final StoreCatalog? catalog;
  final Object? catalogError;
  final StoreShowcaseConfig config;
  final StoreShopper shopper;

  final List<StoreCartItem> cart = [];
  final _cartChanges = StreamController<List<StoreCartItem>>.broadcast();
  final List<String> addedSkus = [];

  @override
  Stream<bool> watchEnabled() => Stream.value(true);

  @override
  Stream<StoreCatalog> watchCatalog() {
    final error = catalogError;
    if (error != null) return Stream.error(error);
    return Stream.value(catalog!);
  }

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
    addedSkus.add(skuId);
    cart.add(StoreCartItem(productId: productId, skuId: skuId, qty: qty));
    _cartChanges.add(List.of(cart));
    return true;
  }

  @override
  Future<void> setPickupArena(String uid, String arenaId) async {}

  @override
  Future<void> setRecentSearches(String uid, List<String> searches) async {}

  @override
  Future<void> setFavorite(String uid, String productId, bool on) async {}
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

final _bola = StoreProduct(
  id: 'bola',
  name: 'Bola NexaGO Pro Beach',
  category: 'bolas',
  collection: 'verao-2026',
  badge: StoreBadge.bestSeller,
  priceCents: 28990,
  minPriceCents: 28990,
  maxPriceCents: 28990,
  pickup: true,
  soldLast30: 40,
  publishedAt: _published,
  variants: const [
    StoreVariant(id: 'unico', priceCents: 28990, inStock: true),
  ],
);

final _camiseta = StoreProduct(
  id: 'camiseta',
  name: 'Camiseta Dry UV50 Areia',
  category: 'vestuario',
  priceCents: 12990,
  minPriceCents: 12990,
  maxPriceCents: 14990,
  pickup: true,
  soldLast30: 20,
  publishedAt: _published,
  axes: const [
    StoreAxis(
      id: 'tam',
      label: 'Tamanho',
      values: [
        StoreAxisValue(id: 'm', label: 'M'),
        StoreAxisValue(id: 'g', label: 'G'),
      ],
    ),
  ],
  variants: const [
    StoreVariant(
      id: 'm',
      values: {'tam': 'm'},
      priceCents: 12990,
      inStock: true,
    ),
    StoreVariant(
      id: 'g',
      values: {'tam': 'g'},
      priceCents: 14990,
      inStock: true,
    ),
  ],
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
  variants: const [
    StoreVariant(id: 'unico', priceCents: 6990, inStock: false),
  ],
);

const _config = StoreShowcaseConfig(
  banners: [
    StoreBanner(
      id: 'verao',
      kicker: 'Coleção Verão 26',
      title: 'Equipamento de quem joga na areia',
      collectionId: 'verao-2026',
    ),
  ],
  benefits: StoreBenefits(pixDiscountPct: 5, pickupReadyHours: 24),
  pickupArenas: [
    StorePickupArena(arenaId: 'errejota', name: 'Arena Errejota'),
  ],
);

Future<_RecordingAnalytics> _open(
  WidgetTester tester,
  _FakeStoreRepository repo, {
  String initialQuery = '',
  ScrollController? tabScrollController,
}) async {
  // Tela alta: a grade monta preguiçosamente e os cards ficariam fora.
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
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(390, 2400),
            disableAnimations: true,
          ),
          child: StorePage(
            initialQuery: initialQuery,
            clock: () => DateTime.utc(2026, 10, 16, 15),
            tabScrollController: tabScrollController,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return analytics;
}

_FakeStoreRepository _repo({bool fromCache = false}) => _FakeStoreRepository(
      catalog: StoreCatalog(
        products: [_viseira, _camiseta, _bola],
        fromCache: fromCache,
      ),
      config: _config,
      shopper: const StoreShopper(pickupArenaId: 'errejota'),
    );

void main() {
  // Aba da barra inferior do atleta (flag da Loja ligada): sem "voltar", e a
  // lista no controller da aba — é ele que o toque repetido leva ao topo.
  testWidgets('como aba: sem voltar e rolando no controller da aba', (
    tester,
  ) async {
    final controller = ScrollController();
    addTearDown(controller.dispose);
    await _open(tester, _repo(), tabScrollController: controller);

    expect(find.byTooltip(StoreCopy.back), findsNothing);
    expect(find.text(StoreCopy.pageTitle), findsOneWidget);
    expect(controller.hasClients, isTrue);

    // Fechar a vitrine não descarta o controller (é do shell).
    await tester.pumpWidget(const SizedBox.shrink());
    expect(() => controller.addListener(() {}), returnsNormally);
  });

  testWidgets('como rota empilhada: tem voltar', (tester) async {
    await _open(tester, _repo());
    expect(find.byTooltip(StoreCopy.back), findsOneWidget);
  });

  testWidgets('renderiza banner, chips, arena, título e a grade', (
    tester,
  ) async {
    final analytics = await _open(tester, _repo());
    await tester.pumpAndSettle();

    expect(find.text(StoreCopy.pageTitle), findsOneWidget);
    expect(find.text('Equipamento de quem joga na areia'), findsOneWidget);
    expect(find.text('COLEÇÃO VERÃO 26'), findsOneWidget);

    // Chips: Tudo + categorias com produto (Rede & quadra e Kits não têm).
    expect(find.text('Tudo'), findsOneWidget);
    expect(find.text('Bolas'), findsOneWidget);
    expect(find.text('Vestuário'), findsOneWidget);
    expect(find.text('Acessórios'), findsOneWidget);
    expect(find.text('Kits'), findsNothing);

    expect(find.textContaining('Arena Errejota', findRichText: true), findsOneWidget);
    expect(find.text(StoreCopy.pickupChange), findsOneWidget);
    expect(find.text('Mais vendidos'), findsOneWidget);
    expect(find.text(StoreCopy.filter), findsOneWidget);

    expect(find.text('Bola NexaGO Pro Beach'), findsOneWidget);
    expect(find.text('Camiseta Dry UV50 Areia'), findsOneWidget);
    expect(find.text('Viseira Dry Fit'), findsOneWidget);
    expect(find.text('TOP'), findsOneWidget);
    expect(find.text('ESGOTADO'), findsOneWidget);
    // Preço e Pix com a mesma conta do servidor (28990 → 27541).
    expect(
      find.textContaining(formatBRLFromCents(28990), findRichText: true),
      findsOneWidget,
    );
    expect(
      find.textContaining(formatBRLFromCents(27541), findRichText: true),
      findsOneWidget,
    );
    expect(
      find.textContaining(StoreCopy.fromPrefix.trim(), findRichText: true),
      findsOneWidget,
    );

    // Mais vendidos primeiro: bola (40) antes da camiseta (20).
    expect(
      tester.getTopLeft(find.text('Bola NexaGO Pro Beach')).dx,
      lessThan(tester.getTopLeft(find.text('Camiseta Dry UV50 Areia')).dx),
    );
    expect(analytics.logged(#logStoreShowcaseView), isTrue);
  });

  testWidgets('trocar de categoria recorta a grade e loga', (tester) async {
    final analytics = await _open(tester, _repo());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Vestuário'));
    await tester.pumpAndSettle();

    expect(find.text('Camiseta Dry UV50 Areia'), findsOneWidget);
    expect(find.text('Bola NexaGO Pro Beach'), findsNothing);
    expect(find.text('Viseira Dry Fit'), findsNothing);
    expect(
      analytics.logged(#logStoreCategorySelect, {#category: 'vestuario'}),
      isTrue,
    );

    await tester.tap(find.text('Tudo'));
    await tester.pumpAndSettle();
    expect(find.text('Bola NexaGO Pro Beach'), findsOneWidget);
  });

  testWidgets('filtro sem resultado mostra o vazio e "Limpar filtros" volta', (
    tester,
  ) async {
    await _open(tester, _repo());
    await tester.pumpAndSettle();

    await tester.tap(find.text(StoreCopy.filter));
    await tester.pumpAndSettle();
    await tester.tap(find.text(StoreCopy.filterOnSale));
    await tester.pumpAndSettle();
    // Nenhum produto tem preço "de": o botão já avisa.
    await tester.tap(find.text(StoreCopy.filterApply(0)));
    await tester.pumpAndSettle();

    expect(find.text(StoreCopy.emptyFilters), findsOneWidget);
    expect(find.text(StoreCopy.filterWithCount(1)), findsOneWidget);
    expect(find.text('Bola NexaGO Pro Beach'), findsNothing);

    await tester.tap(find.text(StoreCopy.clearFilters));
    await tester.pumpAndSettle();
    expect(find.text(StoreCopy.emptyFilters), findsNothing);
    expect(find.text('Bola NexaGO Pro Beach'), findsOneWidget);
    expect(find.text(StoreCopy.filter), findsOneWidget);
  });

  testWidgets('erro ao carregar: mensagem e "Tentar de novo"', (tester) async {
    await _open(
      tester,
      _FakeStoreRepository(catalogError: Exception('permission-denied')),
    );
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text(StoreCopy.errorTitle), findsOneWidget);
    expect(find.text(StoreCopy.retry), findsOneWidget);
    expect(find.text('Bola NexaGO Pro Beach'), findsNothing);
  });

  testWidgets('"+" sem variação adiciona, mostra o aviso e conta na sacola', (
    tester,
  ) async {
    final repo = _repo();
    final analytics = await _open(tester, repo);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('store-cart-badge')), findsNothing);

    final bolaCard = find.byKey(const ValueKey('store-product-bola'));
    await tester.tap(
      find.descendant(of: bolaCard, matching: find.byIcon(Icons.add_rounded)),
    );
    await tester.pumpAndSettle();

    expect(repo.addedSkus, ['unico']);
    expect(find.text(StoreCopy.added), findsOneWidget);
    expect(find.text(StoreCopy.seeCart), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('store-cart-badge')),
        matching: find.text('1'),
      ),
      findsOneWidget,
    );
    expect(analytics.logged(#logStoreQuickAdd, {#productId: 'bola'}), isTrue);
  });

  testWidgets('"+" com variação abre a folha e adiciona o SKU escolhido', (
    tester,
  ) async {
    final repo = _repo();
    await _open(tester, repo);
    await tester.pumpAndSettle();

    final card = find.byKey(const ValueKey('store-product-camiseta'));
    await tester.tap(
      find.descendant(of: card, matching: find.byIcon(Icons.add_rounded)),
    );
    await tester.pumpAndSettle();

    expect(find.text(StoreCopy.variantPick), findsOneWidget);
    await tester.tap(find.text('G'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(StoreCopy.variantAdd));
    await tester.pumpAndSettle();

    expect(repo.addedSkus, ['g']);
  });

  testWidgets('esgotado: o sino avisa que a lista de espera vem aí', (
    tester,
  ) async {
    final repo = _repo();
    await _open(tester, repo);
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.notifications_none_rounded));
    await tester.pumpAndSettle();

    expect(find.text(StoreCopy.waitlistSoon), findsOneWidget);
    expect(repo.addedSkus, isEmpty);
  });

  testWidgets('busca sem resultado: "Não achamos" + mais vendidos', (
    tester,
  ) async {
    await _open(tester, _repo(), initialQuery: 'raquete');
    await tester.pumpAndSettle();

    expect(find.text(StoreCopy.searchNotFound('raquete')), findsOneWidget);
    expect(find.text('Resultados para "raquete"'), findsOneWidget);
    expect(find.text('Bola NexaGO Pro Beach'), findsOneWidget);
  });

  testWidgets('cache sem servidor: vitrine em cache com "Sem conexão"', (
    tester,
  ) async {
    await _open(tester, _repo(fromCache: true));
    await tester.pump(const Duration(seconds: 2));

    expect(find.text('Bola NexaGO Pro Beach'), findsOneWidget);
    expect(find.text(StoreCopy.offline), findsOneWidget);
  });
}

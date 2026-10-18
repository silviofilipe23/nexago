import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/store/application/store_checkout_providers.dart';
import 'package:nexago_app/features/store/application/store_providers.dart';
import 'package:nexago_app/features/store/domain/store_checkout_models.dart';
import 'package:nexago_app/features/store/domain/store_checkout_rules.dart';
import 'package:nexago_app/features/store/domain/store_checkout_service.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_order_rules.dart';
import 'package:nexago_app/features/store/domain/store_repository.dart';
import 'package:nexago_app/features/store/presentation/store_address_page.dart';
import 'package:nexago_app/features/store/presentation/store_cart_page.dart';
import 'package:nexago_app/features/store/presentation/store_order_page.dart';
import 'package:nexago_app/features/store/presentation/store_orders_page.dart';

/// Peças em memória do carrinho/checkout/pedidos: nada de Firebase no teste.

/// "R\$ 180,40" com o espaço que o `NumberFormat` usa.
String brl(int cents) => formatBRLFromCents(cents);

/// Sexta, 17/10/2026 às 17h de São Paulo.
final DateTime kTestNow = DateTime.utc(2026, 10, 17, 20);

const StoreProduct kBola = StoreProduct(
  id: 'bola',
  name: 'Bola Pro Beach',
  category: 'bolas',
  priceCents: 18990,
  minPriceCents: 18990,
  maxPriceCents: 18990,
  pickup: true,
  delivery: true,
  variants: [
    StoreVariant(id: 'unico', priceCents: 18990, inStock: true, maxQty: 3),
  ],
);

const StoreShowcaseConfig kConfig = StoreShowcaseConfig(
  benefits: StoreBenefits(pixDiscountPct: 5, exchangeDays: 30),
  pickupArenas: [
    StorePickupArena(arenaId: 'a1', name: 'Arena Errejota', readyHours: 24),
  ],
  delivery: StoreDelivery(
    freeAboveCents: 39900,
    modes: [
      StoreDeliveryMode(
        id: 'expressa',
        name: 'Expressa',
        description: 'Chega amanhã',
        priceCents: 3490,
      ),
    ],
  ),
);

class FakeStoreRepository implements StoreRepository {
  FakeStoreRepository({
    List<StoreCartItem> cart = const [],
    this.products = const [kBola],
  }) : cart = List.of(cart);

  List<StoreCartItem> cart;
  final List<StoreProduct> products;
  final _cartChanges = StreamController<List<StoreCartItem>>.broadcast();
  final List<(String, String, int, int?)> added = [];

  void setCart(List<StoreCartItem> next) {
    cart = List.of(next);
    _cartChanges.add(List.of(cart));
  }

  @override
  Stream<bool> watchEnabled() => Stream.value(true);

  @override
  Stream<StoreCatalog> watchCatalog() =>
      Stream.value(StoreCatalog(products: products));

  @override
  Stream<StoreShowcaseConfig> watchShowcaseConfig() => Stream.value(kConfig);

  @override
  Stream<StoreShopper> watchShopper(String uid) =>
      Stream.value(StoreShopper.empty);

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
    added.add((productId, skuId, qty, maxQty));
    setCart(
        [...cart, StoreCartItem(productId: productId, skuId: skuId, qty: qty)]);
    return true;
  }

  @override
  Future<void> setPickupArena(String uid, String arenaId) async {}

  @override
  Future<void> setRecentSearches(String uid, List<String> searches) async {}

  @override
  Future<void> setFavorite(String uid, String productId, bool on) async {}
}

/// Cotação do servidor para o pedido (o mesmo cenário do spec do portal).
StoreCheckoutQuote quoteFor(
  StoreCheckoutRequest req, {
  Map<String, Object?> over = const {},
  int qty = 1,
}) {
  final casa = req.delivery is StoreHomeDelivery;
  return storeQuoteFromMap({
    'lines': [
      {
        'key': 'bola/unico',
        'productId': 'bola',
        'skuId': 'unico',
        'qty': qty,
        'name': 'Bola Pro Beach',
        'unitCents': 18990,
        'totalCents': 18990 * qty,
        'problem': null,
      },
    ],
    'units': qty,
    'subtotalCents': 18990 * qty,
    'coupon': null,
    'pixDiscountPct': 5,
    'pixDiscountCents': 950,
    'shippingCents': casa ? 3490 : 0,
    'freeShipping': false,
    'totalCents': casa ? 21530 : 18040,
    'problems': req.delivery != null ? const [] : const ['entrega_faltando'],
    ...over,
  })!;
}

class FakeCheckoutService implements StoreCheckoutService {
  final List<StoreCheckoutRequest> quotes = [];
  final List<(StoreCheckoutRequest, int, String?)> creates = [];

  StoreCheckoutQuote Function(StoreCheckoutRequest req) quoteImpl = quoteFor;

  Future<StoreCreatedOrder> Function(
    StoreCheckoutRequest req,
    int expected,
    String? cpf,
  ) createImpl = (req, expected, cpf) async => StoreCreatedOrder(
        orderId: 'ord_pedido_1',
        number: 'NX-0001',
        totalCents: expected,
        pix: StoreOrderPix(
          copyPaste: 'x' * 40,
          expiresAt: kTestNow.add(const Duration(minutes: 30)),
        ),
      );

  @override
  Future<StoreCheckoutQuote> quote(StoreCheckoutRequest request) async {
    quotes.add(request);
    return quoteImpl(request);
  }

  @override
  Future<StoreCreatedOrder> createOrder(
    StoreCheckoutRequest request, {
    required int expectedTotalCents,
    String? cpf,
  }) {
    creates.add((request, expectedTotalCents, cpf));
    return createImpl(request, expectedTotalCents, cpf);
  }
}

class FakeCheckoutRepository implements StoreCheckoutRepository {
  FakeCheckoutRepository(this.store, {List<StoreAddress> addresses = const []})
      : addresses = List.of(addresses);

  final FakeStoreRepository store;
  List<StoreAddress> addresses;
  final _addressChanges = StreamController<List<StoreAddress>>.broadcast();
  final List<(String, int)> qtyCalls = [];
  final List<List<StoreAddress>> saved = [];
  final StreamController<List<StoreOrderView>> orders =
      StreamController<List<StoreOrderView>>.broadcast();
  final Map<String, StreamController<StoreOrderView?>> _order = {};

  StreamController<StoreOrderView?> order(String id) =>
      _order.putIfAbsent(id, StreamController<StoreOrderView?>.broadcast);

  @override
  Stream<List<StoreAddress>> watchAddresses(String uid) async* {
    yield List.of(addresses);
    yield* _addressChanges.stream;
  }

  @override
  Future<void> saveAddresses(String uid, List<StoreAddress> items) async {
    saved.add(items);
    addresses = List.of(items);
    _addressChanges.add(List.of(items));
  }

  @override
  Future<void> setCartLineQty(String uid, String key, int qty) async {
    qtyCalls.add((key, qty));
    store.setCart(storeCartWithLineQty(store.cart, key, qty));
  }

  @override
  Stream<List<StoreOrderView>> watchOrders(String uid) => orders.stream;

  @override
  Stream<StoreOrderView?> watchOrder(String orderId) => order(orderId).stream;
}

class FakeCepLookup implements StoreCepLookup {
  @override
  Future<StoreViaCepAddress?> lookup(String cep) async => cep == '74210130'
      ? const StoreViaCepAddress(
          cep: '74210130',
          street: 'Rua T-37',
          district: 'Setor Bueno',
          city: 'Goiânia',
          uf: 'GO',
        )
      : null;
}

class RecordingAnalytics implements AnalyticsService {
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

/// O app de teste: as rotas da Loja que o checkout usa, com os fakes.
class CheckoutHarness {
  CheckoutHarness({
    List<StoreCartItem> cart = const [
      StoreCartItem(productId: 'bola', skuId: 'unico', qty: 1),
    ],
    List<StoreAddress> addresses = const [],
    List<StoreProduct> products = const [kBola],
  })  : store = FakeStoreRepository(cart: cart, products: products),
        service = FakeCheckoutService() {
    checkout = FakeCheckoutRepository(store, addresses: addresses);
  }

  final FakeStoreRepository store;
  final FakeCheckoutService service;
  late final FakeCheckoutRepository checkout;
  final RecordingAnalytics analytics = RecordingAnalytics();
  final List<Uri> opened = [];
  late final GoRouter router;

  Future<void> pump(
    WidgetTester tester, {
    String initial = AppRoutes.storeCart,
    Object? extra,
    DateTime? now,
  }) async {
    tester.view.physicalSize = const Size(390, 2600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    DateTime clock() => now ?? kTestNow;
    Widget stub(String label) => Scaffold(body: Center(child: Text(label)));
    router = GoRouter(
      initialLocation: initial,
      initialExtra: extra,
      routes: [
        GoRoute(
          path: AppRoutes.store,
          name: AppRouteNames.store,
          builder: (_, _) => stub('vitrine'),
        ),
        GoRoute(
          path: AppRoutes.storeCart,
          name: AppRouteNames.storeCart,
          builder: (_, _) => StoreCartPage(clock: clock),
        ),
        GoRoute(
          path: AppRoutes.storeAddress,
          name: AppRouteNames.storeAddress,
          builder: (_, state) =>
              StoreAddressPage(addressId: state.uri.queryParameters['id']),
        ),
        GoRoute(
          path: AppRoutes.storeOrders,
          name: AppRouteNames.storeOrders,
          builder: (_, _) => StoreOrdersPage(clock: clock),
        ),
        GoRoute(
          path: AppRoutes.storeOrder,
          name: AppRouteNames.storeOrder,
          builder: (_, state) {
            final extra = state.extra;
            return StoreOrderPage(
              orderId: state.pathParameters['orderId'] ?? '',
              created: extra is StoreCreatedOrder ? extra : null,
              clock: clock,
              notFoundAfter: const Duration(seconds: 2),
            );
          },
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          storeRepositoryProvider.overrideWithValue(store),
          storeCheckoutServiceProvider.overrideWithValue(service),
          storeCheckoutRepositoryProvider.overrideWithValue(checkout),
          storeCepLookupProvider.overrideWithValue(FakeCepLookup()),
          storeUidProvider.overrideWith((ref) => 'ana'),
          storeUserPositionProvider.overrideWith((ref) => null),
          storeBookingVisitsProvider.overrideWith((ref) => const []),
          storeCheckoutChannelProvider.overrideWithValue(kStoreChannelIos),
          storeRecipientNameProvider.overrideWith((ref) => 'Ana Souza'),
          storeOpenUrlProvider.overrideWithValue((uri) async {
            opened.add(uri);
            return true;
          }),
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
  }

  /// Espera a cotação (debounce de 250 ms) e a resposta.
  static Future<void> settleQuote(WidgetTester tester) async {
    // O rebuild que agenda a cotação vem antes de o relógio andar.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    await tester.pump();
  }
}

StoreOrderView orderView(
  String id, [
  Map<String, Object?> over = const {},
]) =>
    storeOrderViewFromMap(id, {
      'uid': 'ana',
      'number': 'NX-4821',
      'status': 'sep',
      'items': [
        {
          'productId': 'bola',
          'skuId': 'unico',
          'name': 'Bola Pro Beach',
          'qty': 1,
          'unitCents': 18990,
          'totalCents': 18990,
        },
      ],
      'units': 1,
      'subtotalCents': 18990,
      'pixDiscountCents': 950,
      'totalCents': 18040,
      'delivery': {
        'type': 'arena',
        'placeName': 'Arena Errejota',
        'counter': 'recepção',
        'address': 'Rua 1, Goiânia',
      },
      'createdAt': '2026-10-17T19:02:00.000Z',
      ...over,
    })!;

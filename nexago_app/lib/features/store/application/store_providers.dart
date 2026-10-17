import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/location/user_location_providers.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/store_models.dart';
import '../domain/store_pickup.dart';
import '../domain/store_product_rules.dart';
import '../domain/store_rules.dart';
import '../infrastructure/firestore_store_repository.dart';

export '../infrastructure/firestore_store_repository.dart'
    show storeRepositoryProvider;

/// Uid da sessão; vazio deslogado (preferências e carrinho viram neutros e
/// nenhuma leitura bate nas rules do dono).
final storeUidProvider = Provider.autoDispose<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// `appConfig/store.enabled` (a rule de `appConfig` exige sessão).
final storeFlagProvider = StreamProvider.autoDispose<bool>((ref) {
  if (ref.watch(storeUidProvider).isEmpty) return Stream.value(false);
  return ref.watch(storeRepositoryProvider).watchEnabled();
});

/// A Loja está ligada? Carregando ou com erro conta como desligada — a
/// entrada da home só aparece com `true` confirmado.
final storeEnabledProvider = Provider.autoDispose<bool>((ref) {
  return ref.watch(storeFlagProvider).valueOrNull ?? false;
});

final storeCatalogProvider = StreamProvider.autoDispose<StoreCatalog>((ref) {
  return ref.watch(storeRepositoryProvider).watchCatalog();
});

final storeShowcaseConfigProvider =
    StreamProvider.autoDispose<StoreShowcaseConfig>((ref) {
  return ref.watch(storeRepositoryProvider).watchShowcaseConfig();
});

enum StoreProductStatus { loading, error, notFound, found }

/// Página do produto (tela 02) lida do catálogo que a vitrine já escuta —
/// nada de consulta nova. [products] alimenta "Combina com" e os mais
/// vendidos do "não está mais disponível".
class StoreProductLookup {
  const StoreProductLookup._(
    this.status, {
    this.product,
    this.products = const [],
    this.fromCache = false,
  });

  static const StoreProductLookup loading =
      StoreProductLookup._(StoreProductStatus.loading);
  static const StoreProductLookup error =
      StoreProductLookup._(StoreProductStatus.error);

  final StoreProductStatus status;
  final StoreProduct? product;
  final List<StoreProduct> products;

  /// Catálogo do cache (offline): a página abre, mas o "Adicionar" não.
  final bool fromCache;
}

/// Produto por id (ou slug, o link do portal), derivado de
/// [storeCatalogProvider]. Cache vazio ainda não é "não encontrado": é o
/// servidor que não respondeu.
final storeProductProvider =
    Provider.autoDispose.family<StoreProductLookup, String>((ref, idOrSlug) {
  final async = ref.watch(storeCatalogProvider);
  final catalog = async.valueOrNull;
  if (catalog == null) {
    return async.hasError
        ? StoreProductLookup.error
        : StoreProductLookup.loading;
  }
  final product = findStoreProduct(catalog.products, idOrSlug);
  if (product == null) {
    if (catalog.fromCache) return StoreProductLookup.loading;
    return StoreProductLookup._(
      StoreProductStatus.notFound,
      products: catalog.products,
    );
  }
  return StoreProductLookup._(
    StoreProductStatus.found,
    product: product,
    products: catalog.products,
    fromCache: catalog.fromCache,
  );
});

final storeShopperProvider = StreamProvider.autoDispose<StoreShopper>((ref) {
  final uid = ref.watch(storeUidProvider);
  if (uid.isEmpty) return Stream.value(StoreShopper.empty);
  return ref.watch(storeRepositoryProvider).watchShopper(uid);
});

final storeCartProvider =
    StreamProvider.autoDispose<List<StoreCartItem>>((ref) {
  final uid = ref.watch(storeUidProvider);
  if (uid.isEmpty) return Stream.value(const <StoreCartItem>[]);
  return ref.watch(storeRepositoryProvider).watchCart(uid);
});

/// Contador da sacola (soma das unidades); 0 enquanto carrega.
final storeCartUnitsProvider = Provider.autoDispose<int>((ref) {
  return storeCartUnits(ref.watch(storeCartProvider).valueOrNull ?? const []);
});

/// Reservas do atleta reduzidas ao que a arena de retirada precisa.
final storeBookingVisitsProvider =
    Provider.autoDispose<List<StoreBookingVisit>>((ref) {
  final bookings = ref.watch(myBookingsStreamProvider).valueOrNull ?? const [];
  return [
    for (final b in bookings)
      if ((b.arenaId ?? '').trim().isNotEmpty)
        StoreBookingVisit(
          arenaId: b.arenaId!.trim(),
          dateKey: b.dateRaw,
          status: b.rawStatus,
        ),
  ];
});

/// Coordenadas do atleta SÓ com permissão já concedida: `userLocationProvider`
/// nunca abre o diálogo do sistema. `null` = sem localização.
final storeUserPositionProvider =
    Provider.autoDispose<({double latitude, double longitude})?>((ref) {
  final location = ref.watch(userLocationProvider).valueOrNull;
  if (location == null || !location.hasCoordinates) return null;
  return (latitude: location.latitude!, longitude: location.longitude!);
});

/// Arena de retirada (escolhida → frequente → próxima → nenhuma). `null`
/// enquanto as preferências do atleta carregam — a faixa espera em vez de
/// mostrar uma arena e trocar por outra logo depois.
final storePickupChoiceProvider =
    Provider.autoDispose<StorePickupChoice?>((ref) {
  final shopper = ref.watch(storeShopperProvider);
  if (!shopper.hasValue && !shopper.hasError) return null;
  final config = ref.watch(storeShowcaseConfigProvider).valueOrNull ??
      StoreShowcaseConfig.empty;
  final position = ref.watch(storeUserPositionProvider);
  return resolveStorePickupArena(
    arenas: config.pickupArenas,
    chosenArenaId: shopper.valueOrNull?.pickupArenaId,
    visits: ref.watch(storeBookingVisitsProvider),
    todayKey: storeSaoPauloDateKey(DateTime.now()),
    userLatitude: position?.latitude,
    userLongitude: position?.longitude,
  );
});

/// Escritas do atleta na Loja (preferências e carrinho).
class StoreActions {
  StoreActions(this._ref);

  final Ref _ref;

  String get _uid => _ref.read(storeUidProvider);

  /// `false` = carrinho cheio. Sem sessão lança (a tela já exige login).
  /// [maxQty] = saldo exposto do SKU (página do produto): a linha não passa
  /// dele.
  Future<bool> addToCart({
    required String productId,
    required String skuId,
    int qty = 1,
    int? maxQty,
  }) {
    final uid = _uid;
    if (uid.isEmpty) throw StateError('Entre na sua conta pra usar a Loja.');
    return _ref.read(storeRepositoryProvider).addToCart(
          uid,
          productId: productId,
          skuId: skuId,
          qty: qty,
          maxQty: maxQty,
        );
  }

  /// Liga/desliga o favorito. Sem sessão lança (a tela já exige login).
  Future<void> toggleFavorite(String productId, {required bool on}) {
    final uid = _uid;
    if (uid.isEmpty) throw StateError('Entre na sua conta pra usar a Loja.');
    return _ref.read(storeRepositoryProvider).setFavorite(uid, productId, on);
  }

  Future<void> choosePickupArena(String arenaId) async {
    final uid = _uid;
    if (uid.isEmpty) return;
    await _ref.read(storeRepositoryProvider).setPickupArena(uid, arenaId);
  }

  /// Busca recente é conveniência: falhar em gravar não atrapalha a busca.
  Future<void> rememberSearch(String term) async {
    final uid = _uid;
    if (uid.isEmpty || term.trim().isEmpty) return;
    final current =
        _ref.read(storeShopperProvider).valueOrNull?.recentSearches ??
            const <String>[];
    try {
      await _ref
          .read(storeRepositoryProvider)
          .setRecentSearches(uid, withRecentSearch(current, term));
    } catch (_) {
      // Ignorado de propósito: a busca segue sem o histórico.
    }
  }
}

/// Sem autoDispose: as ações são lidas em callbacks (`ref.read`) e terminam
/// depois de um `await` — um provider descartado no meio derrubaria o `Ref`.
final storeActionsProvider = Provider<StoreActions>(StoreActions.new);

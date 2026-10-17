import 'store_models.dart';

/// Leitura da vitrine e as preferências/carrinho do atleta.
///
/// Leitura: espelhos públicos (`storeShowcase`, `storePublic/showcase`) e
/// `appConfig/store`. Escrita: só `storeShoppers/{uid}` e `storeCarts/{uid}`,
/// com os campos que as rules aceitam.
abstract interface class StoreRepository {
  /// `appConfig/store.enabled`; doc ausente = desligado.
  Stream<bool> watchEnabled();

  /// Catálogo inteiro do canal app (`channels.app == true`), numa consulta.
  Stream<StoreCatalog> watchCatalog();

  /// `storePublic/showcase`; doc ausente = [StoreShowcaseConfig.empty].
  Stream<StoreShowcaseConfig> watchShowcaseConfig();

  /// `storeShoppers/{uid}`; doc ausente = [StoreShopper.empty].
  Stream<StoreShopper> watchShopper(String uid);

  /// `storeCarts/{uid}.items`; doc ausente = carrinho vazio.
  Stream<List<StoreCartItem>> watchCart(String uid);

  /// Grava a arena de retirada escolhida (merge).
  Future<void> setPickupArena(String uid, String arenaId);

  /// Regrava as buscas recentes (já cortadas em 5, mais recente primeiro).
  Future<void> setRecentSearches(String uid, List<String> searches);

  /// Liga/desliga [productId] em `favoriteIds` (merge, sem reler a lista).
  Future<void> setFavorite(String uid, String productId, bool on);

  /// Soma [qty] unidades do SKU no carrinho (lê, soma e grava numa
  /// transação), sem a linha passar de [maxQty] (o saldo exposto do SKU).
  /// `false` = carrinho cheio (30 linhas).
  Future<bool> addToCart(
    String uid, {
    required String productId,
    required String skuId,
    int qty = 1,
    int? maxQty,
  });
}

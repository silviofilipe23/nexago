import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_providers.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/store_checkout_models.dart';
import '../domain/store_models.dart';
import '../domain/store_order_rules.dart';
import '../infrastructure/firestore_store_checkout_repository.dart';
import 'store_providers.dart';

export '../infrastructure/firebase_store_checkout_service.dart'
    show storeCheckoutServiceProvider;
export '../infrastructure/firestore_store_checkout_repository.dart'
    show storeCheckoutRepositoryProvider;
export '../infrastructure/via_cep_lookup.dart' show storeCepLookupProvider;

/// `app_ios` ou `app_android` (o `channel` do checkout).
final storeCheckoutChannelProvider = Provider<String>((ref) {
  return defaultTargetPlatform == TargetPlatform.iOS
      ? kStoreChannelIos
      : kStoreChannelAndroid;
});

/// Nome que o "Quem recebe" do endereço novo já traz: o do perfil, senão o
/// da conta.
final storeRecipientNameProvider = Provider.autoDispose<String>((ref) {
  final profile = ref.watch(athleteProfileProvider).valueOrNull?.name.trim();
  if (profile != null && profile.isNotEmpty) return profile;
  return ref.watch(authProvider).valueOrNull?.displayName?.trim() ?? '';
});

/// `storeAddresses/{uid}` (só o dono lê); deslogado = vazio.
final storeAddressesProvider =
    StreamProvider.autoDispose<List<StoreAddress>>((ref) {
  final uid = ref.watch(storeUidProvider);
  if (uid.isEmpty) return Stream.value(const <StoreAddress>[]);
  return ref.watch(storeCheckoutRepositoryProvider).watchAddresses(uid);
});

/// Visão dos pedidos do atleta, mais recentes primeiro.
final storeOrdersProvider =
    StreamProvider.autoDispose<List<StoreOrderView>>((ref) {
  final uid = ref.watch(storeUidProvider);
  if (uid.isEmpty) return Stream.value(const <StoreOrderView>[]);
  return ref.watch(storeCheckoutRepositoryProvider).watchOrders(uid);
});

/// Um pedido pelo id (chave `String` — `family` com lista vira loop);
/// `null` enquanto o espelho ainda não existe.
final storeOrderProvider =
    StreamProvider.autoDispose.family<StoreOrderView?, String>((ref, orderId) {
  if (ref.watch(storeUidProvider).isEmpty || orderId.trim().isEmpty) {
    return Stream.value(null);
  }
  return ref.watch(storeCheckoutRepositoryProvider).watchOrder(orderId.trim());
});

/// Abre um link fora do app (Maps, rastreio). Trocado nos testes.
final storeOpenUrlProvider = Provider<Future<bool> Function(Uri uri)>((ref) {
  return (uri) => launchUrl(uri, mode: LaunchMode.externalApplication);
});

/// Resultado do "Comprar de novo".
class StoreRebuyResult {
  const StoreRebuyResult({required this.added, required this.skipped});

  final int added;
  final int skipped;
}

/// Escritas do atleta no checkout (carrinho, endereços, comprar de novo).
class StoreCheckoutActions {
  StoreCheckoutActions(this._ref);

  final Ref _ref;

  String _uid() {
    final uid = _ref.read(storeUidProvider);
    if (uid.isEmpty) throw StateError('Entre na sua conta pra usar a Loja.');
    return uid;
  }

  /// Quantidade da linha [key] (0 remove).
  Future<void> setLineQty(String key, int qty) => _ref
      .read(storeCheckoutRepositoryProvider)
      .setCartLineQty(_uid(), key, qty);

  Future<void> saveAddresses(List<StoreAddress> items) =>
      _ref.read(storeCheckoutRepositoryProvider).saveAddresses(_uid(), items);

  /// Põe no carrinho as peças comuns do pedido que seguem à venda (com o
  /// saldo do SKU como teto). Personalizadas e fora da loja ficam de fora.
  Future<StoreRebuyResult> rebuy(StoreOrderView order) async {
    final StoreCatalog catalog = _ref.read(storeCatalogProvider).valueOrNull ??
        await _ref.read(storeCatalogProvider.future);
    final plan = storeRebuyPlan(order.items, catalog.products);
    final store = _ref.read(storeActionsProvider);
    var added = 0;
    var skipped = plan.skipped;
    for (final line in plan.lines) {
      final ok = await store.addToCart(
        productId: line.productId,
        skuId: line.skuId,
        qty: line.qty,
        maxQty: line.maxQty,
      );
      if (ok) {
        added++;
      } else {
        skipped++;
      }
    }
    return StoreRebuyResult(added: added, skipped: skipped);
  }
}

/// Sem autoDispose: as ações terminam depois de um `await` (ver
/// `storeActionsProvider`).
final storeCheckoutActionsProvider =
    Provider<StoreCheckoutActions>(StoreCheckoutActions.new);

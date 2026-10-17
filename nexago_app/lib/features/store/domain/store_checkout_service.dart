import 'store_checkout_models.dart';

/// As duas callables do checkout (região do cliente). Erro →
/// [StoreCheckoutException] com a mensagem pronta e, quando o servidor
/// mandou, a cotação nova.
abstract interface class StoreCheckoutService {
  /// `quoteStoreCheckout`: só leitura — relê carrinho, catálogo, entrega,
  /// cupom e desconto do Pix.
  Future<StoreCheckoutQuote> quote(StoreCheckoutRequest request);

  /// `createStoreOrder`: [expectedTotalCents] é o total que a tela mostrou
  /// (diferente do recalculado → [StoreCheckoutErrorKind.changed]); [cpf] só
  /// depois do `cpf_required`.
  Future<StoreCreatedOrder> createOrder(
    StoreCheckoutRequest request, {
    required int expectedTotalCents,
    String? cpf,
  });
}

/// O que é do atleta no Firestore durante o checkout: endereços, linhas do
/// carrinho e a visão dos pedidos (só o dono lê).
abstract interface class StoreCheckoutRepository {
  /// `storeAddresses/{uid}`; doc ausente = lista vazia.
  Stream<List<StoreAddress>> watchAddresses(String uid);

  /// Regrava a lista inteira (até 10).
  Future<void> saveAddresses(String uid, List<StoreAddress> items);

  /// Muda a quantidade de uma linha (0 remove) numa transação, preservando
  /// as outras inteiras.
  Future<void> setCartLineQty(String uid, String key, int qty);

  /// `storeOrderViews` do atleta, mais recentes primeiro.
  Stream<List<StoreOrderView>> watchOrders(String uid);

  /// Um pedido; `null` enquanto o espelho ainda não existe (o gatilho grava
  /// ~1 s depois do `createStoreOrder`).
  Stream<StoreOrderView?> watchOrder(String orderId);
}

/// Consulta de CEP. Nunca lança: CEP errado ou serviço fora do ar viram
/// `null` e o atleta digita na mão.
abstract interface class StoreCepLookup {
  Future<StoreViaCepAddress?> lookup(String cep);
}

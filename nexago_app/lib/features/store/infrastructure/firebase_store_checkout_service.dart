import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../domain/store_checkout_models.dart';
import '../domain/store_checkout_rules.dart';
import '../domain/store_checkout_service.dart';
import '../domain/store_order_rules.dart';

/// Checkout no Firebase: `quoteStoreCheckout` e `createStoreOrder` na região
/// do cliente (`nexagoFunctions`), como as outras callables da Loja.
class FirebaseStoreCheckoutService implements StoreCheckoutService {
  FirebaseStoreCheckoutService({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  static const StoreCheckoutException _badResponse = StoreCheckoutException(
    StoreCheckoutErrorKind.other,
    'Não deu pra fechar o pedido. Tente de novo em instantes.',
  );

  @override
  Future<StoreCheckoutQuote> quote(StoreCheckoutRequest request) async {
    final data = await _call('quoteStoreCheckout', request.toMap());
    return storeQuoteFromMap(data) ?? (throw _badResponse);
  }

  @override
  Future<StoreCreatedOrder> createOrder(
    StoreCheckoutRequest request, {
    required int expectedTotalCents,
    String? cpf,
  }) async {
    final data = await _call('createStoreOrder', {
      ...request.toMap(),
      'expectedTotalCents': expectedTotalCents,
      'cpf': cpf,
    });
    return storeCreatedOrderFromMap(data) ?? (throw _badResponse);
  }

  Future<Object?> _call(String name, Map<String, Object?> input) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(input);
      return result.data;
    } on FirebaseFunctionsException catch (e) {
      throw storeCheckoutErrorOf(
        code: e.code,
        message: e.message,
        details: e.details,
      );
    } on StoreCheckoutException {
      rethrow;
    } catch (_) {
      // Sem rede ou resposta inesperada: a mensagem genérica.
      throw storeCheckoutErrorOf(code: 'unknown');
    }
  }
}

final storeCheckoutServiceProvider = Provider<StoreCheckoutService>((ref) {
  return FirebaseStoreCheckoutService();
});

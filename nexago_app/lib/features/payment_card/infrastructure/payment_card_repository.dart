import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/saved_payment_card.dart';

/// Falha das callables do cartão: o `toString` é só a frase, para o
/// `friendlyErrorMessage` mostrar como veio. Nunca carrega dado do cartão.
class PaymentCardException implements Exception {
  PaymentCardException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// Cartão salvo do atleta (callables; o app nunca guarda o número).
class PaymentCardRepository {
  PaymentCardRepository({FirebaseFunctions? functions})
      : _functionsOverride = functions;

  final FirebaseFunctions? _functionsOverride;

  FirebaseFunctions get _functions => _functionsOverride ?? nexagoFunctions;

  Future<Object?> _call(
    String name,
    Map<String, Object?> payload, {
    required String fallback,
  }) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(
            payload,
          );
      return result.data;
    } on FirebaseFunctionsException catch (e) {
      throw PaymentCardException(
        callableErrorMessage(e.code, e.message, fallback),
        code: e.code,
      );
    }
  }

  Map<String, dynamic> _map(Object? data) => data is Map
      ? {for (final e in data.entries) e.key.toString(): e.value}
      : <String, dynamic>{};

  /// Salva o cartão. [cpfCnpj] só quando o servidor pediu (só dígitos).
  Future<SavedPaymentCard> save(
    PaymentCardInput input, {
    String? cpfCnpj,
  }) async {
    final data = _map(await _call(
      'saveMyPaymentCard',
      {
        ...input.toMap(),
        if (cpfCnpj != null && cpfCnpj.isNotEmpty) 'cpfCnpj': cpfCnpj,
      },
      fallback: 'Não foi possível salvar o cartão.',
    ));
    return SavedPaymentCard(
      brand: (data['brand'] ?? '').toString(),
      last4: (data['last4'] ?? '').toString(),
      expiryMonth: input.expiryMonth,
      expiryYear: input.expiryYear,
    );
  }

  Future<SavedPaymentCard?> mine() async {
    final data = await _call(
      'getMyPaymentCard',
      const {},
      fallback: 'Não foi possível carregar o cartão.',
    );
    if (data == null) return null;
    return SavedPaymentCard.fromMap(_map(data));
  }

  /// Remove o cartão; devolve quantos planos tiveram o débito desligado.
  Future<int> remove() async {
    final data = _map(await _call(
      'removeMyPaymentCard',
      const {},
      fallback: 'Não foi possível remover o cartão.',
    ));
    final plans = data['plans'];
    return plans is num ? plans.toInt() : 0;
  }
}

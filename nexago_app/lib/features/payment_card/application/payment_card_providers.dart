import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../domain/saved_payment_card.dart';
import '../infrastructure/payment_card_repository.dart';

final paymentCardRepositoryProvider = Provider<PaymentCardRepository>(
  (ref) => PaymentCardRepository(),
);

/// Cartão salvo do atleta (`null` = sem cartão).
final myPaymentCardProvider =
    FutureProvider.autoDispose<SavedPaymentCard?>((ref) {
  return ref.watch(paymentCardRepositoryProvider).mine();
});

/// Flag `appConfig/payments.scheduleCardAutopay`. Consumir com
/// `.valueOrNull ?? false`: carregando ou com erro = desligado.
final scheduleCardAutopayEnabledProvider = StreamProvider<bool>((ref) {
  return ref
      .watch(firestoreProvider)
      .doc('appConfig/payments')
      .snapshots()
      .map((doc) => doc.data()?['scheduleCardAutopay'] == true);
});

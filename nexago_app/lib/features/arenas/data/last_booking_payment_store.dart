import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/auth/auth_providers.dart';
import '../domain/booking_payment_method.dart';

/// Última forma de pagamento de reserva, por atleta, neste aparelho.
///
/// É conveniência: se o armazenamento falhar, a tela abre com o padrão de
/// sempre e nada quebra. Por isso todo erro vira `null`/no-op.
class LastBookingPaymentStore {
  LastBookingPaymentStore({Future<SharedPreferences> Function()? prefs})
      : _prefs = prefs ?? SharedPreferences.getInstance;

  final Future<SharedPreferences> Function() _prefs;

  static String _key(String uid) => 'booking_last_payment_$uid';

  Future<BookingPaymentMethod?> load(String uid) async {
    if (uid.isEmpty) return null;
    try {
      final prefs = await _prefs();
      return BookingPaymentMethod.fromStorage(prefs.getString(_key(uid)));
    } on PlatformException {
      return null;
    } on MissingPluginException {
      return null;
    }
  }

  Future<void> save(String uid, BookingPaymentMethod method) async {
    if (uid.isEmpty) return;
    try {
      final prefs = await _prefs();
      await prefs.setString(_key(uid), method.storageValue);
    } on PlatformException {
      // Canal indisponível (hot restart): fica só o padrão.
    } on MissingPluginException {
      // Sem plugin (testes): fica só o padrão.
    }
  }
}

final lastBookingPaymentStoreProvider =
    Provider<LastBookingPaymentStore>((ref) => LastBookingPaymentStore());

/// Forma lembrada do atleta logado; `null` sem login, sem histórico ou
/// enquanto lê.
final lastBookingPaymentProvider =
    FutureProvider.autoDispose<BookingPaymentMethod?>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  return ref.watch(lastBookingPaymentStoreProvider).load(uid);
});

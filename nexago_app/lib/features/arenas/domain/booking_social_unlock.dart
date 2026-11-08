import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/formatting/app_currency_format.dart';
import 'booking_providers.dart';

/// Regra do dono: metade da reserva paga pelo app libera placar, story e arte
/// do resultado. A mesma de `functions/src/booking-app-payment.ts`.
const double socialUnlockMinAppPaidShare = 0.5;

const double _toleranceReais = 0.02;

const Set<String> _notLiveStatuses = {
  'canceled',
  'cancelled',
  'pending',
  'processing',
  'pending_payment',
  'expired',
  'rejected',
};

/// Placar, story e arte do resultado de uma reserva: liberados ou não, e
/// quanto falta. Vem do doc da reserva, que o servidor atualiza sozinho quando
/// o Pix/cartão confirma, uma fatia é paga, a reserva é cancelada ou estornada.
@immutable
class BookingSocialUnlock {
  const BookingSocialUnlock({
    required this.unlocked,
    required this.appPaidReais,
    required this.totalReais,
  });

  /// Sem reserva (story avulso) ou doc inexistente: nada pago pelo app.
  static const none =
      BookingSocialUnlock(unlocked: false, appPaidReais: 0, totalReais: 0);

  final bool unlocked;
  final double appPaidReais;
  final double totalReais;

  /// Quanto ainda faltaria pagar pelo app para chegar à metade.
  double get missingReais {
    final missing = totalReais * socialUnlockMinAppPaidShare - appPaidReais;
    return missing > 0 ? (missing * 100).roundToDouble() / 100 : 0;
  }

  /// Lê os derivados gravados pelo servidor (`socialUnlocked`, `appPaidReais`).
  /// Reserva de antes do gatilho (sem os campos) cai na mesma conta feita com
  /// o pago online, o crédito de chuva e os estornos do próprio doc. Quem
  /// decide de verdade é a callable do placar.
  factory BookingSocialUnlock.fromBooking(Map<String, dynamic>? data) {
    if (data == null) return none;
    final total = _num(data['amountReais']);
    if (data['socialUnlocked'] is bool) {
      return BookingSocialUnlock(
        unlocked: data['socialUnlocked'] as bool,
        appPaidReais: _num(data['appPaidReais']),
        totalReais: total,
      );
    }
    final status = '${data['status'] ?? ''}'.trim().toLowerCase();
    var paid = 0.0;
    if (!_notLiveStatuses.contains(status)) {
      paid = _num(data['amountPaidOnlineReais']) +
          _num(data['weatherCreditReais']) -
          _reversed(data['appPaymentReversals']);
      if (paid < 0) paid = 0;
    }
    return BookingSocialUnlock(
      unlocked: total > 0 &&
          paid > 0 &&
          paid + _toleranceReais >= total * socialUnlockMinAppPaidShare,
      appPaidReais: (paid * 100).roundToDouble() / 100,
      totalReais: total,
    );
  }

  static double _num(Object? v) {
    final n = v is num ? v.toDouble() : double.tryParse('${v ?? ''}');
    return n == null || !n.isFinite || n < 0 ? 0 : n;
  }

  static double _reversed(Object? raw) {
    if (raw is! Map) return 0;
    var total = 0.0;
    for (final entry in raw.values) {
      if (entry is Map) total += _num(entry['amountReais']);
    }
    return total;
  }
}

/// Texto do estado bloqueado: o dono sabe o que fazer; o convidado sabe de
/// quem depende.
String bookingSocialLockedMessage(
  BookingSocialUnlock unlock, {
  required bool isOwner,
}) {
  final head = isOwner
      ? 'Pague pelo app pelo menos metade da reserva (Pix ou cartão) para '
          'registrar o placar, postar o resultado no story e gerar as artes '
          'da partida.'
      : 'O placar, o story e as artes do resultado liberam quando quem '
          'reservou paga pelo menos metade da reserva pelo app.';
  if (unlock.totalReais <= 0) return head;
  final paid = formatBRL(unlock.appPaidReais);
  final total = formatBRL(unlock.totalReais);
  return '$head Desta reserva, $paid de $total foram pagos pelo app.';
}

/// Liberação ao vivo da reserva: muda sozinha quando o pagamento confirma.
/// `null` enquanto o doc carrega; [BookingSocialUnlock.none] sem reserva.
final bookingSocialUnlockProvider =
    Provider.autoDispose.family<BookingSocialUnlock?, String>((ref, bookingId) {
  if (bookingId.trim().isEmpty) return BookingSocialUnlock.none;
  final async = ref.watch(arenaBookingDocProvider(bookingId));
  if (async.hasError) return BookingSocialUnlock.none;
  final snap = async.valueOrNull;
  if (snap == null) return null;
  return BookingSocialUnlock.fromBooking(snap.data());
});

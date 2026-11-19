import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../domain/booking_split.dart';

/// Resposta inesperada da callable (sem `shareIds`). Os erros de regra de
/// negócio — CPF faltando, soma errada, reserva que já não espera pagamento —
/// chegam como `FirebaseFunctionsException` com a frase pronta do servidor, e
/// a tela os passa por `friendlyErrorMessage`.
class BookingSplitException implements Exception {
  const BookingSplitException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// "Dividir com os jogadores": a callable `splitArenaBookingPayment` e o
/// status ao vivo de cada fatia.
class BookingSplitRepository {
  BookingSplitRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const String _callableSplit = 'splitArenaBookingPayment';

  /// Gera o Pix de cada pessoa da reserva `pending_payment` (só o dono
  /// chama). O servidor confere tudo de novo — dono, canal, status, soma e
  /// prazo — e, dando certo, a reserva já fica confirmada.
  Future<List<String>> split({
    required String bookingId,
    required List<({String athleteId, double amountReais})> shares,
  }) async {
    final id = bookingId.trim();
    if (id.isEmpty) {
      throw const BookingSplitException('Reserva inválida.');
    }
    if (shares.isEmpty || shares.length > kBookingSplitMaxShares) {
      throw const BookingSplitException(
        'A divisão aceita de 1 a $kBookingSplitMaxShares pessoas.',
      );
    }
    final raw = await _functions.httpsCallable(_callableSplit).call(
      <String, dynamic>{
        'bookingId': id,
        'shares': [
          for (final s in shares)
            {'athleteId': s.athleteId, 'amountReais': s.amountReais},
        ],
      },
    );
    final data = raw.data;
    final shareIds = data is Map ? data['shareIds'] : null;
    if (shareIds is! List) {
      throw const BookingSplitException(
        'O servidor não confirmou a divisão. Confira a reserva antes de tentar de novo.',
      );
    }
    return List.unmodifiable(shareIds.whereType<String>());
  }

  /// Fatias da reserva, na ordem em que foram criadas. As rules só deixam o
  /// dono da reserva e o pagador de cada fatia lerem.
  Stream<List<BookingPaymentShare>> watchShares(String bookingId) {
    final id = bookingId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection('arenaBookings')
        .doc(id)
        .collection('paymentShares')
        .orderBy('createdAt')
        .snapshots()
        .map(
          (snap) => List.unmodifiable([
            for (final doc in snap.docs)
              BookingPaymentShare.fromMap(doc.id, _withDates(doc.data())),
          ]),
        );
  }
}

/// `Timestamp` → `DateTime`, para o domínio não depender do Firestore.
Map<String, dynamic> _withDates(Map<String, dynamic> data) => {
      for (final e in data.entries)
        e.key: e.value is Timestamp ? (e.value as Timestamp).toDate() : e.value,
    };

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart';
import '../domain/booking_result.dart';
import '../domain/booking_result_record.dart';
import '../domain/booking_result_repository.dart';

class FirebaseBookingResultRepository implements BookingResultRepository {
  FirebaseBookingResultRepository(this._firestore,
      {FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const String collection = 'bookingResults';

  /// Um atleta com mais placares que isso perde os mais antigos da lista (sem
  /// `orderBy`: a query com `array-contains` não pede índice composto).
  static const int _limit = 200;

  @override
  Stream<List<SavedBookingResult>> watchMine(String uid) {
    if (uid.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(collection)
        .where('playerUids', arrayContains: uid)
        .limit(_limit)
        .snapshots()
        .map((snap) => [
              for (final doc in snap.docs)
                if (SavedBookingResult.fromDoc(doc) case final saved?) saved,
            ]);
  }

  @override
  Future<void> save(String bookingId, BookingResult result) => _call(
      'saveBookingResult',
      bookingResultPayload(bookingId, result),
      'Não foi possível salvar o placar. Tente de novo.');

  @override
  Future<void> respond(
    String bookingId, {
    required bool confirm,
    required int version,
  }) =>
      _call(
        'respondBookingResult',
        {
          'bookingId': bookingId,
          'response': confirm ? 'confirm' : 'dispute',
          'version': version,
        },
        'Não foi possível enviar sua resposta. Tente de novo.',
      );

  Future<void> _call(
      String name, Map<String, Object?> data, String fallback) async {
    try {
      await _functions.httpsCallable(name).call<Object?>(data);
    } on FirebaseFunctionsException catch (e) {
      throw BookingResultException(
          callableErrorMessage(e.code, e.message, fallback));
    } catch (_) {
      throw BookingResultException(fallback);
    }
  }
}

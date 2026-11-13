import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/booking_reschedule.dart';

/// Resposta de `rescheduleArenaBooking`.
class BookingRescheduleResult {
  const BookingRescheduleResult({
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.courtName,
    required this.courtChanged,
    required this.tablePriceDiffReais,
  });

  final String date;
  final String startTime;
  final String endTime;
  final String courtName;
  final bool courtChanged;

  /// Tabela do horário novo menos a do antigo (a reserva manteve o valor).
  final double tablePriceDiffReais;

  factory BookingRescheduleResult.fromMap(Map<String, dynamic> data) =>
      BookingRescheduleResult(
        date: (data['date'] as String?) ?? '',
        startTime: (data['startTime'] as String?) ?? '',
        endTime: (data['endTime'] as String?) ?? '',
        courtName: (data['courtName'] as String?) ?? 'Quadra',
        courtChanged: data['courtChanged'] == true,
        tablePriceDiffReais:
            (data['tablePriceDiffReais'] as num?)?.toDouble() ?? 0,
      );
}

class BookingRescheduleException implements Exception {
  const BookingRescheduleException(this.message, {this.slotTaken = false});

  final String message;

  /// O horário foi pego por outra reserva: recarregar a grade.
  final bool slotTaken;

  @override
  String toString() => message;
}

class BookingRescheduleService {
  BookingRescheduleService({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  Future<BookingRescheduleResult> reschedule({
    required String bookingId,
    required DateTime day,
    required String startTime,
    required BookingRescheduleActor actor,
    String? courtId,
    String? reason,
  }) async {
    try {
      final result =
          await _functions.httpsCallable('rescheduleArenaBooking').call(
        <String, dynamic>{
          'bookingId': bookingId,
          'date': bookingRescheduleDateKey(day),
          'startTime': startTime,
          'as': actor == BookingRescheduleActor.arena ? 'arena' : 'athlete',
          if (courtId != null) 'courtId': courtId,
          if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
        },
      );
      return BookingRescheduleResult.fromMap(
        Map<String, dynamic>.from(result.data as Map),
      );
    } on FirebaseFunctionsException catch (e) {
      throw BookingRescheduleException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível remarcar. Tente de novo.',
        ),
        slotTaken: e.code == 'already-exists' || e.code == 'resource-exhausted',
      );
    }
  }
}

final bookingRescheduleServiceProvider =
    Provider<BookingRescheduleService>((ref) => BookingRescheduleService());

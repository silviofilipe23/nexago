import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../domain/arena_manual_booking.dart';

/// Reserva de balcão criada pelo gestor no detalhe do horário (atleta
/// cadastrado ou nome do cliente). Mesmas callables do modal do portal da
/// arena: `quoteArenaManualBooking` (preço sugerido + banco de horas do
/// mensalista) e `createArenaManualBooking` (reserva + slot + locks numa
/// transação, recusa horário bloqueado/ocupado).
class ArenaManualBookingService {
  ArenaManualBookingService({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  /// Preço sugerido (quadra + promoções ativas). Com [athleteId], traz também
  /// o banco de horas dele quando é mensalista.
  Future<ArenaManualBookingQuote> quote({
    required String arenaId,
    required String courtId,
    required String dateKey,
    required String startTime,
    required String endTime,
    String? athleteId,
  }) async {
    final athlete = athleteId?.trim();
    final result =
        await _functions.httpsCallable('quoteArenaManualBooking').call({
      'arenaId': arenaId,
      'courtId': courtId,
      'date': dateKey,
      'startTime': startTime,
      'endTime': endTime,
      if (athlete != null && athlete.isNotEmpty) 'athleteId': athlete,
    });
    return ArenaManualBookingQuote.fromData(result.data);
  }

  /// Cria a reserva e devolve o id. Precisa de [athleteId] ou [customerName].
  /// [useMemberHours] só vale com atleta: o servidor desconta do banco da
  /// semana e cobra só o que sobrar de [amountReais] (preço do horário inteiro).
  ///
  /// Recusas do servidor (horário bloqueado, ocupado, data passada) sobem como
  /// `FirebaseFunctionsException` com a mensagem em português — a tela mostra
  /// via `friendlyErrorMessage`.
  Future<String> create({
    required String arenaId,
    required String courtId,
    required String dateKey,
    required String startTime,
    required String endTime,
    required double amountReais,
    String? athleteId,
    String? customerName,
    bool useMemberHours = false,
    String? note,
  }) async {
    final athlete = athleteId?.trim();
    final hasAthlete = athlete != null && athlete.isNotEmpty;
    final name = customerName?.trim();
    final trimmedNote = note?.trim();
    final result =
        await _functions.httpsCallable('createArenaManualBooking').call({
      'arenaId': arenaId,
      'courtId': courtId,
      'date': dateKey,
      'startTime': startTime,
      'endTime': endTime,
      'amountReais': amountReais,
      if (hasAthlete) 'athleteId': athlete,
      if (name != null && name.isNotEmpty) 'customerName': name,
      if (hasAthlete && useMemberHours) 'useMemberHours': true,
      if (trimmedNote != null && trimmedNote.isNotEmpty) 'note': trimmedNote,
    });
    final data = result.data;
    final id = data is Map ? data['bookingId'] : null;
    if (id is! String || id.trim().isEmpty) {
      throw StateError('Resposta inválida do servidor.');
    }
    return id;
  }
}

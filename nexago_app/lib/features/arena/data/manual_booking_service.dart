import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';

/// Reserva de balcão criada pelo gestor no detalhe do horário (walk-in ou
/// nome do cliente). Mesmas callables do modal do portal da arena:
/// `quoteArenaManualBooking` (preço sugerido) e `createArenaManualBooking`
/// (reserva + slot + locks numa transação, recusa horário bloqueado/ocupado).
class ArenaManualBookingService {
  ArenaManualBookingService({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  /// Preço sugerido (quadra + promoções ativas). `null` quando o servidor não
  /// devolve valor — o gestor digita.
  Future<double?> quote({
    required String arenaId,
    required String courtId,
    required String dateKey,
    required String startTime,
    required String endTime,
  }) async {
    final result = await _functions.httpsCallable('quoteArenaManualBooking').call({
      'arenaId': arenaId,
      'courtId': courtId,
      'date': dateKey,
      'startTime': startTime,
      'endTime': endTime,
    });
    final data = result.data;
    if (data is! Map) return null;
    final amount = data['amountReais'];
    return amount is num ? amount.toDouble() : null;
  }

  /// Cria a reserva e devolve o id. Recusas do servidor (horário bloqueado,
  /// ocupado, data passada) sobem como `FirebaseFunctionsException` com a
  /// mensagem em português — a tela mostra via `friendlyErrorMessage`.
  Future<String> create({
    required String arenaId,
    required String courtId,
    required String dateKey,
    required String startTime,
    required String endTime,
    required String customerName,
    required double amountReais,
    String? note,
  }) async {
    final trimmedNote = note?.trim();
    final result =
        await _functions.httpsCallable('createArenaManualBooking').call({
      'arenaId': arenaId,
      'courtId': courtId,
      'date': dateKey,
      'startTime': startTime,
      'endTime': endTime,
      'customerName': customerName.trim(),
      'amountReais': amountReais,
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

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../domain/arena_booking_waitlist_entry.dart';

/// Lista de espera de horário de quadra lotado (`arenaBookingWaitlist`).
///
/// Domínio distinto da lista de espera de INSCRIÇÃO em torneio
/// (`organizerMoveToWaitlist`) — esta é sobre reserva de quadra em arena.
/// Escrita só via Cloud Function (`joinArenaBookingWaitlist`); o client só lê.
class WaitlistRepository {
  WaitlistRepository(
    this._firestore, {
    FirebaseFunctions? functions,
  }) : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const String collection = 'arenaBookingWaitlist';
  static const int _myWaitlistLimit = 64;

  /// Entra na fila para um horário lotado. O servidor reconsulta o horário
  /// (`arenaSlotLocks`) e rejeita se ainda houver vaga disponível.
  Future<String> join({
    required String arenaId,
    required String courtId,
    required String dateKey,
    required String startTime,
    required String endTime,
    String? arenaName,
    String? courtName,
  }) async {
    try {
      final result = await _functions.httpsCallable('joinArenaBookingWaitlist').call(
        <String, dynamic>{
          'arenaId': arenaId,
          'courtId': courtId,
          'date': dateKey,
          'startTime': startTime,
          'endTime': endTime,
          if (arenaName != null && arenaName.trim().isNotEmpty) 'arenaName': arenaName,
          if (courtName != null && courtName.trim().isNotEmpty) 'courtName': courtName,
        },
      );
      final data = result.data;
      final waitlistId = data is Map ? data['waitlistId'] as String? : null;
      if (waitlistId == null || waitlistId.isEmpty) {
        throw WaitlistException('Resposta inválida do servidor.');
      }
      return waitlistId;
    } on FirebaseFunctionsException catch (e) {
      throw WaitlistException(_mapFunctionsMessage(e), code: _functionsCode(e));
    } catch (e) {
      if (e is WaitlistException) rethrow;
      throw WaitlistException('Não foi possível entrar na lista de espera: $e');
    }
  }

  /// Entradas ativas e históricas do próprio atleta, mais recentes primeiro.
  Stream<List<ArenaBookingWaitlistEntry>> watchMyWaitlist(String athleteId) {
    final uid = athleteId.trim();
    if (uid.isEmpty) {
      return Stream<List<ArenaBookingWaitlistEntry>>.value(const []);
    }
    return _firestore
        .collection(collection)
        .where('athleteId', isEqualTo: uid)
        .limit(_myWaitlistLimit)
        .snapshots()
        .map((snapshot) {
      final items =
          snapshot.docs.map(ArenaBookingWaitlistEntry.fromFirestore).toList();
      items.sort((a, b) {
        final am = a.createdAt?.millisecondsSinceEpoch ?? 0;
        final bm = b.createdAt?.millisecondsSinceEpoch ?? 0;
        return bm.compareTo(am);
      });
      return items;
    });
  }

  static String? _functionsCode(FirebaseFunctionsException e) {
    switch (e.code) {
      case 'failed-precondition':
        return WaitlistRepository.slotNotFullCode;
      default:
        return null;
    }
  }

  static const String slotNotFullCode = 'SLOT_NOT_FULL';

  static String _mapFunctionsMessage(FirebaseFunctionsException e) {
    final detail = e.message;
    switch (e.code) {
      case 'unauthenticated':
        return 'Faça login para entrar na lista de espera.';
      case 'invalid-argument':
        return detail ?? 'Dados do horário inválidos.';
      case 'failed-precondition':
        return detail ?? 'Esse horário ainda tem vaga disponível.';
      default:
        return detail ?? 'Não foi possível entrar na lista de espera (${e.code}).';
    }
  }
}

class WaitlistException implements Exception {
  WaitlistException(this.message, {this.code});

  final String message;
  final String? code;

  bool get isSlotNotFull => code == WaitlistRepository.slotNotFullCode;

  @override
  String toString() => message;
}

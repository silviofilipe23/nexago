import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'dart:async';

import '../../arena/domain/arena_manager_booking.dart';
import '../domain/arena_booking_confirm_args.dart';
import '../domain/arena_booking_quote.dart';
import '../domain/my_booking_item.dart';

/// Paridade com o fluxo web: transação em `arenaSlotLocks` + `arenaSlots` + `arenaBookings`,
/// depois [notifyArenaBookingCreated] (notificação ao gestor; não duplica gravação).
///
/// Leituras em tempo real usam [FirebaseFirestore.snapshots] em [arenaBookings] para a UI
/// (minhas reservas e painel do gestor).
class BookingService {
  BookingService(
    this._firestore, {
    FirebaseFunctions? functions,
  }) : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const String arenaBookingsCollection = 'arenaBookings';
  static const String arenaSlotsCollection = 'arenaSlots';
  static const String arenaSlotLocksCollection = 'arenaSlotLocks';
  static const String arenaBlocksCollection = 'arena_blocks';

  static const String slotConflictCode = 'SLOT_CONFLICT';
  static const String blockedAthleteCode = 'BLOCKED_ATHLETE';

  static const int _myBookingsLimit = 64;
  static const int _arenaBookingsLimit = 256;

  /// Reservas do atleta em [arenaBookings] (atualização em tempo real).
  Stream<List<MyBookingItem>> watchMyBookings(String athleteId) {
    if (athleteId.isEmpty) {
      return Stream<List<MyBookingItem>>.value(const []);
    }
    final byAthleteId = _watchMyBookingsByField('athleteId', athleteId);
    final byBookingAthleteId =
        _watchMyBookingsByField('bookingAthleteId', athleteId);

    return Stream<List<MyBookingItem>>.multi((controller) {
      List<MyBookingItem> latestA = const [];
      List<MyBookingItem> latestB = const [];

      void emitMerged() {
        final byId = <String, MyBookingItem>{};
        for (final item in latestA) {
          byId[item.id] = item;
        }
        for (final item in latestB) {
          byId[item.id] = item;
        }
        final merged = byId.values.toList()
          ..sort((a, b) => b.sortMillis.compareTo(a.sortMillis));
        controller.add(merged);
      }

      final subA = byAthleteId.listen(
        (items) {
          latestA = items;
          emitMerged();
        },
        onError: controller.addError,
      );

      final subB = byBookingAthleteId.listen(
        (items) {
          latestB = items;
          emitMerged();
        },
        onError: controller.addError,
      );

      controller.onCancel = () async {
        await subA.cancel();
        await subB.cancel();
      };
    });
  }

  Stream<List<MyBookingItem>> _watchMyBookingsByField(
      String field, String athleteId) {
    return _firestore
        .collection(arenaBookingsCollection)
        .where(field, isEqualTo: athleteId)
        .limit(_myBookingsLimit)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map(MyBookingItem.fromFirestore).toList());
  }

  /// Todas as reservas da arena (gestor); filtro por dia fica na UI.
  Stream<List<ArenaManagerBooking>> watchBookingsForArena(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) {
      return Stream<List<ArenaManagerBooking>>.value(const []);
    }
    return _firestore
        .collection(arenaBookingsCollection)
        .where('arenaId', isEqualTo: id)
        .limit(_arenaBookingsLimit)
        .snapshots()
        .map((snapshot) {
      final list =
          snapshot.docs.map(ArenaManagerBooking.fromFirestore).toList();
      list.sort((a, b) {
        final byDate = b.dateKey.compareTo(a.dateKey);
        if (byDate != 0) return byDate;
        return b.startTime.compareTo(a.startTime);
      });
      return list;
    });
  }

  /// Cota autoritativa (promoções + preço por quadra) via Cloud Function.
  Future<ArenaBookingQuote> quoteBooking({
    required ArenaBookingConfirmArgs args,
  }) async {
    if (!args.isValid) {
      throw BookingException(
          'Dados da reserva inválidos. Volte e escolha outro horário.');
    }
    try {
      final result = await _functions.httpsCallable('quoteArenaBooking').call(
        _bookingCallablePayload(args),
      );
      return _parseQuoteResponse(result.data);
    } on FirebaseFunctionsException catch (e) {
      throw BookingException(_mapFunctionsMessage(e), code: _functionsCode(e));
    }
  }

  Future<double> quoteBookingAmount({
    required ArenaBookingConfirmArgs args,
  }) async {
    final quote = await quoteBooking(args: args);
    return quote.amountReais;
  }

  static ArenaBookingQuote _parseQuoteResponse(Object? data) {
    if (data is! Map) {
      throw BookingException('Resposta inválida do servidor.');
    }
    final map = Map<String, dynamic>.from(data);
    final amount = (map['amountReais'] as num?)?.toDouble();
    if (amount == null || amount <= 0) {
      throw BookingException(
        'Configure o preço da quadra antes de reservar.',
      );
    }
    final linesRaw = map['lineItems'];
    final lines = <ArenaBookingQuoteLine>[];
    if (linesRaw is List) {
      for (final item in linesRaw) {
        if (item is! Map) continue;
        final row = Map<String, dynamic>.from(item);
        final start = row['startTime'] as String? ?? '';
        final end = row['endTime'] as String? ?? '';
        final finalP = (row['finalSlotPriceReais'] as num?)?.toDouble();
        final baseP = (row['baseSlotPriceReais'] as num?)?.toDouble();
        if (start.isEmpty || finalP == null) continue;
        lines.add(
          ArenaBookingQuoteLine(
            startTime: start.length >= 5 ? start.substring(0, 5) : start,
            endTime: end.length >= 5 ? end.substring(0, 5) : end,
            finalSlotPriceReais: finalP,
            baseSlotPriceReais: baseP ?? finalP,
          ),
        );
      }
    }
    return ArenaBookingQuote(amountReais: amount, lineItems: lines);
  }

  /// Reserva via callable `createArenaBooking` (preço validado no servidor).
  Future<CreateBookingResult> createBookingAtomically({
    required ArenaBookingConfirmArgs args,
    required String athleteId,
    String paymentMode = 'onsite',
    double paymentFraction = 1.0,
  }) async {
    if (athleteId.isEmpty) {
      throw BookingException('Faça login para confirmar a reserva.');
    }
    if (!args.isValid) {
      throw BookingException(
          'Dados da reserva inválidos. Volte e escolha outro horário.');
    }

    if (paymentMode == 'pix' &&
        paymentFraction != 0.5 &&
        paymentFraction != 1.0) {
      throw BookingException('Escolha pagar 50% ou 100% via PIX.');
    }

    try {
      final payload = _bookingCallablePayload(args);
      payload['clientAmountReais'] = args.amountReais;
      payload['paymentMode'] = paymentMode;
      if (paymentMode == 'pix') {
        payload['paymentFraction'] = paymentFraction;
      }

      final result =
          await _functions.httpsCallable('createArenaBooking').call(payload);
      final data = result.data;
      if (data is! Map) {
        throw BookingException('Resposta inválida do servidor.');
      }
      final bookingId = (data['bookingId'] as String?)?.trim();
      final amount = (data['amountReais'] as num?)?.toDouble();
      if (bookingId == null || bookingId.isEmpty || amount == null) {
        throw BookingException('Resposta inválida do servidor.');
      }

      if (paymentMode == 'onsite') {
        await _notifyArenaBookingCreatedSafe(bookingId);
      }

      return CreateBookingResult(
        bookingId: bookingId,
        amountReais: amount,
        amountToPayNowReais:
            (data['amountToPayNowReais'] as num?)?.toDouble() ?? 0,
        amountDueOnsiteReais:
            (data['amountDueOnsiteReais'] as num?)?.toDouble() ?? amount,
        paymentMode: (data['paymentMode'] as String?) ?? paymentMode,
        paymentFraction:
            (data['paymentFraction'] as num?)?.toDouble() ?? paymentFraction,
        paymentExpiresAt: data['paymentExpiresAt'] as String?,
      );
    } on FirebaseFunctionsException catch (e) {
      throw BookingException(_mapFunctionsMessage(e), code: _functionsCode(e));
    } catch (e) {
      if (e is BookingException) rethrow;
      throw BookingException('Não foi possível concluir a reserva: $e');
    }
  }

  static Map<String, dynamic> _bookingCallablePayload(
    ArenaBookingConfirmArgs args,
  ) {
    return <String, dynamic>{
      'arenaId': args.arenaId,
      'arenaName': args.arenaName,
      'courtId': args.courtId,
      'courtName': args.courtName,
      'date': args.dateKey,
      'startTime': args.startTime,
      'endTime': args.endTime,
      if (args.selectedSlotStartTimes.isNotEmpty)
        'selectedSlotStartTimes': args.selectedSlotStartTimes,
    };
  }

  static String? _functionsCode(FirebaseFunctionsException e) {
    switch (e.code) {
      case 'already-exists':
        return slotConflictCode;
      case 'permission-denied':
        final msg = e.message ?? '';
        if (msg.contains('bloqueada')) return blockedAthleteCode;
        return null;
      default:
        return null;
    }
  }

  static String _mapFunctionsMessage(FirebaseFunctionsException e) {
    final detail = e.message;
    switch (e.code) {
      case 'unauthenticated':
        return 'Faça login para confirmar a reserva.';
      case 'permission-denied':
        return detail ?? 'Sem permissão para concluir a reserva.';
      case 'not-found':
        return detail ?? 'Arena ou quadra não encontrada.';
      case 'invalid-argument':
        return detail ?? 'Dados da reserva inválidos.';
      case 'failed-precondition':
        return detail ?? 'Não foi possível reservar este horário.';
      case 'already-exists':
        return 'Esse horário acabou de ser reservado. Escolha outro.';
      case 'internal':
        return detail ?? 'Erro no servidor. Tente novamente.';
      default:
        return detail ?? 'Não foi possível concluir a reserva (${e.code}).';
    }
  }

  Future<void> _notifyArenaBookingCreatedSafe(String bookingId) async {
    try {
      await _functions
          .httpsCallable('notifyArenaBookingCreated')
          .call(<String, dynamic>{'bookingId': bookingId});
    } catch (_) {
      // Não falha a UI: a reserva já está gravada; o gestor pode não receber push imediato.
    }
  }

  /// Cancela uma reserva do atleta.
  Future<void> cancelBooking({
    required String bookingId,
    required String athleteId,
  }) async {
    final id = bookingId.trim();
    final uid = athleteId.trim();
    if (id.isEmpty || uid.isEmpty) {
      throw BookingException('Dados inválidos para cancelamento.');
    }

    final ref = _firestore.collection(arenaBookingsCollection).doc(id);
    final snap = await ref.get();
    if (!snap.exists) {
      throw BookingException('Reserva não encontrada.');
    }
    final data = snap.data() ?? <String, dynamic>{};
    final ownerId = (data['athleteId'] as String?)?.trim() ?? '';
    if (ownerId != uid) {
      throw BookingException('Você não pode cancelar esta reserva.');
    }

    await ref.update(<String, dynamic>{
      'status': 'canceled',
      'attendanceStatus': 'canceled',
      'canceledAt': FieldValue.serverTimestamp(),
    });
  }

  static const Duration _undoWindow = Duration(seconds: 60);

  /// Cancelamento pelo gestor da arena (valida [arenaId] do documento).
  Future<void> cancelBookingByArenaManager({
    required String bookingId,
    required String arenaId,
    String? cancelReason,
  }) async {
    final id = bookingId.trim();
    final aid = arenaId.trim();
    if (id.isEmpty || aid.isEmpty) {
      throw BookingException('Dados inválidos para cancelar.');
    }
    final docRef = _firestore.collection(arenaBookingsCollection).doc(id);
    final snap = await docRef.get();
    if (!snap.exists) {
      throw BookingException('Reserva não encontrada.');
    }
    final data = snap.data() ?? <String, dynamic>{};
    final bookingArena = (data['arenaId'] as String?)?.trim() ?? '';
    if (bookingArena != aid) {
      throw BookingException('Esta reserva não pertence à arena atual.');
    }
    final status = (data['status'] as String?)?.toLowerCase().trim() ?? '';
    if (status == 'cancelled' ||
        status == 'canceled' ||
        status == 'completed') {
      throw BookingException('Esta reserva não pode ser cancelada.');
    }
    final statusBefore = (data['status'] as String?)?.trim() ?? 'active';
    final attendanceBefore =
        (data['attendanceStatus'] as String?)?.trim() ?? 'pending';

    final payload = <String, dynamic>{
      'status': 'canceled',
      'attendanceStatus': 'canceled',
      'canceledAt': FieldValue.serverTimestamp(),
      'canceledByRole': 'arena_manager',
      'statusBeforeCancel': statusBefore,
      'attendanceStatusBeforeCancel': attendanceBefore,
    };
    final reason = cancelReason?.trim();
    if (reason != null && reason.isNotEmpty) {
      payload['cancelReason'] = reason;
    }
    await docRef.update(payload);
  }

  /// Restaura reserva cancelada pelo gestor (janela de 60s após cancelamento).
  Future<void> restoreBookingByArenaManager({
    required String bookingId,
    required String arenaId,
  }) async {
    final id = bookingId.trim();
    final aid = arenaId.trim();
    if (id.isEmpty || aid.isEmpty) {
      throw BookingException('Dados inválidos para restaurar.');
    }
    final docRef = _firestore.collection(arenaBookingsCollection).doc(id);
    final snap = await docRef.get();
    if (!snap.exists) {
      throw BookingException('Reserva não encontrada.');
    }
    final data = snap.data() ?? <String, dynamic>{};
    final bookingArena = (data['arenaId'] as String?)?.trim() ?? '';
    if (bookingArena != aid) {
      throw BookingException('Esta reserva não pertence à arena atual.');
    }
    final status = (data['status'] as String?)?.toLowerCase().trim() ?? '';
    if (status != 'canceled' && status != 'cancelled') {
      throw BookingException('Esta reserva não está cancelada.');
    }

    final canceledAt = data['canceledAt'];
    DateTime? canceledTime;
    if (canceledAt is Timestamp) {
      canceledTime = canceledAt.toDate();
    }
    if (canceledTime == null) {
      throw BookingException('Não é possível desfazer este cancelamento.');
    }
    if (DateTime.now().difference(canceledTime) > _undoWindow) {
      throw BookingException(
        'O prazo para desfazer o cancelamento expirou.',
      );
    }

    final statusBefore =
        (data['statusBeforeCancel'] as String?)?.trim() ?? 'active';
    final attendanceBefore =
        (data['attendanceStatusBeforeCancel'] as String?)?.trim() ?? 'pending';

    await docRef.update(<String, dynamic>{
      'status': statusBefore,
      'attendanceStatus': attendanceBefore,
      'canceledAt': FieldValue.delete(),
      'canceledByRole': FieldValue.delete(),
      'cancelReason': FieldValue.delete(),
      'statusBeforeCancel': FieldValue.delete(),
      'attendanceStatusBeforeCancel': FieldValue.delete(),
    });
  }

  Future<void> confirmAttendance({
    required String bookingId,
    required String athleteId,
  }) async {
    final id = bookingId.trim();
    final uid = athleteId.trim();
    if (id.isEmpty || uid.isEmpty) {
      throw BookingException('Dados inválidos para confirmar presença.');
    }
    final bookingRef = _firestore.collection(arenaBookingsCollection).doc(id);
    await _firestore.runTransaction((tx) async {
      final snap = await tx.get(bookingRef);
      if (!snap.exists) {
        throw BookingException('Reserva não encontrada.');
      }
      final data = snap.data() ?? <String, dynamic>{};
      final owner = ((data['athleteId'] ?? data['bookingAthleteId']) as String?)
              ?.trim() ??
          '';
      if (owner != uid) {
        throw BookingException('Apenas o dono da reserva pode confirmar.');
      }
      final alreadyConfirmed = data['attendanceConfirmed'] == true;
      if (alreadyConfirmed) {
        throw BookingException('Presença já confirmada.');
      }
      final status = (data['status'] as String?)?.trim().toLowerCase() ?? '';
      if (status == 'canceled' || status == 'cancelled') {
        throw BookingException('Reserva cancelada não pode ser confirmada.');
      }
      final dateRaw = data['date'];
      final startRaw = (data['startTime'] as String?)?.trim() ?? '';
      DateTime? startAt;
      if (dateRaw is String && dateRaw.length >= 10 && startRaw.length >= 4) {
        final date = DateTime.tryParse(dateRaw.substring(0, 10));
        final parts = startRaw.split(':');
        final hh = int.tryParse(parts[0]) ?? 0;
        final mm = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
        if (date != null) {
          startAt = DateTime(date.year, date.month, date.day, hh, mm);
        }
      } else if (dateRaw is Timestamp && startRaw.length >= 4) {
        final date = dateRaw.toDate();
        final parts = startRaw.split(':');
        final hh = int.tryParse(parts[0]) ?? 0;
        final mm = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
        startAt = DateTime(date.year, date.month, date.day, hh, mm);
      }
      if (startAt == null) {
        throw BookingException('Não foi possível validar horário da reserva.');
      }
      final now = DateTime.now();
      final windowStart = startAt.subtract(const Duration(hours: 2));
      if (now.isBefore(windowStart)) {
        throw BookingException(
            'A confirmação ficará disponível nas últimas 2 horas antes do jogo.');
      }
      if (now.isAfter(startAt)) {
        throw BookingException('A janela de confirmação já encerrou.');
      }

      final gamificationRef =
          _firestore.collection('users').doc(uid).collection('gamification').doc('summary');
      final badgesRef =
          _firestore.collection('users').doc(uid).collection('gamification_badges');
      final gamificationSnap = await tx.get(gamificationRef);
      final current = gamificationSnap.data() ?? <String, dynamic>{};
      final totalConfirmed =
          (current['attendanceConfirmationsTotal'] as num?)?.toInt() ?? 0;
      final streak = (current['attendanceConfirmationStreak'] as num?)?.toInt() ?? 0;
      final lastTs = current['lastAttendanceConfirmationAt'];
      DateTime? last;
      if (lastTs is Timestamp) last = lastTs.toDate();
      final nowDate = DateTime(now.year, now.month, now.day);
      final nextStreak = last == null
          ? 1
          : (DateTime(last.year, last.month, last.day)
                      .difference(nowDate)
                      .inDays
                      .abs() <=
                  1
              ? streak + 1
              : 1);
      final nextTotal = totalConfirmed + 1;

      tx.update(bookingRef, <String, dynamic>{
        'attendanceConfirmed': true,
        'attendanceStatus': 'confirmed',
        'attendanceConfirmedAt': FieldValue.serverTimestamp(),
      });

      tx.set(
        gamificationRef,
        <String, dynamic>{
          'attendanceConfirmationsTotal': nextTotal,
          'attendanceConfirmationStreak': nextStreak,
          'lastAttendanceConfirmationAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );

      if (nextStreak >= 5) {
        tx.set(
          badgesRef.doc('attendance_pontual'),
          <String, dynamic>{
            'id': 'attendance_pontual',
            'title': 'Pontual',
            'unlockedAt': FieldValue.serverTimestamp(),
          },
          SetOptions(merge: true),
        );
      }
      if (nextTotal >= 10) {
        tx.set(
          badgesRef.doc('attendance_comprometido'),
          <String, dynamic>{
            'id': 'attendance_comprometido',
            'title': 'Comprometido',
            'unlockedAt': FieldValue.serverTimestamp(),
          },
          SetOptions(merge: true),
        );
      }
    });
  }

  Future<void> checkIn({
    required String bookingId,
    required String athleteId,
    bool locationVerified = false,
  }) async {
    final id = bookingId.trim();
    final uid = athleteId.trim();
    if (id.isEmpty || uid.isEmpty) {
      throw BookingException('Dados inválidos para check-in.');
    }
    final bookingRef = _firestore.collection(arenaBookingsCollection).doc(id);
    await _firestore.runTransaction((tx) async {
      final snap = await tx.get(bookingRef);
      if (!snap.exists) {
        throw BookingException('Reserva não encontrada.');
      }
      final data = snap.data() ?? <String, dynamic>{};
      final owner = ((data['athleteId'] ?? data['bookingAthleteId']) as String?)
              ?.trim() ??
          '';
      if (owner != uid) {
        throw BookingException('Apenas o dono da reserva pode fazer check-in.');
      }
      final status = (data['status'] as String?)?.trim().toLowerCase() ?? '';
      if (status == 'canceled' || status == 'cancelled') {
        throw BookingException('Reserva cancelada não permite check-in.');
      }
      final attendanceStatus =
          (data['attendanceStatus'] as String?)?.trim().toLowerCase() ?? 'pending';
      if (attendanceStatus == 'checked_in') {
        throw BookingException('Check-in já realizado.');
      }
      if (attendanceStatus == 'no_show') {
        throw BookingException('Esta reserva já foi marcada como no-show.');
      }

      final dateRaw = data['date'];
      final startRaw = (data['startTime'] as String?)?.trim() ?? '';
      final endRaw = (data['endTime'] as String?)?.trim() ?? '';
      DateTime? startAt;
      DateTime? endAt;
      if (dateRaw is String && dateRaw.length >= 10) {
        final date = DateTime.tryParse(dateRaw.substring(0, 10));
        if (date != null) {
          final startParts = startRaw.split(':');
          final endParts = endRaw.split(':');
          final sh = int.tryParse(startParts[0]) ?? 0;
          final sm = startParts.length > 1 ? (int.tryParse(startParts[1]) ?? 0) : 0;
          final eh = int.tryParse(endParts[0]) ?? 0;
          final em = endParts.length > 1 ? (int.tryParse(endParts[1]) ?? 0) : 0;
          startAt = DateTime(date.year, date.month, date.day, sh, sm);
          endAt = DateTime(date.year, date.month, date.day, eh, em);
        }
      } else if (dateRaw is Timestamp) {
        final date = dateRaw.toDate();
        final startParts = startRaw.split(':');
        final endParts = endRaw.split(':');
        final sh = int.tryParse(startParts[0]) ?? 0;
        final sm = startParts.length > 1 ? (int.tryParse(startParts[1]) ?? 0) : 0;
        final eh = int.tryParse(endParts[0]) ?? 0;
        final em = endParts.length > 1 ? (int.tryParse(endParts[1]) ?? 0) : 0;
        startAt = DateTime(date.year, date.month, date.day, sh, sm);
        endAt = DateTime(date.year, date.month, date.day, eh, em);
      }
      if (startAt == null || endAt == null) {
        throw BookingException('Não foi possível validar a janela do check-in.');
      }
      if (!endAt.isAfter(startAt)) {
        endAt = endAt.add(const Duration(days: 1));
      }

      final now = DateTime.now();
      final checkInWindowStart = startAt.subtract(const Duration(minutes: 20));
      final checkInWindowEnd = endAt.add(const Duration(minutes: 15));
      if (now.isBefore(checkInWindowStart) || now.isAfter(checkInWindowEnd)) {
        throw BookingException(
          'Check-in disponível de 20 min antes até 15 min após o término do horário.',
        );
      }

      tx.update(bookingRef, <String, dynamic>{
        'attendanceStatus': 'checked_in',
        'checkedInAt': FieldValue.serverTimestamp(),
        'locationVerified': locationVerified,
      });
    });
  }

  /// Bloqueia um atleta para novas reservas na arena.
  Future<void> blockUser({
    required String arenaId,
    required String athleteId,
    required String reason,
  }) async {
    final aid = arenaId.trim();
    final uid = athleteId.trim();
    final why = reason.trim();
    if (aid.isEmpty || uid.isEmpty) {
      throw BookingException('Dados inválidos para bloqueio.');
    }
    if (why.isEmpty) {
      throw BookingException('Informe um motivo para o bloqueio.');
    }

    final docId = _arenaBlockDocId(aid, uid);
    await _firestore.collection(arenaBlocksCollection).doc(docId).set(
      <String, dynamic>{
        'arenaId': aid,
        'athleteId': uid,
        'reason': why,
        'createdAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  /// Remove o bloqueio de um atleta na arena.
  Future<void> unblockUser({
    required String arenaId,
    required String athleteId,
  }) async {
    final aid = arenaId.trim();
    final uid = athleteId.trim();
    if (aid.isEmpty || uid.isEmpty) {
      throw BookingException('Dados inválidos para desbloqueio.');
    }
    final docId = _arenaBlockDocId(aid, uid);
    await _firestore.collection(arenaBlocksCollection).doc(docId).delete();
  }

  static String _safeIdPart(String s) => s.replaceAll('/', '_');
  static String _arenaBlockDocId(String arenaId, String athleteId) =>
      '${_safeIdPart(arenaId)}_${_safeIdPart(athleteId)}';
}

class CreateBookingResult {
  const CreateBookingResult({
    required this.bookingId,
    required this.amountReais,
    this.amountToPayNowReais = 0,
    this.amountDueOnsiteReais = 0,
    this.paymentMode = 'onsite',
    this.paymentFraction = 1,
    this.paymentExpiresAt,
  });

  final String bookingId;
  final double amountReais;
  final double amountToPayNowReais;
  final double amountDueOnsiteReais;
  final String paymentMode;
  final double paymentFraction;
  final String? paymentExpiresAt;

  bool get isPix => paymentMode == 'pix';
}

class BookingException implements Exception {
  BookingException(this.message, {this.code});

  final String message;
  final String? code;

  bool get isSlotConflict => code == BookingService.slotConflictCode;
  bool get isBlockedAthlete => code == BookingService.blockedAthleteCode;

  @override
  String toString() => message;
}

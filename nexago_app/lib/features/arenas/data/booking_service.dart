import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'dart:async';

import '../../arena/domain/arena_manager_booking.dart';
import '../domain/arena_booking_confirm_args.dart';
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

  /// Transação atômica alinhada ao `ArenaService.createBookingAtomically` do web.
  ///
  /// - Verifica locks por **hora civil** tocada em `[startTime, endTime)`.
  /// - Cria **um** documento em [arenaSlots] para a faixa inteira.
  /// - Cria **um** [arenaBookings] com `status: active`.
  /// - Cria um lock por hora em [arenaSlotLocks].
  ///
  /// Retorna o `bookingId` de [arenaBookings].
  Future<String> createBookingAtomically({
    required ArenaBookingConfirmArgs args,
    required String athleteId,
  }) async {
    if (athleteId.isEmpty) {
      throw BookingException('Faça login para confirmar a reserva.');
    }
    if (!args.isValid) {
      throw BookingException(
          'Dados da reserva inválidos. Volte e escolha outro horário.');
    }
    await _ensureAthleteIsNotBlocked(
      arenaId: args.arenaId,
      athleteId: athleteId,
    );

    final dateKey = args.dateKey;
    final startMin = _toMinutes(args.startTime);
    final endMin = _toMinutes(args.endTime);
    if (endMin <= startMin) {
      throw BookingException('Intervalo de horário inválido.');
    }

    final hours = _calendarHoursSpanning(startMin, endMin);
    if (hours.isEmpty) {
      throw BookingException(
          'Não foi possível calcular os horários da reserva.');
    }

    final bookingRef = _firestore.collection(arenaBookingsCollection).doc();
    final slotRef = _firestore.collection(arenaSlotsCollection).doc();
    final bookingId = bookingRef.id;

    final safeArena = _safeIdPart(args.arenaId);
    final safeCourt = _safeIdPart(args.courtId);
    final lockRefs = hours
        .map(
          (h) => _firestore.collection(arenaSlotLocksCollection).doc(
                '${safeArena}_${safeCourt}_${dateKey}_h${h.toString().padLeft(2, '0')}',
              ),
        )
        .toList();

    try {
      await _firestore.runTransaction((transaction) async {
        for (final lockRef in lockRefs) {
          final snap = await transaction.get(lockRef);
          if (snap.exists) {
            throw BookingException(
              'Esse horário acabou de ser reservado. Escolha outro.',
              code: slotConflictCode,
            );
          }
        }

        final day = DateTime(args.date.year, args.date.month, args.date.day);
        final startParts = args.startTime.split(':');
        final startHour = int.tryParse(startParts[0]) ?? 0;
        final startMinute =
            startParts.length > 1 ? (int.tryParse(startParts[1]) ?? 0) : 0;
        final startAt =
            DateTime(day.year, day.month, day.day, startHour, startMinute);
        final confirmationDeadline = startAt.subtract(const Duration(hours: 2));

        transaction.set(bookingRef, <String, dynamic>{
          'athleteId': athleteId,
          'arenaId': args.arenaId,
          'arenaName': args.arenaName,
          'courtId': args.courtId,
          'courtName': args.courtName,
          'date': dateKey,
          'startTime': args.startTime,
          'endTime': args.endTime,
          'amountReais': args.amountReais,
          'status': 'active',
          'attendanceConfirmed': false,
          'attendanceStatus': 'pending',
          'confirmationDeadline': Timestamp.fromDate(confirmationDeadline),
          'source': 'platform',
          'createdAt': FieldValue.serverTimestamp(),
        });

        transaction.set(slotRef, <String, dynamic>{
          'arenaId': args.arenaId,
          'courtId': args.courtId,
          'date': Timestamp.fromDate(day),
          'startTime': args.startTime,
          'endTime': args.endTime,
          'status': 'booked',
          'bookingAthleteId': athleteId,
          'bookingId': bookingId,
          'priceReais': args.amountReais,
          'createdAt': FieldValue.serverTimestamp(),
        });

        for (var i = 0; i < hours.length; i++) {
          final h = hours[i];
          transaction.set(
            lockRefs[i],
            <String, dynamic>{
              'arenaId': args.arenaId,
              'courtId': args.courtId,
              'date': dateKey,
              'startTime': _fmtHourStart(h),
              'endTime': _fmtHourEnd(h),
              'bookingId': bookingId,
              'bookingAthleteId': athleteId,
              'createdAt': FieldValue.serverTimestamp(),
            },
          );
        }
      });
    } on BookingException {
      rethrow;
    } on FirebaseException catch (e) {
      if (e.code == 'permission-denied') {
        throw BookingException(
          'Sem permissão para concluir a reserva. Verifique login e regras do Firestore.',
        );
      }
      throw BookingException(e.message ?? 'Falha na transação (${e.code}).');
    } catch (e) {
      if (e is BookingException) rethrow;
      throw BookingException('Não foi possível concluir a reserva: $e');
    }

    await _notifyArenaBookingCreatedSafe(bookingId);

    return bookingId;
  }

  Future<void> _ensureAthleteIsNotBlocked({
    required String arenaId,
    required String athleteId,
  }) async {
    final aid = arenaId.trim();
    final uid = athleteId.trim();
    if (aid.isEmpty || uid.isEmpty) return;

    final blockId = _arenaBlockDocId(aid, uid);
    final blockSnap =
        await _firestore.collection(arenaBlocksCollection).doc(blockId).get();
    if (!blockSnap.exists) return;

    final reason = (blockSnap.data()?['reason'] as String?)?.trim();
    final reasonSuffix =
        (reason != null && reason.isNotEmpty) ? ' Motivo: $reason' : '';
    throw BookingException(
      'Sua conta está bloqueada para reservar nesta arena.$reasonSuffix',
      code: blockedAthleteCode,
    );
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

  /// Cancelamento pelo gestor da arena (valida [arenaId] do documento).
  Future<void> cancelBookingByArenaManager({
    required String bookingId,
    required String arenaId,
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
    await docRef.update(<String, dynamic>{
      'status': 'canceled',
      'attendanceStatus': 'canceled',
      'canceledAt': FieldValue.serverTimestamp(),
      'canceledByRole': 'arena_manager',
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

  static int _toMinutes(String hhmm) {
    final t = hhmm.trim();
    if (t.length < 4) return 0;
    final parts = t.split(':');
    final h = int.tryParse(parts[0]) ?? 0;
    final m = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
    return h * 60 + m;
  }

  /// Horas civis [0–23] que intersectam `[startMin, endMin)`.
  static List<int> _calendarHoursSpanning(int startMin, int endMin) {
    if (endMin <= startMin) return [];
    final startH = startMin ~/ 60;
    final endH = (endMin - 1) ~/ 60;
    return [for (var h = startH; h <= endH; h++) h];
  }

  static String _fmtHourStart(int h) =>
      '${h.clamp(0, 23).toString().padLeft(2, '0')}:00';

  static String _fmtHourEnd(int h) {
    if (h >= 23) return '24:00';
    return '${(h + 1).toString().padLeft(2, '0')}:00';
  }
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

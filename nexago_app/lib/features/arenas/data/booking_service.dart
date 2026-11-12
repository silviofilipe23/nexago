import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'dart:async';

import '../../arena/domain/arena_manager_booking.dart';
import '../domain/arena_booking_confirm_args.dart';
import '../domain/arena_booking_quote.dart';
import '../domain/my_booking_item.dart';
import '../domain/pending_pix_booking_match.dart';
import '../../../core/firebase/functions_region.dart';

/// Paridade com o fluxo web: transação em `arenaSlotLocks` + `arenaSlots` + `arenaBookings`,
/// depois [notifyArenaBookingCreated] (notificação ao gestor; não duplica gravação).
///
/// Leituras em tempo real usam [FirebaseFirestore.snapshots] em [arenaBookings] para a UI
/// (minhas reservas e painel do gestor).
class BookingService {
  BookingService(
    this._firestore, {
    FirebaseFunctions? functions,
  }) : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const String arenaBookingsCollection = 'arenaBookings';
  static const String arenaSlotsCollection = 'arenaSlots';
  static const String arenaSlotLocksCollection = 'arenaSlotLocks';
  static const String arenaBlocksCollection = 'arena_blocks';

  static const String slotConflictCode = 'SLOT_CONFLICT';
  static const String blockedAthleteCode = 'BLOCKED_ATHLETE';

  /// Reserva como professor recusada (`details.reason` = `no_link`,
  /// `not_active` ou `permission_off`): dá para reservar como atleta.
  static const String professorDeniedCode = 'PROFESSOR_DENIED';

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

  /// Reservas em que o atleta entrou por convite (lista gravada pelo servidor
  /// em `participantUids` — ver `functions/src/arena-booking-invite.ts`).
  Stream<List<MyBookingItem>> watchGuestBookings(String athleteId) {
    if (athleteId.isEmpty) {
      return Stream<List<MyBookingItem>>.value(const []);
    }
    return _firestore
        .collection(arenaBookingsCollection)
        .where('participantUids', arrayContains: athleteId)
        .limit(_myBookingsLimit)
        .snapshots()
        .map((snapshot) {
      final items = snapshot.docs.map(MyBookingItem.fromFirestore).toList()
        ..sort((a, b) => b.sortMillis.compareTo(a.sortMillis));
      return items;
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

  /// Até 256 reservas da arena, **sem filtro de data**: a partir daí as de
  /// hoje podem sumir. Não usar em agenda/listas por dia — ver
  /// [watchBookingsForArenaInRange].
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
        .map(_managerBookingsFromSnapshot);
  }

  /// Reservas da arena com `date` (`yyyy-MM-dd`) entre [fromKey] e [toKey],
  /// inclusive. Índice `arenaBookings (arenaId ASC, date ASC)`.
  Stream<List<ArenaManagerBooking>> watchBookingsForArenaInRange(
    String arenaId, {
    required String fromKey,
    required String toKey,
  }) {
    final id = arenaId.trim();
    if (id.isEmpty) {
      return Stream<List<ArenaManagerBooking>>.value(const []);
    }
    return _firestore
        .collection(arenaBookingsCollection)
        .where('arenaId', isEqualTo: id)
        .where('date', isGreaterThanOrEqualTo: fromKey)
        .where('date', isLessThanOrEqualTo: toKey)
        .snapshots()
        .map(_managerBookingsFromSnapshot);
  }

  static List<ArenaManagerBooking> _managerBookingsFromSnapshot(
    QuerySnapshot<Map<String, dynamic>> snapshot,
  ) {
    final list = snapshot.docs.map(ArenaManagerBooking.fromFirestore).toList();
    list.sort((a, b) {
      final byDate = b.dateKey.compareTo(a.dateKey);
      if (byDate != 0) return byDate;
      return b.startTime.compareTo(a.startTime);
    });
    return list;
  }

  /// Cota autoritativa (promoções + preço por quadra + cupom) via Cloud Function.
  ///
  /// [asProfessor] pede o preço "como professor": o servidor aplica o desconto
  /// do vínculo (`courtDiscountPercent`) quando ele vence promoção/cupom; sem
  /// vínculo válido volta o preço de atleta, sem erro.
  ///
  /// [useWeatherCredit] pede o crédito de chuva aplicado na cotação; vai com o
  /// [paymentMode] (`onsite`/`pix`) porque no Pix o servidor deixa um mínimo
  /// para cobrar. Sem ele o payload segue igual ao de antes.
  Future<ArenaBookingQuote> quoteBooking({
    required ArenaBookingConfirmArgs args,
    String? couponCode,
    bool asProfessor = false,
    bool useWeatherCredit = false,
    String paymentMode = 'onsite',
  }) async {
    if (!args.isValid) {
      throw BookingException(
          'Dados da reserva inválidos. Volte e escolha outro horário.');
    }
    try {
      final payload = _bookingCallablePayload(args, couponCode: couponCode);
      if (asProfessor) payload['asProfessor'] = true;
      if (useWeatherCredit) {
        payload['useWeatherCredit'] = true;
        payload['paymentMode'] = paymentMode;
        if (paymentMode == 'pix') payload['paymentFraction'] = 1.0;
      }
      final result =
          await _functions.httpsCallable('quoteArenaBooking').call(payload);
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
    final memberHoursMinutes = _nonNegativeInt(map['memberHoursMinutes']);
    final scheduleFlexMinutes = _nonNegativeInt(map['scheduleFlexMinutes']);
    // Total 0 só vale quando o banco de horas do mensalista ou o plano de
    // horário cobriu a reserva.
    if (amount == null ||
        amount < 0 ||
        (amount == 0 && memberHoursMinutes <= 0 && scheduleFlexMinutes <= 0)) {
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
    return ArenaBookingQuote(
      amountReais: amount,
      lineItems: lines,
      couponApplied: map['couponApplied'] == true,
      couponId: map['couponId'] as String?,
      couponDiscountReais:
          (map['couponDiscountReais'] as num?)?.toDouble() ?? 0,
      professorDiscountPercent:
          (map['professorDiscountPercent'] as num?)?.round() ?? 0,
      professorDiscountReais:
          (map['professorDiscountReais'] as num?)?.toDouble() ?? 0,
      athletePricingTier: map['athletePricingTier'] as String?,
      athletePricingLabel: map['athletePricingLabel'] as String?,
      athletePricingDiscountReais:
          _nonNegative(map['athletePricingDiscountReais']),
      weatherCreditAvailableReais:
          _nonNegative(map['weatherCreditAvailableReais']),
      weatherCreditNextExpiresAt: map['weatherCreditNextExpiresAt'] is String
          ? DateTime.tryParse(map['weatherCreditNextExpiresAt'] as String)
              ?.toLocal()
          : null,
      weatherCreditAppliedReais: _nonNegative(map['weatherCreditAppliedReais']),
      amountAfterCreditReais:
          (map['amountAfterCreditReais'] as num?)?.toDouble(),
      memberHoursWeeklyMinutes:
          _nonNegativeInt(map['memberHoursWeeklyMinutes']),
      memberHoursAvailableMinutes:
          _nonNegativeInt(map['memberHoursAvailableMinutes']),
      memberHoursMinutes: memberHoursMinutes,
      memberHoursDiscountReais: _nonNegative(map['memberHoursDiscountReais']),
      memberHoursPlanName: _trimmedOrNull(map['memberHoursPlanName']),
      memberHoursBlockedReason: _trimmedOrNull(map['memberHoursBlockedReason']),
      schedulePlanName: _trimmedOrNull(map['schedulePlanName']),
      schedulePlanTimesPerWeek:
          _nonNegativeInt(map['schedulePlanTimesPerWeek']),
      schedulePlanUsesLeft: _nonNegativeInt(map['schedulePlanUsesLeft']),
      scheduleFlexMinutes: scheduleFlexMinutes,
      scheduleFlexDiscountReais: _nonNegative(map['scheduleFlexDiscountReais']),
      schedulePlanBlockedReason:
          _trimmedOrNull(map['schedulePlanBlockedReason']),
    );
  }

  static double _nonNegative(Object? raw) {
    final v = raw is num ? raw.toDouble() : 0.0;
    return v.isFinite && v > 0 ? v : 0;
  }

  static int _nonNegativeInt(Object? raw) => _nonNegative(raw).round();

  static String? _trimmedOrNull(Object? raw) {
    final v = raw is String ? raw.trim() : '';
    return v.isEmpty ? null : v;
  }

  /// Reserva via callable `createArenaBooking` (preço validado no servidor).
  Future<CreateBookingResult> createBookingAtomically({
    required ArenaBookingConfirmArgs args,
    required String athleteId,
    String paymentMode = 'onsite',
    double paymentFraction = 1.0,
    String? couponCode,
    String? sport,
    bool asProfessor = false,

    /// Aula para um aluno da carteira (professor independente). Só vai junto
    /// com [asProfessor]; o servidor confere vínculo e aluno ativo.
    String? professorStudentId,

    /// Desconta o crédito de chuva do atleta nesta arena. Coberta por inteiro,
    /// a resposta vem com `paymentMode: 'weather_credit'` e a reserva já paga.
    bool useWeatherCredit = false,
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
      final payload = _bookingCallablePayload(args, couponCode: couponCode);
      payload['clientAmountReais'] = args.amountReais;
      payload['paymentMode'] = paymentMode;
      if (sport != null && sport.trim().isNotEmpty) {
        payload['sport'] = sport.trim();
      }
      if (paymentMode == 'pix') {
        payload['paymentFraction'] = paymentFraction;
      }
      // Só com o vínculo liberando "Reservar quadras"; sem a chave é reserva
      // de atleta, como sempre (o servidor relê o vínculo e decide).
      if (asProfessor) {
        payload['asProfessor'] = true;
        final studentId = professorStudentId?.trim() ?? '';
        if (studentId.isNotEmpty) payload['professorStudentId'] = studentId;
      }
      if (useWeatherCredit) payload['useWeatherCredit'] = true;

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

      final resultMode = (data['paymentMode'] as String?) ?? paymentMode;
      // Coberta pelo crédito de chuva: já nasce paga, sem webhook do Pix para
      // avisar o gestor — avisa como a reserva no local.
      // Coberta pelo banco de horas: o servidor confirma no local mesmo que o
      // app tenha pedido Pix — avisa como a reserva no local.
      if (paymentMode == 'onsite' ||
          resultMode == 'onsite' ||
          resultMode == CreateBookingResult.weatherCreditMode) {
        await _notifyArenaBookingCreatedSafe(bookingId);
      }

      return CreateBookingResult(
        bookingId: bookingId,
        amountReais: amount,
        amountToPayNowReais:
            (data['amountToPayNowReais'] as num?)?.toDouble() ?? 0,
        amountDueOnsiteReais:
            (data['amountDueOnsiteReais'] as num?)?.toDouble() ?? amount,
        paymentMode: resultMode,
        paymentFraction:
            (data['paymentFraction'] as num?)?.toDouble() ?? paymentFraction,
        paymentExpiresAt: data['paymentExpiresAt'] as String?,
        couponApplied: data['couponApplied'] == true,
        couponId: data['couponId'] as String?,
        couponDiscountReais:
            (data['couponDiscountReais'] as num?)?.toDouble() ?? 0,
        professorDiscountPercent:
            (data['professorDiscountPercent'] as num?)?.round() ?? 0,
        professorDiscountReais:
            (data['professorDiscountReais'] as num?)?.toDouble() ?? 0,
        weatherCreditAppliedReais:
            _nonNegative(data['weatherCreditAppliedReais']),
        memberHoursMinutes: _nonNegativeInt(data['memberHoursMinutes']),
        memberHoursDiscountReais:
            _nonNegative(data['memberHoursDiscountReais']),
        scheduleFlexMinutes: _nonNegativeInt(data['scheduleFlexMinutes']),
      );
    } on FirebaseFunctionsException catch (e) {
      throw BookingException(_mapFunctionsMessage(e), code: _functionsCode(e));
    } catch (e) {
      if (e is BookingException) rethrow;
      throw BookingException('Não foi possível concluir a reserva: $e');
    }
  }

  /// Retoma reserva PIX pendente do mesmo horário (ex.: voltou da tela PIX sem pagar).
  Future<CreateBookingResult?> findResumablePixBooking({
    required String athleteId,
    required ArenaBookingConfirmArgs args,
  }) async {
    if (athleteId.isEmpty || !args.isValid) return null;

    final candidates = <QueryDocumentSnapshot<Map<String, dynamic>>>[];

    Future<void> collect(String field) async {
      final snap = await _firestore
          .collection(arenaBookingsCollection)
          .where(field, isEqualTo: athleteId)
          .where('status', isEqualTo: 'pending_payment')
          .limit(24)
          .get();
      for (final doc in snap.docs) {
        if (candidates.every((c) => c.id != doc.id)) {
          candidates.add(doc);
        }
      }
    }

    await collect('athleteId');
    await collect('bookingAthleteId');

    CreateBookingResult? best;
    int bestSort = -1;

    for (final doc in candidates) {
      final data = doc.data();
      if (!PendingPixBookingMatch.isResumablePendingPix(data)) continue;
      if (!PendingPixBookingMatch.matchesConfirmArgs(data, args)) continue;

      final created = data['createdAt'];
      var sort = 0;
      if (created is Timestamp) {
        sort = created.millisecondsSinceEpoch;
      }

      if (best != null && sort <= bestSort) continue;
      bestSort = sort;

      final amount = (data['amountReais'] as num?)?.toDouble();
      if (amount == null) continue;

      best = CreateBookingResult(
        bookingId: doc.id,
        amountReais: amount,
        amountToPayNowReais:
            (data['amountToPayNowReais'] as num?)?.toDouble() ?? amount,
        amountDueOnsiteReais:
            (data['amountDueOnsiteReais'] as num?)?.toDouble() ?? 0,
        paymentMode: 'pix',
        paymentFraction: (data['paymentFraction'] as num?)?.toDouble() ?? 1.0,
        paymentExpiresAt: PendingPixBookingMatch.paymentExpiresAtIso(data),
        weatherCreditAppliedReais: _nonNegative(data['weatherCreditReais']),
      );
    }

    return best;
  }

  static Map<String, dynamic> _bookingCallablePayload(
    ArenaBookingConfirmArgs args, {
    String? couponCode,
  }) {
    return <String, dynamic>{
      'arenaId': args.arenaId,
      'arenaName': args.arenaName,
      // Arena "a arena define a quadra": sem quadra; o servidor escolhe a provisória e precisa
      // do esporte já na cotação (o preço é o do horário daquele esporte).
      if (args.capacity) ...<String, dynamic>{
        'allocation': 'capacity',
        'sport': args.sport,
      } else ...<String, dynamic>{
        'courtId': args.courtId,
        'courtName': args.courtName,
      },
      'date': args.dateKey,
      'startTime': args.startTime,
      'endTime': args.endTime,
      if (args.selectedSlotStartTimes.isNotEmpty)
        'selectedSlotStartTimes': args.selectedSlotStartTimes,
      if (couponCode != null && couponCode.trim().isNotEmpty)
        'couponCode': couponCode.trim(),
    };
  }

  static String? _functionsCode(FirebaseFunctionsException e) {
    switch (e.code) {
      case 'already-exists':
      // Arena "a arena define a quadra": todas as quadras do horário foram ocupadas.
      case 'resource-exhausted':
        return slotConflictCode;
      case 'permission-denied':
        final details = e.details;
        final reason = details is Map ? details['reason'] : null;
        if (reason == 'no_link' ||
            reason == 'not_active' ||
            reason == 'permission_off') {
          return professorDeniedCode;
        }
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

  /// Cancela a reserva do próprio atleta pelo servidor (`cancelMyArenaBooking`):
  /// dentro do prazo, vale a política da arena copiada na reserva — estorno
  /// integral ou parcial pelo mesmo meio (Pix ou cartão), ou crédito na arena.
  /// Devolve quanto foi estornado e quanto virou crédito.
  /// Reserva aguardando pagamento só perde a cobrança aberta (nada a estornar).
  /// A escrita direta antiga só marcava `canceled` e o dinheiro ficava retido.
  ///
  /// [lateCancel]: fora do prazo grátis cancela mesmo assim, sem estorno
  /// ("Cancelar mesmo" do modo professor).
  Future<BookingCancelOutcome> cancelBooking({
    required String bookingId,
    required String athleteId,
    bool lateCancel = false,
  }) async {
    final id = bookingId.trim();
    final uid = athleteId.trim();
    if (id.isEmpty || uid.isEmpty) {
      throw BookingException('Dados inválidos para cancelamento.');
    }

    try {
      final result = await _functions
          .httpsCallable('cancelMyArenaBooking')
          .call(<String, dynamic>{
        'bookingId': id,
        if (lateCancel) 'lateCancel': true,
      });
      return BookingCancelOutcome.fromCallable(result.data);
    } on FirebaseFunctionsException catch (e) {
      throw BookingException(
        e.message ?? 'Não foi possível cancelar a reserva.',
      );
    }
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

      // Gamificação (streak/badges/XP) é creditada server-side via Cloud Function
      // (trigger em arenaBookings ao confirmar presença) — rules bloqueiam escrita
      // do client em `gamification*`, e incluí-la aqui quebraria esta transação inteira.
      tx.update(bookingRef, <String, dynamic>{
        'attendanceConfirmed': true,
        'attendanceStatus': 'confirmed',
        'attendanceConfirmedAt': FieldValue.serverTimestamp(),
      });
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
          (data['attendanceStatus'] as String?)?.trim().toLowerCase() ??
              'pending';
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
          final sm =
              startParts.length > 1 ? (int.tryParse(startParts[1]) ?? 0) : 0;
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
        final sm =
            startParts.length > 1 ? (int.tryParse(startParts[1]) ?? 0) : 0;
        final eh = int.tryParse(endParts[0]) ?? 0;
        final em = endParts.length > 1 ? (int.tryParse(endParts[1]) ?? 0) : 0;
        startAt = DateTime(date.year, date.month, date.day, sh, sm);
        endAt = DateTime(date.year, date.month, date.day, eh, em);
      }
      if (startAt == null || endAt == null) {
        throw BookingException(
            'Não foi possível validar a janela do check-in.');
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

      // Gamificação (checkInsCount) é creditada server-side via Cloud Function
      // (trigger em arenaBookings ao fazer check-in) — mesmo motivo do confirmAttendance acima.
      tx.update(bookingRef, <String, dynamic>{
        'attendanceStatus': 'checked_in',
        'checkedInAt': FieldValue.serverTimestamp(),
        'locationVerified': locationVerified,
      });
    });
  }

  /// Check-in pelo QR da quadra (reserva de arena que define a quadra): a quadra lida vira a da
  /// reserva e o check-in é marcado no servidor (`checkInArenaBookingByCourtQr`). Devolve a quadra.
  Future<String> checkInByCourtQr({
    required String bookingId,
    required String qr,
  }) async {
    try {
      final result = await _functions
          .httpsCallable('checkInArenaBookingByCourtQr')
          .call(<String, dynamic>{
        'bookingId': bookingId.trim(),
        'qr': qr.trim()
      });
      final data = result.data;
      final court = data is Map ? data['courtName'] : null;
      return court is String && court.trim().isNotEmpty
          ? court.trim()
          : 'Quadra';
    } on FirebaseFunctionsException catch (e) {
      final details = e.details;
      final reason = details is Map ? details['reason'] : null;
      throw BookingException(
        e.message?.trim().isNotEmpty == true
            ? e.message!.trim()
            : 'Não foi possível fazer o check-in agora.',
        code: reason is String ? reason : e.code,
      );
    }
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
    this.couponApplied = false,
    this.couponId,
    this.couponDiscountReais = 0,
    this.professorDiscountPercent = 0,
    this.professorDiscountReais = 0,
    this.weatherCreditAppliedReais = 0,
    this.memberHoursMinutes = 0,
    this.memberHoursDiscountReais = 0,
    this.scheduleFlexMinutes = 0,
  });

  /// `paymentMode` da resposta quando o crédito de chuva cobriu tudo.
  static const String weatherCreditMode = 'weather_credit';

  final String bookingId;
  final double amountReais;
  final double amountToPayNowReais;
  final double amountDueOnsiteReais;
  final String paymentMode;
  final double paymentFraction;
  final String? paymentExpiresAt;
  final bool couponApplied;
  final String? couponId;
  final double couponDiscountReais;

  /// Desconto do professor aplicado (0 quando não aplicado).
  final int professorDiscountPercent;
  final double professorDiscountReais;

  /// Crédito de chuva aplicado na reserva (0 sem crédito).
  final double weatherCreditAppliedReais;

  /// Minutos cobertos pelo banco de horas do mensalista (0 sem banco).
  final int memberHoursMinutes;

  /// Quanto o banco de horas tirou do preço (0 sem banco).
  final double memberHoursDiscountReais;

  /// Minutos cobertos pelo plano de horário livre (0 sem plano).
  final int scheduleFlexMinutes;

  /// O banco de horas cobriu tudo: confirmada no local, nada a pagar.
  bool get isCoveredByMemberHours => memberHoursMinutes > 0 && amountReais <= 0;

  /// O plano de horário livre cobriu tudo: confirmada, nada a pagar.
  bool get isCoveredBySchedulePlan =>
      scheduleFlexMinutes > 0 && amountReais <= 0;

  bool get isPix => paymentMode == 'pix';

  /// O crédito de chuva cobriu tudo: reserva já ativa e paga, sem Pix.
  bool get isCoveredByWeatherCredit => paymentMode == weatherCreditMode;
}

class BookingException implements Exception {
  BookingException(this.message, {this.code});

  final String message;
  final String? code;

  bool get isSlotConflict => code == BookingService.slotConflictCode;
  bool get isBlockedAthlete => code == BookingService.blockedAthleteCode;
  bool get isProfessorDenied => code == BookingService.professorDeniedCode;

  @override
  String toString() => message;
}

/// Resultado do `cancelMyArenaBooking`: o que voltou em dinheiro e o que
/// virou crédito na arena (os dois 0 quando nada foi pago pelo app).
class BookingCancelOutcome {
  const BookingCancelOutcome({this.refundedReais = 0, this.creditedReais = 0});

  factory BookingCancelOutcome.fromCallable(Object? data) {
    double read(String key) {
      final v = data is Map ? data[key] : null;
      return v is num ? v.toDouble() : 0;
    }

    return BookingCancelOutcome(
      refundedReais: read('refundedReais'),
      creditedReais: read('creditedReais'),
    );
  }

  final double refundedReais;
  final double creditedReais;
}

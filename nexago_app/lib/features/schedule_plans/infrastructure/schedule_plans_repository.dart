import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/schedule_plan_models.dart';

/// Falha de uma callable dos Planos de horário, com a frase do servidor (ou o
/// padrão da tela) — o `toString` é só a frase, para o
/// `friendlyErrorMessage` mostrar como veio.
class SchedulePlanException implements Exception {
  SchedulePlanException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// Leitura (Firestore) e ações (callables) dos Planos de horário do lado do
/// atleta. Escrita é 100% pelas Cloud Functions.
class SchedulePlansRepository {
  SchedulePlansRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _db = firestore,
        _functionsOverride = functions;

  final FirebaseFirestore _db;
  final FirebaseFunctions? _functionsOverride;

  FirebaseFunctions get _functions => _functionsOverride ?? nexagoFunctions;

  /// Planos publicados da arena (rules: qualquer logado lê os `active`).
  Stream<List<SchedulePlan>> watchActivePlans(String arenaId) {
    return _db
        .collection('arenas')
        .doc(arenaId)
        .collection('schedulePlans')
        .where('status', isEqualTo: 'active')
        .snapshots()
        .map((snap) {
      final plans = [
        for (final d in snap.docs)
          SchedulePlan.fromMap(d.id, d.data(), arenaId: arenaId),
      ]..sort((a, b) {
          final byTimes = a.timesPerWeek.compareTo(b.timesPerWeek);
          if (byTimes != 0) return byTimes;
          return a.monthlyPriceReais.compareTo(b.monthlyPriceReais);
        });
      return plans;
    });
  }

  /// Quantas assinaturas vivas o atleta tem (titular ou membro) — só para a
  /// entrada da agenda. Sem índice composto: filtra o status no app.
  Stream<int> watchMyLiveSubscriptionsCount(String uid) {
    return _db
        .collection('arenaScheduleSubscriptions')
        .where('memberAthleteIds', arrayContains: uid)
        .snapshots()
        .map((snap) => snap.docs
            .where((d) => d.data()['status'] != 'canceled')
            .length);
  }

  /// Vagas oferecidas ao atleta na lista de espera (entrada da agenda).
  Stream<int> watchMyOffersCount(String uid) {
    return _db
        .collection('arenaScheduleWaitlist')
        .where('athleteId', isEqualTo: uid)
        .snapshots()
        .map((snap) =>
            snap.docs.where((d) => d.data()['status'] == 'offered').length);
  }

  Future<Map<String, dynamic>> _call(
    String name,
    Map<String, Object?> payload, {
    required String fallback,
  }) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(
            payload,
          );
      return spMap(result.data);
    } on FirebaseFunctionsException catch (e) {
      throw SchedulePlanException(
        callableErrorMessage(e.code, e.message, fallback),
        code: e.code,
      );
    }
  }

  Future<SchedulePlanAvailability> availability({
    required String arenaId,
    required String planId,
  }) async {
    final data = await _call(
      'getArenaSchedulePlanAvailability',
      {'arenaId': arenaId, 'planId': planId},
      fallback: 'Não foi possível carregar os horários do plano.',
    );
    return SchedulePlanAvailability.fromMap(
      data,
      arenaId: arenaId,
      planId: planId,
    );
  }

  Future<ScheduleSubscribeResult> subscribe({
    required String arenaId,
    required String planId,
    required List<int> weekdays,
    required String startTime,
    required SchedulePlanCycle cycle,
    required SchedulePaymentMethod paymentMethod,
    List<String> memberAthleteIds = const [],
  }) async {
    final data = await _call(
      'subscribeArenaSchedulePlan',
      {
        'arenaId': arenaId,
        'planId': planId,
        'weekdays': weekdays,
        'startTime': startTime,
        'cycle': cycle.key,
        'paymentMethod': paymentMethod.key,
        if (memberAthleteIds.isNotEmpty) 'memberAthleteIds': memberAthleteIds,
      },
      fallback: 'Não foi possível assinar o plano.',
    );
    return ScheduleSubscribeResult.fromMap(data);
  }

  Future<String> acceptOffer({
    required String entryId,
    required SchedulePlanCycle cycle,
    required SchedulePaymentMethod paymentMethod,
    List<String> memberAthleteIds = const [],
  }) async {
    final data = await _call(
      'acceptArenaScheduleWaitlistOffer',
      {
        'entryId': entryId,
        'cycle': cycle.key,
        'paymentMethod': paymentMethod.key,
        if (memberAthleteIds.isNotEmpty) 'memberAthleteIds': memberAthleteIds,
      },
      fallback: 'Não foi possível aceitar a vaga.',
    );
    return spStr(data['subscriptionId']);
  }

  /// Entra na fila do horário; devolve a posição (0 se o servidor não
  /// mandar).
  Future<int> joinWaitlist({
    required String arenaId,
    required String planId,
    required List<int> weekdays,
    required String startTime,
    int? playersCount,
  }) async {
    final data = await _call(
      'addArenaScheduleWaitlist',
      {
        'arenaId': arenaId,
        'planId': planId,
        'weekdays': weekdays,
        'startTime': startTime,
        if (playersCount != null && playersCount > 1)
          'playersCount': playersCount,
      },
      fallback: 'Não foi possível entrar na fila.',
    );
    return spInt(data['position']);
  }

  Future<MyScheduleSubscriptions> mySubscriptions() async {
    final data = await _call(
      'getMyArenaScheduleSubscriptions',
      const {},
      fallback: 'Não foi possível carregar seus planos de horário.',
    );
    return MyScheduleSubscriptions.fromMap(data);
  }

  Future<ScheduleSkipResult> skipOccurrence(String bookingId) async {
    final data = await _call(
      'skipArenaScheduleOccurrence',
      {'bookingId': bookingId},
      fallback: 'Não foi possível avisar a arena.',
    );
    return ScheduleSkipResult.fromMap(data);
  }

  Future<List<ScheduleMakeupOption>> makeupOptions({
    required String creditId,
    required String date,
  }) async {
    final data = await _call(
      'getArenaScheduleMakeupOptions',
      {'creditId': creditId, 'date': date},
      fallback: 'Não foi possível buscar horários para a reposição.',
    );
    return [
      for (final o in spMapList(data['options'])) ScheduleMakeupOption.fromMap(o),
    ];
  }

  Future<String> useMakeup({
    required String creditId,
    required String date,
    required String courtId,
    required String startTime,
  }) async {
    final data = await _call(
      'useArenaScheduleMakeup',
      {
        'creditId': creditId,
        'date': date,
        'courtId': courtId,
        'startTime': startTime,
      },
      fallback: 'Não foi possível marcar a reposição.',
    );
    return spStr(data['bookingId']);
  }

  /// Troca de horário → nome da quadra nova.
  Future<String> changeSlots({
    required String subscriptionId,
    required List<int> weekdays,
    required String startTime,
  }) async {
    final data = await _call(
      'changeArenaScheduleSubscriptionSlots',
      {
        'subscriptionId': subscriptionId,
        'weekdays': weekdays,
        'startTime': startTime,
      },
      fallback: 'Não foi possível trocar o horário.',
    );
    return spStr(data['courtName']);
  }

  /// Pausa até [until] (`YYYY-MM-DD`) → dias de pausa que sobram.
  Future<int?> pause({
    required String subscriptionId,
    required String until,
  }) async {
    final data = await _call(
      'pauseArenaScheduleSubscription',
      {'subscriptionId': subscriptionId, 'until': until},
      fallback: 'Não foi possível pausar o plano.',
    );
    final left = data['daysLeft'];
    return left is num ? left.toInt() : null;
  }

  Future<void> resume(String subscriptionId) async {
    await _call(
      'resumeArenaScheduleSubscription',
      {'subscriptionId': subscriptionId},
      fallback: 'Não foi possível retomar o plano.',
    );
  }
}

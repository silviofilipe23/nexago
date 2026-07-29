import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../domain/arena_manager_booking.dart';
import '../domain/arena_recurring_booking.dart';

class RecurringBookingException implements Exception {
  RecurringBookingException(this.message, {this.code});
  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// Horários fixos (mensalistas): leitura de `arenaRecurringBookings` e
/// escrita via Cloud Functions (`createArenaRecurringBooking`,
/// `cancelArenaRecurringBooking`, `cancelArenaRecurringOccurrence`).
class RecurringBookingService {
  RecurringBookingService(
    this._firestore, {
    FirebaseFunctions? functions,
  }) : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const String collection = 'arenaRecurringBookings';
  static const String _bookingsCollection = 'arenaBookings';

  /// Séries visíveis da arena (ativas + pausadas) — pausada não some da
  /// lista do gestor no app, mesmo sem botão de pausar/retomar aqui ainda
  /// (isso fica só no portal web nesta rodada).
  Stream<List<ArenaRecurringBooking>> watchActiveSeries(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) {
      return Stream<List<ArenaRecurringBooking>>.value(const []);
    }
    return _firestore
        .collection(collection)
        .where('arenaId', isEqualTo: id)
        .where('status', whereIn: ['active', 'paused'])
        .snapshots()
        .map((snapshot) {
      final list =
          snapshot.docs.map(ArenaRecurringBooking.fromFirestore).toList();
      list.sort((a, b) {
        final byDay = a.weekday.compareTo(b.weekday);
        if (byDay != 0) return byDay;
        return a.startTime.compareTo(b.startTime);
      });
      return list;
    });
  }

  /// Uma série específica (detalhe em tempo real).
  Stream<ArenaRecurringBooking?> watchSeries(String seriesId) {
    final id = seriesId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _firestore.collection(collection).doc(id).snapshots().map(
          (doc) => doc.exists ? ArenaRecurringBooking.fromFirestore(doc) : null,
        );
  }

  /// Próximas ocorrências materializadas da série (a partir de hoje).
  ///
  /// Filtra e ordena no cliente para não exigir índice composto
  /// (`recurringBookingId` + `date`) antes do deploy de índices.
  Stream<List<ArenaManagerBooking>> watchUpcomingOccurrences(String seriesId) {
    final id = seriesId.trim();
    if (id.isEmpty) {
      return Stream<List<ArenaManagerBooking>>.value(const []);
    }
    final todayKey = _dateKey(DateTime.now());
    return _firestore
        .collection(_bookingsCollection)
        .where('recurringBookingId', isEqualTo: id)
        .snapshots()
        .map((snapshot) => _upcomingOccurrencesFromDocs(
              snapshot.docs,
              todayKey: todayKey,
            ));
  }

  /// Filtra reservas futuras e ordena por data (YYYY-MM-DD).
  static List<ArenaManagerBooking> _upcomingOccurrencesFromDocs(
    Iterable<QueryDocumentSnapshot<Map<String, dynamic>>> docs, {
    required String todayKey,
  }) {
    final list = docs.map(ArenaManagerBooking.fromFirestore).where((booking) {
      final key = booking.dateKey;
      return key.isNotEmpty && key.compareTo(todayKey) >= 0;
    }).toList();
    list.sort((a, b) => a.dateKey.compareTo(b.dateKey));
    return list;
  }

  /// Cria a série e materializa as primeiras ocorrências no servidor.
  Future<CreateRecurringBookingResult> createSeries({
    required String arenaId,
    required String courtId,
    required int weekday,
    required String startTime,
    required String endTime,
    required double amountReais,
    String? athleteId,
    String? customerName,
    String? startDate,
    String? endDate,
  }) async {
    try {
      final result =
          await _functions.httpsCallable('createArenaRecurringBooking').call({
        'arenaId': arenaId,
        'courtId': courtId,
        'weekday': weekday,
        'startTime': startTime,
        'endTime': endTime,
        'amountReais': amountReais,
        if (athleteId != null && athleteId.trim().isNotEmpty)
          'athleteId': athleteId.trim(),
        if (customerName != null && customerName.trim().isNotEmpty)
          'customerName': customerName.trim(),
        if (startDate != null) 'startDate': startDate,
        if (endDate != null) 'endDate': endDate,
      });
      final data = result.data;
      if (data is! Map) {
        throw RecurringBookingException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      final seriesId = (map['seriesId'] as String?)?.trim();
      if (seriesId == null || seriesId.isEmpty) {
        throw RecurringBookingException('Resposta inválida do servidor.');
      }
      return CreateRecurringBookingResult(
        seriesId: seriesId,
        createdDates: _stringList(map['createdDates']),
        skippedDates: _stringList(map['skippedDates']),
      );
    } on FirebaseFunctionsException catch (e) {
      throw RecurringBookingException(_mapMessage(e), code: e.code);
    }
  }

  /// Encerra a série: cancela as ocorrências futuras, preserva as passadas.
  Future<void> cancelSeries(String seriesId, {String? reason}) async {
    try {
      await _functions.httpsCallable('cancelArenaRecurringBooking').call({
        'seriesId': seriesId,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      });
    } on FirebaseFunctionsException catch (e) {
      throw RecurringBookingException(_mapMessage(e), code: e.code);
    }
  }

  /// Cancela apenas uma ocorrência, sem encerrar a série.
  Future<void> cancelOccurrence(String bookingId, {String? reason}) async {
    try {
      await _functions.httpsCallable('cancelArenaRecurringOccurrence').call({
        'bookingId': bookingId,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      });
    } on FirebaseFunctionsException catch (e) {
      throw RecurringBookingException(_mapMessage(e), code: e.code);
    }
  }

  static List<String> _stringList(dynamic v) {
    if (v is! List) return const [];
    return [
      for (final item in v)
        if (item is String && item.trim().isNotEmpty) item.trim(),
    ];
  }

  static String _dateKey(DateTime d) {
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$m-$day';
  }

  static String _mapMessage(FirebaseFunctionsException e) {
    final message = e.message?.trim();
    if (message != null && message.isNotEmpty) {
      return message;
    }
    switch (e.code) {
      case 'internal':
      case 'unknown':
      case 'unavailable':
        return 'Não foi possível criar o horário fixo. Tente novamente em instantes.';
      default:
        return 'Não foi possível concluir a operação. Tente novamente.';
    }
  }
}

import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/weather_models.dart';

/// Escolha do atleta para uma reserva liberada por chuva.
enum WeatherChoice { credit, keep, reschedule }

/// Horário novo escolhido na remarcação.
class WeatherReschedulePick {
  const WeatherReschedulePick({
    required this.courtId,
    required this.courtName,
    required this.dateKey,
    required this.startTime,
    required this.endTime,
    this.selectedSlotStartTimes = const [],
  });

  final String courtId;
  final String? courtName;
  final String dateKey;
  final String startTime;
  final String endTime;
  final List<String> selectedSlotStartTimes;

  Map<String, dynamic> toPayload() => <String, dynamic>{
        'courtId': courtId,
        if (courtName != null && courtName!.trim().isNotEmpty)
          'courtName': courtName!.trim(),
        'date': dateKey,
        'startTime': startTime,
        'endTime': endTime,
        if (selectedSlotStartTimes.isNotEmpty)
          'selectedSlotStartTimes': selectedSlotStartTimes,
      };
}

/// Resposta de `chooseArenaWeatherOption`.
class WeatherChoiceResult {
  const WeatherChoiceResult({
    required this.choice,
    this.creditId,
    this.creditReais = 0,
    this.expiresAt,
    this.newBookingId,
    this.newAmountReais = 0,
    this.coveredByCreditReais = 0,
    this.dueOnsiteReais = 0,
    this.leftoverCreditReais = 0,
  });

  final WeatherChoice choice;

  /// `credit` (e a sobra da remarcação, quando houver).
  final String? creditId;
  final double creditReais;
  final DateTime? expiresAt;

  /// `reschedule`.
  final String? newBookingId;
  final double newAmountReais;
  final double coveredByCreditReais;
  final double dueOnsiteReais;
  final double leftoverCreditReais;
}

/// Resposta de `requestArenaWeatherRelease`.
class WeatherRequestResult {
  const WeatherRequestResult({required this.status, this.weather});

  /// `pending` (fila da arena) ou `approved` (aprovado na hora).
  final WeatherRequestStatus status;
  final WeatherReading? weather;
}

class WeatherException implements Exception {
  WeatherException(this.message, {this.code});

  /// Horário escolhido na remarcação acabou de ser tomado.
  static const String slotTakenCode = 'SLOT_TAKEN';

  /// Callable ainda não publicada (NOT FOUND cru do SDK).
  static const String unavailableCode = 'UNAVAILABLE';

  final String message;
  final String? code;

  bool get isSlotTaken => code == slotTakenCode;
  bool get isUnavailable => code == unavailableCode;

  @override
  String toString() => message;
}

/// Leituras (Firestore) e ações (callables) do cancelamento por chuva no app
/// do atleta. Escrita é sempre do servidor.
class WeatherService {
  WeatherService(this._firestore, {FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const String requestsCollection = 'arenaWeatherRequests';
  static const String creditsCollection = 'arenaWeatherCredits';

  static const String unavailableMessage =
      'Esta função ainda não está disponível. Tente de novo mais tarde.';

  /// `arenas/{arenaId}.weatherPolicy` (padrão quando não existe).
  Stream<WeatherPolicy> watchPolicy(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(WeatherPolicy.defaults);
    return _firestore
        .collection('arenas')
        .doc(id)
        .snapshots()
        .map((snap) => WeatherPolicy.fromMap(snap.data()?['weatherPolicy']));
  }

  /// Pedido do atleta para a reserva. Sem permissão de leitura (pedido que não
  /// existe) conta como "sem pedido".
  Stream<WeatherRequest?> watchRequest(String bookingId) {
    final id = bookingId.trim();
    if (id.isEmpty) return Stream<WeatherRequest?>.value(null);
    return _nullOnError(
      _firestore
          .collection(requestsCollection)
          .doc(id)
          .snapshots()
          .map((snap) => WeatherRequest.fromMap(snap.id, snap.data())),
    );
  }

  /// Créditos do atleta em todas as arenas (o filtro por arena é no cliente).
  Stream<List<WeatherCredit>> watchCredits(String athleteId) {
    final uid = athleteId.trim();
    if (uid.isEmpty) return Stream.value(const <WeatherCredit>[]);
    return _firestore
        .collection(creditsCollection)
        .where('athleteId', isEqualTo: uid)
        .limit(100)
        .snapshots()
        .map(
          (snap) => [
            for (final doc in snap.docs)
              WeatherCredit.fromMap(doc.id, doc.data()),
          ],
        );
  }

  Future<WeatherChoiceResult> chooseOption({
    required String bookingId,
    required WeatherChoice choice,
    WeatherReschedulePick? reschedule,
  }) async {
    if (choice == WeatherChoice.reschedule && reschedule == null) {
      throw WeatherException('Escolha o novo horário.');
    }
    final data = await _call('chooseArenaWeatherOption', <String, dynamic>{
      'bookingId': bookingId.trim(),
      'choice': choice.name,
      if (choice == WeatherChoice.reschedule)
        'reschedule': reschedule!.toPayload(),
    });
    return WeatherChoiceResult(
      choice: choice,
      creditId: _text(data['creditId']),
      creditReais: _money(data['creditReais']),
      expiresAt: weatherDateOf(data['expiresAt']),
      newBookingId: _text(data['newBookingId']),
      newAmountReais: _money(data['newAmountReais']),
      coveredByCreditReais: _money(data['coveredByCreditReais']),
      dueOnsiteReais: _money(data['dueOnsiteReais']),
      leftoverCreditReais: _money(data['leftoverCreditReais']),
    );
  }

  Future<WeatherRequestResult> requestRelease({
    required String bookingId,
    String? note,
  }) async {
    final text = note?.trim() ?? '';
    final data = await _call('requestArenaWeatherRelease', <String, dynamic>{
      'bookingId': bookingId.trim(),
      if (text.isNotEmpty) 'note': text,
    });
    return WeatherRequestResult(
      status: data['status'] == 'approved'
          ? WeatherRequestStatus.approved
          : WeatherRequestStatus.pending,
      weather: WeatherReading.fromMap(data['weather']),
    );
  }

  Future<void> withdrawRequest({required String bookingId}) async {
    await _call('withdrawArenaWeatherRequest', <String, dynamic>{
      'bookingId': bookingId.trim(),
    });
  }

  Future<Map<String, dynamic>> _call(
    String name,
    Map<String, dynamic> payload,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call(payload);
      final data = result.data;
      return data is Map
          ? Map<String, dynamic>.from(data)
          : <String, dynamic>{};
    } on FirebaseFunctionsException catch (e) {
      throw mapWeatherFunctionsError(e.code, e.message);
    }
  }

  static Stream<T?> _nullOnError<T>(Stream<T?> source) {
    return source.transform(
      StreamTransformer<T?, T?>.fromHandlers(
        handleError: (error, stack, sink) => sink.add(null),
      ),
    );
  }
}

/// Erro de callable → mensagem para o atleta. `not-found` com a mensagem
/// genérica do SDK ("NOT FOUND") é callable não publicada.
WeatherException mapWeatherFunctionsError(String code, String? message) {
  String text(String fallback) => callableErrorMessage(code, message, fallback);
  switch (code) {
    case 'not-found':
      final msg = text('');
      if (msg.isEmpty) {
        return WeatherException(
          WeatherService.unavailableMessage,
          code: WeatherException.unavailableCode,
        );
      }
      return WeatherException(msg);
    case 'already-exists':
      return WeatherException(
        text('Esse horário acabou de ser reservado. Escolha outro.'),
        code: WeatherException.slotTakenCode,
      );
    case 'unauthenticated':
      return WeatherException('Faça login para continuar.');
    case 'permission-denied':
      return WeatherException(text('Só o dono da reserva pode fazer isso.'));
    case 'failed-precondition':
      return WeatherException(
          text('Não dá para fazer isso nesta reserva agora.'));
    case 'deadline-exceeded':
      return WeatherException(text('O prazo para essa escolha acabou.'));
    case 'invalid-argument':
      return WeatherException(text('Dados inválidos. Tente de novo.'));
    case 'unavailable':
      return WeatherException('Sem conexão com o servidor. Tente de novo.');
    default:
      return WeatherException(
          text('Não foi possível concluir. Tente de novo.'));
  }
}

String? _text(Object? raw) {
  if (raw is! String) return null;
  final t = raw.trim();
  return t.isEmpty ? null : t;
}

double _money(Object? raw) {
  if (raw is! num || !raw.isFinite || raw <= 0) return 0;
  return (raw * 100).roundToDouble() / 100;
}

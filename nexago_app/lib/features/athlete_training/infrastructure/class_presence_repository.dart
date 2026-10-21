import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/class_presence.dart';

/// Falha de uma ação do aluno na aula, com a mensagem do servidor pronta para
/// a tela (fora da aula, aula começada, longe da arena, sem vaga…).
class ClassPresenceException implements Exception {
  const ClassPresenceException(this.message, {this.code = ''});

  final String message;
  final String code;

  @override
  String toString() => message;
}

/// Presença do aluno nas aulas da turma, pelas callables de
/// `functions/src/arena-class-athlete-actions.ts` (as coleções de aula são só
/// da equipe — o servidor confere que o atleta está na aula).
class ClassPresenceRepository {
  ClassPresenceRepository({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  /// "Vou" (`reason` nulo) ou "Não vou" com motivo e mensagem opcional.
  Future<ClassRsvpResult> respond({
    required String sessionId,
    required bool going,
    String? reason,
    String? message,
  }) async {
    final raw = await _call(
        'respondArenaClassSession',
        {
          'sessionId': sessionId,
          'response': going ? 'going' : 'not_going',
          if (!going) 'reason': reason,
          if (!going && message != null && message.trim().isNotEmpty)
            'message': message.trim(),
        },
        'Não foi possível enviar sua resposta. Tente novamente.');
    return ClassRsvpResult.fromMap(raw);
  }

  /// Check-in pela localização do aparelho.
  Future<void> checkIn({
    required String sessionId,
    required double lat,
    required double lng,
    double? accuracy,
  }) =>
      _call(
          'checkInArenaClassSession',
          {
            'sessionId': sessionId,
            'lat': lat,
            'lng': lng,
            if (accuracy != null) 'accuracy': accuracy,
          },
          'Não foi possível fazer o check-in. Tente novamente.');

  /// Check-in pelo QR da quadra — `qr` é o texto lido, como veio da câmera.
  Future<void> checkInWithQr({
    required String sessionId,
    required String qr,
  }) =>
      _call(
          'checkInArenaClassSession',
          {'sessionId': sessionId, 'method': 'qr', 'qr': qr.trim()},
          'Não foi possível fazer o check-in. Tente novamente.');

  Future<List<ClassMakeupCredit>> fetchCredits() async {
    final raw = await _call('getMyClassCredits', const {},
        'Não foi possível carregar seus créditos.');
    final items = raw['items'];
    if (items is! List) return const [];
    return [
      for (final m in items.whereType<Map>())
        ClassMakeupCredit.fromMap(m.map((k, v) => MapEntry('$k', v))),
    ];
  }

  Future<List<ClassMakeupOption>> fetchMakeupOptions(String creditId) async {
    final raw = await _call('getMyClassMakeupOptions', {'creditId': creditId},
        'Não foi possível carregar as turmas para reposição.');
    final items = raw['options'];
    if (items is! List) return const [];
    return [
      for (final m in items.whereType<Map>())
        ClassMakeupOption.fromMap(m.map((k, v) => MapEntry('$k', v))),
    ];
  }

  Future<void> bookMakeup({
    required String creditId,
    required String sessionId,
  }) =>
      _call(
          'bookArenaClassMakeup',
          {
            'creditId': creditId,
            'sessionId': sessionId,
          },
          'Não foi possível marcar a reposição. Tente novamente.');

  /// Turma lotada: entra na fila. `true` = já estava na fila.
  Future<bool> joinWaitlist({
    required String creditId,
    required String classId,
  }) async {
    final raw = await _call(
        'joinArenaClassMakeupWaitlist',
        {
          'creditId': creditId,
          'classId': classId,
        },
        'Não foi possível entrar na fila. Tente novamente.');
    return raw['alreadyWaiting'] == true;
  }

  Future<Map<String, Object?>> _call(
    String name,
    Map<String, Object?> data,
    String fallback,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      final raw = result.data;
      return raw is Map ? raw.map((k, v) => MapEntry('$k', v)) : const {};
    } on FirebaseFunctionsException catch (e) {
      throw ClassPresenceException(
        callableErrorMessage(e.code, e.message, fallback),
        code: e.code,
      );
    }
  }
}

final classPresenceRepositoryProvider = Provider<ClassPresenceRepository>(
  (ref) => ClassPresenceRepository(),
);

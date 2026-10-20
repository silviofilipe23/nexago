import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/agenda/class_agenda_entry.dart';
import '../domain/agenda/class_charge_entry.dart';
import '../domain/agenda/teacher_class_roster.dart';

/// Falha da chamada do professor, com a mensagem do servidor pronta para a
/// tela (aula de outro professor, vínculo sem a permissão, aula cancelada…).
class TeacherClassException implements Exception {
  const TeacherClassException(this.message, {this.code = ''});

  final String message;
  final String code;

  @override
  String toString() => message;
}

/// Aulas da arena na agenda do atleta, pelas callables `getMyClassAgenda` e
/// `getMyClassCharges` (as coleções de aula são só da equipe da arena — o
/// atleta não lê direto).
class ClassAgendaRepository {
  ClassAgendaRepository({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  /// Intervalo padrão do servidor: 30 dias para trás, 35 para a frente.
  Future<List<ClassAgendaEntry>> fetchMyClasses() async {
    final result = await _functions
        .httpsCallable('getMyClassAgenda')
        .call<Object?>(const <String, Object?>{});
    final raw = result.data;
    final items = raw is Map ? raw['items'] : null;
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map(
          (m) => ClassAgendaEntry.fromMap(
            m.map((k, v) => MapEntry(k.toString(), v)),
          ),
        )
        .toList();
  }

  /// Lista da chamada de uma aula que dou como professor
  /// (`getMyClassSessionRoster`; só com o vínculo liberando a chamada).
  Future<TeacherClassRoster> fetchTeacherRoster(String sessionId) async {
    try {
      final result = await _functions
          .httpsCallable('getMyClassSessionRoster')
          .call<Object?>({'sessionId': sessionId});
      final raw = result.data;
      if (raw is! Map) {
        throw const TeacherClassException('Resposta inválida do servidor.');
      }
      return TeacherClassRoster.fromMap(
        raw.map((k, v) => MapEntry(k.toString(), v)),
      );
    } on FirebaseFunctionsException catch (e) {
      throw TeacherClassException(
        callableErrorMessage(e.code, e.message, _rosterFallback),
        code: e.code,
      );
    }
  }

  /// Grava a chamada pela mesma `saveArenaClassAttendance` da equipe — o
  /// servidor aceita o professor da aula com a permissão. `null` apaga a marca;
  /// [close] fecha a chamada (crédito de reposição e débito de pacote).
  Future<void> saveTeacherAttendance({
    required String sessionId,
    required Map<String, String?> marks,
    required bool close,
  }) async {
    try {
      await _functions.httpsCallable('saveArenaClassAttendance').call<Object?>({
        'sessionId': sessionId,
        'marks': marks,
        'close': close,
      });
    } on FirebaseFunctionsException catch (e) {
      throw TeacherClassException(
        callableErrorMessage(e.code, e.message, _saveFallback),
        code: e.code,
      );
    }
  }

  static const _rosterFallback =
      'Não foi possível abrir a chamada agora. Tente de novo em instantes.';
  static const _saveFallback =
      'Não foi possível salvar a chamada. Tente novamente.';

  /// Mensalidades em aberto, da que vence primeiro.
  Future<List<ClassChargeEntry>> fetchMyCharges() async {
    final result = await _functions
        .httpsCallable('getMyClassCharges')
        .call<Object?>(const <String, Object?>{});
    final raw = result.data;
    final items = raw is Map ? raw['items'] : null;
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map(
          (m) => ClassChargeEntry.fromMap(
            m.map((k, v) => MapEntry(k.toString(), v)),
          ),
        )
        .toList();
  }
}

final classAgendaRepositoryProvider = Provider<ClassAgendaRepository>(
  (ref) => ClassAgendaRepository(),
);

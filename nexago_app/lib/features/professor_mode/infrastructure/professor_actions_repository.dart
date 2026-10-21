import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/professor_actions.dart';
import '../domain/professor_cancel.dart';
import 'professor_students_repository.dart' show ProfessorStudentsException;

/// Aluno escolhido numa ação: com conta (`athleteId`) ou só da arena
/// (`studentId`, sem conta) — o servidor resolve nome e foto.
class ProfessorActionStudent {
  const ProfessorActionStudent({
    this.athleteId,
    this.studentId,
    required this.name,
  });

  final String? athleteId;
  final String? studentId;
  final String name;

  Map<String, Object?> toMap() => {
        if (athleteId != null) 'athleteId': athleteId,
        if (studentId != null) 'studentId': studentId,
        'name': name,
      };
}

/// Fase 2 do App do Professor: o professor da equipe age nas Aulas da arena
/// (callables; as coleções seguem fechadas à equipe nas rules).
abstract class ProfessorActionsRepository {
  Future<ProfessorActionsContext> fetchContext(String arenaId);

  Future<ProfessorEnrollmentPreview> previewEnrollment(
    ProfessorEnrollmentRequest request,
  );

  /// Devolve o id da matrícula.
  Future<String> enroll(ProfessorEnrollmentRequest request);

  Future<void> addTrial({
    required String sessionId,
    required ProfessorActionStudent student,
  });

  Future<void> addMakeup({required String sessionId, required String creditId});

  Future<void> addToWaitlist({
    required String classId,
    required ProfessorActionStudent student,
    String? note,
  });

  Future<void> removeFromWaitlist({
    required String classId,
    required String entryId,
  });

  Future<void> moveStudent({
    required String fromClassId,
    required String toClassId,
    required String studentId,
  });

  /// Devolve o nome da quadra escolhida pela arena.
  Future<String> createLesson({
    required String arenaId,
    required String type,
    required String date,
    required String startTime,
    required String endTime,
    required List<ProfessorActionStudent> students,
    String? sport,
  });

  /// Devolve quantos alunos foram avisados.
  Future<int> sendNotice({
    required List<String> sessionIds,
    required String message,
  });

  Future<ProfessorSessionCancelResult> cancelSession({
    required String sessionId,
    required String reason,
    required bool generateCredits,
    String? message,
  });

  /// Depois de cancelar a reserva da aula da carteira: avisa o aluno com o
  /// motivo (`notifyProfessorLessonCanceled`). Devolve se avisou.
  Future<bool> notifyLessonCanceled({
    required String bookingId,
    required String reason,
  });
}

class ProfessorEnrollmentRequest {
  const ProfessorEnrollmentRequest({
    required this.arenaId,
    required this.planId,
    required this.classId,
    required this.weekdays,
    required this.student,
    this.online = false,
    this.waitlistEntryId,
  });

  final String arenaId;
  final String planId;
  final String classId;
  final List<int> weekdays;
  final ProfessorActionStudent student;

  /// Cobrança online (link) — só quando a arena ligou nas Regras.
  final bool online;
  final String? waitlistEntryId;

  Map<String, Object?> toMap() => {
        'arenaId': arenaId,
        'planId': planId,
        'slots': [
          for (final d in weekdays) {'classId': classId, 'weekday': d}
        ],
        // O servidor troca pelo padrão das Regras no caminho do professor.
        'dueDay': 5,
        'billingMode': online ? 'asaas' : 'manual',
        if (waitlistEntryId != null) ...{
          'waitlistClassId': classId,
          'waitlistEntryId': waitlistEntryId,
        },
        ...student.toMap(),
      };
}

class FirebaseProfessorActionsRepository implements ProfessorActionsRepository {
  FirebaseProfessorActionsRepository({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  Future<Map<String, Object?>> _call(
    String name,
    Map<String, Object?> data,
    String fallback,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      final raw = result.data;
      return raw is Map
          ? raw.map((k, v) => MapEntry(k.toString(), v))
          : const <String, Object?>{};
    } on FirebaseFunctionsException catch (e) {
      throw ProfessorStudentsException(
        callableErrorMessage(e.code, e.message, fallback),
      );
    }
  }

  @override
  Future<ProfessorActionsContext> fetchContext(String arenaId) async =>
      ProfessorActionsContext.fromMap(await _call(
        'getProfessorClassActions',
        {'arenaId': arenaId},
        'Não foi possível carregar as turmas.',
      ));

  @override
  Future<ProfessorEnrollmentPreview> previewEnrollment(
    ProfessorEnrollmentRequest request,
  ) async =>
      ProfessorEnrollmentPreview.fromMap(await _call(
        'previewArenaClassEnrollment',
        request.toMap(),
        'Não foi possível calcular a cobrança.',
      ));

  @override
  Future<String> enroll(ProfessorEnrollmentRequest request) async {
    final out = await _call(
      'createArenaClassEnrollment',
      request.toMap(),
      'Não foi possível matricular.',
    );
    return out['enrollmentId']?.toString() ?? '';
  }

  @override
  Future<void> addTrial({
    required String sessionId,
    required ProfessorActionStudent student,
  }) =>
      _call(
        'addArenaClassExtra',
        {'sessionId': sessionId, 'kind': 'trial', ...student.toMap()},
        'Não foi possível encaixar a experimental.',
      );

  @override
  Future<void> addMakeup({
    required String sessionId,
    required String creditId,
  }) =>
      _call(
        'addArenaClassExtra',
        {'sessionId': sessionId, 'kind': 'makeup', 'creditId': creditId},
        'Não foi possível encaixar a reposição.',
      );

  @override
  Future<void> addToWaitlist({
    required String classId,
    required ProfessorActionStudent student,
    String? note,
  }) =>
      _call(
        'addArenaClassWaitlist',
        {
          'classId': classId,
          ...student.toMap(),
          if (note != null && note.isNotEmpty) 'note': note,
        },
        'Não foi possível pôr na lista de espera.',
      );

  @override
  Future<void> removeFromWaitlist({
    required String classId,
    required String entryId,
  }) =>
      _call(
        'removeArenaClassWaitlist',
        {'classId': classId, 'entryId': entryId},
        'Não foi possível tirar da lista de espera.',
      );

  @override
  Future<void> moveStudent({
    required String fromClassId,
    required String toClassId,
    required String studentId,
  }) =>
      _call(
        'moveArenaClassStudent',
        {
          'fromClassId': fromClassId,
          'toClassId': toClassId,
          'studentId': studentId,
        },
        'Não foi possível mover o aluno.',
      );

  @override
  Future<String> createLesson({
    required String arenaId,
    required String type,
    required String date,
    required String startTime,
    required String endTime,
    required List<ProfessorActionStudent> students,
    String? sport,
  }) async {
    final out = await _call(
      'createArenaClassLesson',
      {
        'arenaId': arenaId,
        'type': type,
        'date': date,
        'startTime': startTime,
        'endTime': endTime,
        'students': [for (final s in students) s.toMap()],
        if (sport != null && sport.isNotEmpty) 'sport': sport,
      },
      'Não foi possível agendar a aula.',
    );
    return out['courtName']?.toString() ?? 'Quadra';
  }

  @override
  Future<int> sendNotice({
    required List<String> sessionIds,
    required String message,
  }) async {
    final out = await _call(
      'sendArenaClassNotice',
      {'sessionIds': sessionIds, 'message': message},
      'Não foi possível enviar o aviso.',
    );
    final n = out['notified'];
    return n is num ? n.toInt() : 0;
  }

  @override
  Future<ProfessorSessionCancelResult> cancelSession({
    required String sessionId,
    required String reason,
    required bool generateCredits,
    String? message,
  }) async =>
      ProfessorSessionCancelResult.fromMap(await _call(
        'cancelArenaClassSession',
        {
          'sessionId': sessionId,
          'reason': reason,
          'generateCredits': generateCredits,
          if (message != null && message.isNotEmpty) 'message': message,
        },
        'Não foi possível cancelar a aula.',
      ));

  @override
  Future<bool> notifyLessonCanceled({
    required String bookingId,
    required String reason,
  }) async {
    final out = await _call(
      'notifyProfessorLessonCanceled',
      {'bookingId': bookingId, 'reason': reason},
      'Não foi possível avisar o aluno.',
    );
    return out['notified'] is num && (out['notified']! as num) > 0;
  }
}

final professorActionsRepositoryProvider = Provider<ProfessorActionsRepository>(
  (ref) => FirebaseProfessorActionsRepository(),
);

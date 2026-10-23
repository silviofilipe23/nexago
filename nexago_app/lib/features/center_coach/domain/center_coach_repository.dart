import 'center_alerts.dart';
import 'center_coach.dart';

/// Leituras e escritas do professor no centro (Firestore direto, nas rules do
/// portal; reposição pela callable).
abstract class CenterCoachRepository {
  /// Vínculos da conta em todos os centros (inclusive revogados — P9).
  Stream<List<CenterMembership>> watchMemberships(String uid);

  Stream<CenterCoachCenter?> watchCenter(String centerId);

  /// Aulas do centro de [fromKey] a [toKey] (o filtro por professor é na tela).
  Stream<List<CenterCoachSession>> watchSessions(
    String centerId, {
    required String fromKey,
    required String toKey,
  });

  Stream<CenterCoachSession?> watchSession(String centerId, String sessionId);

  /// Aulas de uma turma (histórico, P8), da mais recente para a mais antiga.
  Stream<List<CenterCoachSession>> watchClassSessions(
    String centerId,
    String classId, {
    required String fromKey,
    required String toKey,
  });

  Stream<List<CenterCoachClass>> watchClasses(String centerId);

  /// Alunos que o professor vê: todos (gestão) ou os dele (`coachUids`).
  Stream<List<CenterCoachStudent>> watchStudents(
    String centerId, {
    required String uid,
    required bool all,
  });

  /// Salva a chamada; [finalize] fecha a aula (os créditos saem no servidor).
  Future<void> saveAttendance({
    required String centerId,
    required CenterCoachSession session,
    required Map<String, CenterMark> marks,
    required List<String> makeupIds,
    required bool finalize,
    required String actorUid,
    required String actorName,
    required bool audit,
  });

  /// Corrige a marca de um aluno depois de finalizada, com justificativa.
  Future<void> correctAttendance({
    required String centerId,
    required CenterCoachSession session,
    required String studentId,
    required String studentName,
    required CenterMark to,
    required String reason,
    required String actorUid,
    required String actorName,
  });

  /// Matrículas do centro (gestão / recepção).
  Stream<List<CenterCoachEnrollment>> watchEnrollments(String centerId);

  /// Cobranças do centro (só com financeiro).
  Stream<List<CenterCoachInvoice>> watchInvoices(String centerId);

  /// Trilha de auditoria do centro, mais recente primeiro (só owner/admin).
  Stream<List<CenterAuditEntry>> watchAuditLogs(
    String centerId, {
    int limit = 100,
  });

  /// Cancela só esta aula (gestão): motivo para os alunos, auditoria e, com
  /// reposição automática, +1 crédito para cada aluno em [creditStudentIds].
  Future<void> cancelSession({
    required String centerId,
    required CenterCoachSession session,
    required String reason,
    required List<String> creditStudentIds,
    required String actorUid,
    required String actorName,
  });

  /// Check-in do aluno (recepção, gestão ou o professor da aula): pela
  /// carteirinha ([qr]) ou pelo cadastro ([studentId]). [force] registra
  /// mesmo com mensalidade em atraso.
  Future<CenterCheckinResult> checkIn({
    required String centerId,
    String? qr,
    String? studentId,
    bool force = false,
  });

  Future<List<MakeupCandidate>> makeupCandidates(
    String centerId,
    String sessionId,
  );
}

/// Erro de escrita/leitura do professor, com o texto para a tela.
/// [revoked] = o vínculo caiu (P9).
class CenterCoachException implements Exception {
  const CenterCoachException(this.message, {this.revoked = false});

  final String message;
  final bool revoked;

  @override
  String toString() => message;
}

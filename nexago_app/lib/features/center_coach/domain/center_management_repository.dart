import 'center_coach.dart';
import 'center_management.dart';

/// Quem age (vai na auditoria).
typedef CenterActor = ({String uid, String name});

/// Escritas e leituras da gestão do centro no app, com as mesmas rules e o
/// mesmo formato do portal (cada escrita leva a linha de `auditLogs`).
abstract class CenterManagementRepository {
  // Equipe (G17/G18)
  Stream<List<CenterTeamMember>> watchTeam(String centerId);
  Stream<List<CenterInvite>> watchInvites(String centerId);

  Future<void> invite({
    required String centerId,
    required String centerName,
    required String email,
    required String displayName,
    required String role,
    required List<String> programIds,
    required List<String> classIds,
    required CenterActor actor,
  });

  Future<void> cancelInvite({
    required String centerId,
    required CenterInvite invite,
    required CenterActor actor,
  });

  Future<void> revokeMember({
    required String centerId,
    required CenterTeamMember member,
    required String reason,
    required CenterActor actor,
  });

  Stream<List<CenterProgram>> watchPrograms(String centerId);

  // Novo aluno (W10 do portal)

  /// Cadastra o aluno (conta vinculada ou convite por e-mail) com a linha
  /// `student.added` da auditoria; devolve o id do aluno.
  Future<String> addStudent({
    required String centerId,
    required CenterNewStudentInput input,
    required CenterActor actor,
  });

  // Matrícula (G11–G13)
  Stream<List<CenterPlan>> watchPlans(String centerId);

  /// Matricula em transação com a turma (vaga lida fresca): turma cheia
  /// devolve [CenterEnrollFull] sem gravar nada. Com [canBill], a 1ª cobrança
  /// nasce junto.
  Future<CenterEnrollResult> enroll({
    required String centerId,
    required CenterCoachCenter center,
    required CenterCoachStudent student,
    required CenterCoachClass cls,
    required CenterPlan plan,
    required String startDate,
    required String today,
    required bool canBill,
    required CenterActor actor,
  });

  /// Entra na fila sem ocupar vaga (o contrato congela na oferta).
  Future<String> joinWaitlist({
    required String centerId,
    required CenterCoachStudent student,
    required CenterCoachClass cls,
    required CenterPlan plan,
    required String startDate,
    required CenterActor actor,
  });

  // Local da aula (L6)
  Stream<List<CenterLocation>> watchLocations(String centerId);
  Stream<List<CenterCourt>> watchCourts(String centerId);

  Future<void> changeSessionLocation({
    required String centerId,
    required CenterCoachSession session,
    required CenterLocation location,
    CenterCourt? court,
    required String reason,
    required CenterActor actor,
  });

  // Assinatura (R6)
  Stream<List<CenterSubscription>> watchStudentSubscriptions(
    String centerId,
    String studentId,
  );

  Future<void> scheduleSubscriptionCancel({
    required String centerId,
    required CenterSubscription subscription,
    required CenterActor actor,
  });

  Future<void> undoSubscriptionCancel({
    required String centerId,
    required CenterSubscription subscription,
    required CenterActor actor,
  });

  /// Gera (ou reaproveita) a cobrança do ciclo agora; devolve o link.
  Future<({String invoiceId, String invoiceUrl, bool generated})> chargeNow({
    required String centerId,
    required CenterSubscription subscription,
  });
}

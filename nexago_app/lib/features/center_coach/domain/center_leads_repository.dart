import 'center_leads.dart';
import 'center_management_repository.dart' show CenterActor;

/// Captação do centro (C6–C8): leitura e escrita direta de `leads` (rules:
/// gestão, recepção e `enroll_students`) e as callables da experimental.
abstract class CenterLeadsRepository {
  /// Interessados do centro, mais recentes primeiro (limite ~300).
  Stream<List<CenterLead>> watchLeads(String centerId);

  /// `settings/leads` (padrões do contrato sem o doc).
  Stream<CenterLeadSettings> watchSettings(String centerId);

  /// Cadastro no balcão (C7) com a linha `lead.created` da auditoria;
  /// devolve o id.
  Future<String> createLead({
    required String centerId,
    required CenterNewLeadInput input,
    required CenterActor actor,
  });

  /// `contacted` ou `lost` (com [lostReason]); a 1ª saída de `new` grava
  /// `firstContactAt`.
  Future<void> setStage({
    required String centerId,
    required CenterLead lead,
    required String stage,
    String? lostReason,
    required CenterActor actor,
  });

  /// Callable `scheduleTrainingCenterLeadTrial`; devolve o bookingId.
  Future<String> scheduleTrial({
    required String centerId,
    required String leadId,
    required String sessionId,
  });

  /// Callable `evaluateTrainingCenterTrial` (professor da aula ou equipe).
  Future<void> evaluateTrial({
    required String centerId,
    required String bookingId,
    required bool attended,
    String? level,
    String? classId,
    String note = '',
  });
}

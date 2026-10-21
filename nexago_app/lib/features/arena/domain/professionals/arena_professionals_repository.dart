import '../../../professor_links/domain/arena_professor_link.dart';
import '../../../professor_links/domain/professor_links_repository.dart';
import 'arena_professionals_logic.dart';

export '../../../professor_links/domain/professor_links_repository.dart'
    show ProfessorLinkException, ProfessorLinkResult;

/// Leitura e ações da ARENA (dono + gestor, área `perfil`) nos vínculos com
/// professores.
///
/// Leituras direto no Firestore (as rules liberam `arenaCanRead(arenaId,
/// 'perfil')`); toda transição passa pelas callables de
/// `functions/src/arena-professor-links.ts`, que respondem `{linkId, status}`.
/// Erro de callable chega como [ProfessorLinkException] com a mensagem em
/// português que o servidor devolveu.
abstract interface class ArenaProfessionalsRepository {
  /// Vínculos da arena (`arenaId == X`), todos os estados.
  Stream<List<ArenaProfessorLink>> watchArenaLinks(String arenaId);

  /// Um vínculo; `null` quando o doc não existe.
  Stream<ArenaProfessorLink?> watchLink(String linkId);

  /// Histórico do vínculo (todas as rodadas), em qualquer ordem.
  Stream<List<ArenaProfessorLinkEvent>> watchEvents(String linkId);

  /// Contas NexaGO pelo perfil público (mesma busca das Aulas).
  Future<List<ArenaProfessorCandidate>> searchAccounts(String term);

  /// `createArenaProfessorInvite` — também é o "Reenviar convite": o servidor
  /// marca o convite vencido como `EXPIRED` e reabre o mesmo doc.
  Future<ProfessorLinkResult> invite({
    required String arenaId,
    required String professorUserId,
    required ArenaProfessorLinkType type,
    required ArenaProfessorPermissions permissions,
    String? message,
  });

  /// `approveArenaProfessorRequest` com as permissões escolhidas na análise.
  Future<ProfessorLinkResult> approve({
    required String linkId,
    required ArenaProfessorPermissions permissions,
  });

  /// `rejectArenaProfessorRequest`.
  Future<ProfessorLinkResult> reject({required String linkId, String? reason});

  /// `suspendArenaProfessorLink` — [reason] é obrigatório no servidor.
  Future<ProfessorLinkResult> suspend({
    required String linkId,
    required String reason,
    String? details,
  });

  /// `reactivateArenaProfessorLink`.
  Future<ProfessorLinkResult> reactivate(String linkId);

  /// `endArenaProfessorLink` com `side: ARENA`.
  Future<ProfessorLinkResult> end({required String linkId, String? reason});

  /// `cancelArenaProfessorLink` com `side: ARENA` (só convite em aberto).
  Future<ProfessorLinkResult> cancelInvite(String linkId);

  /// `updateArenaProfessorPermissions` — patch parcial: só a chave enviada muda.
  Future<ProfessorLinkResult> updatePermission({
    required String linkId,
    required ArenaProfessorPermissionKey key,
    required bool value,
  });

  /// `updateArenaProfessorCourtDiscount` — desconto (%) inteiro 0–90 no
  /// aluguel de quadra reservado "como professor". Só com o vínculo `ACTIVE`
  /// ou `SUSPENDED`. [courtDiscountStartTime]/[courtDiscountEndTime] ("HH:mm",
  /// fim até "24:00") limitam a faixa do dia; as duas `null` = o dia todo.
  Future<ProfessorLinkResult> updateCourtDiscount({
    required String linkId,
    required int courtDiscountPercent,
    String? courtDiscountStartTime,
    String? courtDiscountEndTime,
  });
}

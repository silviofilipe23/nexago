import 'arena_professor_link.dart';
import 'professor_link_rules.dart';

/// Leitura e ações do PROFESSOR nos vínculos com arenas.
///
/// Leituras direto no Firestore (as rules liberam o próprio professor);
/// toda transição passa pelas callables de
/// `functions/src/arena-professor-links.ts`, que respondem `{linkId, status}`.
abstract interface class ProfessorLinksRepository {
  /// Vínculos do professor em todas as arenas (`professorUserId == uid`).
  Stream<List<ArenaProfessorLink>> watchMyLinks(String professorUserId);

  /// Um vínculo; `null` quando o doc não existe.
  Stream<ArenaProfessorLink?> watchLink(String linkId);

  /// Histórico do vínculo (todas as rodadas), em qualquer ordem — a tela
  /// ordena com `sortProfessorLinkEvents`.
  Stream<List<ArenaProfessorLinkEvent>> watchEvents(String linkId);

  /// Professores que a arena exibe na página pública.
  Stream<List<PublicArenaProfessor>> watchPublicProfessors(String arenaId);

  /// `requestArenaProfessorLink` — o uid vem da sessão no servidor.
  Future<ProfessorLinkResult> requestLink({
    required String arenaId,
    required ArenaProfessorLinkType type,
    String? message,
  });

  /// `respondToArenaProfessorInvite`.
  Future<ProfessorLinkResult> respondToInvite({
    required String linkId,
    required bool accept,
    String? reason,
  });

  /// `cancelArenaProfessorLink` com `side: PROFESSOR` (só pedido aguardando).
  Future<ProfessorLinkResult> cancelRequest(String linkId);

  /// `endArenaProfessorLink` com `side: PROFESSOR` (imediato).
  Future<ProfessorLinkResult> endLink({
    required String linkId,
    String? reason,
  });
}

class ProfessorLinkResult {
  const ProfessorLinkResult({required this.linkId, required this.status});

  final String linkId;
  final ArenaProfessorLinkStatus? status;
}

/// Erro com a copy do servidor pronta para a tela. [duplicate] quando o
/// pedido esbarrou num vínculo em aberto (M5); [status] = `details.status`
/// quando houver (ex.: `EXPIRED` ao responder convite vencido).
class ProfessorLinkException implements Exception {
  const ProfessorLinkException(
    this.message, {
    this.code = '',
    this.status,
    this.duplicate,
  });

  final String message;
  final String code;
  final ArenaProfessorLinkStatus? status;
  final ProfessorLinkDuplicate? duplicate;

  @override
  String toString() => message;
}

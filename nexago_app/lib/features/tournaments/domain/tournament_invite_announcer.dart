import 'tournament_partner_invite.dart';

/// Regras do anúncio automático de convite — a tela que abre sozinha ao entrar
/// no app quando existe convite de dupla/equipe esperando resposta.
///
/// Tudo aqui é puro e testável de propósito: o widget só orquestra store e
/// navegação; quem decide O QUE anunciar e QUANDO parar de anunciar é este
/// módulo. Espelha `shared/partner-invite/invite-announcement.ts` do portal do
/// atleta.

/// Próximo convite a anunciar, ou `null`.
///
/// Dois cortes, cada um respondendo a uma pergunta diferente:
///
/// - [announced] é o "uma vez por sessão" — respondeu ou adiou, não volta a
///   abrir enquanto o app estiver aberto.
/// - [sessionStartedAt] restringe o anúncio ao que o atleta já tinha ao
///   ENTRAR. O listener é ao vivo, então sem esse corte um convite que
///   chegasse no meio de um pagamento abriria uma tela por cima dele. Convite
///   novo acende o badge e o card; a tela dele é na próxima entrada.
///
/// Convite sem `createdAt` conta como antigo: doc sem o campo não é convite
/// recém-criado, e engolir para sempre seria pior que anunciar.
TournamentPartnerInvite? nextInviteToAnnounce({
  required List<TournamentPartnerInvite> pending,
  required Set<String> announced,
  required DateTime sessionStartedAt,
}) {
  final candidates = pending
      .where((invite) => invite.isPending && !invite.isExpired)
      .where((invite) => !announced.contains(invite.id))
      .where(
        (invite) =>
            !invite.hasCreatedAt ||
            !invite.createdAt.isAfter(sessionStartedAt),
      )
      .toList();
  if (candidates.isEmpty) return null;

  // O mais antigo primeiro: é o que está mais perto de expirar. Convite sem
  // data vai na frente pelo mesmo motivo — não dá para saber quanto já esperou.
  candidates.sort((a, b) {
    if (a.hasCreatedAt != b.hasCreatedAt) return a.hasCreatedAt ? 1 : -1;
    return a.createdAt.compareTo(b.createdAt);
  });
  return candidates.first;
}

/// Convite recebido para uma categoria específica, para o cartão dentro da
/// tela de inscrição — mesma posição que o portal web usa.
///
/// Diferente de [nextInviteToAnnounce], aqui não há corte de sessão: o atleta
/// está olhando justamente essa categoria, então o convite dela tem de
/// aparecer mesmo que tenha chegado agora.
TournamentPartnerInvite? receivedInviteForCategory({
  required List<TournamentPartnerInvite> pending,
  required String tournamentId,
  required String categoryId,
}) {
  if (tournamentId.trim().isEmpty || categoryId.trim().isEmpty) return null;
  for (final invite in pending) {
    if (!invite.isPending || invite.isExpired) continue;
    if (invite.tournamentId != tournamentId) continue;
    if (invite.categoryId != categoryId) continue;
    return invite;
  }
  return null;
}

/// Título da tela: "Bia te chamou pra dupla" / "…pra equipe Areia Quente".
String inviteAnnouncementTitle(TournamentPartnerInvite invite) {
  final who = invite.inviterName.trim().isEmpty
      ? 'Um atleta'
      : invite.inviterName.trim();
  if (!invite.isTeamInvite) return '$who te chamou pra dupla';
  final team = invite.teamName?.trim();
  if (team == null || team.isEmpty) return '$who te chamou pra equipe';
  return '$who te chamou pra equipe $team';
}

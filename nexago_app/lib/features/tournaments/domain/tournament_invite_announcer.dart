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

/// Convites que EU enviei e seguem pendentes nesta categoria.
///
/// O atleta pode convidar mais de uma pessoa — o primeiro aceite derruba os
/// demais no backend (`markStaleInvitesAfterAccept`), mas até lá todos
/// precisam aparecer com "cancelar". Antes o app guardava um convite só e os
/// outros ficavam invisíveis até expirar.
///
/// [excludeInviteId] tira da lista o convite que já está em destaque na tela.
List<TournamentPartnerInvite> sentPendingInvitesFor({
  required List<TournamentPartnerInvite> invites,
  required String tournamentId,
  required String categoryId,
  String? excludeInviteId,
}) {
  if (tournamentId.trim().isEmpty || categoryId.trim().isEmpty) {
    return const <TournamentPartnerInvite>[];
  }
  final result = invites
      .where((invite) => invite.isPending && !invite.isExpired)
      .where((invite) => invite.tournamentId == tournamentId)
      .where((invite) => invite.categoryId == categoryId)
      .where((invite) => invite.id != excludeInviteId?.trim())
      .toList();
  result.sort((a, b) => a.createdAt.compareTo(b.createdAt));
  return result;
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

const _minute = Duration(minutes: 1);
const _hour = Duration(hours: 1);
const _day = Duration(days: 1);

/// Iniciais do convidante — duas letras quando dá (`Silvio` → `SI`).
String inviteInitials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return 'AT';
  final first = parts.first;
  final second = parts.length > 1
      ? parts.last[0]
      : (first.length > 1 ? first[1] : '');
  return (first[0] + second).toUpperCase();
}

/// Idade do convite no canto do card: `AGORA`, `HÁ 12 MIN`, `HÁ 2 H`, `HÁ 3 D`.
String? inviteAgeLabel(
  DateTime? createdAt,
  DateTime now, {
  bool hasCreatedAt = true,
}) {
  if (createdAt == null || !hasCreatedAt) return null;
  final elapsed = now.difference(createdAt);
  if (elapsed < _minute) return 'AGORA';
  if (elapsed < _hour) return 'HÁ ${elapsed.inMinutes} MIN';
  if (elapsed < _day) return 'HÁ ${elapsed.inHours} H';
  return 'HÁ ${elapsed.inDays} D';
}

/// Prazo compacto do rodapé do card na home: `VENCE EM 1 DIA E 4 H`.
String? inviteExpiryHomeLabel(DateTime expiresAt, DateTime now) {
  final remaining = expiresAt.difference(now);
  if (remaining <= Duration.zero) return null;

  final days = remaining.inDays;
  final hours = remaining.inHours % 24;

  if (days >= 1) {
    if (hours > 0) {
      final dayWord = days == 1 ? 'DIA' : 'DIAS';
      return 'VENCE EM $days $dayWord E $hours H';
    }
    return days == 1 ? 'VENCE EM 1 DIA' : 'VENCE EM $days DIAS';
  }
  if (remaining.inHours >= 1) return 'VENCE EM ${remaining.inHours} H';
  final minutes = remaining.inMinutes.clamp(1, 59);
  return 'VENCE EM $minutes MIN';
}

/// Linha de apoio do card na home — espelha o protótipo do painel.
String inviteHomeCardSubtitle(TournamentPartnerInvite invite) {
  final closes =
      invite.isTeamInvite ? 'equipe estar fechada' : 'dupla estar fechada';
  return 'Ele já confirmou a parte dele. Falta só você pra $closes.';
}

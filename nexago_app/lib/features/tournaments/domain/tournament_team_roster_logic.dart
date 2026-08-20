/// Elenco de categoria de EQUIPE (trio/quarteto/quinteto) na tela de
/// inscrição: quem já está dentro, quantas vagas restam e quem pode sair.
///
/// Módulo puro — o widget só desenha, e a busca de perfis fica na camada de
/// dados. Espelha o elenco do portal do atleta.
library;

/// Uma linha do elenco.
class TournamentRosterMember {
  const TournamentRosterMember({
    required this.uid,
    required this.name,
    required this.isCaptain,
    required this.isMe,
    this.photoUrl,
  });

  final String uid;
  final String name;
  final String? photoUrl;
  final bool isCaptain;
  final bool isMe;
}

/// Monta o elenco na ordem de `participantUids`.
///
/// Perfil público pode não ter carregado (ou nem existir): a linha aparece
/// mesmo assim, com "Você"/"Atleta". Um elenco menor do que a equipe realmente
/// é seria pior que um nome genérico.
List<TournamentRosterMember> buildTeamRoster({
  required List<String> participantUids,
  required String? captainUid,
  required String? myUid,
  required Map<String, String> nameByUid,
  required Map<String, String> photoByUid,
}) {
  // Sem `captainUid` no doc, quem criou a equipe é o primeiro participante.
  final captain = (captainUid?.trim().isNotEmpty ?? false)
      ? captainUid!.trim()
      : (participantUids.isNotEmpty ? participantUids.first : null);

  return participantUids.map((uid) {
    final isMe = uid == myUid;
    final name = nameByUid[uid]?.trim();
    return TournamentRosterMember(
      uid: uid,
      name: (name != null && name.isNotEmpty)
          ? name
          : (isMe ? 'Você' : 'Atleta'),
      photoUrl: photoByUid[uid],
      isCaptain: uid == captain,
      isMe: isMe,
    );
  }).toList();
}

/// Vagas ainda convidáveis: elenco e convites pendentes contam como ocupadas —
/// senão o capitão manda mais convites do que a equipe comporta e o backend
/// recusa depois, sem o app ter avisado.
int remainingTeamInviteSlots({
  required int? teamSize,
  required int rosterCount,
  required int pendingInviteCount,
}) {
  if (teamSize == null) return 0;
  final left = teamSize - rosterCount - pendingInviteCount;
  return left < 0 ? 0 : left;
}

/// Integrante (não capitão) pode sair enquanto a própria cota não foi paga.
///
/// O capitão sai por outra porta (cancelar a inscrição): sair por aqui
/// deixaria a equipe sem dono. Dinheiro em jogo também fecha a saída — aí o
/// caminho é o pedido de cancelamento ao organizador, porque a plataforma não
/// estorna.
bool canLeaveTeamRegistration({
  required int? teamSize,
  required String? captainUid,
  required String? myUid,
  required bool isPaid,
  required List<String> sharePaidUids,
}) {
  if (teamSize == null) return false;
  final uid = myUid?.trim() ?? '';
  if (uid.isEmpty) return false;
  if ((captainUid?.trim() ?? '') == uid) return false;
  if (isPaid) return false;
  return !sharePaidUids.contains(uid);
}

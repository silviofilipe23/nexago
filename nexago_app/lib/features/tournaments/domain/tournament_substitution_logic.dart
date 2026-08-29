/// Substituição de atleta — lógica pura do lado do app.
///
/// Espelha a regra do backend (tournament-substitution-logic.ts): dupla troca
/// qualquer vaga; equipe (trio+) só pelo capitão, nunca a própria. O cliente
/// apenas ESCONDE a ação — o servidor é a autoridade.
library;

/// Vagas que [uid] pode pedir para substituir nesta inscrição.
/// Vazio = ação indisponível.
List<String> substitutionReplaceableUids({
  required List<String> participantUids,
  required String uid,
  required int? teamSize,
  required String? captainUid,
  required bool partnerPending,
  required bool bracketPublished,
}) {
  if (bracketPublished || partnerPending) return const [];
  if (!participantUids.contains(uid)) return const [];
  final isTeam = (teamSize ?? 2) >= 3;
  if (!isTeam) return participantUids;
  if (captainUid == null || uid != captainUid) return const [];
  return participantUids.where((id) => id != captainUid).toList();
}

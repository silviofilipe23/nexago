import type { AthleteTournamentRegistration } from '../../data/tournament-registrations-repository';

/** Vagas que `uid` pode pedir para substituir. Espelha a regra do backend
 *  (dupla: qualquer membro troca qualquer vaga; equipe: só o capitão, nunca a
 *  própria). O cliente só esconde a ação — o servidor é a autoridade. */
export function substitutionSlots(r: AthleteTournamentRegistration, uid: string | null): string[] {
  if (!uid || r.partnerPending || !r.participantUids.includes(uid)) return [];
  const isTeam = r.teamSize != null;
  if (!isTeam) return r.participantUids;
  if (r.captainUid !== uid) return [];
  return r.participantUids.filter((id) => id !== r.captainUid);
}

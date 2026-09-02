import type {
  AthleteTournamentRegistration,
  SentPartnerInvite,
} from '../../data/tournament-registrations-repository';

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

/** Papel da vaga no passo "quem sai" — quem lê é o próprio atleta, então a vaga
 *  dele é "Sua vaga", nunca o nome. Em equipe o capitão só troca integrantes. */
export function substitutionSlotRole(
  r: Pick<AthleteTournamentRegistration, 'teamSize' | 'captainUid'>,
  slotUid: string,
  uid: string | null,
): string {
  if (slotUid === uid) return 'Sua vaga';
  if (r.teamSize != null) return slotUid === r.captainUid ? 'Capitão' : 'Integrante';
  return 'Parceiro · confirmado';
}

/** Motivo declarado — espelha `SUBSTITUTION_REASONS`/`SUBSTITUTION_REASON_LABELS`
 *  de functions/src/tournament-substitution.ts. Mudou lá, mude aqui. */
export const SUBSTITUTION_REASONS = ['lesao', 'imprevisto', 'trabalho', 'viagem', 'outro'] as const;
export type SubstitutionReason = (typeof SUBSTITUTION_REASONS)[number];

export const SUBSTITUTION_REASON_LABELS: Record<SubstitutionReason, string> = {
  lesao: 'Lesão',
  imprevisto: 'Imprevisto pessoal',
  trabalho: 'Trabalho',
  viagem: 'Viagem',
  outro: 'Outro',
};

export const SUBSTITUTION_REASON_NOTE_MAX = 300;

/** Regra "inscrição já paga é mantida" — `null` quando ninguém pagou nada (a linha
 *  some do diálogo). Com pagamento integral cita o valor; com cota parcial só avisa
 *  que nada é cobrado de novo. Espelha `_paymentRuleSubtitle` do app. */
export function substitutionPaymentRule(
  r: Pick<AthleteTournamentRegistration, 'isPaid' | 'sharePaidUids' | 'teamSize'>,
  entryFeeLabel: string | null,
): string | null {
  const isTeam = r.teamSize != null;
  if (r.isPaid) {
    const split = isTeam ? 'o acerto é entre vocês' : 'o acerto da metade é entre vocês';
    return entryFeeLabel ? `Os ${entryFeeLabel} seguem valendo — ${split}` : `Nada é cobrado de novo — ${split}`;
  }
  if (r.sharePaidUids.length > 0) return 'Nada é cobrado de novo — o acerto é entre vocês';
  return null;
}

/** Convite de substituição ainda em aberto desta inscrição — o card troca o botão
 *  "Substituir atleta" pelo acompanhamento enquanto ele existir. O mais recente
 *  ganha se houver mais de um (duplicata transitória aceita no backend). */
export function pendingSubstitutionFor(
  invites: readonly SentPartnerInvite[],
  registrationId: string,
): SentPartnerInvite | null {
  const pending = invites.filter(
    (i) => i.isSubstitutionInvite && i.status === 'pending' && i.attachRegistrationId === registrationId,
  );
  if (pending.length === 0) return null;
  return pending.reduce((latest, i) =>
    (i.createdAt?.getTime() ?? 0) > (latest.createdAt?.getTime() ?? 0) ? i : latest,
  );
}

/** Tempo até `expiresAt` como o app mostra: "1d 04h", "05h 12min", "12min";
 *  `null` quando já venceu. */
export function substitutionDeadlineLabel(expiresAt: Date | null, now: Date): string | null {
  if (!expiresAt) return null;
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return null;
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes - days * 24 * 60 - hours * 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (days >= 1) return `${days}d ${pad(hours)}h`;
  if (hours >= 1) return `${pad(hours)}h ${pad(minutes)}min`;
  return `${minutes}min`;
}

/** Texto do lembrete que abre no WhatsApp SEM destinatário: quem convidou escolhe o
 *  contato. O portal nunca expõe telefone de atleta a atleta. */
export function substitutionReminderMessage(params: {
  inviteeName: string;
  replacedName: string;
  tournamentName: string;
  categoryName: string;
}): string {
  const first = firstNameOf(params.inviteeName);
  return (
    `Oi, ${first}! Te chamei pra entrar no lugar de ${params.replacedName} na categoria ` +
    `${params.categoryName} do ${params.tournamentName}. É só abrir o nexaGO e aceitar o convite ` +
    `pra fechar a troca.`
  );
}

export function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first.length > 0 ? first : 'Atleta';
}

/** Iniciais do avatar de fallback: "Ana Souza" → "AS", "Bia" → "B". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '?';
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
  return `${first}${last}`.toUpperCase();
}

/** "em 03/09" — quando a troca foi concluída. */
export function substitutionDateLabel(at: Date | null): string | null {
  if (!at) return null;
  const dd = at.getDate().toString().padStart(2, '0');
  const mm = (at.getMonth() + 1).toString().padStart(2, '0');
  return `em ${dd}/${mm}`;
}

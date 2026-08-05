/**
 * Lógica pura da inscrição "solo" (garantir vaga sem parceiro confirmado).
 *
 * Modelo: uma reserva solo é uma inscrição com `player1Id` (o dono),
 * `participantUids` de 1 atleta e `partnerPending: true`. Não há doc em `teams`
 * — uma dupla de 1 atleta não deve existir; a equipe nasce quando o parceiro
 * aceita o convite e a inscrição existente é PREENCHIDA em vez de duplicada.
 * (Solo legado: pode ter `teamId` com `player2Id` vazio.)
 *
 * Reservar solo não é "já estar inscrito": os dois lados do convite podem ter
 * uma reserva, e nesse caso elas se fundem em uma só (resolvePartnerRegistrationPlan).
 */

import {buildPairKey} from "./tournament-pair-uniqueness";
import type {
  ParsedCategoryRegistration,
  RegistrationConflictRole,
} from "./tournament-pair-uniqueness";

export interface InviterCategoryRegistration {
  registrationId: string;
  /** Vazio para inscrições solo novas (equipe só é criada no aceite). */
  teamId: string;
  /** O convidador é o player1 da inscrição. */
  isPlayer1: boolean;
  /** O convidador participa da inscrição (player1 ou player2). */
  isMember: boolean;
  /** Inscrição solo com vaga de parceiro em aberto. */
  partnerPending: boolean;
}

/**
 * Plano de inscrição da dupla, olhando os DOIS atletas ao mesmo tempo.
 *
 * Uma reserva solo (`partnerPending`) é vaga guardada, não dupla fechada — vale
 * igual para quem convida e para quem é convidado. Quando os dois reservaram
 * solo na mesma categoria, uma inscrição recebe a dupla e a outra é liberada.
 */
export type PartnerRegistrationPlan =
  | {kind: "create"}
  | {
      kind: "attach";
      /** Inscrição que recebe a dupla. */
      registrationId: string;
      /** Equipe existente ("" quando ela ainda será criada no aceite). */
      teamId: string;
      /** Reserva solo do outro atleta, liberada ao fechar a dupla ("" se não há). */
      releaseRegistrationId: string;
    }
  | {kind: "blocked"; reason: RegistrationConflictRole};

export function resolvePartnerRegistrationPlan(
  registrations: ParsedCategoryRegistration[],
  inviterUid: string,
  inviteeUid: string,
): PartnerRegistrationPlan {
  const inviter = inviterUid.trim();
  const invitee = inviteeUid.trim();
  const targetPairKey = buildPairKey(inviter, invitee);

  let inviterSolo: ParsedCategoryRegistration | null = null;
  let inviteeSolo: ParsedCategoryRegistration | null = null;
  let pairTaken = false;
  let inviterTaken = false;
  let inviteeTaken = false;

  for (const reg of registrations) {
    const hasInviter = reg.participantUids.includes(inviter);
    const hasInvitee = reg.participantUids.includes(invitee);
    if (!hasInviter && !hasInvitee) continue;

    if (reg.isComplete) {
      if (targetPairKey && reg.pairKey === targetPairKey) pairTaken = true;
      else if (hasInviter) inviterTaken = true;
      else inviteeTaken = true;
      continue;
    }

    // Incompleta: só é fundível se o dono for um dos dois. Sem dono
    // identificável (solo legado), volta a ser bloqueio.
    if (reg.ownerUid === inviter) inviterSolo ??= reg;
    else if (reg.ownerUid === invitee) inviteeSolo ??= reg;
    else if (hasInviter) inviterTaken = true;
    else inviteeTaken = true;
  }

  if (pairTaken) return {kind: "blocked", reason: "pair"};
  if (inviterTaken) return {kind: "blocked", reason: "inviter"};
  if (inviteeTaken) return {kind: "blocked", reason: "invitee"};

  const base = pickSurvivingRegistration(inviterSolo, inviteeSolo);
  if (!base) return {kind: "create"};

  const discarded = base === inviterSolo ? inviteeSolo : inviterSolo;
  // Duas reservas pagas viram duas taxas para uma vaga: fundir exigiria estorno.
  if (discarded?.isPaid && base.isPaid) {
    return {kind: "blocked", reason: "bothPaid"};
  }

  return {
    kind: "attach",
    registrationId: base.registrationId,
    teamId: base.teamId,
    releaseRegistrationId: discarded?.registrationId ?? "",
  };
}

/**
 * Qual das duas reservas solo sobrevive à fusão. Prioridade: a paga (dinheiro
 * nunca é descartado), depois a que está fora da fila de espera, depois a mais
 * antiga. Empate fica com a do convidante.
 */
function pickSurvivingRegistration(
  inviterSolo: ParsedCategoryRegistration | null,
  inviteeSolo: ParsedCategoryRegistration | null,
): ParsedCategoryRegistration | null {
  if (!inviterSolo || !inviteeSolo) return inviterSolo ?? inviteeSolo;
  if (inviterSolo.isPaid !== inviteeSolo.isPaid) {
    return inviterSolo.isPaid ? inviterSolo : inviteeSolo;
  }
  if (inviterSolo.waitlist !== inviteeSolo.waitlist) {
    return inviterSolo.waitlist ? inviteeSolo : inviterSolo;
  }
  const a = inviterSolo.createdAtMs;
  const b = inviteeSolo.createdAtMs;
  if (a != null && b != null && a !== b) return a < b ? inviterSolo : inviteeSolo;
  return inviterSolo;
}

/** Atleta já tem inscrição (completa ou solo) na categoria? (bloqueia registerSolo). */
export function athleteAlreadyRegistered(
  registrations: InviterCategoryRegistration[],
): boolean {
  return registrations.some((r) => r.isMember);
}

/**
 * Uma equipe está completa para o chaveamento (sem vaga de parceiro em aberto)?
 * Times solo (partnerPending / player2 vazio) NÃO entram na chave.
 */
export function isTeamCompleteForBracket(team: {
  player1Id?: unknown;
  player2Id?: unknown;
}): boolean {
  const p1 = typeof team.player1Id === "string" ? team.player1Id.trim() : "";
  const p2 = typeof team.player2Id === "string" ? team.player2Id.trim() : "";
  return p1.length > 0 && p2.length > 0;
}

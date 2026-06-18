/**
 * Lógica pura da inscrição "solo" (garantir vaga sem parceiro confirmado).
 *
 * Modelo: uma inscrição solo é um documento normal de inscrição com a equipe
 * tendo `player2Id` vazio e a flag `partnerPending: true`. A vaga é reservada.
 * Quando um parceiro aceita o convite, a inscrição existente é PREENCHIDA
 * (player2 + participante) em vez de criar uma nova.
 */

export interface InviterCategoryRegistration {
  registrationId: string;
  teamId: string;
  /** O convidador é o player1 da equipe. */
  isPlayer1: boolean;
  /** O convidador participa da equipe (player1 ou player2). */
  isMember: boolean;
  /** Inscrição solo com vaga de parceiro em aberto. */
  partnerPending: boolean;
}

export type InviteRegistrationAction =
  | {kind: "create"}
  | {kind: "attach"; registrationId: string; teamId: string}
  | {kind: "blocked"};

/**
 * Decide o que fazer ao enviar/aceitar um convite dada a situação do convidador:
 * - já tem dupla completa → bloqueia ("já inscrito");
 * - tem inscrição solo onde é player1 → ANEXA o convidado a ela;
 * - nenhuma → cria nova inscrição no aceite (fluxo clássico).
 */
export function resolveInviteRegistrationAction(
  registrations: InviterCategoryRegistration[],
): InviteRegistrationAction {
  for (const reg of registrations) {
    if (reg.isMember && !reg.partnerPending) {
      return {kind: "blocked"};
    }
  }
  for (const reg of registrations) {
    if (reg.partnerPending && reg.isPlayer1) {
      return {
        kind: "attach",
        registrationId: reg.registrationId,
        teamId: reg.teamId,
      };
    }
  }
  return {kind: "create"};
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

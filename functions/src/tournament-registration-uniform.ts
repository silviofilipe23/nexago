import {
  MIN_TEAM_CATEGORY_SIZE,
  extractTeamMemberUids,
  registrationTeamSize,
} from "./tournament-team-category";

/**
 * Onde o uniforme de um atleta é gravado na inscrição, e se ele pode gravar.
 *
 * Existem três destinos no doc da inscrição: os slots legados `*Player1` /
 * `*Player2` (dupla) e o mapa `uniformByUid.{uid}` (equipe trio+).
 *
 * A autorização NÃO pode depender do doc em `teams`: `registerSoloTournament`
 * cria a reserva sem equipe de propósito (uma dupla com 1 atleta não deve
 * existir — o doc nasce quando o parceiro aceita o convite). Enquanto a
 * inscrição está `partnerPending` a única fonte de verdade é ela mesma
 * (`player1Id` / `participantUids`).
 *
 * O fallback por índice em `participantUids` é o mesmo que os clientes já usam
 * pra LER o slot (`uniformSlotForRegistration` no app, `registration-progress`
 * no portal) — ler e gravar precisam concordar sobre qual slot é de quem.
 */

export type UniformSlot = "player1" | "player2" | "byUid";

function trimmed(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function participantUidsOf(
  registration: Record<string, unknown> | null | undefined,
): string[] {
  const raw = registration?.participantUids;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => trimmed(entry)).filter((entry) => entry.length > 0);
}

/** Inscrição de equipe nomeada (trio+) — uniforme por atleta, sem slot fixo. */
export function isTeamUniformRegistration(
  registration: Record<string, unknown> | null | undefined,
): boolean {
  return registrationTeamSize(registration, null) >= MIN_TEAM_CATEGORY_SIZE;
}

/**
 * Slot do uniforme de [uid] nesta inscrição, ou `null` quando ele não é um dos
 * atletas dela (o chamador transforma isso em `permission-denied`).
 *
 * [team] é o doc de `teams/{registration.teamId}` quando existe; em reserva
 * solo ele é `null` e a decisão sai da própria inscrição.
 */
export function resolveUniformSlot(
  registration: Record<string, unknown> | null | undefined,
  team: Record<string, unknown> | null | undefined,
  uid: string,
): UniformSlot | null {
  const caller = uid.trim();
  if (!registration || !caller) return null;

  const isTeamRegistration = isTeamUniformRegistration(registration);
  const hasTeam = trimmed(registration.teamId).length > 0;

  if (hasTeam && team) {
    const isPlayer1 = trimmed(team.player1Id) === caller;
    const isPlayer2 = trimmed(team.player2Id) === caller;
    const isMember =
      isTeamRegistration && extractTeamMemberUids(team).includes(caller);
    if (!isPlayer1 && !isPlayer2 && !isMember) return null;
    if (isTeamRegistration) return "byUid";
    return isPlayer1 ? "player1" : "player2";
  }

  // Reserva solo (ou equipe sem doc): a inscrição responde por si.
  const participants = participantUidsOf(registration);
  const player1Id = trimmed(registration.player1Id);
  if (player1Id !== caller && !participants.includes(caller)) return null;
  if (isTeamRegistration) return "byUid";
  if (player1Id === caller) return "player1";
  return participants[0] === caller ? "player1" : "player2";
}

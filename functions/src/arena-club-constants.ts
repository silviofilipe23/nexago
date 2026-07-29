/**
 * Clubinho — jogo aberto recorrente de arena (lista pública + PIX por sessão).
 * Constantes compartilhadas entre callables, materializador e webhook Asaas.
 */

export const ARENA_CLUBS = "arenaClubs";
export const ARENA_CLUB_SESSIONS = "arenaClubSessions";
/** Subcoleção de `arenaClubSessions/{sessionId}` — docId = uid do atleta. */
export const CLUB_PARTICIPANTS = "clubParticipants";

/** Horizonte rolante de materialização (dias) — igual ao mensalista. */
export const CLUB_HORIZON_DAYS = 35;

/**
 * Prefixo de `externalReference` das cobranças PIX de vaga no clubinho:
 * `arenaClubSession:{sessionId}:{athleteUid}`.
 */
export const ARENA_CLUB_SESSION_PAYMENT_REF_PREFIX = "arenaClubSession:";

export function clubSessionPaymentRef(sessionId: string, athleteUid: string): string {
  return `${ARENA_CLUB_SESSION_PAYMENT_REF_PREFIX}${sessionId}:${athleteUid}`;
}

/** Ids de sessão (`club_{clubId}_{date}`) e uid não contêm `:`. */
export function parseClubSessionPaymentRef(
  ref: string,
): {sessionId: string; athleteUid: string} | null {
  if (!ref.startsWith(ARENA_CLUB_SESSION_PAYMENT_REF_PREFIX)) return null;
  const rest = ref.slice(ARENA_CLUB_SESSION_PAYMENT_REF_PREFIX.length);
  const sep = rest.lastIndexOf(":");
  if (sep <= 0 || sep === rest.length - 1) return null;
  return {sessionId: rest.slice(0, sep), athleteUid: rest.slice(sep + 1)};
}

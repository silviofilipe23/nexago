/**
 * Constantes e leitura de prazo dos convites de inscrição. Vive num módulo
 * folha porque `tournament-partner-invite` (que as declarava) importa o release
 * e o prazo de garantia da vaga — e esses precisam da coleção sem fechar um
 * ciclo de imports.
 */

import {Timestamp} from "firebase-admin/firestore";

export const INVITES_COLLECTION = "tournamentRegistrationInvites";

/** Convite de dupla/equipe vale 48h. */
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

/** Vencimento do convite em ms, ou null quando o doc não declara prazo. */
export function inviteExpiresAtMs(
  invite: Record<string, unknown> | null | undefined,
): number | null {
  const expiresAt = invite?.expiresAt as Timestamp | undefined;
  if (!expiresAt || typeof expiresAt.toMillis !== "function") return null;
  return expiresAt.toMillis();
}

/** Convite pendente que ainda pode ser respondido. */
export function inviteIsLive(
  invite: Record<string, unknown> | null | undefined,
  nowMs: number,
): boolean {
  if (!invite || invite.status !== "pending") return false;
  const expiry = inviteExpiresAtMs(invite);
  return expiry == null || expiry >= nowMs;
}

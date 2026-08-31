/**
 * Prazo de garantia da vaga ("hold") na inscrição de torneio.
 *
 * O prazo mora na INSCRIÇÃO (`holdExpiresAt`), não no torneio: campo ausente
 * é imunidade permanente. É o que mantém fora da varredura, sem backfill nem
 * data de corte no código, três populações inteiras — as inscrições anteriores
 * a esta regra, as criadas pelo organizador e a fila de espera.
 *
 * O relógio só corre quando a vaga depende de alguém agir AGORA. Enquanto há
 * convite pendente vivo, o prazo acompanha o convite: o parceiro ainda tem as
 * 48h dele para responder, e só quando o convite morre (vence, é recusado ou
 * cancelado) — ou quando o elenco fecha — os minutos de pagamento começam.
 */

import {registrationCancellationBlockReason} from
  "./tournament-registration-cancellation";

export const DEFAULT_REGISTRATION_HOLD_MINUTES = 30;

/**
 * Margem sobre o vencimento da cobrança PIX. Sem ela o sweeper mataria uma
 * cobrança viva na última volta do relógio, e um pagamento em trânsito cairia
 * como órfão no webhook.
 */
export const PIX_HOLD_MARGIN_MS = 2 * 60 * 1000;

/**
 * Minutos de garantia do torneio, ou `null` quando o organizador desligou o
 * prazo. Torneio sem os campos vale 30 minutos: é assim que a regra nasce
 * ligada em todos sem escrever em nenhum.
 */
export function resolveRegistrationHoldMinutes(
  tournament: Record<string, unknown> | null | undefined,
): number | null {
  if (tournament && tournament.registrationHoldEnabled === false) return null;
  const raw = tournament?.registrationHoldMinutes;
  const n =
    typeof raw === "number" ? raw :
      typeof raw === "string" ? Number(raw) :
        Number.NaN;
  if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  return DEFAULT_REGISTRATION_HOLD_MINUTES;
}

/**
 * Instante em que a vaga cai: o convite vivo mais longe, quando há, mais os
 * minutos de garantia. Sem convite vivo, conta de agora.
 */
export function computeRegistrationHoldExpiryMs(params: {
  nowMs: number;
  holdMinutes: number;
  liveInviteExpiresAtMs?: number | null;
}): number {
  const invite = params.liveInviteExpiresAtMs ?? 0;
  const base = Math.max(params.nowMs, invite);
  return base + params.holdMinutes * 60 * 1000;
}

/** Cobrança PIX aberta empurra o prazo; nunca o encurta. */
export function extendHoldForPixMs(
  currentHoldMs: number | null | undefined,
  pixExpiresAtMs: number,
): number {
  return Math.max(currentHoldMs ?? 0, pixExpiresAtMs + PIX_HOLD_MARGIN_MS);
}

/**
 * A inscrição está sujeita ao prazo? Fila de espera não ocupa vaga, e qualquer
 * pagamento (integral, parcela ou declaração direta) compra a vaga de vez —
 * mesmo critério que barra o cancelamento pelo atleta.
 */
export function shouldTrackRegistrationHold(
  registration: Record<string, unknown> | null | undefined,
): boolean {
  if (!registration) return false;
  if (registration.waitlist === true) return false;
  return registrationCancellationBlockReason(registration) === null;
}

/**
 * Dono da inscrição, que responde por ela e por seus convites avulsos. A
 * inscrição criada no ACEITE não tem `player1Id` nem `captainUid` — daí o
 * primeiro participante como último recurso, para o dono nunca sair vazio (uid
 * vazio casaria com convite malformado).
 */
export function registrationOwnerUid(
  registration: Record<string, unknown> | null | undefined,
): string {
  const explicit = String(
    registration?.captainUid ?? registration?.player1Id ?? "",
  ).trim();
  if (explicit) return explicit;
  const participants = registration?.participantUids;
  if (Array.isArray(participants)) {
    for (const raw of participants) {
      const uid = String(raw ?? "").trim();
      if (uid) return uid;
    }
  }
  return "";
}

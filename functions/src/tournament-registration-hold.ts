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

import {organizerConfirmedShareUidsFromRegistration} from
  "./organizer-payment-share";

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

/** Por que esta inscrição já comprou a vaga e não tem mais prazo. */
export type RegistrationHoldImmunityReason =
  | "paid"
  | "settledAmount"
  | "organizerConfirmed";

/**
 * A vaga já foi COMPRADA? Só isso dá imunidade permanente ao prazo.
 *
 * Não é a mesma pergunta que `registrationCancellationBlockReason` responde.
 * Lá basta a ALEGAÇÃO de pagamento para travar o cancelamento pelo atleta —
 * conservador de propósito, para ninguém sumir em silêncio depois de dizer que
 * pagou. Aqui a pergunta é outra, e mais exigente: a vaga está paga a ponto de
 * ficar presa para sempre?
 *
 * Por isso `sharePaidUids` sozinho não vale. Em categoria GRATUITA
 * (`confirmFreeTournamentRegistration`) e na declaração de PARCELA do
 * pagamento direto (`reserveDirectOrganizerRegistration`), um atleta se marca
 * sozinho sem que dinheiro nenhum mude de mãos — um clique. Tratar isso como
 * pagamento devolvia exatamente o bug que o prazo veio matar: dupla
 * incompleta segurando a vaga para sempre.
 */
export function registrationHoldImmunityReason(
  registration: Record<string, unknown>,
): RegistrationHoldImmunityReason | null {
  // Inscrição fechada: o elenco inteiro pagou, declarou ou confirmou. Inclui
  // o solo que declarou o valor INTEGRAL para garantir a vaga sozinho.
  if (registration.isPaid === true) return "paid";
  // Dinheiro que a plataforma registrou: PIX pago (integral ou parcela) e a
  // baixa do organizador com valor.
  if ((Number(registration.paidAmount) || 0) > 0) return "settledAmount";
  // O organizador — quem RECEBE — deu baixa neste atleta. É dinheiro real que
  // correu fora da plataforma, e vale mesmo sem valor gravado (a baixa por
  // atleta não grava `paidAmount`). Diferente da declaração do próprio
  // atleta, que ninguém conferiu.
  if (organizerConfirmedShareUidsFromRegistration(registration).length > 0) {
    return "organizerConfirmed";
  }
  return null;
}

/**
 * A inscrição está sujeita ao prazo? Fila de espera não ocupa vaga, e vaga
 * comprada não tem prazo.
 */
export function shouldTrackRegistrationHold(
  registration: Record<string, unknown> | null | undefined,
): boolean {
  if (!registration) return false;
  if (registration.waitlist === true) return false;
  return registrationHoldImmunityReason(registration) === null;
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

/**
 * "Pagamento confirmado pelo app" de uma reserva de quadra (`arenaBookings/{id}`) — regra única,
 * usada pelo modelo comercial das arenas (contagem das faixas) e pelos recursos sociais da pelada
 * (placar, Stories e artes só com ≥ 50% pago pelo app).
 *
 * Fonte: `amountPaidOnlineReais`. Só os webhooks de pagamento gravam valor positivo nele, e só na
 * confirmação — PIX recebido, cartão autorizado, cada fatia do rateio (`FieldValue.increment`) —
 * em `asaas-arena-booking-webhook.ts` e no legado `mercadopago-arena-booking-webhook.ts`. As rules
 * não deixam cliente gravá-lo, e reserva presencial, manual, de aula/clubinho ou paga com crédito
 * de chuva nasce com 0. Cashback e desconto de embaixador entram (foram aplicados pelo app).
 *
 * Ficam de fora: pagamento presencial (nunca chega ao campo), pendente (ainda 0), e reserva
 * cancelada, expirada ou estornada — o cancelamento só troca o `status`, então o valor pago fica
 * no doc e precisa ser ignorado aqui.
 */

type Raw = Record<string, unknown>;

/** Status de reserva que não vale mais (cancelada pelo atleta/equipe, PIX vencido, estornada). */
export const INACTIVE_BOOKING_STATUSES: ReadonlySet<string> = new Set([
  "canceled",
  "cancelled",
  "expired",
  "refunded",
  "rejected",
]);

export interface ArenaBookingAppPayment {
  /** Reais com pagamento confirmado pelo app; 0 se nada foi pago pelo app ou a reserva não vale. */
  confirmedReais: number;
  /** Total da reserva (`amountReais`). */
  totalReais: number;
  /** Fração do total paga pelo app, de 0 a 1 (0 se o total não é positivo). */
  share: number;
  /** Reserva cancelada, expirada ou estornada. */
  cancelled: boolean;
}

function money(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
}

/** A reserva foi cancelada, expirou ou teve o pagamento estornado? */
export function isArenaBookingInactive(booking: Raw): boolean {
  const status = typeof booking["status"] === "string" ? booking["status"].trim().toLowerCase() : "";
  if (INACTIVE_BOOKING_STATUSES.has(status)) return true;
  const paymentStatus = typeof booking["paymentStatus"] === "string" ?
    booking["paymentStatus"].trim().toLowerCase() : "";
  return paymentStatus === "refunded" || booking["refundedAt"] != null;
}

export function arenaBookingAppPayment(booking: Raw): ArenaBookingAppPayment {
  const cancelled = isArenaBookingInactive(booking);
  const totalReais = money(booking["amountReais"]);
  const confirmedReais = cancelled ? 0 : money(booking["amountPaidOnlineReais"]);
  const share = totalReais > 0 ? Math.min(1, confirmedReais / totalReais) : 0;
  return {confirmedReais, totalReais, share, cancelled};
}

/** Reserva válida com algum pagamento confirmado pelo app (sinal, integral ou fatia do rateio). */
export function isArenaBookingPaidByApp(booking: Raw): boolean {
  return arenaBookingAppPayment(booking).confirmedReais > 0;
}

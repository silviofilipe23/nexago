/** Prefixo de `externalReference` / referência externa para cobranças de reserva de arena. */
export const ARENA_BOOKING_PAYMENT_REF_PREFIX = "arenaBooking:";

/** @deprecated Use ARENA_BOOKING_PAYMENT_REF_PREFIX */
export const ARENA_BOOKING_MP_REF_PREFIX = ARENA_BOOKING_PAYMENT_REF_PREFIX;

/** Prefixo de `externalReference` para PIX de inscrição em torneio (`{registrationId}:{payerUid}`). */
export const TOURNAMENT_REGISTRATION_PAYMENT_REF_PREFIX = "tournamentRegistration:";

/**
 * Janela da cobrança PIX de inscrição SEM prazo de vaga (inscrição imune ou
 * torneio com o prazo desligado). Com prazo, a cobrança vence junto com a
 * vaga — ver `computePixWindow`, que também recorta pelo fim das inscrições.
 */
export const TOURNAMENT_REGISTRATION_PIX_EXPIRY_MINUTES = 15;

/** Prefixo de `externalReference` para transferências PIX de saque de arena. */
export const ARENA_WITHDRAWAL_REF_PREFIX = "arenaWithdrawal:";

/** Prefixo de `externalReference` para transferências PIX de saque de organizador. */
export const ORGANIZER_WITHDRAWAL_REF_PREFIX = "organizerWithdrawal:";

/** Prefixo de `externalReference` para assinatura de plano de arena (`{arenaId}:{tier}`). */
export const ARENA_SUBSCRIPTION_REF_PREFIX = "arenaSubscription:";

/**
 * Prefixo de `externalReference` para fatia de split de pagamento de reserva
 * (`{bookingId}:{shareId}`, doc em `arenaBookings/{bookingId}/paymentShares/{shareId}`).
 */
export const ARENA_BOOKING_SHARE_PAYMENT_REF_PREFIX = "arenaBookingShare:";

/** Valor máximo (R$) para tentativa de PIX automático na solicitação do gestor. */
export const ARENA_WITHDRAWAL_AUTO_MAX_REAIS = 500;

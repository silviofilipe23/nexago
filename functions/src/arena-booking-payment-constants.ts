/** Prefixo de `externalReference` / referência externa para cobranças de reserva de arena. */
export const ARENA_BOOKING_PAYMENT_REF_PREFIX = "arenaBooking:";

/** @deprecated Use ARENA_BOOKING_PAYMENT_REF_PREFIX */
export const ARENA_BOOKING_MP_REF_PREFIX = ARENA_BOOKING_PAYMENT_REF_PREFIX;

/** Prefixo de `externalReference` para PIX de inscrição em torneio (`{registrationId}:{payerUid}`). */
export const TOURNAMENT_REGISTRATION_PAYMENT_REF_PREFIX = "tournamentRegistration:";

/** Prazo para concluir PIX da parcela de inscrição após gerar o QR. */
export const TOURNAMENT_REGISTRATION_PIX_EXPIRY_MINUTES = 15;

/** Prefixo de `externalReference` para transferências PIX de saque de arena. */
export const ARENA_WITHDRAWAL_REF_PREFIX = "arenaWithdrawal:";

/** Prefixo de `externalReference` para assinatura de plano de arena (`{arenaId}:{tier}`). */
export const ARENA_SUBSCRIPTION_REF_PREFIX = "arenaSubscription:";

/** Valor máximo (R$) para tentativa de PIX automático na solicitação do gestor. */
export const ARENA_WITHDRAWAL_AUTO_MAX_REAIS = 500;

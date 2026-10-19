/** Prazo para concluir PIX após criar reserva (`pending_payment`). */
export const ARENA_BOOKING_PAYMENT_EXPIRY_MINUTES = 5;

/**
 * Prazo do pagamento com CARTÃO, contado da criação da reserva: digitar o
 * cartão no checkout do Asaas (e passar pelo 3DS) não cabe nos 5 min do PIX.
 * Ancorado na criação — gerar a cobrança de novo não estica o horário preso.
 */
export const ARENA_BOOKING_CARD_PAYMENT_EXPIRY_MINUTES = 15;

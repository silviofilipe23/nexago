/**
 * Taxas da plataforma — fonte da verdade no servidor (nunca vindo do cliente).
 *
 * Modelo: percentual com piso mínimo por transação (o piso cobre o custo de
 * gateway ~R$1/PIX em valores baixos). A taxa incide sobre o valor pago online
 * e é sempre descontada do recebedor (arena/organizador recebe líquido); o
 * pagador (atleta) paga o mesmo valor.
 *
 * - Reservas: só arenas no plano gratuito (Essencial). Pro/Parceiro isentos
 *   (a mensalidade substitui a taxa) — o gate usa `isArenaEntitledPro`.
 * - Inscrições de torneio: todos os organizadores.
 */

// Local (evita import circular com mercadopago-arena-helpers, que consome estas taxas).
function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Taxa sobre reservas de arena no plano gratuito (%). */
export const BOOKING_FEE_PERCENT = 5;

/** Taxa sobre inscrições de torneio (%). */
export const TOURNAMENT_FEE_PERCENT = 8;

/** Piso mínimo da taxa por transação (R$). */
export const FEE_FLOOR_REAIS = 1.5;

/**
 * Taxa em reais para um valor pago: `max(piso, valor × %)`, nunca excedendo o
 * próprio valor (deixa ao menos R$0,01 para o recebedor) nem ficando negativa.
 */
export function computePlatformFeeReais(amountReais: number, percent: number): number {
  if (!(amountReais > 0) || !(percent > 0)) return 0;
  const pctFee = roundMoney((amountReais * percent) / 100);
  const withFloor = Math.max(FEE_FLOOR_REAIS, pctFee);
  const capped = Math.min(roundMoney(amountReais - 0.01), roundMoney(withFloor));
  return Math.max(0, capped);
}

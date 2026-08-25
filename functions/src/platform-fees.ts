/**
 * Taxas da plataforma — fonte da verdade no servidor (nunca vindo do cliente).
 *
 * Modelo: percentual com piso mínimo por transação (o piso cobre o custo de
 * gateway ~R$1/PIX em valores baixos). A taxa incide sobre o valor pago online
 * e é sempre descontada do recebedor (arena/organizador recebe líquido); o
 * pagador (atleta) paga o mesmo valor.
 *
 * - Reservas: todos os planos — 8% Starter, 6% Pro, 5% Elite; sem plano = 8%.
 *   Resolução em `arena-entitlement.resolveArenaBookingFeePercent`.
 * - Inscrições de torneio: todos os organizadores.
 */

// Local (evita import circular com mercadopago-arena-helpers, que consome estas taxas).
function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Taxa sobre reservas de arena por plano (%). Todos os planos pagam; arena sem
 * plano titular paga a taxa do Starter. Resolução em
 * `arena-entitlement.resolveArenaBookingFeePercent`.
 */
export const BOOKING_FEE_PERCENT_BY_TIER = {starter: 8, pro: 6, elite: 5} as const;

/** Taxa de reserva para arena sem plano titular (%). */
export const BOOKING_FEE_PERCENT_NO_PLAN = 8;

/** Taxa padrão sobre inscrições de torneio (%), sem comissão negociada. */
export const TOURNAMENT_FEE_PERCENT = 8;

/**
 * Teto de comissão negociada. Existe para que um valor corrompido ou gravado
 * por engano no cadastro não vire desconto arbitrário sobre o dinheiro do
 * organizador — fora da faixa, cai no padrão.
 */
export const MAX_COMMISSION_PERCENT = 20;

/** Faixa aceita para `organizers/{uid}.commissionPercent`. */
export function isValidCommissionPercent(percent: unknown): percent is number {
  return (
    typeof percent === "number" &&
    Number.isFinite(percent) &&
    percent >= 0 &&
    percent <= MAX_COMMISSION_PERCENT
  );
}

/**
 * Taxa de inscrição para um organizador: a comissão negociada em
 * `organizers/{uid}.commissionPercent` quando houver, senão o padrão.
 * Espelha `resolveArenaBookingFeePercent` (arena-entitlement).
 *
 * `organizer` é o doc de `organizers/{uid}`; ausente (organizador sem cadastro
 * pelo backoffice) resolve para o padrão, que é o comportamento de antes.
 */
export function resolveOrganizerTournamentFeePercent(
  organizer: Record<string, unknown> | null | undefined,
): number {
  const negotiated = organizer?.["commissionPercent"];
  return isValidCommissionPercent(negotiated) ? negotiated : TOURNAMENT_FEE_PERCENT;
}

/** Taxa sobre vagas de clubinho (%) — sem piso: tickets baixos (ex.: R$15). */
export const CLUB_FEE_PERCENT = 5;

/** Piso mínimo da taxa por transação (R$). */
export const FEE_FLOOR_REAIS = 1.5;

/** Tarifa fixa de saque PIX da carteira de arena (R$). Elite é isento. */
export const ARENA_WITHDRAWAL_FEE_REAIS = 1.75;

/**
 * Taxa em reais para um valor pago: `max(piso, valor × %)`, nunca excedendo o
 * próprio valor (deixa ao menos R$0,01 para o recebedor) nem ficando negativa.
 * `floorReais` permite reduzir/zerar o piso (clubinho usa 0).
 */
export function computePlatformFeeReais(
  amountReais: number,
  percent: number,
  options?: {floorReais?: number},
): number {
  if (!(amountReais > 0) || !(percent > 0)) return 0;
  const floorReais = options?.floorReais ?? FEE_FLOOR_REAIS;
  const pctFee = roundMoney((amountReais * percent) / 100);
  const withFloor = Math.max(floorReais, pctFee);
  const capped = Math.min(roundMoney(amountReais - 0.01), roundMoney(withFloor));
  return Math.max(0, capped);
}

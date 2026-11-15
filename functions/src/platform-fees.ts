/**
 * Taxas da plataforma — fonte da verdade no servidor (nunca vindo do cliente).
 *
 * Modelo: percentual com piso mínimo por transação (o piso cobre o custo de
 * gateway ~R$1/PIX em valores baixos). A taxa incide sobre o valor pago online
 * e é sempre descontada do recebedor (arena/organizador recebe líquido); o
 * pagador (atleta) paga o mesmo valor.
 *
 * - Arena (reservas, planos de horário, aulas, CRM, clubinho): padrão 8% Starter, 6% Pro, 5% Elite,
 *   8% sem plano e 5% no clubinho — editável no backoffice, com exceção por arena e produto.
 *   As constantes abaixo são só o padrão de código; quem cobra lê `arena-fees.loadArenaFeePercent`.
 * - Inscrições de torneio: todos os organizadores. Padrão editável e exceção por
 *   torneio em `tournament-fees.ts` (`resolveTournamentFeeRule`). Ali a regra pode
 *   pôr a taxa (ou metade dela) por cima do preço para o atleta ("Quem paga",
 *   `athleteFeeReais`); sem isso vale o de sempre: descontada do organizador.
 */

// Local (evita import circular com mercadopago-arena-helpers, que consome estas taxas).
function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Taxa padrão sobre o que a arena recebe online, por plano (%). Arena sem plano titular paga a
 * taxa do Starter. Só o padrão de código: o backoffice sobrepõe (`arena-fees.ts`).
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
 *
 * `organizer` é o doc de `organizers/{uid}`; ausente (organizador sem cadastro
 * pelo backoffice) resolve para o padrão, que é o comportamento de antes.
 * `defaultPercent` é o padrão editável no backoffice (`tournament-fees.ts`); a
 * cascata completa, com a exceção por torneio, é `resolveTournamentFeeRule`.
 */
export function resolveOrganizerTournamentFeePercent(
  organizer: Record<string, unknown> | null | undefined,
  defaultPercent: number = TOURNAMENT_FEE_PERCENT,
): number {
  const negotiated = organizer?.["commissionPercent"];
  return isValidCommissionPercent(negotiated) ? negotiated : defaultPercent;
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

/**
 * Taxas de torneio — espelho à mão de `functions/src/tournament-fees.ts` (padrão, limites,
 * validação e cascata) e de `computePlatformFeeReais` (`platform-fees.ts`). Mudou lá, muda aqui.
 *
 * Cascata da cobrança: exceção do torneio vigente > comissão do cadastro do organizador (com o
 * piso do padrão) > padrão da plataforma.
 *
 * Quem paga: o organizador (desconto no repasse; sem o campo, como sempre foi), o atleta (preço +
 * taxa) ou dividido (metade por cima do preço, metade do repasse). Na comissão do cadastro quem paga
 * é sempre o organizador.
 */

export type FeeMode = 'padrao' | 'custom' | 'isento';
export type FeeSource = 'tournament' | 'organizer' | 'default';
export type FeePayer = 'atleta' | 'organizador' | 'dividido';

export interface FeeRule {
  percent: number;
  floorReais: number;
  payer: FeePayer;
}

export interface ResolvedFeeRule extends FeeRule {
  source: FeeSource;
}

export interface TournamentFeeOverride extends FeeRule {
  mode: 'custom' | 'isento';
  reason: string;
  /** Último dia em que vale (`YYYY-MM-DD`, data civil de SP); `null` = enquanto o torneio existir. */
  until: string | null;
}

/** O que a tela edita no drawer. */
export interface FeeDraft {
  mode: FeeMode;
  percent: number;
  floorReais: number;
  /** Só vale na personalizada; nos outros modos acompanha a base. */
  payer: FeePayer;
  reason: string;
  until: string;
}

/** Sem `payer` gravado: o organizador paga, como antes do campo existir. */
export const DEFAULT_FEE_PAYER: FeePayer = 'organizador';
export const DEFAULT_FEE_RULE: FeeRule = { percent: 8, floorReais: 1.5, payer: DEFAULT_FEE_PAYER };
export const MAX_FEE_PERCENT = 20;
export const MAX_FEE_FLOOR_REAIS = 20;

export const FEE_REASONS = [
  'Parceria comercial',
  'Evento beneficente',
  'Campanha de lançamento',
  'Correção de cadastro',
] as const;

/** Ordem e rótulos do seletor (protótipo `TX_PAYERS`). */
export const FEE_PAYERS: ReadonlyArray<readonly [FeePayer, string]> = [
  ['atleta', 'Atleta'],
  ['organizador', 'Organizador'],
  ['dividido', 'Dividido'],
];

export const FEE_PAYER_LABEL: Record<FeePayer, string> = {
  atleta: 'Atleta',
  organizador: 'Organizador',
  dividido: 'Dividido',
};

export const NO_FEE: FeeRule = { percent: 0, floorReais: 0, payer: DEFAULT_FEE_PAYER };

type Raw = Record<string, unknown>;

function isObj(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function hasTwoDecimals(n: number): boolean {
  return Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
}

export function isValidFeePercent(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_FEE_PERCENT && hasTwoDecimals(v);
}

export function isValidFeeFloor(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_FEE_FLOOR_REAIS && hasTwoDecimals(v);
}

/** Mesma faixa de `isValidCommissionPercent` (servidor): fora dela, cai no padrão. */
export function isValidCommission(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_FEE_PERCENT;
}

export function isFeePayer(v: unknown): v is FeePayer {
  return v === 'atleta' || v === 'organizador' || v === 'dividido';
}

function payerOf(v: unknown): FeePayer {
  return isFeePayer(v) ? v : DEFAULT_FEE_PAYER;
}

export function isCivilDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return false;
  }
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Data civil de São Paulo (`YYYY-MM-DD`), a mesma do servidor. */
export function saoPauloToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function feeDefaultsFromRaw(raw: unknown): FeeRule {
  const data = isObj(raw) ? raw : {};
  return {
    percent: isValidFeePercent(data['percent']) ? data['percent'] : DEFAULT_FEE_RULE.percent,
    floorReais: isValidFeeFloor(data['floorReais']) ? data['floorReais'] : DEFAULT_FEE_RULE.floorReais,
    payer: payerOf(data['payer']),
  };
}

export function feeOverrideFromRaw(raw: unknown): TournamentFeeOverride | null {
  if (!isObj(raw)) {
    return null;
  }
  const until = isCivilDate(raw['until']) ? raw['until'] : null;
  const reason = typeof raw['reason'] === 'string' ? raw['reason'] : '';
  if (raw['mode'] === 'isento') {
    return { mode: 'isento', ...NO_FEE, reason, until };
  }
  if (raw['mode'] !== 'custom' || !isValidFeePercent(raw['percent']) || !isValidFeeFloor(raw['floorReais'])) {
    return null;
  }
  const payer = payerOf(raw['payer']);
  return { mode: 'custom', percent: raw['percent'], floorReais: raw['floorReais'], payer, reason, until };
}

export function isOverrideActive(override: TournamentFeeOverride, today: string): boolean {
  return override.until === null || today <= override.until;
}

/** A regra "padrão" do torneio, sem exceção: a comissão do cadastro do organizador, senão a plataforma. */
export function baseRule(commissionPercent: number | null, defaults: FeeRule): ResolvedFeeRule {
  return isValidCommission(commissionPercent)
    ? { percent: commissionPercent, floorReais: defaults.floorReais, payer: 'organizador', source: 'organizer' }
    : { ...defaults, source: 'default' };
}

export function resolveRule(
  override: TournamentFeeOverride | null,
  commissionPercent: number | null,
  defaults: FeeRule,
  today: string,
): ResolvedFeeRule {
  if (override && isOverrideActive(override, today)) {
    return { percent: override.percent, floorReais: override.floorReais, payer: override.payer, source: 'tournament' };
  }
  return baseRule(commissionPercent, defaults);
}

/** `computePlatformFeeReais`: `max(piso, valor × %)`, deixando ao menos R$ 0,01 ao organizador. */
export function feeReais(amountReais: number, rule: FeeRule): number {
  if (!(amountReais > 0) || !(rule.percent > 0)) {
    return 0;
  }
  const pctFee = roundMoney((amountReais * rule.percent) / 100);
  const capped = Math.min(roundMoney(amountReais - 0.01), roundMoney(Math.max(rule.floorReais, pctFee)));
  return Math.max(0, capped);
}

/** `athleteFeeReais` do servidor: toda a taxa, metade (centavo ímpar fica com o organizador) ou nada. */
export function athleteFeeReais(priceReais: number, rule: FeeRule): number {
  if (rule.payer === 'organizador') {
    return 0;
  }
  const feeCents = Math.round(feeReais(priceReais, rule) * 100);
  return (rule.payer === 'atleta' ? feeCents : Math.floor(feeCents / 2)) / 100;
}

/**
 * Por inscrição: a taxa da NexaGO, o que o atleta paga (preço + a parte dele) e o que o organizador
 * recebe (preço − a parte dele), antes da taxa do meio de pagamento.
 */
export function feeSplit(priceReais: number, rule: FeeRule): { fee: number; athlete: number; organizer: number } {
  const fee = feeReais(priceReais, rule);
  const athletePart = athleteFeeReais(priceReais, rule);
  return {
    fee,
    athlete: roundMoney(priceReais + athletePart),
    organizer: roundMoney(priceReais - (fee - athletePart)),
  };
}

export function draftOf(override: TournamentFeeOverride | null, base: FeeRule): FeeDraft {
  return {
    mode: override?.mode ?? 'padrao',
    percent: override?.mode === 'custom' ? override.percent : base.percent,
    floorReais: override?.mode === 'custom' ? override.floorReais : base.floorReais,
    payer: override?.mode === 'custom' ? override.payer : base.payer,
    reason: override?.reason ?? '',
    until: override?.until ?? '',
  };
}

/** Regra que o rascunho passaria a cobrar hoje. */
export function draftRule(draft: FeeDraft, base: FeeRule): FeeRule {
  if (draft.mode === 'isento') {
    return NO_FEE;
  }
  return draft.mode === 'custom' ? { percent: draft.percent, floorReais: draft.floorReais, payer: draft.payer } : base;
}

/** Mesma regra para a cobrança: % , mínimo e quem paga. */
export function sameRule(a: FeeRule, b: FeeRule): boolean {
  return a.percent === b.percent && a.floorReais === b.floorReais && a.payer === b.payer;
}

/** Mesmos campos que o servidor recusa (`tournamentFeeErrors`). */
export function draftIssues(draft: FeeDraft, today: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (draft.mode === 'custom') {
    if (!isValidFeePercent(draft.percent)) {
      out['percent'] = `Entre 0% e ${MAX_FEE_PERCENT}%, até duas casas.`;
    }
    if (!isValidFeeFloor(draft.floorReais)) {
      out['floorReais'] = `Entre R$ 0 e R$ ${MAX_FEE_FLOOR_REAIS}.`;
    }
  }
  if (draft.mode !== 'padrao') {
    if (!(FEE_REASONS as readonly string[]).includes(draft.reason)) {
      out['reason'] = 'Selecione o motivo para salvar.';
    }
    if (draft.until && (!isCivilDate(draft.until) || draft.until < today)) {
      out['until'] = 'Use hoje ou uma data futura.';
    }
  }
  return out;
}

export function defaultIssues(rule: FeeRule): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isValidFeePercent(rule.percent)) {
    out['percent'] = `Entre 0% e ${MAX_FEE_PERCENT}%, até duas casas.`;
  }
  if (!isValidFeeFloor(rule.floorReais)) {
    out['floorReais'] = `Entre R$ 0 e R$ ${MAX_FEE_FLOOR_REAIS}.`;
  }
  return out;
}

/** O que o servidor compara para dizer "nada mudou". */
export function sameDraft(a: FeeDraft, b: FeeDraft): boolean {
  if (a.mode !== b.mode) {
    return false;
  }
  if (a.mode === 'padrao') {
    return true;
  }
  const rule = a.mode === 'isento' || (a.percent === b.percent && a.floorReais === b.floorReais && a.payer === b.payer);
  return rule && a.reason === b.reason && (a.until || '') === (b.until || '');
}

// ── rótulos ─────────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function brl(reais: number): string {
  return BRL.format(reais).replace(/ /g, ' ');
}

export function pctLabel(percent: number): string {
  return `${String(percent).replace('.', ',')}%`;
}

/** `2026-12-31` → `31/12/2026`. */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

export function ruleLabel(rule: FeeRule): string {
  return rule.percent === 0 ? 'Isento' : pctLabel(rule.percent);
}

export const SOURCE_LABEL: Record<FeeSource, string> = {
  tournament: 'exceção',
  organizer: 'do cadastro',
  default: 'padrão',
};

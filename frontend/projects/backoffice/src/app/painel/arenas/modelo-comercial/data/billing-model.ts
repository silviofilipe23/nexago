/**
 * Modelo comercial das arenas (2027) — espelho de `functions/src/arena-billing-model.ts`, para a
 * tela validar e simular o rascunho enquanto edita. A gravação valida de novo no servidor
 * (`saveArenaBillingModel`); mexeu numa regra aqui, mexa lá também.
 */

export const MAX_TIERS = 8;
export const MAX_MIN_BOOKINGS = 100_000;
export const MAX_MONTHLY_FEE_CENTS = 10_000_00;
export const MAX_COMMISSION_PERCENT = 20;
export const MAX_NEW_ARENA_FREE_MONTHS = 24;
export const NOTE_MAX = 140;

export interface BillingTier {
  minBookings: number;
  monthlyFeeCents: number;
  commissionPercent: number;
}

export interface BillingModel {
  effectiveFrom: string;
  newArenaFreeMonths: number;
  tiers: BillingTier[];
}

/** Valores de exemplo (nunca salvos): a tela avisa enquanto ninguém definiu o modelo. */
export const DEFAULT_BILLING_MODEL: BillingModel = {
  effectiveFrom: '2027-01',
  newArenaFreeMonths: 3,
  tiers: [
    { minBookings: 0, monthlyFeeCents: 9900, commissionPercent: 8 },
    { minBookings: 30, monthlyFeeCents: 0, commissionPercent: 8 },
    { minBookings: 100, monthlyFeeCents: 0, commissionPercent: 6 },
    { minBookings: 200, monthlyFeeCents: 0, commissionPercent: 5 },
  ],
};

export interface MonthActivity {
  paidBookings: number;
  bookingVolumeCents: number;
  schedulePlanVolumeCents: number;
  currentFeeCents: number;
}

export const EMPTY_ACTIVITY: MonthActivity = {
  paidBookings: 0,
  bookingVolumeCents: 0,
  schedulePlanVolumeCents: 0,
  currentFeeCents: 0,
};

export type FreeReason = 'implantation' | 'new_arena';

export interface MonthBilling {
  billable: boolean;
  freeReason: FreeReason | null;
  firstBilledMonth: string;
  tierIndex: number;
  tier: BillingTier;
  monthlyFeeCents: number;
  commissionBaseCents: number;
  commissionCents: number;
  totalCents: number;
  dueCents: number;
  deltaVsCurrentCents: number;
  next: { tierIndex: number; bookingsMissing: number; commissionPercent: number; monthlyFeeCents: number } | null;
}

// ── mês ────────────────────────────────────────────────────────────────────

export function isMonthKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export function monthKeyOf(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(date)
    .slice(0, 7);
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** `2027-01` → `jan/2027`. */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]}/${y}`;
}

/** `2027-01` → `janeiro de 2027`. */
export function monthLongLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} de ${y}`;
}

// ── formatação ─────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function brlCents(cents: number): string {
  return BRL.format(cents / 100);
}

export function pctLabel(p: number): string {
  return `${p.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

export function bookingsLabel(n: number): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? 'reserva' : 'reservas'}`;
}

/** Intervalo da faixa: "0 a 29 reservas", "200 ou mais". */
export function tierRangeLabel(model: BillingModel, index: number): string {
  const from = model.tiers[index].minBookings;
  const next = model.tiers[index + 1];
  if (!next) {
    return `${from.toLocaleString('pt-BR')} ou mais`;
  }
  const to = next.minBookings - 1;
  return to <= from ? `${from.toLocaleString('pt-BR')}` : `${from.toLocaleString('pt-BR')} a ${to.toLocaleString('pt-BR')}`;
}

// ── validação ──────────────────────────────────────────────────────────────

function int(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function twoDecimals(v: number): boolean {
  return Math.abs(Math.round(v * 100) - v * 100) < 1e-6;
}

/**
 * Mensagem por campo (`tiers.1.commissionPercent` → texto). Mesmas regras do servidor: 1ª faixa
 * começa em 0, mínimos crescem, e comissão e mensalidade nunca sobem com mais reservas.
 */
export function modelIssues(model: BillingModel): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isMonthKey(model.effectiveFrom)) {
    out['effectiveFrom'] = 'Escolha o mês de início.';
  }
  if (!int(model.newArenaFreeMonths, 0, MAX_NEW_ARENA_FREE_MONTHS)) {
    out['newArenaFreeMonths'] = `De 0 a ${MAX_NEW_ARENA_FREE_MONTHS} meses, sem casas decimais.`;
  }
  if (model.tiers.length < 1 || model.tiers.length > MAX_TIERS) {
    out['tiers'] = `De 1 a ${MAX_TIERS} faixas.`;
  }
  model.tiers.forEach((t, i) => {
    const at = (f: string) => `tiers.${i}.${f}`;
    const prev = model.tiers[i - 1];
    if (i === 0 && t.minBookings !== 0) {
      out[at('minBookings')] = 'A primeira faixa começa em 0.';
    } else if (!int(t.minBookings, 0, MAX_MIN_BOOKINGS)) {
      out[at('minBookings')] = 'Número inteiro de reservas.';
    } else if (prev && t.minBookings <= prev.minBookings) {
      out[at('minBookings')] = `Precisa ser maior que ${prev.minBookings}.`;
    }
    if (!int(t.monthlyFeeCents, 0, MAX_MONTHLY_FEE_CENTS)) {
      out[at('monthlyFeeCents')] = 'Valor de R$ 0 a R$ 10.000.';
    } else if (prev && t.monthlyFeeCents > prev.monthlyFeeCents) {
      out[at('monthlyFeeCents')] = 'Não pode ser maior que a da faixa anterior.';
    }
    const p = t.commissionPercent;
    if (!Number.isFinite(p) || p < 0 || p > MAX_COMMISSION_PERCENT || !twoDecimals(p)) {
      out[at('commissionPercent')] = `De 0% a ${MAX_COMMISSION_PERCENT}%, até 2 casas.`;
    } else if (prev && p > prev.commissionPercent) {
      out[at('commissionPercent')] = 'Não pode ser maior que a da faixa anterior.';
    }
  });
  return out;
}

export function sameModel(a: BillingModel, b: BillingModel): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneModel(m: BillingModel): BillingModel {
  return { ...m, tiers: m.tiers.map((t) => ({ ...t })) };
}

/** Nova faixa ao fim: mínimo acima da última, mesma comissão, sem mensalidade. */
export function appendTier(m: BillingModel): BillingModel {
  const last = m.tiers[m.tiers.length - 1];
  const step = m.tiers.length > 1 ? last.minBookings - m.tiers[m.tiers.length - 2].minBookings : 30;
  return {
    ...m,
    tiers: [...m.tiers.map((t) => ({ ...t })), { minBookings: last.minBookings + Math.max(1, step), monthlyFeeCents: 0, commissionPercent: last.commissionPercent }],
  };
}

// ── cálculo ────────────────────────────────────────────────────────────────

export function tierIndexFor(model: BillingModel, paidBookings: number): number {
  let idx = 0;
  model.tiers.forEach((t, i) => {
    if (paidBookings >= t.minBookings) {
      idx = i;
    }
  });
  return idx;
}

export function firstBilledMonth(model: BillingModel, arenaStartMonth: string | null): string {
  if (!arenaStartMonth || !isMonthKey(arenaStartMonth) || arenaStartMonth < model.effectiveFrom) {
    return model.effectiveFrom;
  }
  return shiftMonth(arenaStartMonth, model.newArenaFreeMonths);
}

export function computeMonthBilling(
  model: BillingModel,
  month: string,
  activity: MonthActivity,
  arenaStartMonth: string | null = null,
): MonthBilling {
  const paid = Math.max(0, Math.floor(activity.paidBookings));
  const tierIndex = tierIndexFor(model, paid);
  const tier = model.tiers[tierIndex];
  const first = firstBilledMonth(model, arenaStartMonth);
  const billable = month >= first;
  const freeReason: FreeReason | null = billable ? null : month < model.effectiveFrom ? 'implantation' : 'new_arena';
  const commissionBaseCents =
    Math.max(0, Math.round(activity.bookingVolumeCents)) + Math.max(0, Math.round(activity.schedulePlanVolumeCents));
  const commissionCents = Math.round((commissionBaseCents * tier.commissionPercent) / 100);
  const totalCents = tier.monthlyFeeCents + commissionCents;
  const nextTier = model.tiers[tierIndex + 1];
  return {
    billable,
    freeReason,
    firstBilledMonth: first,
    tierIndex,
    tier,
    monthlyFeeCents: tier.monthlyFeeCents,
    commissionBaseCents,
    commissionCents,
    totalCents,
    dueCents: billable ? totalCents : 0,
    deltaVsCurrentCents: totalCents - Math.max(0, Math.round(activity.currentFeeCents)),
    next: nextTier
      ? {
          tierIndex: tierIndex + 1,
          bookingsMissing: nextTier.minBookings - paid,
          commissionPercent: nextTier.commissionPercent,
          monthlyFeeCents: nextTier.monthlyFeeCents,
        }
      : null,
  };
}

/** Modelo lido (doc ou retorno da callable); inválido vira o exemplo, como no servidor. */
export function modelFrom(raw: unknown): BillingModel {
  const m = raw as BillingModel | null;
  if (!m || typeof m !== 'object' || !Array.isArray(m.tiers)) {
    return cloneModel(DEFAULT_BILLING_MODEL);
  }
  const model: BillingModel = {
    effectiveFrom: m.effectiveFrom,
    newArenaFreeMonths: m.newArenaFreeMonths,
    tiers: m.tiers.map((t) => ({
      minBookings: t?.minBookings,
      monthlyFeeCents: t?.monthlyFeeCents,
      commissionPercent: t?.commissionPercent,
    })),
  };
  return Object.keys(modelIssues(model)).length === 0 ? model : cloneModel(DEFAULT_BILLING_MODEL);
}

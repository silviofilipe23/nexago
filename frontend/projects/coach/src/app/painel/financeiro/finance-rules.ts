export type PlanCycle = 'mensal' | 'trimestral' | 'anual';

export const CYCLE_MONTHS: Record<PlanCycle, number> = { mensal: 1, trimestral: 3, anual: 12 };
export const DEFAULT_INSTALLMENTS: Record<PlanCycle, number> = { mensal: 12, trimestral: 4, anual: 1 };
export const CYCLE_LABEL: Record<PlanCycle, string> = { mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };

const pad = (n: number) => String(n).padStart(2, '0');

/** Texto digitado em reais ("180", "180,50", "R$ 1.234,56", "19.90") → centavos; `null` se não for um valor. */
export function toCents(input: string): number | null {
  let s = input.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) {
    return null;
  }
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (!/^\d+\.\d{1,2}$/.test(s)) {
    // "1.234" / "1.234.567" são milhares; só "19.90" (1–2 casas) é decimal.
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return null;
  }
  const [int, frac = ''] = s.split('.');
  return Number(int) * 100 + Number(frac.padEnd(2, '0'));
}

/** `18050` → `"180,50"`; `123456` → `"1.234,56"`. */
export function fromCents(cents: number): string {
  const int = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${int},${pad(cents % 100)}`;
}

export function formatBRL(cents: number): string {
  return `R$ ${fromCents(cents)}`;
}

/** Para pré-preencher um campo de edição: sem separador de milhar. */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)},${pad(cents % 100)}`;
}

/** `2026-11-05` → `05/11/2026`. */
export function formatDate(iso: string): string {
  return iso.split('-').reverse().join('/');
}

/** `2026-11-05` → `05/11`. */
export function formatShortDate(iso: string): string {
  return iso.split('-').reverse().slice(0, 2).join('/');
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function addMonths(year: number, month: number, delta: number): [number, number] {
  const index = year * 12 + (month - 1) + delta;
  return [Math.floor(index / 12), (index % 12) + 1];
}

/** `YYYY-MM` do mês atual no fuso local. */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/** Soma `delta` meses a um `YYYY-MM`. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const [ny, nm] = addMonths(y!, m!, delta);
  return `${ny}-${pad(nm)}`;
}

/** Faixa de `dueDate` (inclusive) de um mês — `-31` serve até em fevereiro: a comparação é de texto. */
export function monthRange(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${month}-31` };
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Primeiro dia do período que vem depois de `lastPeriodKey` (`YYYY-MM`), pulando o passo do ciclo. */
export function nextPeriodStart(lastPeriodKey: string, cycle: PlanCycle): string {
  const [y, m] = lastPeriodKey.split('-').map(Number);
  const [ny, nm] = addMonths(y!, m!, CYCLE_MONTHS[cycle]);
  return ymd(ny, nm, 1);
}

export interface GenerateChargesInput {
  cycle: PlanCycle;
  amountCents: number;
  startDate: string;
  dueDay: number;
  /** Quantos períodos percorrer (os já existentes são pulados, então pode voltar menos). */
  count: number;
  /** `periodKey` das parcelas não canceladas do aluno. */
  existingPeriods: string[];
}

export interface GeneratedCharge {
  periodKey: string;
  dueDate: string;
  amountCents: number;
}

/**
 * Primeiro vencimento: o `dueDay` (limitado ao fim do mês) no mês de `startDate`; se já passou do início,
 * vai pro mês seguinte. Os demais somam o passo do ciclo, recalculando o dia a cada mês.
 */
export function generateCharges(input: GenerateChargesInput): GeneratedCharge[] {
  const [sy, sm] = input.startDate.split('-').map(Number);
  let [by, bm] = [sy!, sm!];
  if (ymd(by, bm, Math.min(input.dueDay, daysInMonth(by, bm))) < input.startDate) {
    [by, bm] = addMonths(by, bm, 1);
  }
  const existing = new Set(input.existingPeriods);
  const step = CYCLE_MONTHS[input.cycle];
  const out: GeneratedCharge[] = [];
  for (let k = 0; k < input.count; k++) {
    const [y, m] = addMonths(by, bm, k * step);
    const periodKey = `${y}-${pad(m)}`;
    if (existing.has(periodKey)) {
      continue;
    }
    out.push({
      periodKey,
      dueDate: ymd(y, m, Math.min(input.dueDay, daysInMonth(y, m))),
      amountCents: input.amountCents,
    });
  }
  return out;
}

export type ChargeState = 'pago' | 'cancelado' | 'atrasado' | 'pendente';

/** "Atrasado" não é gravado: é `pendente` com vencimento anterior a hoje (vence hoje ainda é pendente). */
export function chargeState(
  charge: { status: 'pendente' | 'pago' | 'cancelado'; dueDate: string },
  today: string,
): ChargeState {
  if (charge.status === 'pago') {
    return 'pago';
  }
  if (charge.status === 'cancelado') {
    return 'cancelado';
  }
  return charge.dueDate < today ? 'atrasado' : 'pendente';
}

interface MoneyCharge {
  status: 'pendente' | 'pago' | 'cancelado';
  dueDate: string;
  amountCents: number;
}

/** Recebido e a receber de um conjunto de parcelas (o chamador já filtrou o mês). */
export function monthTotals(charges: MoneyCharge[], today: string): { receivedCents: number; toReceiveCents: number } {
  let receivedCents = 0;
  let toReceiveCents = 0;
  for (const c of charges) {
    if (c.status === 'pago') {
      receivedCents += c.amountCents;
    } else if (c.status === 'pendente' && c.dueDate >= today) {
      toReceiveCents += c.amountCents;
    }
  }
  return { receivedCents, toReceiveCents };
}

/** Pendentes vencidas, de qualquer mês. */
export function overdueSummary(charges: MoneyCharge[], today: string): { count: number; cents: number } {
  const overdue = charges.filter((c) => c.status === 'pendente' && c.dueDate < today);
  return { count: overdue.length, cents: overdue.reduce((sum, c) => sum + c.amountCents, 0) };
}

/** Receita mensal prevista: trimestral ÷ 3, anual ÷ 12, só matrículas ativas. */
export function monthlyEquivalentCents(
  enrollments: { planId: string; status: 'ativa' | 'encerrada' }[],
  plans: { id: string; amountCents: number; cycle: PlanCycle }[],
): number {
  const byId = new Map(plans.map((p) => [p.id, p]));
  let total = 0;
  for (const e of enrollments) {
    const plan = byId.get(e.planId);
    if (e.status === 'ativa' && plan) {
      total += Math.round(plan.amountCents / CYCLE_MONTHS[plan.cycle]);
    }
  }
  return total;
}

export function collectionMessage(amountCents: number, dueDate: string): string {
  return `Olá! Lembrando da mensalidade de ${formatBRL(amountCents)}, com vencimento em ${formatShortDate(dueDate)}.`;
}

/**
 * Onde recomeça a série ao trocar de plano: no período da primeira parcela cancelada (pra não abrir
 * buraco), ou hoje se nada foi cancelado. `cancelledPeriods` são `YYYY-MM`.
 */
export function replacementStart(cancelledPeriods: string[], today: string): string {
  if (cancelledPeriods.length === 0) {
    return today;
  }
  return `${[...cancelledPeriods].sort()[0]}-01`;
}

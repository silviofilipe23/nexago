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

import { brl as brlBase } from '../aulas/billing.model';
import { isoWeekdayOf } from '../aulas/class.model';
import { WEEKDAY_SHORT } from './schedule-plan.model';

/** Formatação compartilhada das telas (não entra em teste: é só apresentação). */

export function brl(value: number): string {
  return brlBase(Math.round(value * 100) / 100);
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `2026-11-05` → `Qui · 5 nov`. */
export function weekdayDayMonth(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${WEEKDAY_SHORT[isoWeekdayOf(dateKey)] ?? ''} · ${d ?? ''} ${MONTHS_SHORT[(m ?? 1) - 1] ?? ''}`;
}

/** `2026-11-20` → `Sex 20/11`. */
export function weekdayShortDate(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${WEEKDAY_SHORT[isoWeekdayOf(dateKey)] ?? ''} ${d}/${m}`;
}

/** `2026-03` → `mar/2026`. */
export function monthYear(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  return `${MONTHS_SHORT[(m ?? 1) - 1] ?? ''}/${y ?? ''}`;
}

export function monthLong(date = new Date()): string {
  return date.toLocaleDateString('pt-BR', { month: 'long' });
}

/** Data e hora curtas: `05/11 às 19:30`. */
export function dateTimeShort(date: Date | null): string {
  if (!date) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} às ${hh}:${mi}`;
}

/** `12 set` a partir de um Date. */
export function dayMonth(date: Date | null): string {
  if (!date) return '—';
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS_SHORT[date.getMonth()]}`;
}

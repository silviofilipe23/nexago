/**
 * Datas do centro como "parede" (dia e hora locais do fuso do centro), nunca como instante UTC
 * formatado no fuso do navegador — o mesmo erro que já deslocou dia em `arenaSlots`.
 * `dayKey` = 'YYYY-MM-DD' no fuso do centro; horário = 'HH:mm'.
 */

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** 0 = domingo … 6 = sábado (mesma convenção de `Date#getDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

/** Ordem de exibição (semana começando na segunda). */
export const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Dia e hora de parede do instante `at` no fuso `tz`. */
export function wallClock(at: Date, tz = DEFAULT_TIMEZONE): { dayKey: string; time: string; weekday: Weekday } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const dayKey = `${get('year')}-${get('month')}-${get('day')}`;
  return { dayKey, time: `${get('hour')}:${get('minute')}`, weekday: weekdayOf(dayKey) };
}

export function todayKey(tz = DEFAULT_TIMEZONE, now = new Date()): string {
  return wallClock(now, tz).dayKey;
}

export function parseDayKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

/** Aritmética de calendário em UTC puro — só pra somar dias de um dayKey, sem fuso no meio. */
export function addDays(key: string, days: number): string {
  const { y, m, d } = parseDayKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function weekdayOf(key: string): Weekday {
  const { y, m, d } = parseDayKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

/** Segunda-feira da semana do dia. */
export function startOfWeek(key: string): string {
  const wd = weekdayOf(key);
  return addDays(key, wd === 0 ? -6 : 1 - wd);
}

export function monthKey(key: string): string {
  return key.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

export function monthLabel(month: string, long = false): string {
  const m = Number(month.slice(5, 7)) - 1;
  return long ? `${MONTHS_LONG[m]} ${month.slice(0, 4)}` : MONTHS_LONG[m]!.slice(0, 3);
}

/** '22 out' (ou '22 out 2026' com `withYear`). */
export function formatDayKey(key: string, withYear = false): string {
  const { y, m, d } = parseDayKey(key);
  return `${pad(d)} ${MONTHS_SHORT[m - 1]}${withYear ? ' ' + y : ''}`;
}

/** 'Qui 22 out'. */
export function formatDayWithWeekday(key: string): string {
  return `${WEEKDAY_SHORT[weekdayOf(key)]} ${formatDayKey(key)}`;
}

/** Instante → '22 out 16:02' no fuso do centro. */
export function formatInstant(at: Date | null, tz = DEFAULT_TIMEZONE): string {
  if (!at) {
    return '—';
  }
  const w = wallClock(at, tz);
  return `${formatDayKey(w.dayKey)} ${w.time}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesToTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function isValidDayKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return false;
  }
  return addDays(key, 0) === key;
}

/** Dias entre duas datas (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseDayKey(a);
  const pb = parseDayKey(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** Saudação pela hora de parede. */
export function greeting(time: string): string {
  const h = Number(time.slice(0, 2));
  if (h < 12) {
    return 'Bom dia';
  }
  return h < 18 ? 'Boa tarde' : 'Boa noite';
}

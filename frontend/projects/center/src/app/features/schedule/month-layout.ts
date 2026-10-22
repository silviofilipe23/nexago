import { addDays, monthKey, startOfWeek } from '../../domain/dates';

/** Quantas aulas cabem numa célula do mês antes do "+N". */
export const MONTH_CELL_LIMIT = 3;

export interface MonthCell<T> {
  day: string;
  /** Dia de outro mês (preenche a primeira/última semana). */
  outside: boolean;
  items: T[];
  more: number;
}

/**
 * Semanas (segunda → domingo) que cobrem o mês de `day`: 4 a 6 linhas de 7 dias. Os dias de fora
 * do mês ficam para a grade não "pular" de tamanho no meio da semana.
 */
export function monthWeeks(day: string): string[][] {
  const month = monthKey(day);
  let cursor = startOfWeek(`${month}-01`);
  const weeks: string[][] = [];
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  } while (monthKey(cursor) === month);
  return weeks;
}

/** Primeiro e último dia visíveis na grade do mês (inclui as bordas de outros meses). */
export function monthRange(day: string): { first: string; last: string } {
  const weeks = monthWeeks(day);
  return { first: weeks[0]![0]!, last: weeks[weeks.length - 1]![6]! };
}

/** Distribui as aulas (já filtradas) nas células, em ordem de horário, cortando em `limit`. */
export function monthCells<T extends { date: string; startTime: string }>(
  day: string,
  items: readonly T[],
  limit = MONTH_CELL_LIMIT,
): MonthCell<T>[][] {
  const month = monthKey(day);
  const byDay = new Map<string, T[]>();
  for (const it of [...items].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    const list = byDay.get(it.date) ?? [];
    list.push(it);
    byDay.set(it.date, list);
  }
  return monthWeeks(day).map((week) =>
    week.map((d) => {
      const all = byDay.get(d) ?? [];
      return { day: d, outside: monthKey(d) !== month, items: all.slice(0, limit), more: Math.max(0, all.length - limit) };
    }),
  );
}

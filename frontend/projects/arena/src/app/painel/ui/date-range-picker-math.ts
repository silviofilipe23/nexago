export interface MonthGridDay {
  dateKey: string;
  day: number;
  inMonth: boolean;
}

export const MONTH_LABELS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** ISO: 1=segunda … 7=domingo (mesma convenção do resto do horário fixo). */
function isoWeekday(year: number, month: number, day: number): number {
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=dom … 6=sáb
  return ((jsDay + 6) % 7) + 1;
}

/** Grade de 6 semanas (42 dias) começando na segunda, incluindo dias do mês
 *  anterior/seguinte pra preencher a primeira/última semana. `month` é 1-12. */
export function buildMonthGrid(year: number, month: number): MonthGridDay[] {
  const firstWeekday = isoWeekday(year, month, 1);
  const start = new Date(Date.UTC(year, month - 1, 1));
  start.setUTCDate(start.getUTCDate() - (firstWeekday - 1));

  const days: MonthGridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push({
      dateKey: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1 && d.getUTCFullYear() === year,
    });
  }
  return days;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

export function formatDateKeyPtBr(dateKey: string): string {
  const [y, m, d] = dateKey.split('-');
  return d && m && y ? `${d}/${m}/${y}` : dateKey;
}

import { saoPauloParts, type BlogPost, type BlogStatus } from './blog-post';

/** Calendário editorial (`painel/conteudo/blog/calendario`): mês em São Paulo, semana de domingo. */

export const MONTH_NAMES = [
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
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAY_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export interface MonthRef {
  year: number;
  /** 1–12. */
  month: number;
}

export interface CalendarEntry {
  id: string;
  title: string;
  status: BlogStatus;
  /** "09:00" só no agendado (a hora em que vai ao ar). */
  time: string | null;
  /** Para ordenar dentro do dia. */
  at: number;
}

export interface CalendarDay {
  /** 'YYYY-MM-DD' de São Paulo. */
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  entries: CalendarEntry[];
}

const pad = (n: number) => String(n).padStart(2, '0');

export function monthOf(d: Date): MonthRef {
  const p = saoPauloParts(d);
  return { year: p.year, month: p.month };
}

export function shiftMonth(m: MonthRef, delta: number): MonthRef {
  const index = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthLabel(m: MonthRef): string {
  return `${MONTH_NAMES[m.month - 1]} ${m.year}`;
}

/** "2026-11" ↔ mês; formato estranho → `null`. */
export function parseMonthParam(raw: string | null): MonthRef | null {
  const match = /^(\d{4})-(\d{2})$/.exec(raw ?? '');
  if (!match) {
    return null;
  }
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year: Number(match[1]), month } : null;
}

export function monthParam(m: MonthRef): string {
  return `${m.year}-${pad(m.month)}`;
}

/** Posts com `publishAt` por dia de São Paulo, na ordem da hora. */
export function entriesByDay(posts: readonly BlogPost[]): Map<string, CalendarEntry[]> {
  const byDay = new Map<string, CalendarEntry[]>();
  for (const post of posts) {
    if (!post.publishAt) {
      continue;
    }
    const p = saoPauloParts(post.publishAt);
    const list = byDay.get(p.date) ?? [];
    list.push({
      id: post.id,
      title: post.title || 'Sem título',
      status: post.status,
      time: post.status === 'scheduled' ? p.time : null,
      at: post.publishAt.getTime(),
    });
    byDay.set(p.date, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.at - b.at);
  }
  return byDay;
}

/** Sem `publishAt`: rascunhos e revisões sem data planejada (o editado mais recente primeiro). */
export function undatedPosts(posts: readonly BlogPost[]): BlogPost[] {
  return posts
    .filter((p) => !p.publishAt)
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
}

/** Grade do mês em semanas completas (domingo a sábado), com os dias de fora esmaecidos. */
export function monthGrid(m: MonthRef, entries: Map<string, CalendarEntry[]>, now: Date): CalendarDay[][] {
  const today = saoPauloParts(now).date;
  // Datas civis puras em UTC: só servem para contar dias e dias da semana, sem fuso.
  const first = new Date(Date.UTC(m.year, m.month - 1, 1));
  const start = new Date(first.getTime() - first.getUTCDay() * 86_400_000);
  const daysInMonth = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
  const weeks = Math.ceil((first.getUTCDay() + daysInMonth) / 7);
  const grid: CalendarDay[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start.getTime() + (w * 7 + d) * 86_400_000);
      const key = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
      week.push({
        key,
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === m.month - 1,
        isToday: key === today,
        entries: entries.get(key) ?? [],
      });
    }
    grid.push(week);
  }
  return grid;
}

/** "terça, 12" — título do dia na lista das telas estreitas. */
export function dayHeading(key: string): string {
  const [y, mo, d] = key.split('-').map(Number);
  const weekday = new Date(Date.UTC(y!, mo! - 1, d!)).getUTCDay();
  return `${WEEKDAY_LONG[weekday]}, ${d}`;
}

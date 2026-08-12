/** "Que dia do evento é hoje" — compartilhado pela casca de abas e pela casca do Focus.
 *  Comparação sempre pelos componentes locais do dia (meia-noite a meia-noite), nunca pela
 *  diferença bruta em milissegundos entre dois instantes: à noite do primeiro dia já se
 *  passaram mais de 24h desde a meia-noite anterior, e uma conta ingênua (ms / 86400000)
 *  empurraria o evento pro "dia 2" sem o dia ter virado de verdade. */

const DAY_MS = 86_400_000;

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export interface EventDay {
  current: number;
  total: number;
}

/** "dia 2 de 3" — só quando o torneio ocupa mais de um dia E `now` cai dentro da janela do
 *  evento (do início do primeiro dia ao fim do último). `null` no evento de um dia só (não faz
 *  sentido dizer "dia 1 de 1") e fora da janela (antes de começar ou depois de encerrado). */
export function eventDayOf(start: Date | null | undefined, end: Date | null | undefined, now: Date): EventDay | null {
  if (!start || !end) return null;
  const total = Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS) + 1;
  if (total <= 1) return null;
  if (now < startOfDay(start) || now > endOfDay(end)) return null;
  const current = Math.round((startOfDay(now).getTime() - startOfDay(start).getTime()) / DAY_MS) + 1;
  return { current, total };
}

import { saoPauloDateKey } from './tournament-live.selectors';

/** "Que dia do evento é hoje" — compartilhado pela casca de abas e pela casca do Focus.
 *  Comparação sempre pelos componentes locais do dia (meia-noite a meia-noite) em vez da
 *  diferença bruta em milissegundos entre dois instantes: à noite do primeiro dia já se
 *  passaram mais de 24h desde a meia-noite anterior, e uma conta ingênua (ms / 86400000)
 *  empurraria o evento pro "dia 2" sem o dia ter virado de verdade.
 *
 *  "Local" aqui é SEMPRE São Paulo — o fuso canônico do torneio, igual ao resto do app
 *  (`saoPauloDateKey` em `tournament-live.selectors.ts`) — nunca o fuso do dispositivo do
 *  atleta. O Brasil cobre quatro fusos: às 23h30 em Manaus já são 00h30 em São Paulo, e um
 *  atleta lá veria "Dia 1 de 2" depois que o dia 2 já começou se a conta usasse os componentes
 *  locais do aparelho dele em vez dos de São Paulo. */

const DAY_MS = 86_400_000;

/** São Paulo não observa horário de verão desde 2019 — o deslocamento de UTC é sempre -03:00 o
 *  ano inteiro, o que permite reconstruir a meia-noite local a partir só dos componentes de
 *  calendário (`saoPauloDateKey`), sem precisar de uma biblioteca de fusos horários. */
const SAO_PAULO_UTC_OFFSET_HOURS = 3;

function saoPauloMidnightUtc(date: Date): Date {
  const [year, month, day] = saoPauloDateKey(date).split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));
}

export function startOfDay(date: Date): Date {
  return saoPauloMidnightUtc(date);
}

export function endOfDay(date: Date): Date {
  return new Date(saoPauloMidnightUtc(date).getTime() + DAY_MS - 1);
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

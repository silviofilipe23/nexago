import { arenaSlotIsAvailable, isPastSlot, type ArenaSlot } from '@nexago/arena-discovery';

/** Quantidade de chips do strip padrão de datas (offsets 0..29 a partir de hoje). */
export const STRIP_DAYS = 30;

/** Offset máximo, em dias a partir de hoje, que o atleta pode selecionar.
 *  Um dia a menos que RECURRING_HORIZON_DAYS/CLUB_HORIZON_DAYS (35) das Cloud Functions,
 *  de propósito: esse horizonte não é um teto estático, é uma janela rolante avançada
 *  pelos materializadores agendados (03:00/03:10 horário de SP), não à meia-noite. A data
 *  local do cliente pode estar à frente da data em SP (entre 00:00 e 03:00 em SP, ou o dia
 *  todo em fusos a leste de UTC-3), então usar 35 aqui deixaria o cliente oferecer D+36
 *  quando só D+35 foi materializado — o dia apareceria livre mesmo com série contratada em
 *  cima. Mantemos 1 dia de folga em vez de replicar o cálculo de fuso do servidor no cliente. */
export const MAX_HORIZON_DAYS = 34;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(base: Date, days: number): Date {
  const out = dateOnly(base);
  out.setDate(out.getDate() + days);
  return out;
}

/** Diferença em dias de calendário. Passa por UTC para não quebrar em transição de
 *  horário de verão, onde um "dia" local pode ter 23 ou 25 horas. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/** Datas do strip: STRIP_DAYS chips a partir de hoje, estendendo até a data selecionada
 *  quando ela cai além do strip padrão, e nunca passando do teto do horizonte. */
export function buildDateStrip(
  today: Date,
  selectedDate: Date,
  stripDays: number = STRIP_DAYS,
  maxHorizonDays: number = MAX_HORIZON_DAYS,
): Date[] {
  const start = dateOnly(today);
  const offset = daysBetween(start, selectedDate);
  const needed = offset > 0 ? offset + 1 : 0;
  const count = Math.min(maxHorizonDays + 1, Math.max(stripDays, needed));

  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    out.push(addDays(start, i));
  }
  return out;
}

/** Converte o valor de um `<input type="date">` (`YYYY-MM-DD`) em Date, ou null se o
 *  valor for malformado ou cair fora da faixa selecionável. O input nativo aceita
 *  digitação e colagem, então `min`/`max` no HTML não bastam. */
export function clampPickedDate(
  rawValue: string,
  today: Date,
  maxHorizonDays: number = MAX_HORIZON_DAYS,
): Date | null {
  const match = DATE_KEY_PATTERN.exec(rawValue.trim());
  if (!match) {
    return null;
  }
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m) - 1;
  const day = Number(d);
  const parsed = new Date(year, month, day);
  // Rejeita datas que o construtor "corrigiu" (ex: 2026-13-01 vira jan/2027).
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  const offset = daysBetween(today, parsed);
  if (offset < 0 || offset > maxHorizonDays) {
    return null;
  }
  return parsed;
}

/** O chip mostra o mês no início do strip e em toda virada de mês. */
export function shouldShowMonth(date: Date, index: number): boolean {
  return index === 0 || date.getDate() === 1;
}

/** Acha, entre os slots de uma quadra num dia, o que começa exatamente no horário pedido,
 *  disponível e ainda não passado. Usado para pré-selecionar o "próximo horário" quando o
 *  atleta chega na grade de agendamento vindo de um botão "Reservar" que já sabe o horário. */
export function findSlotByTime(
  slots: ArenaSlot[],
  courtId: string,
  time: string | null,
  date: Date,
  now: Date = new Date(),
): ArenaSlot | null {
  if (!time) {
    return null;
  }
  return (
    slots.find(
      (s) =>
        s.courtId === courtId &&
        s.startTime === time &&
        arenaSlotIsAvailable(s) &&
        !isPastSlot(date, s.startTime, now),
    ) ?? null
  );
}

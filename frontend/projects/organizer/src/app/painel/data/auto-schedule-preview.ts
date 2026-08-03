import type { AutoScheduleSlot } from './organizer-ops.service';

/** Bloco posicionado na grade de agendamento: minutos contados a partir da
 *  meia-noite do dia selecionado na parede America/Sao_Paulo. Pode passar de
 *  1440 — o auto-agendamento do servidor não consulta `matchOps.dayEnd`, então
 *  uma grade cheia transborda pro dia seguinte e a tela precisa poder dizer
 *  isso em vez de desenhar o bloco de volta no topo. */
export interface AgendaBlock {
  matchId: string;
  courtId: string;
  startMin: number;
  durMin: number;
}

/** "HH:mm" → minutos do dia. */
export function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Minutos do dia → "HH:mm" (aceita > 1440, seguindo pra 24:30, 25:00…). */
export function formatHHMM(min: number): string {
  const safe = Math.max(0, Math.round(min));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** dayKey (YYYY-MM-DD) + minutos na parede SP → instante UTC. SP é UTC-3 fixo desde 2019
 *  (sem horário de verão) — mesmo pressuposto do `eventDateFromDayKeyAndTime` do servidor.
 *  Somar minutos à meia-noite em vez de montar "HH:mm" aceita 1440+ (o `dayEnd` padrão é
 *  `24:00`, e a grade pode transbordar pro dia seguinte). */
export function spWallToDate(dayKey: string, minOfDay: number): Date {
  const midnight = new Date(`${dayKey}T00:00:00-03:00`);
  return new Date(midnight.getTime() + Math.round(minOfDay) * 60000);
}

/** Minutos do dia na parede America/Sao_Paulo pra um instante UTC. */
export function spWallMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return parseHHMM(parts);
}

/** Minutos entre a meia-noite SP de `dayKey` e `date`. Diferente de
 *  `spWallMinutes`, não volta pra zero na virada do dia: um jogo às 00:30 do dia
 *  seguinte vira 1470, e continua depois de tudo na grade. */
export function minutesFromDayStart(date: Date, dayKey: string): number {
  return Math.round((date.getTime() - spWallToDate(dayKey, 0).getTime()) / 60000);
}

/** Horários oferecidos em "começar a partir das": passo de `slotMin` da abertura
 *  até o último slot que ainda cabe antes do fim da jornada. */
export function startTimeOptions(dayStartMin: number, dayEndMin: number, slotMin: number): number[] {
  if (slotMin <= 0) return [dayStartMin];
  const options: number[] = [];
  for (let min = dayStartMin; min < dayEndMin; min += slotMin) options.push(min);
  return options.length > 0 ? options : [dayStartMin];
}

/** Slots devolvidos pelo servidor → blocos por quadra, prontos pra desenhar.
 *  `fallbackDurMin` cobre slot sem `end` válido. */
export function previewBlocksByCourt(
  slots: readonly AutoScheduleSlot[],
  opts: { dayKey: string; fallbackDurMin: number },
): Record<string, AgendaBlock[]> {
  const byCourt: Record<string, AgendaBlock[]> = {};
  for (const slot of slots) {
    const courtId = slot.courtId?.trim();
    if (!courtId) continue;
    const start = new Date(slot.start);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(slot.end);
    const durMin = Number.isNaN(end.getTime())
      ? opts.fallbackDurMin
      : Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
    const list = byCourt[courtId] ?? [];
    list.push({ matchId: slot.matchId, courtId, startMin: minutesFromDayStart(start, opts.dayKey), durMin });
    byCourt[courtId] = list;
  }
  for (const list of Object.values(byCourt)) list.sort((a, b) => a.startMin - b.startMin);
  return byCourt;
}

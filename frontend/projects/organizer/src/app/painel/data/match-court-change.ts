import type { TournamentMatch } from './matches-repository';

/** Motivo pelo qual a quadra da partida não pode ser trocada.
 *  - `finished`: partida encerrada — a chave já avançou. Mesma regra do `isFinished` do
 *    agendamento, que também bloqueia reagendar partida encerrada.
 *  - `unscheduled`: sem horário — o `scheduleMatch` grava quadra e horário juntos, então
 *    não há como trocar só a quadra. O horário se define na tela de Agendamento. */
export type CourtChangeBlock = 'finished' | 'unscheduled';

/** `null` quando a quadra pode ser trocada; senão o motivo do bloqueio. */
export function courtChangeBlockReason(match: TournamentMatch): CourtChangeBlock | null {
  if (match.status === 'completed' || match.score != null) return 'finished';
  if (!match.scheduledAt) return 'unscheduled';
  return null;
}

/** Argumentos do `scheduleMatch` pra trocar só a quadra: preserva o horário já agendado e
 *  muda apenas o `courtId`. Devolve `null` quando a troca está bloqueada ou o `courtId` é
 *  vazio — a validação mora aqui, não na UI. Sem `scheduleEndTime` no doc, o fim vira
 *  início + duração padrão do torneio (mesma conta do `agendamento.component.ts`). */
export function courtChangePayload(
  match: TournamentMatch,
  courtId: string,
  defaultDurationMin: number,
): { matchId: string; courtId: string; scheduleTime: Date; scheduleEndTime: Date } | null {
  const id = courtId.trim();
  if (!id) return null;
  if (courtChangeBlockReason(match) != null) return null;

  const scheduleTime = match.scheduledAt!;
  const durMin = defaultDurationMin > 0 ? defaultDurationMin : 30;
  const scheduleEndTime = match.scheduleEndAt ?? new Date(scheduleTime.getTime() + durMin * 60000);

  return { matchId: match.id, courtId: id, scheduleTime, scheduleEndTime };
}

/** O que a troca de quadra da mesa ao vivo lê do doc da partida (`LiveMatch`). */
export interface LiveCourtChangeSource {
  id: string;
  status: TournamentMatch['status'];
  courtId?: string | null;
  scheduleTime: Date | null;
  scheduleEndTime?: Date | null;
  matchStartedAt: Date | null;
  dayKey?: string | null;
}

/** Argumentos do `scheduleMatch` pra trocar a quadra NA MESA AO VIVO. Diferente do
 *  `courtChangePayload` (tela de Placar), aceita partida já iniciada e com pontos — a quadra
 *  pode precisar mudar no meio do jogo — e partida sem horário: a iniciada pela própria mesa
 *  fica ao vivo sem `scheduleTime`, então a janela parte do `matchStartedAt` (ou de agora).
 *  Preserva o `dayKey` gravado: é a jornada, não o dia de calendário do início.
 *  `null` = nada a fazer (quadra vazia, a mesma de agora, ou partida encerrada/cancelada). */
export function liveCourtChangePayload(
  match: LiveCourtChangeSource,
  courtId: string,
  defaultDurationMin: number,
  now: Date = new Date(),
): { matchId: string; courtId: string; scheduleTime: Date; scheduleEndTime: Date; dayKey?: string } | null {
  const id = courtId.trim();
  if (!id || id === (match.courtId ?? '').trim()) return null;
  if (match.status === 'completed' || match.status === 'canceled') return null;

  const scheduleTime = match.scheduleTime ?? match.matchStartedAt ?? now;
  const durMin = defaultDurationMin > 0 ? defaultDurationMin : 30;
  const end = (match.scheduleTime && match.scheduleEndTime) || new Date(scheduleTime.getTime() + durMin * 60000);
  const dayKey = match.dayKey?.trim();

  return { matchId: match.id, courtId: id, scheduleTime, scheduleEndTime: end, ...(dayKey ? { dayKey } : {}) };
}

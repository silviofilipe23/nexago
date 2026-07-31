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

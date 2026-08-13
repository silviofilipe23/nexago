import { matchIsCanceled, matchIsCompleted } from '../../data/matches-repository';
import type { ArenaMatch } from '../../data/teams-repository';
import { isSameSaoPauloDay, saoPauloDateKey } from '../tournament-live.selectors';

/** O torneio que deve abrir em Focus e a partida que motivou a escolha. */
export interface FocusDayTarget {
  tournamentId: string;
  matchId: string;
}

/** Partida que ainda decide o dia: agendada para o dia de referência e nem encerrada nem
 *  cancelada. `in progress` CONTA — é exatamente o momento em que o Focus mais serve.
 *
 *  Delega em `matchIsCompleted`/`matchIsCanceled` (`data/matches-repository.ts`) em vez de
 *  reimplementar o critério de status: `ArenaMatch.status` é `string`, estruturalmente igual ao
 *  `Pick<TournamentMatch, 'status'>` que aquelas funções pedem, então encaixam sem adaptação —
 *  e duas definições de "cancelada" é a classe de bug que este branch já cometeu duas vezes. */
export function isOpenToday(m: ArenaMatch, reference: Date): boolean {
  if (matchIsCompleted(m) || matchIsCanceled(m)) return false;
  return m.scheduleTime != null && isSameSaoPauloDay(m.scheduleTime, reference);
}

/**
 * O torneio do dia. Entre as partidas abertas de hoje a mais cedo manda; o empate desempata
 * por id para a escolha ser estável entre chamadas (o atleta não pode ser jogado para um
 * torneio diferente a cada navegação).
 */
export function focusDayTargetOf(matches: readonly ArenaMatch[], reference: Date): FocusDayTarget | null {
  const open = matches
    .filter((m) => m.tournamentId.length > 0 && isOpenToday(m, reference))
    .sort((a, b) => (a.scheduleTime!.getTime() - b.scheduleTime!.getTime()) || a.id.localeCompare(b.id));
  const first = open[0];
  return first ? { tournamentId: first.tournamentId, matchId: first.id } : null;
}

/** Chave da memoização: o alvo do dia só vale para o MESMO atleta no MESMO dia. Sem ela, uma
 *  aba aberta depois da meia-noite — ou uma troca de conta sem recarregar — serve o alvo de
 *  ontem, ou o de outra pessoa. */
export function focusMemoKeyOf(uid: string, reference: Date): string {
  return `${uid}:${saoPauloDateKey(reference)}`;
}

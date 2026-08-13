import type { ArenaMatch } from '../../data/teams-repository';
import { isSameSaoPauloDay, saoPauloDateKey } from '../tournament-live.selectors';

/** O torneio que deve abrir em Focus e a partida que motivou a escolha. */
export interface FocusDayTarget {
  tournamentId: string;
  matchId: string;
}

/** Marca do "silêncio do dia": guarda a `focusMemoKeyOf` (atleta + data local de São Paulo) de
 *  quando o atleta saiu do Focus — escopada por atleta para não vazar entre contas no mesmo
 *  dispositivo. */
export const FOCUS_DISMISSED_KEY = 'nexago.focus.dismissed';

/** Partida que ainda decide o dia: agendada para o dia de referência e nem encerrada nem
 *  cancelada. `in progress` CONTA — é exatamente o momento em que o Focus mais serve. */
function isOpenToday(m: ArenaMatch, reference: Date): boolean {
  const status = m.status.trim().toLowerCase();
  if (status === 'completed' || status === 'canceled') return false;
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

/** O atleta já dispensou o Focus hoje? A marca é escopada por atleta e dia (ver
 *  `focusMemoKeyOf`): num dispositivo compartilhado, a dispensa de um não pode silenciar o
 *  Focus do outro. */
export function isFocusDismissed(storedValue: string | null, uid: string, reference: Date): boolean {
  return storedValue != null && storedValue === focusMemoKeyOf(uid, reference);
}

/** Chave da memoização: o alvo do dia só vale para o MESMO atleta no MESMO dia. Sem ela, uma
 *  aba aberta depois da meia-noite — ou uma troca de conta sem recarregar — serve o alvo de
 *  ontem, ou o de outra pessoa. */
export function focusMemoKeyOf(uid: string, reference: Date): string {
  return `${uid}:${saoPauloDateKey(reference)}`;
}

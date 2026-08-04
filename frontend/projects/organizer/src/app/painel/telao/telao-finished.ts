import type { TournamentMatch } from '../data/matches-repository';

/** Celebração de fim de partida: o card da quadra fica 30 s em "fim de jogo" antes de chamar
 *  o próximo. O fim é OBSERVADO pela TV (transição de status entre snapshots) — com fallback
 *  pelo `matchEndedAt` do doc pra TV que recarregou no ponto do jogo. Partida que já chegou
 *  encerrada e antiga não celebra. */

export const FINISHED_SHOWCASE_MS = 30_000;

export interface MatchFinishMemory {
  status: TournamentMatch['status'];
  /** Momento (ms) em que a TV viu a partida terminar — null quando o fim não foi observado. */
  endedSeenAtMs: number | null;
}

export function nextFinishMemoryOf(
  prev: ReadonlyMap<string, MatchFinishMemory>,
  matches: readonly TournamentMatch[],
  nowMs: number,
): Map<string, MatchFinishMemory> {
  const next = new Map<string, MatchFinishMemory>();
  for (const m of matches) {
    if (m.status !== 'completed') {
      next.set(m.id, { status: m.status, endedSeenAtMs: null });
      continue;
    }
    const p = prev.get(m.id);
    let endedSeenAtMs: number | null = null;
    if (p?.endedSeenAtMs != null) {
      endedSeenAtMs = p.endedSeenAtMs; // fim já observado — estável nos snapshots seguintes
    } else if (p && p.status !== 'completed') {
      endedSeenAtMs = nowMs; // transição observada agora (ao vivo OU lançamento direto)
    } else if (!p && m.matchEndedAt && nowMs - m.matchEndedAt.getTime() < FINISHED_SHOWCASE_MS) {
      endedSeenAtMs = m.matchEndedAt.getTime(); // TV abriu/recarregou logo após o fim
    }
    next.set(m.id, { status: 'completed', endedSeenAtMs });
  }
  return next;
}

export function finishedAtOf(memory: ReadonlyMap<string, MatchFinishMemory>, matchId: string): number | null {
  return memory.get(matchId)?.endedSeenAtMs ?? null;
}

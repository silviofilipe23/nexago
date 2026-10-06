import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OverlayDuelView } from './overlay-selectors';

/** Tempo médico no ar: vem do doc (`medicalTimeout`, gravado pela mesa) e só sai quando a mesa
 *  encerra o atendimento ou a partida acaba — NÃO fecha sozinho ao zerar, a mesa é quem decide se
 *  o atleta volta (ver `medical-timeout.ts`). */
export interface OverlayMedicoView {
  /** Muda a cada atendimento novo — re-anima a entrada. */
  key: string;
  startMs: number;
  durMs: number;
  side: 'A' | 'B';
  teamId: string;
  playerSlot: number;
  /** Nome congelado no chamado; vazio = resolver pelo elenco. */
  playerName: string;
  /** "Set 2 · 17–19" (vôlei) ou "Set 2 · Games 4–3 · 30–40" (games). */
  setInfo: string;
}

export function medicoSetInfoOf(v: OverlayDuelView): string {
  const games = v.gameA != null && v.gameB != null;
  const placar = games
    ? `Games ${v.pointsA ?? 0}–${v.pointsB ?? 0} · ${v.gameA}–${v.gameB}`
    : `${v.pointsA ?? 0}–${v.pointsB ?? 0}`;
  return `Set ${v.currentSetNumber} · ${placar}`;
}

export function medicoOf(match: TournamentMatch | null, v: OverlayDuelView | null, nowMs: number): OverlayMedicoView | null {
  const mt = match?.medicalTimeout;
  if (!match || !mt || !v || match.status !== 'in_progress') return null;
  // Sem carimbo ainda (escrita local antes do servidor responder): tempo cheio a partir de agora.
  const startMs = mt.startedAt?.getTime() ?? nowMs;
  return {
    key: `${match.id}:${mt.side}${mt.playerSlot}:${startMs}`,
    startMs,
    durMs: mt.durationSec * 1000,
    side: mt.side,
    teamId: mt.teamId || (mt.side === 'A' ? match.teamAId : match.teamBId),
    playerSlot: mt.playerSlot,
    playerName: mt.playerName.trim(),
    setInfo: medicoSetInfoOf(v),
  };
}

import { matchLiveCurrentSet } from '../../painel/data/live-set-display';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OverlayDuelView } from './overlay-selectors';

/** Tempo técnico no ar: o card entra só quando a mesa grava o minuto no doc e sai quando passa o
 *  minuto, quando qualquer ponto é marcado ou `TECNICO_SAIDA_MS` depois do relógio zerar. O
 *  automático do 21º ponto (opção do torneio) também vem da mesa — o overlay nunca dispara sozinho,
 *  então recarregar o OBS não reabre um minuto que ninguém chamou.
 *
 *  Puro pelo mesmo motivo dos ciclos de doação/patrocínio: a tela só agenda e desenha, e a regra
 *  de "quando está no ar" mora aqui, com teste. */

export const TECNICO_SAIDA_MS = 4000;

export interface OverlayTecnicoView {
  /** Muda a cada tempo técnico novo — chave do `@for` que re-anima a entrada. */
  key: string;
  startMs: number;
  durMs: number;
  /** Lado que pediu; `null` no automático (vale pras duas). */
  side: 'A' | 'B' | null;
  auto: boolean;
  teamId: string;
  /** Linha de informação: "Set 2 · 17 × 19 · Masculino B". */
  info: string;
}

/** Ainda cabe na tela? Some `TECNICO_SAIDA_MS` depois de zerar. */
export function tecnicoNoAr(startMs: number, durMs: number, nowMs: number): boolean {
  return nowMs < startMs + durMs + TECNICO_SAIDA_MS;
}

/** Segundos restantes, arredondados pra cima: 60 s mostra "1:00", não "0:59". */
export function tecnicoRestanteSeg(startMs: number, durMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((durMs - (nowMs - startMs)) / 1000));
}

export function tecnicoClock(totalSec: number): string {
  const s = Math.max(0, Math.trunc(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Linha de informação: vôlei mostra os pontos do set, games mostra games e ponto do game. */
export function tecnicoInfoOf(v: OverlayDuelView, categoryName: string | null): string {
  const games = v.gameA != null && v.gameB != null;
  const placar = games
    ? `Games ${v.pointsA ?? 0} × ${v.pointsB ?? 0} · ${v.gameA} × ${v.gameB}`
    : `${v.pointsA ?? 0} × ${v.pointsB ?? 0}`;
  return [`Set ${v.currentSetNumber}`, placar, categoryName?.trim() ?? '']
    .filter((p) => p !== '')
    .join(' · ');
}

/** Tempo técnico gravado pela mesa (chamado por uma dupla ou automático) e ainda válido: o placar do set é o do instante da chamada
 *  (ponto marcado = acabou). `null` fora disso. */
export function tecnicoManualOf(
  match: TournamentMatch | null,
  v: OverlayDuelView | null,
  nowMs: number,
  categoryName: string | null,
): OverlayTecnicoView | null {
  const tt = match?.technicalTimeout;
  if (!match || !tt || !v || match.status !== 'in_progress') return null;
  const live = matchLiveCurrentSet(match);
  if (!live || live.setNumber - 1 !== tt.setIndex || live.a !== tt.scoreA || live.b !== tt.scoreB) return null;
  // Sem carimbo ainda (escrita local antes do servidor responder): minuto cheio a partir de agora.
  const startMs = tt.startedAt?.getTime() ?? nowMs;
  const durMs = tt.durationSec * 1000;
  if (!tecnicoNoAr(startMs, durMs, nowMs)) return null;
  return {
    key: `${match.id}:${tt.setIndex}:${startMs}`,
    startMs,
    durMs,
    side: tt.side,
    auto: tt.auto,
    teamId: tt.side == null ? '' : tt.teamId || (tt.side === 'A' ? match.teamAId : match.teamBId),
    info: tecnicoInfoOf(v, categoryName),
  };
}

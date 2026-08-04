import { matchClosedSets, matchLiveCurrentSet, type LiveScoreFields } from '../data/live-set-display';
import { matchWinnerSide, setWinnerSide, type ScoreSet } from '../data/match-scoring';
import type { TournamentMatch } from '../data/matches-repository';
import { finishedAtOf, type MatchFinishMemory } from './telao-finished';

/** Modo GRANDE FINAL: final, grand final (dupla eliminação) e disputa de 3º lugar ganham a
 *  tela inteira do telão — uma partida só, em tratamento premium. Aqui vive a lógica pura
 *  (quem entra em destaque, alerta de match/set point, se há outras quadras jogando). */

/** Tela de campeões da final fica mais tempo que a celebração comum (30 s): é o clímax do
 *  torneio e o momento de foto da galera. */
export const CHAMPIONS_SHOWCASE_MS = 90_000;

/** Dourado pra final, bronze pra disputa de 3º lugar. */
export type FinalKind = 'final' | 'third-place';

/** `matchType` gravado por `category-bracket-builders.ts`: "Final", "Grand Final" (DE) e
 *  "Third Place" — comparação tolerante a caixa e separador, como no resto do portal. */
export function finalKindOf(matchType: string): FinalKind | null {
  const t = matchType.trim().toLowerCase().replace(/_/g, ' ');
  if (t === 'final' || t === 'grand final') return 'final';
  if (t === 'third place' || t === '3rd place') return 'third-place';
  return null;
}

export interface FinalShowcase {
  match: TournamentMatch;
  kind: FinalKind;
  state: 'live' | 'champions';
}

/** Grand final/final na frente da disputa de 3º lugar quando as duas rolam juntas. */
const KIND_PRIORITY: Record<FinalKind, number> = { final: 0, 'third-place': 1 };

/** Partida que assume a tela: final ao vivo (prioridade por tipo, depois a que começou por
 *  último) → senão final recém-encerrada dentro da janela de campeões. Só quadras
 *  selecionadas no telão. */
export function finalShowcaseOf(
  matches: readonly TournamentMatch[],
  courtIds: readonly string[],
  nowMs: number,
  finishMemory: ReadonlyMap<string, MatchFinishMemory>,
): FinalShowcase | null {
  const courts = new Set(courtIds);
  const finals = matches
    .map((m) => ({ m, kind: finalKindOf(m.matchType) }))
    .filter((x): x is { m: TournamentMatch; kind: FinalKind } => x.kind != null && courts.has(x.m.courtId));

  const live = finals
    .filter((x) => x.m.status === 'in_progress')
    .sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || (b.m.matchStartedAt?.getTime() ?? 0) - (a.m.matchStartedAt?.getTime() ?? 0))[0];
  if (live) return { match: live.m, kind: live.kind, state: 'live' };

  const champions = finals
    .filter((x) => x.m.status === 'completed')
    .map((x) => ({ ...x, at: finishedAtOf(finishMemory, x.m.id) }))
    .filter((x): x is { m: TournamentMatch; kind: FinalKind; at: number } => x.at != null && nowMs - x.at < CHAMPIONS_SHOWCASE_MS)
    .sort((a, b) => b.at - a.at)[0];
  if (champions) return { match: champions.m, kind: champions.kind, state: 'champions' };

  return null;
}

/** Há jogo rolando em OUTRA quadra do telão? Se sim, o modo final reveza com a grade pra
 *  quem joga fora da quadra central não ficar sem acompanhar. */
export function hasOtherLiveCourts(matches: readonly TournamentMatch[], courtIds: readonly string[], final: TournamentMatch): boolean {
  const courts = new Set(courtIds);
  return matches.some((m) => m.status === 'in_progress' && m.courtId !== final.courtId && courts.has(m.courtId));
}

export interface PointAlert {
  side: 'A' | 'B';
  kind: 'match' | 'set';
}

type PointAlertFields = LiveScoreFields & Pick<TournamentMatch, 'bestOf'>;

/** Um ponto do fim: MATCH POINT (fecha a partida) ou SET POINT (fecha só o set). Simula o
 *  próximo ponto de cada lado com as regras reais (`match-scoring`) — 21 com vantagem de 2,
 *  15 no set decisivo de MD3. */
export function pointAlertOf(m: PointAlertFields): PointAlert | null {
  const current = matchLiveCurrentSet(m);
  if (!current) return null;
  const closed: ScoreSet[] = matchClosedSets(m).map((s) => ({ a: s.a, b: s.b }));
  const setIndex = closed.length;

  const alertFor = (side: 'A' | 'B'): PointAlert | null => {
    const next: ScoreSet = side === 'A' ? { a: current.a + 1, b: current.b } : { a: current.a, b: current.b + 1 };
    const simulated = [...closed, next];
    if (setWinnerSide(simulated, setIndex, m.bestOf) !== side) return null;
    return { side, kind: matchWinnerSide(simulated, m.bestOf) === side ? 'match' : 'set' };
  };

  const a = alertFor('A');
  const b = alertFor('B');
  if (a && b) return current.a === current.b ? null : current.a > current.b ? a : b;
  return a ?? b;
}

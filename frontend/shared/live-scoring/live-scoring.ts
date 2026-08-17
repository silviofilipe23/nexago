import { DEFAULT_SET_POINTS, MIN_ADVANTAGE, isSetWon, matchWinnerSide, setWinnerSide, setsWon, targetPointsForSet, type ScoreSet } from './match-scoring';
import type { MatchDisplayStatus } from './match-status';

/** Porta fiel da parte PONTO A PONTO de `match_scoring_logic.dart` (mesa ao vivo I1 do app):
 *  aplicar/desfazer ponto, troca de formato e os hints de set point. As regras de set
 *  (target/vantagem) vêm de `match-scoring.ts` — mesma fonte que o lançamento rápido usa. */

/** Set como gravado no doc: além de `a`/`b`, a mesa preserva `startedAt`/`endedAt` (Timestamps
 *  crus do Firestore) — o app grava `startedAt` no primeiro ponto do set e nós repassamos o
 *  valor adiante sem interpretá-lo. */
export interface LiveSet extends ScoreSet {
  startedAt?: unknown;
  endedAt?: unknown;
}

export interface ApplyPointResult {
  sets: LiveSet[];
  currentSetIndex: number;
  winnerId: string | null;
}

function matchWinnerId(sets: readonly ScoreSet[], teamAId: string, teamBId: string, bestOf: number): string | null {
  const side = matchWinnerSide(sets, bestOf);
  if (side === 'A') return teamAId;
  if (side === 'B') return teamBId;
  return null;
}

/** Espelha `MatchScoringLogic.applyPoint`: soma 1 ponto ao set atual, fecha o set quando a
 *  regra permite (avança o índice se a partida continua) e devolve o vencedor quando o ponto
 *  encerra a partida. */
export function applyPoint(params: { sets: readonly LiveSet[]; currentSetIndex: number; side: 'A' | 'B'; teamAId: string; teamBId: string; bestOf: number }): ApplyPointResult {
  const { side, teamAId, teamBId, bestOf } = params;
  const idx = Math.min(Math.max(params.currentSetIndex, 0), bestOf - 1);
  const working: LiveSet[] = params.sets.map((s) => ({ ...s }));
  while (working.length <= idx) working.push({ a: 0, b: 0 });

  const current = working[idx]!;
  const isA = side === 'A';
  working[idx] = {
    ...current,
    a: current.a + (isA ? 1 : 0),
    b: current.b + (isA ? 0 : 1),
    startedAt: current.startedAt ?? new Date(),
  };

  let nextSetIndex = idx;
  if (isSetWon(working[idx]!.a, working[idx]!.b, targetPointsForSet(idx, bestOf))) {
    if (matchWinnerSide(working, bestOf) == null && idx < bestOf - 1) nextSetIndex = idx + 1;
  }

  return { sets: working, currentSetIndex: nextSetIndex, winnerId: matchWinnerId(working, teamAId, teamBId, bestOf) };
}

/** Espelha `MatchScoringLogic.undoPoint`: tira 1 ponto do lado indicado no set atual; se o set
 *  zera e não é o primeiro, remove o set e volta o índice (desfazer o ponto que abriu o set). */
export function undoPoint(params: { sets: readonly LiveSet[]; currentSetIndex: number; side: 'A' | 'B' }): { sets: LiveSet[]; currentSetIndex: number } {
  if (params.sets.length === 0) return { sets: [...params.sets], currentSetIndex: params.currentSetIndex };

  const idx = Math.min(Math.max(params.currentSetIndex, 0), params.sets.length - 1);
  const working: LiveSet[] = params.sets.map((s) => ({ ...s }));
  const current = working[idx]!;
  const isA = params.side === 'A';
  const newA = isA ? Math.max(0, current.a - 1) : current.a;
  const newB = isA ? current.b : Math.max(0, current.b - 1);

  if (newA === 0 && newB === 0 && idx > 0) {
    working.splice(idx, 1);
    return { sets: working, currentSetIndex: idx - 1 };
  }

  working[idx] = { ...current, a: newA, b: newB };
  return { sets: working, currentSetIndex: idx };
}

/** Sets que já têm algum ponto lançado (não conta 0×0) — guarda da troca de formato. */
export function playedSetsCount(sets: readonly ScoreSet[]): number {
  return sets.filter((s) => s.a > 0 || s.b > 0).length;
}

export function canReduceBestOf(sets: readonly ScoreSet[], newBestOf: number): boolean {
  return playedSetsCount(sets) <= newBestOf;
}

/** Espelha `MatchScoringLogic.applyBestOfChange`: trunca sets excedentes ao novo formato e
 *  recalcula vencedor/índice do set atual/conclusão. */
export function applyBestOfChange(params: { sets: readonly LiveSet[]; newBestOf: number; teamAId: string; teamBId: string }): ApplyPointResult & { completed: boolean } {
  const { newBestOf, teamAId, teamBId } = params;
  const trimmed: LiveSet[] = params.sets.slice(0, Math.min(params.sets.length, newBestOf)).map((s) => ({ ...s }));
  const winnerId = matchWinnerId(trimmed, teamAId, teamBId, newBestOf);

  let idx = 0;
  while (idx < trimmed.length && setWinnerSide(trimmed, idx, newBestOf) != null && idx < newBestOf - 1) idx++;

  return { sets: trimmed, currentSetIndex: idx, winnerId, completed: winnerId != null };
}

/** Serializa o set pro doc — só inclui `startedAt`/`endedAt` quando existem (o Firestore não
 *  aceita `undefined` em campo de mapa). */
export function liveSetToMap(s: LiveSet): Record<string, unknown> {
  return { a: s.a, b: s.b, ...(s.startedAt != null ? { startedAt: s.startedAt } : {}), ...(s.endedAt != null ? { endedAt: s.endedAt } : {}) };
}

export function setsWonOf(sets: readonly ScoreSet[], bestOf: number): { a: number; b: number } {
  return setsWon(sets, bestOf);
}

/** "set até 21 · vantagem de 2" — espelha `setRulesLabel`. */
export function setRulesLabel(setIndex: number, bestOf: number): string {
  return `set até ${targetPointsForSet(setIndex, bestOf)} · vantagem de ${MIN_ADVANTAGE}`;
}

/** Espelha `setPointHint`: "set point em 1" quando o próximo ponto fecha o set; "set point em
 *  N" (2..5) quando o líder está perto do target. `null` fora dessas janelas. */
export function setPointHint(scoreA: number, scoreB: number, setIndex: number, bestOf: number): string | null {
  const target = targetPointsForSet(setIndex, bestOf);
  if (isSetWon(scoreA, scoreB, target)) return null;
  if (isSetWon(scoreA + 1, scoreB, target) || isSetWon(scoreB + 1, scoreA, target)) return 'set point em 1';
  const leader = Math.max(scoreA, scoreB);
  if (leader < target - 5) return null;
  const remaining = target - leader;
  return remaining > 1 && remaining <= 5 ? `set point em ${remaining}` : null;
}

/** Quem ABRE o saque é o único momento que o rally não resolve: do 1º ponto em diante
 *  `servingTeamId` é sempre quem marcou. Enquanto ninguém está com o saque a mesa pergunta —
 *  inclusive com a partida já ao vivo, porque o mesário pode ter iniciado e só depois lembrado.
 *  Cala em partida encerrada/cancelada e enquanto a chave não definiu os dois lados (não existe
 *  teamId pra gravar). Mora aqui, e não em cada tela, porque as três mesas (organizador, portal
 *  do atleta e app) têm que perguntar na MESMA janela — espelhado em `match_scoring_logic.dart`. */
export function needsStartingServe(params: { servingTeamId: string; status: MatchDisplayStatus; teamAId: string; teamBId: string }): boolean {
  if (params.status === 'completed' || params.status === 'canceled') return false;
  if (params.teamAId.trim() === '' || params.teamBId.trim() === '') return false;
  return params.servingTeamId.trim() === '';
}

/** "07:32" — espelha `formatElapsedMmSs` (minutos podem passar de 60: "75:10"). */
export function formatElapsedMmSs(totalSec: number): string {
  const safe = Math.min(Math.max(totalSec, 0), 99_999);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function elapsedSecondsFromStart(startedAt: Date | null, now: Date): number {
  if (!startedAt) return 0;
  return Math.min(Math.max(Math.floor((now.getTime() - startedAt.getTime()) / 1000), 0), 99_999);
}

export { DEFAULT_SET_POINTS };

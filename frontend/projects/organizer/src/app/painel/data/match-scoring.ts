/** Porta fiel (subconjunto de lançamento) de `match_scoring_logic.dart` (Flutter): regras de
 *  placar do vôlei de praia — set até 21 (tie-break até 15 no 3º set de MD3), vantagem de 2 —
 *  usadas pra validar localmente ANTES do `submitMatchResult` (o servidor revalida). */

export interface ScoreSet {
  a: number;
  b: number;
}

export const DEFAULT_SET_POINTS = 21;
export const TIEBREAK_SET_POINTS = 15;
export const MIN_ADVANTAGE = 2;
export const DEFAULT_BEST_OF = 3;

export function targetPointsForSet(setIndex: number, bestOf: number): number {
  if (bestOf === 3 && setIndex === 2) return TIEBREAK_SET_POINTS;
  return DEFAULT_SET_POINTS;
}

export function isSetWon(scoreA: number, scoreB: number, target: number): boolean {
  if (scoreA >= target && scoreA - scoreB >= MIN_ADVANTAGE) return true;
  if (scoreB >= target && scoreB - scoreA >= MIN_ADVANTAGE) return true;
  return false;
}

export function setWinnerSide(sets: readonly ScoreSet[], index: number, bestOf: number): 'A' | 'B' | null {
  if (index < 0 || index >= sets.length) return null;
  const s = sets[index]!;
  if (!isSetWon(s.a, s.b, targetPointsForSet(index, bestOf))) return null;
  return s.a > s.b ? 'A' : 'B';
}

export function setsWon(sets: readonly ScoreSet[], bestOf: number): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (let i = 0; i < sets.length; i++) {
    const side = setWinnerSide(sets, i, bestOf);
    if (side === 'A') a++;
    else if (side === 'B') b++;
  }
  return { a, b };
}

export function matchWinnerSide(sets: readonly ScoreSet[], bestOf: number): 'A' | 'B' | null {
  const needed = Math.ceil(bestOf / 2);
  const wins = setsWon(sets, bestOf);
  if (wins.a >= needed && wins.a > wins.b) return 'A';
  if (wins.b >= needed && wins.b > wins.a) return 'B';
  return null;
}

export interface ScoreValidationIssue {
  setIndex: number | null;
  message: string;
}

/** Espelha `validateQuickScoreSubmission` — mensagens idênticas às do app. */
export function validateScoreSubmission(sets: readonly ScoreSet[], bestOf: number): ScoreValidationIssue[] {
  const issues: ScoreValidationIssue[] = [];
  if (sets.length === 0) return [{ setIndex: null, message: 'Informe ao menos um set.' }];
  if (sets.length > bestOf) issues.push({ setIndex: null, message: `Máximo de ${bestOf} sets.` });

  for (let i = 0; i < sets.length; i++) {
    const s = sets[i]!;
    const setLabel = `Set ${i + 1}`;
    if (s.a === s.b) {
      issues.push({ setIndex: i, message: `${setLabel}: não pode terminar empatado.` });
      continue;
    }
    if (s.a < 0 || s.b < 0 || s.a > 99 || s.b > 99) {
      issues.push({ setIndex: i, message: `${setLabel}: placar fora do intervalo (0–99).` });
      continue;
    }
    const target = targetPointsForSet(i, bestOf);
    if (!isSetWon(s.a, s.b, target)) {
      issues.push({ setIndex: i, message: `${setLabel}: vitória exige ${target} pontos com vantagem de ${MIN_ADVANTAGE}.` });
    }
  }

  const hasSetErrors = issues.some((issue) => issue.setIndex != null);
  if (!hasSetErrors && matchWinnerSide(sets, bestOf) == null) {
    issues.push({ setIndex: null, message: 'Complete o placar: nenhuma dupla venceu ainda.' });
  }
  return issues;
}

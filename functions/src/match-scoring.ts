/**
 * Regras de placar (espelho de `MatchScoringLogic` no app Flutter) usadas para
 * validar resultados no servidor de forma autoritativa.
 */

export const DEFAULT_SET_POINTS = 21;
export const TIEBREAK_SET_POINTS = 15;
export const MIN_ADVANTAGE = 2;
export const DEFAULT_BEST_OF = 3;

export interface ScoreSet {
  a: number;
  b: number;
}

export function targetPointsForSet(setIndex: number, bestOf: number): number {
  if (bestOf === 3 && setIndex === 2) return TIEBREAK_SET_POINTS;
  return DEFAULT_SET_POINTS;
}

export function isSetWon(
  scoreA: number,
  scoreB: number,
  target: number = DEFAULT_SET_POINTS,
): boolean {
  if (scoreA >= target && scoreA - scoreB >= MIN_ADVANTAGE) return true;
  if (scoreB >= target && scoreB - scoreA >= MIN_ADVANTAGE) return true;
  return false;
}

/** `'A'`, `'B'` ou `null` se o set ainda não foi vencido por ninguém. */
export function setWinnerSide(
  sets: ScoreSet[],
  index: number,
  bestOf: number = DEFAULT_BEST_OF,
): "A" | "B" | null {
  if (index < 0 || index >= sets.length) return null;
  const s = sets[index];
  if (!isSetWon(s.a, s.b, targetPointsForSet(index, bestOf))) return null;
  return s.a > s.b ? "A" : "B";
}

/** Quantos sets cada lado venceu DE FATO (respeitando target/vantagem). */
export function setsWon(
  sets: ScoreSet[],
  bestOf: number = DEFAULT_BEST_OF,
): {a: number; b: number} {
  let a = 0;
  let b = 0;
  for (let i = 0; i < sets.length; i++) {
    const side = setWinnerSide(sets, i, bestOf);
    if (side === "A") a++;
    else if (side === "B") b++;
  }
  return {a, b};
}

export function isMatchWon(
  sets: ScoreSet[],
  bestOf: number = DEFAULT_BEST_OF,
): boolean {
  const needed = Math.ceil(bestOf / 2);
  const wins = setsWon(sets, bestOf);
  return wins.a >= needed || wins.b >= needed;
}

export function matchWinnerId(
  sets: ScoreSet[],
  teamAId: string,
  teamBId: string,
  bestOf: number = DEFAULT_BEST_OF,
): string | null {
  if (!isMatchWon(sets, bestOf)) return null;
  const wins = setsWon(sets, bestOf);
  if (wins.a > wins.b) return teamAId;
  if (wins.b > wins.a) return teamBId;
  return null;
}

/**
 * Normaliza e valida sets recebidos do cliente. Lança `Error` com mensagem
 * amigável quando o placar é inválido. Não exige que a partida esteja
 * concluída (permite salvar parcial sem vencedor).
 */
export function parseAndValidateSets(
  raw: unknown,
  bestOf: number = DEFAULT_BEST_OF,
): ScoreSet[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Informe ao menos um set.");
  }
  if (raw.length > bestOf) {
    throw new Error(`Máximo de ${bestOf} sets.`);
  }
  const sets: ScoreSet[] = [];
  for (const entry of raw) {
    const obj = (entry ?? {}) as Record<string, unknown>;
    const a = Number(obj.a);
    const b = Number(obj.b);
    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      throw new Error("Placar inválido.");
    }
    if (a < 0 || b < 0 || a > 99 || b > 99) {
      throw new Error("Placar fora do intervalo.");
    }
    // Um set registrado não pode terminar empatado (inclui 0×0).
    if (a === b) {
      throw new Error("Um set não pode terminar empatado.");
    }
    sets.push({a, b});
  }
  return sets;
}

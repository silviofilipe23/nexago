/**
 * Regras de placar usadas para validar resultados no servidor de forma
 * autoritativa. As regras moram no núcleo (`sports/scoring.ts`, por perfil);
 * as funções daqui são invólucros com a regra histórica (21/15, vantagem 2),
 * mantidas pelas assinaturas que o resto do backend já usa.
 */
import {
  isPointsSetWon,
  legacyScoringProfile,
  setPointsTarget,
  setsWonBy,
  setWinnerSide as coreSetWinnerSide,
  type ScoreSet,
} from "./sports/scoring";


export const DEFAULT_SET_POINTS = 21;
export const TIEBREAK_SET_POINTS = 15;
export const MIN_ADVANTAGE = 2;
export const DEFAULT_BEST_OF = 3;

export type {ScoreSet} from "./sports/scoring";

/**
 * Formato configurado na categoria (`tournaments/{id}.categories[].bestOf`)
 * traduzido para o número de sets gravado na partida.
 *
 * `bestOf5` cai em MD3 de propósito: o placar (mesa, telão e app) só entende 1
 * ou 3 sets, então MD5 já era jogado como MD3 — mapear para 5 mudaria o alvo do
 * 3º set (15 → 21) e o número de sets para vencer.
 *
 * Categoria SEM o campo é torneio antigo, criado quando o formato nem era
 * escolhido: mantém MD3, o padrão histórico.
 */
export function matchBestOfFromCategory(raw: unknown): number {
  return raw === "singleSet" ? 1 : DEFAULT_BEST_OF;
}

export function targetPointsForSet(setIndex: number, bestOf: number): number {
  return setPointsTarget(legacyScoringProfile(bestOf), setIndex);
}

export function isSetWon(
  scoreA: number,
  scoreB: number,
  target: number = DEFAULT_SET_POINTS,
): boolean {
  return isPointsSetWon(scoreA, scoreB, target, MIN_ADVANTAGE, null);
}

/** `'A'`, `'B'` ou `null` se o set ainda não foi vencido por ninguém. */
export function setWinnerSide(
  sets: ScoreSet[],
  index: number,
  bestOf: number = DEFAULT_BEST_OF,
): "A" | "B" | null {
  return coreSetWinnerSide(sets, index, legacyScoringProfile(bestOf));
}

/** Quantos sets cada lado venceu DE FATO (respeitando target/vantagem). */
export function setsWon(
  sets: ScoreSet[],
  bestOf: number = DEFAULT_BEST_OF,
): {a: number; b: number} {
  return setsWonBy(sets, legacyScoringProfile(bestOf));
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

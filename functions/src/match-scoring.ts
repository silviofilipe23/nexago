/**
 * Regras de placar (espelho de `MatchScoringLogic` no app Flutter) usadas para
 * validar resultados no servidor de forma autoritativa.
 */

export const DEFAULT_SET_POINTS = 21;
export const TIEBREAK_SET_POINTS = 15;
export const MIN_ADVANTAGE = 2;
export const DEFAULT_BEST_OF = 3;

/** Esportes com regra de set própria (valor cru de `tournaments/{id}.sport`). */
const FOOTVOLLEY_SPORT = "footvolley";

/** Futevôlei (FIFV/CBFv): set até 18 e set decisivo até 15, diferença de 2. */
export const FOOTVOLLEY_SET_POINTS = 18;

export interface ScoreSet {
  a: number;
  b: number;
}

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

/**
 * Pontos para fechar o set. Sem `sport` (ou esporte sem regra própria) vale a
 * regra histórica de vôlei de praia (21 / decisivo 15).
 */
export function targetPointsForSet(
  setIndex: number,
  bestOf: number,
  sport?: string | null,
): number {
  if (bestOf === 3 && setIndex === 2) return TIEBREAK_SET_POINTS;
  return sport === FOOTVOLLEY_SPORT ? FOOTVOLLEY_SET_POINTS : DEFAULT_SET_POINTS;
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
  sport?: string | null,
): "A" | "B" | null {
  if (index < 0 || index >= sets.length) return null;
  const s = sets[index];
  if (!isSetWon(s.a, s.b, targetPointsForSet(index, bestOf, sport))) return null;
  return s.a > s.b ? "A" : "B";
}

/** Quantos sets cada lado venceu DE FATO (respeitando target/vantagem). */
export function setsWon(
  sets: ScoreSet[],
  bestOf: number = DEFAULT_BEST_OF,
  sport?: string | null,
): {a: number; b: number} {
  let a = 0;
  let b = 0;
  for (let i = 0; i < sets.length; i++) {
    const side = setWinnerSide(sets, i, bestOf, sport);
    if (side === "A") a++;
    else if (side === "B") b++;
  }
  return {a, b};
}

export function isMatchWon(
  sets: ScoreSet[],
  bestOf: number = DEFAULT_BEST_OF,
  sport?: string | null,
): boolean {
  const needed = Math.ceil(bestOf / 2);
  const wins = setsWon(sets, bestOf, sport);
  return wins.a >= needed || wins.b >= needed;
}

export function matchWinnerId(
  sets: ScoreSet[],
  teamAId: string,
  teamBId: string,
  bestOf: number = DEFAULT_BEST_OF,
  sport?: string | null,
): string | null {
  if (!isMatchWon(sets, bestOf, sport)) return null;
  const wins = setsWon(sets, bestOf, sport);
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

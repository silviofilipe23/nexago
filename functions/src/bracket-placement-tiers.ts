import {normalizeMatchType} from "./match-status";

/**
 * Degrau de premiação abaixo do pódio. O nome é a FASE alcançada, e a faixa de
 * colocação que ele representa sai da estrutura da chave (ver
 * `placementTiersFromMatches`), nunca da rodada crua — a LB de 22 duplas tem 6
 * rodadas e a de 8 tem 3, então "rodada 2" significa colocações completamente
 * diferentes em cada planta.
 */
export type PlacementTierKey = "quarters" | "r16" | "r32";

/** Faixa 5-8 → quartas, 9-16 → oitavas, acima disso → 16-avos (último degrau). */
export function tierForTopPosition(top: number): PlacementTierKey {
  if (top <= 8) return "quarters";
  if (top <= 16) return "r16";
  return "r32";
}

export interface EliminationTierMap {
  /** rodada da LB (dupla eliminação) → degrau */
  lb: Record<number, PlacementTierKey>;
  /** rodada do mata-mata simples → degrau */
  knockout: Record<number, PlacementTierKey>;
}

function countByRound(
  matches: Array<Record<string, unknown>>,
  predicate: (matchType: string) => boolean,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const match of matches) {
    if (!predicate(normalizeMatchType(match.matchType))) continue;
    const round = Number(match.round ?? 0);
    if (!Number.isInteger(round) || round <= 0) continue;
    counts.set(round, (counts.get(round) ?? 0) + 1);
  }
  return counts;
}

/**
 * Distribui degraus percorrendo as rodadas da MAIS TARDIA para a mais precoce:
 * quem cai por último ocupa as melhores colocações abaixo do pódio (a partir da
 * 5ª), quem cai primeiro ocupa as últimas. Cada rodada consome tantas posições
 * quantas partidas ela tem — é daí que sai a faixa.
 */
function tiersFromCounts(
  counts: Map<number, number>,
  isPodiumRound: (round: number) => boolean,
): Record<number, PlacementTierKey> {
  const tiers: Record<number, PlacementTierKey> = {};
  const rounds = [...counts.keys()]
    .filter((round) => !isPodiumRound(round))
    .sort((a, b) => b - a);

  let top = 5;
  for (const round of rounds) {
    tiers[round] = tierForTopPosition(top);
    top += counts.get(round) ?? 0;
  }
  return tiers;
}

/**
 * Degraus de cada rodada eliminatória da categoria, derivados da ESTRUTURA da
 * chave (quantas duplas caem em cada rodada) e não do estado do torneio. Puro:
 * a mesma lista de partidas sempre dá o mesmo resultado, o que permite ao motor
 * (na premiação) e ao script de histórico (nas partidas já gravadas) usarem a
 * mesma regra — é essa unificação que impede o passado de divergir do presente.
 *
 * Rodadas de PÓDIO não entram na conta, porque seus perdedores não estão
 * eliminados abaixo do 4º lugar:
 *  - DE com disputa de 3º: a final da LB (o perdedor ainda joga o 3º lugar);
 *  - DE legada sem disputa de 3º: a final da LB (3º) e a anterior (4º);
 *  - mata-mata simples: da semifinal em diante.
 *
 * A entrada desigual na LB das plantas 20-23 (perdedores da WB R2 entrando em
 * rodadas diferentes) não afeta nada: o critério é quantas duplas caem por
 * rodada, não quando cada uma entrou.
 */
export function placementTiersFromMatches(
  matches: Array<Record<string, unknown>>,
): EliminationTierMap {
  let maxLbRound = 0;
  let knockoutFinalRound = 0;
  let hasThirdPlaceMatch = false;

  for (const match of matches) {
    const matchType = normalizeMatchType(match.matchType);
    const round = Number(match.round ?? 0);
    if (matchType === "third place" || matchType === "3rd place") {
      hasThirdPlaceMatch = true;
    }
    if (matchType === "lb" && round > maxLbRound) maxLbRound = round;
    if (
      (matchType === "knockout" ||
        matchType === "final" ||
        matchType === "grand final") &&
      round > knockoutFinalRound
    ) {
      knockoutFinalRound = round;
    }
  }

  const lbPodiumFloor = hasThirdPlaceMatch ? maxLbRound : maxLbRound - 1;
  const semifinalRound = knockoutFinalRound > 1 ? knockoutFinalRound - 1 : 1;

  return {
    lb: tiersFromCounts(
      countByRound(matches, (type) => type === "lb"),
      (round) => maxLbRound > 0 && round >= lbPodiumFloor,
    ),
    knockout: tiersFromCounts(
      countByRound(matches, (type) => type === "knockout"),
      (round) => round >= semifinalRound,
    ),
  };
}

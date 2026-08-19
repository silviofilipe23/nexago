/* eslint-disable */
/**
 * Cópia JS pura de `functions/src/bracket-placement-tiers.ts` — script standalone,
 * sem import do bundle compilado (mesma convenção de `ranking-recompute.js`).
 * Mudou lá, muda aqui: `functions/test/bracket-placement-tiers-parity.test.mjs` é
 * quem cobra.
 */

/** Cópia de `normalizeMatchType` (functions/src/match-status.ts). */
function normalizeMatchType(raw) {
  return String(raw ?? "").trim().toLowerCase().replace(/_/g, " ");
}

/**
 * Degrau de premiação abaixo do pódio. O nome é a FASE alcançada, e a faixa de
 * colocação que ele representa sai da estrutura da chave (ver
 * `placementTiersFromMatches`), nunca da rodada crua — a LB de 22 duplas tem 6
 * rodadas e a de 8 tem 3, então "rodada 2" significa colocações completamente
 * diferentes em cada planta.
 */

/** Faixa 5-8 → quartas, 9-16 → oitavas, acima disso → 16-avos (último degrau). */
function tierForTopPosition(top) {
  if (top <= 8) return "quarters";
  if (top <= 16) return "r16";
  return "r32";
}


/**
 * Uma partida elimina quem perde? Só quando o perdedor NÃO tem para onde ir.
 * A chave materializada grava `loserAdvance` (ver `category-bracket-builders.ts`)
 * apontando a próxima partida do perdedor — é assim que a final da LB, cujo
 * perdedor ainda joga a disputa de 3º, se distingue de uma eliminação de
 * verdade.
 *
 * Contar rodadas em vez de olhar a fiação NÃO funciona: nas plantas pequenas a
 * disputa de 3º puxa participantes de rodadas diferentes (na de 4 lugares, do
 * perdedor da LB R1; na de 6, do perdedor da LB R2), então "a última rodada da
 * LB é pódio" é falso justamente onde a chave é mais curta.
 */
function isElimination(match) {
  return match.loserAdvance == null;
}

/**
 * A chave foi materializada com fiação? Sem nenhum `winnerAdvance`/`loserAdvance`
 * não dá para saber quem seguiu vivo, e o módulo se recusa a inventar: devolve
 * mapas vazios, o que faz o motor cair no comportamento legado (tudo em
 * `quarters`) em vez de premiar por um degrau adivinhado.
 */
function hasAdvanceWiring(matches) {
  return matches.some(
    (match) => match.winnerAdvance != null || match.loserAdvance != null,
  );
}

function countEliminationsByRound(matches, predicate) {
  const counts = new Map();
  for (const match of matches) {
    if (!predicate(normalizeMatchType(match.matchType))) continue;
    if (!isElimination(match)) continue;
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
function tiersFromCounts(counts, isPodiumRound) {
  const tiers = {};
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
function placementTiersFromMatches(matches) {
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

  if (!hasAdvanceWiring(matches)) return {lb: {}, knockout: {}};

  const semifinalRound = knockoutFinalRound > 1 ? knockoutFinalRound - 1 : 1;

  return {
    lb: tiersFromCounts(
      countEliminationsByRound(matches, (type) => type === "lb"),
      // Sem disputa de 3º (chave legada), as duas últimas rodadas da LB decidem
      // 3º e 4º — o resolvedor premia colocação lá, não degrau. Com disputa de
      // 3º, `loserAdvance` já tirou essas partidas da conta.
      (round) =>
        !hasThirdPlaceMatch && maxLbRound > 0 && round >= maxLbRound - 1,
    ),
    knockout: tiersFromCounts(
      countEliminationsByRound(matches, (type) => type === "knockout"),
      (round) => round >= semifinalRound,
    ),
  };
}

module.exports = {tierForTopPosition, placementTiersFromMatches};

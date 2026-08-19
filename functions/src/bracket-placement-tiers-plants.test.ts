import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {placementTiersFromMatches, tierForTopPosition} from "./bracket-placement-tiers";
import {
  BRACKET_DEFINITIONS,
  bracketToMatchType,
} from "./bracket-definitions/bracket-definitions";

/**
 * As plantas são a fonte da verdade da chave. Um degrau derivado errado aqui
 * reescreve o ranking de um torneio inteiro, e nenhum teste sintético pega o
 * caso real da entrada desigual na LB das plantas 20-23 (perdedores da WB R2
 * entrando em rodadas diferentes) — que é justamente o cenário em que "contar
 * rodada" e "contar eliminados" divergem.
 *
 * As três invariantes abaixo valem para TODA planta, sem exceção:
 *   1. exatamente `N - 4` duplas recebem degrau (as outras 4 são o pódio);
 *   2. as faixas cobrem de 5 até N sem buraco nem sobreposição;
 *   3. o degrau de cada rodada é o da sua faixa, e nunca melhora conforme se
 *      cai mais cedo.
 */
describe("degraus contra as 25 plantas de dupla eliminação", () => {
  for (const [teamCount, definitions] of Object.entries(BRACKET_DEFINITIONS)) {
    const total = Number(teamCount);
    // Materializa a fiação como `buildMatchesFromDefinition` faz: a partida cujo
    // PERDEDOR é fonte de outra recebe `loserAdvance` — ou seja, não elimina.
    const destinoDoPerdedor = new Set<number>();
    const destinoDoVencedor = new Set<number>();
    for (const d of definitions) {
      for (const src of [d.teamA, d.teamB]) {
        if (src.type === "LOSER") destinoDoPerdedor.add(src.matchNumber);
        if (src.type === "WINNER") destinoDoVencedor.add(src.matchNumber);
      }
    }
    const matches = definitions.map((d) => ({
      matchType: bracketToMatchType(d.bracket),
      round: d.round,
      ...(destinoDoVencedor.has(d.matchNumber)
        ? {winnerAdvance: {matchNumber: 0, teamSlot: "teamAId"}}
        : {}),
      ...(destinoDoPerdedor.has(d.matchNumber)
        ? {loserAdvance: {matchNumber: 0, teamSlot: "teamAId"}}
        : {}),
    }));

    /** Quantas duplas cada rodada da LB ELIMINA (perdedor sem destino). */
    const lbCounts = new Map<number, number>();
    for (const d of definitions) {
      if (d.bracket !== "LB") continue;
      if (destinoDoPerdedor.has(d.matchNumber)) continue;
      lbCounts.set(d.round, (lbCounts.get(d.round) ?? 0) + 1);
    }

    it(`planta de ${total}: exatamente ${total - 4} duplas recebem degrau`, () => {
      const tiers = placementTiersFromMatches(matches);
      let comDegrau = 0;
      for (const [round, count] of lbCounts) {
        if (tiers.lb[round] != null) comDegrau += count;
      }
      assert.equal(comDegrau, total - 4);
    });

    it(`planta de ${total}: as faixas cobrem de 5 a ${total} sem buraco`, () => {
      const tiers = placementTiersFromMatches(matches);
      const rounds = Object.keys(tiers.lb)
        .map(Number)
        .sort((a, b) => b - a);

      let topo = 5;
      for (const round of rounds) {
        assert.equal(
          tiers.lb[round],
          tierForTopPosition(topo),
          `LB r${round} deveria ser o degrau da faixa que começa em ${topo}`,
        );
        topo += lbCounts.get(round) ?? 0;
      }
      assert.equal(topo - 1, total, "última colocação coberta");
    });
  }
});

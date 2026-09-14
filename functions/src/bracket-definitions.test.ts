import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {BRACKET_4_TEAMS} from "./bracket-definitions/bracket-4-teams";
import {BRACKET_5_TEAMS} from "./bracket-definitions/bracket-5-teams";
import {BRACKET_6_TEAMS} from "./bracket-definitions/bracket-6-teams";
import {BRACKET_7_TEAMS} from "./bracket-definitions/bracket-7-teams";
import {BRACKET_8_TEAMS} from "./bracket-definitions/bracket-8-teams";
import {BRACKET_9_TEAMS} from "./bracket-definitions/bracket-9-teams";
import {BRACKET_10_TEAMS} from "./bracket-definitions/bracket-10-teams";
import {BRACKET_11_TEAMS} from "./bracket-definitions/bracket-11-teams";
import {BRACKET_12_TEAMS} from "./bracket-definitions/bracket-12-teams";
import {BRACKET_13_TEAMS} from "./bracket-definitions/bracket-13-teams";
import {BRACKET_14_TEAMS} from "./bracket-definitions/bracket-14-teams";
import {BRACKET_15_TEAMS} from "./bracket-definitions/bracket-15-teams";
import {BRACKET_16_TEAMS} from "./bracket-definitions/bracket-16-teams";
import {BRACKET_17_TEAMS} from "./bracket-definitions/bracket-17-teams";
import {BRACKET_18_TEAMS} from "./bracket-definitions/bracket-18-teams";
import {BRACKET_19_TEAMS} from "./bracket-definitions/bracket-19-teams";
import {BRACKET_20_TEAMS} from "./bracket-definitions/bracket-20-teams";
import {BRACKET_21_TEAMS} from "./bracket-definitions/bracket-21-teams";
import {BRACKET_22_TEAMS} from "./bracket-definitions/bracket-22-teams";
import {BRACKET_23_TEAMS} from "./bracket-definitions/bracket-23-teams";
import {BRACKET_24_TEAMS} from "./bracket-definitions/bracket-24-teams";
import {BRACKET_25_TEAMS} from "./bracket-definitions/bracket-25-teams";
import {BRACKET_26_TEAMS} from "./bracket-definitions/bracket-26-teams";
import {BRACKET_27_TEAMS} from "./bracket-definitions/bracket-27-teams";
import {BRACKET_32_TEAMS} from "./bracket-definitions/bracket-32-teams";
import {
  BRACKET_DEFINITIONS,
  SUPPORTED_DE_TEAM_COUNTS,
  describeTeamCounts,
  type MatchDefinition,
  validateBracketDefinition,
} from "./bracket-definitions/bracket-definitions";
import {buildMatchesFromDefinition} from "./category-bracket-builders";

const ALL_BRACKET_DEFINITIONS: [number, MatchDefinition[]][] = [
  [4, BRACKET_4_TEAMS],
  [5, BRACKET_5_TEAMS],
  [6, BRACKET_6_TEAMS],
  [7, BRACKET_7_TEAMS],
  [8, BRACKET_8_TEAMS],
  [9, BRACKET_9_TEAMS],
  [10, BRACKET_10_TEAMS],
  [11, BRACKET_11_TEAMS],
  [12, BRACKET_12_TEAMS],
  [13, BRACKET_13_TEAMS],
  [14, BRACKET_14_TEAMS],
  [15, BRACKET_15_TEAMS],
  [16, BRACKET_16_TEAMS],
  [17, BRACKET_17_TEAMS],
  [18, BRACKET_18_TEAMS],
  [19, BRACKET_19_TEAMS],
  [20, BRACKET_20_TEAMS],
  [21, BRACKET_21_TEAMS],
  [22, BRACKET_22_TEAMS],
  [23, BRACKET_23_TEAMS],
  [24, BRACKET_24_TEAMS],
  [25, BRACKET_25_TEAMS],
  [26, BRACKET_26_TEAMS],
  [27, BRACKET_27_TEAMS],
  [32, BRACKET_32_TEAMS],
];

describe("validateBracketDefinition", () => {
  it("accepts a consistent definition", () => {
    const def: MatchDefinition[] = [
      {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 1}, teamB: {type: "SEED", seed: 2}},
      {matchNumber: 2, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 1}, teamB: {type: "LOSER", matchNumber: 1}},
    ];
    assert.doesNotThrow(() => validateBracketDefinition(def));
  });

  it("rejects a loser referenced by two matches", () => {
    const def: MatchDefinition[] = [
      {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 1}, teamB: {type: "SEED", seed: 2}},
      {matchNumber: 2, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 1}, teamB: {type: "BYE"}},
      {matchNumber: 3, bracket: "FINAL", round: 1, teamA: {type: "LOSER", matchNumber: 1}, teamB: {type: "WINNER", matchNumber: 1}},
    ];
    assert.throws(() => validateBracketDefinition(def), /LOSER.*#1/);
  });

  it("rejects references to missing matches", () => {
    const def: MatchDefinition[] = [
      {matchNumber: 1, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 9}, teamB: {type: "BYE"}},
    ];
    assert.throws(() => validateBracketDefinition(def), /inexistente/);
  });

  it("rejects a winner that advances nowhere", () => {
    const def: MatchDefinition[] = [
      {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 1}, teamB: {type: "SEED", seed: 2}},
      {matchNumber: 2, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 3}, teamB: {type: "SEED", seed: 4}},
      {matchNumber: 3, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 1}, teamB: {type: "LOSER", matchNumber: 1}},
    ];
    assert.throws(() => validateBracketDefinition(def), /WINNER\(#2\)/);
  });

  it("rejects reusing a loser from the LB outside the third place match", () => {
    const def: MatchDefinition[] = [
      {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 1}, teamB: {type: "SEED", seed: 2}},
      {matchNumber: 2, bracket: "LB", round: 1, teamA: {type: "LOSER", matchNumber: 1}, teamB: {type: "BYE"}},
      {matchNumber: 3, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 1}, teamB: {type: "LOSER", matchNumber: 2}},
    ];
    assert.throws(() => validateBracketDefinition(def), /LOSER\(#2\) da LB/);
  });

  it("rejects a FINAL that is not the last matchNumber", () => {
    const def: MatchDefinition[] = [
      {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 1}, teamB: {type: "SEED", seed: 2}},
      {matchNumber: 2, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 1}, teamB: {type: "BYE"}},
      {matchNumber: 3, bracket: "THIRD_PLACE", round: 1, teamA: {type: "LOSER", matchNumber: 1}, teamB: {type: "BYE"}},
    ];
    assert.throws(() => validateBracketDefinition(def), /FINAL \(#2\)/);
  });

  for (const [numTeams, def] of ALL_BRACKET_DEFINITIONS) {
    it(`accepts bracket-${numTeams}-teams`, () => {
      assert.doesNotThrow(() => validateBracketDefinition(def));
    });
  }
});

/** Invariantes de DUPLA eliminação que o validador estrutural não cobre —
 *  pegam o bug da planta de 27 (perdedor da WB #8 nunca descia pra LB e a
 *  dupla era eliminada com UMA derrota), que passava em 300 playthroughs do
 *  harness de jogabilidade (slot duplo/deadlock) sem acusar nada. */
describe("invariantes de dupla eliminação das plantas", () => {
  for (const [numTeams, def] of ALL_BRACKET_DEFINITIONS) {
    it(`bracket-${numTeams}-teams: seeds 1..${numTeams} exatamente uma vez, na WB`, () => {
      const seedCount = new Map<number, number>();
      for (const m of def) {
        for (const src of [m.teamA, m.teamB]) {
          if (src.type !== "SEED") continue;
          seedCount.set(src.seed, (seedCount.get(src.seed) ?? 0) + 1);
          assert.equal(m.bracket, "WB", `SEED ${src.seed} entra fora da WB (#${m.matchNumber})`);
        }
      }
      for (let s = 1; s <= numTeams; s++) {
        assert.equal(seedCount.get(s) ?? 0, 1, `SEED ${s} deveria aparecer exatamente 1x`);
      }
      assert.equal(seedCount.size, numTeams, "não pode haver SEED fora de 1..N");
    });

    it(`bracket-${numTeams}-teams: todo perdedor da WB é consumido (2ª chance)`, () => {
      const consumed = new Set<number>();
      for (const m of def) {
        for (const src of [m.teamA, m.teamB]) {
          if (src.type === "LOSER") consumed.add(src.matchNumber);
        }
      }
      for (const m of def) {
        if (m.bracket !== "WB") continue;
        assert.ok(
          consumed.has(m.matchNumber),
          `perdedor da WB #${m.matchNumber} não desce pra LB nem disputa 3º lugar ` +
            "(seria eliminado com uma derrota só)",
        );
      }
    });

    it(`bracket-${numTeams}-teams: ninguém joga com 2 derrotas (fora do 3º lugar)`, () => {
      const ordered = [...def].sort((a, b) => a.matchNumber - b.matchNumber);
      // Playthroughs determinísticos: favorito sempre, zebra sempre e 100 mistos.
      const pickers: Array<(a: number, b: number, i: number) => number> = [
        (a, b) => Math.min(a, b),
        (a, b) => Math.max(a, b),
      ];
      for (let s = 0; s < 100; s++) {
        pickers.push((a, b, i) => ((i * 2654435761 + s * 40503) >>> (i % 16)) % 2 === 0 ? a : b);
      }
      for (const pick of pickers) {
        const results = new Map<number, {winner: number; loser: number}>();
        const losses = new Map<number, number>();
        const resolve = (src: MatchDefinition["teamA"]): number | null => {
          if (src.type === "SEED") return src.seed;
          if (src.type === "BYE") return null;
          const r = results.get(src.matchNumber);
          assert.ok(r, `#${src.matchNumber} referenciado antes de ser jogado`);
          return src.type === "WINNER" ? r!.winner : r!.loser;
        };
        let i = 0;
        for (const m of ordered) {
          const a = resolve(m.teamA);
          const b = resolve(m.teamB);
          assert.ok(a != null && b != null, `#${m.matchNumber} com BYE não resolvido`);
          assert.notEqual(a, b, `#${m.matchNumber} com a mesma dupla dos dois lados`);
          if (m.bracket !== "THIRD_PLACE") {
            assert.ok(
              (losses.get(a!) ?? 0) < 2,
              `seed ${a} joga #${m.matchNumber} (${m.bracket}) já eliminado (2 derrotas)`,
            );
            assert.ok(
              (losses.get(b!) ?? 0) < 2,
              `seed ${b} joga #${m.matchNumber} (${m.bracket}) já eliminado (2 derrotas)`,
            );
          }
          const winner = pick(a!, b!, i++);
          const loser = winner === a ? b! : a!;
          losses.set(loser, (losses.get(loser) ?? 0) + 1);
          results.set(m.matchNumber, {winner, loser});
        }
        // Todas as N duplas jogam ao menos uma vez.
        const played = new Set<number>();
        for (const r of results.values()) {
          played.add(r.winner);
          played.add(r.loser);
        }
        assert.equal(played.size, numTeams, "toda dupla precisa jogar ao menos 1 partida");
        // Campeão da grande final termina com no máximo 1 derrota.
        const finalMatch = def.find((m) => m.bracket === "FINAL")!;
        const champion = results.get(finalMatch.matchNumber)!.winner;
        assert.ok(
          (losses.get(champion) ?? 0) <= 1,
          `campeão (seed ${champion}) com ${losses.get(champion)} derrotas`,
        );
      }
    });
  }
});

describe("buildMatchesFromDefinition", () => {
  const def: MatchDefinition[] = [
    {matchNumber: 1, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 1}, teamB: {type: "SEED", seed: 4}},
    {matchNumber: 2, bracket: "WB", round: 1, teamA: {type: "SEED", seed: 3}, teamB: {type: "SEED", seed: 2}},
    {matchNumber: 3, bracket: "FINAL", round: 1, teamA: {type: "WINNER", matchNumber: 1}, teamB: {type: "WINNER", matchNumber: 2}},
  ];

  it("resolves SEED slots from the seeding order", () => {
    const out = buildMatchesFromDefinition(def, ["a", "b", "c", "d"]);
    const m1 = out.find((m) => m.matchNumber === 1)!;
    assert.equal(m1.teamAId, "a"); // seed 1
    assert.equal(m1.teamBId, "d"); // seed 4
    const m2 = out.find((m) => m.matchNumber === 2)!;
    assert.equal(m2.teamAId, "c"); // seed 3
    assert.equal(m2.teamBId, "b"); // seed 2
  });

  it("fills placeholders and wires WINNER advances to the source match", () => {
    const out = buildMatchesFromDefinition(def, ["a", "b", "c", "d"]);
    const final = out.find((m) => m.matchNumber === 3)!;
    assert.equal(final.matchType, "Final");
    assert.equal(final.teamAId, "");
    assert.equal(final.teamADescription, "Vencedor Jogo #1");
    assert.equal(final.teamBDescription, "Vencedor Jogo #2");

    const m1 = out.find((m) => m.matchNumber === 1)!;
    assert.deepEqual(m1.winnerAdvance, {matchNumber: 3, teamSlot: "teamAId"});
    const m2 = out.find((m) => m.matchNumber === 2)!;
    assert.deepEqual(m2.winnerAdvance, {matchNumber: 3, teamSlot: "teamBId"});
  });
});

/** O conjunto de plantas tem buraco (não há 28–31). A mensagem que o
 *  organizador lê ao ser bloqueado sai daqui, e um "4 a 32" prometeria uma
 *  quantidade que `generateCategoryBracket` recusa. */
describe("describeTeamCounts", () => {
  it("agrupa contíguos em faixas e separa o avulso", () => {
    assert.equal(describeTeamCounts([4, 5, 6, 32]), "4 a 6 ou 32");
    assert.equal(describeTeamCounts([4, 5, 6, 7]), "4 a 7");
    assert.equal(describeTeamCounts([32]), "32");
    assert.equal(describeTeamCounts([4, 8, 16]), "4, 8 ou 16");
    assert.equal(describeTeamCounts([]), "");
  });

  it("descreve as plantas registradas sem prometer 28 a 31", () => {
    assert.equal(describeTeamCounts(SUPPORTED_DE_TEAM_COUNTS), "4 a 27 ou 32");
    for (const n of [28, 29, 30, 31]) {
      assert.equal(BRACKET_DEFINITIONS[n], undefined, `${n} não tem planta`);
    }
  });

  it("cada tamanho que a descrição promete tem planta de verdade", () => {
    for (const n of SUPPORTED_DE_TEAM_COUNTS) {
      assert.ok(BRACKET_DEFINITIONS[n], `${n} anunciado mas sem planta`);
    }
    assert.equal(
      SUPPORTED_DE_TEAM_COUNTS.length,
      Object.keys(BRACKET_DEFINITIONS).length,
    );
  });
});

/**
 * ENTRADA CRUZADA NA CHAVE DE PERDEDORES. Nas plantas cuja LB R1 é um bloco
 * limpo de perdedores da WB R1, quem perde na metade de CIMA da WB entra pela
 * metade de BAIXO do bloco da LB, e vice-versa. É regra do dono, pela leitura
 * do atleta na tabela impressa — "perdi em cima, vou pra baixo" — e a fiação
 * sequencial é o "conserto" óbvio que alguém faria achando que a inversão é
 * deslize de transcrição.
 *
 * A lista é explícita de propósito: derivar o formato por heurística faria a
 * planta sair da cobertura em silêncio no dia em que alguém mudasse a forma da
 * LB R1 dela. As demais plantas não entram aqui porque já cruzam de outro
 * jeito — casam um perdedor de cima com um de baixo DENTRO da mesma partida.
 */
describe("entrada cruzada na chave de perdedores", () => {
  const PLANTAS_CRUZADAS = [8, 14, 16, 26, 32];

  for (const numTeams of PLANTAS_CRUZADAS) {
    const def = ALL_BRACKET_DEFINITIONS.find(([n]) => n === numTeams)![1];

    it(`bracket-${numTeams}-teams: perdedor de cima entra por baixo, e vice-versa`, () => {
      const wb1 = def
        .filter((m) => m.bracket === "WB" && m.round === 1)
        .map((m) => m.matchNumber)
        .sort((a, b) => a - b);
      const lb1 = def
        .filter((m) => m.bracket === "LB" && m.round === 1)
        .sort((a, b) => a.matchNumber - b.matchNumber);

      assert.ok(lb1.length >= 2 && lb1.length % 2 === 0, "LB R1 precisa de metades");
      const metadeDeCima = (posicao: number, total: number) => posicao < total / 2;

      lb1.forEach((m, i) => {
        const ladoDeCimaNaLb = metadeDeCima(i, lb1.length);
        for (const src of [m.teamA, m.teamB]) {
          assert.equal(src.type, "LOSER", `#${m.matchNumber} não recebe perdedor`);
          const origem = (src as {matchNumber: number}).matchNumber;
          const posicao = wb1.indexOf(origem);
          assert.ok(posicao >= 0, `#${m.matchNumber} recebe perdedor de fora da WB R1`);
          assert.notEqual(
            metadeDeCima(posicao, wb1.length),
            ladoDeCimaNaLb,
            `#${m.matchNumber} (metade ${ladoDeCimaNaLb ? "de cima" : "de baixo"} da LB) ` +
              `recebe o perdedor da #${origem}, da mesma metade da WB`,
          );
        }
      });
    });
  }
});

/**
 * PRIMEIRO REENCONTRO POSSÍVEL. Seguindo a fiação, o vencedor e o perdedor de
 * uma mesma partida podem voltar a se cruzar. Nenhuma planta consegue empurrar
 * o reencontro para depois da final: é limite do formato, não da fiação.
 *
 * Os números abaixo são o que cada planta alcança hoje e travam a única coisa
 * que nenhum outro teste vê: as entradas ESPELHADAS/CRUZADAS de quem cai da WB
 * (a da R2, a da R3, a das semis). Mexer em qualquer uma delas antecipa o
 * reencontro — na de 32, "arrumar" o espelho da R2 derruba de #55 para #49 —
 * sem quebrar nenhum outro invariante. O teste passaria em silêncio e duas
 * duplas se reencontrariam no meio da chave.
 */
describe("primeiro reencontro possível por planta", () => {
  const PRIMEIRO_REENCONTRO: Record<number, number> = {
    4: 5, 5: 6, 6: 8, 7: 10, 8: 12, 9: 12, 10: 13, 11: 17, 12: 17,
    13: 19, 14: 21, 15: 23, 16: 25, 17: 19, 18: 21, 19: 23, 20: 25,
    21: 27, 22: 29, 23: 31, 24: 33, 25: 35, 26: 37, 27: 29, 32: 55,
  };

  type Destino = {match: number; slot: "A" | "B"};

  /** Para onde vai o vencedor e para onde vai o perdedor de cada partida. */
  function avancos(def: MatchDefinition[]) {
    const vencedor = new Map<number, Destino>();
    const perdedor = new Map<number, Destino>();
    for (const m of def) {
      for (const [slot, src] of [["A", m.teamA], ["B", m.teamB]] as const) {
        const destino: Destino = {match: m.matchNumber, slot};
        if (src.type === "WINNER") vencedor.set(src.matchNumber, destino);
        if (src.type === "LOSER") perdedor.set(src.matchNumber, destino);
      }
    }
    return {vencedor, perdedor};
  }

  for (const [numTeams, def] of ALL_BRACKET_DEFINITIONS) {
    it(`bracket-${numTeams}-teams: ninguém se reencontra antes da #${PRIMEIRO_REENCONTRO[numTeams]}`, () => {
      const {vencedor, perdedor} = avancos(def);

      /** Partidas (com o slot) que quem sai de `destino` ainda pode alcançar. */
      const alcance = (destino: Destino | undefined): Set<string> => {
        if (!destino) return new Set();
        const alcancadas = new Set([`${destino.match}:${destino.slot}`]);
        for (const seguinte of [vencedor.get(destino.match), perdedor.get(destino.match)]) {
          for (const chave of alcance(seguinte)) alcancadas.add(chave);
        }
        return alcancadas;
      };

      let maisCedo = {origem: 0, reencontro: Number.POSITIVE_INFINITY};
      for (const m of def) {
        const ganhou = alcance(vencedor.get(m.matchNumber));
        const perdeu = alcance(perdedor.get(m.matchNumber));
        for (const chave of ganhou) {
          const [partida, slot] = chave.split(":");
          if (!perdeu.has(`${partida}:${slot === "A" ? "B" : "A"}`)) continue;
          if (Number(partida) < maisCedo.reencontro) {
            maisCedo = {origem: m.matchNumber, reencontro: Number(partida)};
          }
        }
      }

      assert.equal(
        maisCedo.reencontro,
        PRIMEIRO_REENCONTRO[numTeams],
        `vencedor e perdedor da #${maisCedo.origem} podem se reencontrar já na ` +
          `#${maisCedo.reencontro}`,
      );
    });
  }
});

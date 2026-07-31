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
import {
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

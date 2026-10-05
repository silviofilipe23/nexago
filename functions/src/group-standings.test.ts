import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {computePoolStandings, type GroupMatchData} from "./group-standings";

const BT = {kind: "sets_games", bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: "super_tiebreak", superTiebreakTo: 10};

/**
 * Ciclo A>B, B>C, C>A. A e B empatam em vitórias e em saldo de games (+3); B tem saldo de
 * sets maior (+1 × 0), mas A venceu o confronto direto.
 */
function cycle(profile?: unknown): GroupMatchData[] {
  const base = {poolId: "P", status: "Completed", isGroupMatch: true, bestOf: 3, ...(profile ? {scoringProfile: profile} : {})};
  return [
    {...base, teamAId: "A", teamBId: "B", winnerId: "A", sets: [{a: 4, b: 6}, {a: 6, b: 4}, {a: 1, b: 0}]},
    {...base, teamAId: "B", teamBId: "C", winnerId: "B", sets: [{a: 6, b: 4}, {a: 6, b: 4}]},
    {...base, teamAId: "A", teamBId: "C", winnerId: "C", sets: [{a: 6, b: 2}, {a: 6, b: 7}, {a: 0, b: 1}]},
  ];
}

describe("computePoolStandings · critério por tipo", () => {
  it("games: saldo de sets decide antes do confronto direto", () => {
    assert.deepEqual(computePoolStandings("P", ["A", "B", "C"], cycle(BT)), ["B", "A", "C"]);
  });

  it("pontos (sem carimbo): saldo de pontos e confronto direto, como sempre", () => {
    assert.deepEqual(computePoolStandings("P", ["A", "B", "C"], cycle()), ["A", "B", "C"]);
  });

  it("games: empate em sets e games cai no confronto direto", () => {
    const base = {poolId: "P", status: "Completed", isGroupMatch: true, bestOf: 3, scoringProfile: BT};
    const matches: GroupMatchData[] = [
      {...base, teamAId: "A", teamBId: "B", winnerId: "B", sets: [{a: 4, b: 6}, {a: 4, b: 6}]},
      {...base, teamAId: "A", teamBId: "C", winnerId: "A", sets: [{a: 6, b: 4}, {a: 6, b: 4}]},
      {...base, teamAId: "B", teamBId: "C", winnerId: "C", sets: [{a: 4, b: 6}, {a: 4, b: 6}]},
    ];
    // Todos com 1 vitória, saldo de sets 0 e de games 0: confronto direto de 3 vira ciclo, âncora = seed.
    assert.deepEqual(computePoolStandings("P", ["A", "B", "C"], matches), ["A", "B", "C"]);
  });
});

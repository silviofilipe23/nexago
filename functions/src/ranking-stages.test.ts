import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {collectRankingStageTournaments} from "./ranking-stages";

describe("collectRankingStageTournaments (backfill)", () => {
  it("junta os torneios por esporte, com o maior ano do resultado", () => {
    const stages = collectRankingStageTournaments([
      {sport: "VOLEI_PRAIA", results: [
        {tournamentId: "T1", categoryId: "C1", year: 2025},
        {tournamentId: "T2", categoryId: "C1", year: 2026},
      ]},
      {sport: "VOLEI_PRAIA", results: [{tournamentId: "T1", categoryId: "C2", year: 2026}]},
      {sport: "BEACH_TENNIS", results: [{tournamentId: "T9", year: 2026}]},
    ]);
    assert.deepEqual([...stages.keys()].sort(), ["BEACH_TENNIS", "VOLEI_PRAIA"]);
    assert.deepEqual(Object.fromEntries(stages.get("VOLEI_PRAIA")!), {T1: 2026, T2: 2026});
    assert.deepEqual(Object.fromEntries(stages.get("BEACH_TENNIS")!), {T9: 2026});
  });

  it("ignora doc sem esporte, sem results ou com linha quebrada", () => {
    const stages = collectRankingStageTournaments([
      {results: [{tournamentId: "T1", year: 2026}]},
      {sport: "VOLEI_PRAIA"},
      {sport: "VOLEI_PRAIA", results: [null, "x", {tournamentId: "  ", year: 2026}]},
    ]);
    assert.equal(stages.size, 0);
  });
});

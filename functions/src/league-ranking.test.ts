import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  effectivePointsFromStageResults,
  loadTeamAthleteIds,
  parseCountingStagesMode,
  placementPoints,
  pointsForBucket,
  pointsForPlace,
  resolveLeaguePlacementsFromMatch,
  tryAwardLeagueStagePointsForMatch,
} from "./league-ranking";

const DEFAULT_TABLE = {
  "1": 450,
  "2": 280,
  "3": 180,
  "4": 120,
  quarters: 80,
  groups: 40,
};

function completedMatch(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    status: "Completed",
    teamAId: "team-a",
    teamBId: "team-b",
    winnerId: "team-a",
    ...overrides,
  };
}

describe("parseCountingStagesMode", () => {
  it("defaults to best_4_of_6", () => {
    assert.equal(parseCountingStagesMode(null), "best_4_of_6");
    assert.equal(parseCountingStagesMode("unknown"), "best_4_of_6");
  });

  it("parses known modes", () => {
    assert.equal(parseCountingStagesMode("best_3_of_5"), "best_3_of_5");
    assert.equal(parseCountingStagesMode("all_stages"), "all_stages");
  });
});

describe("pointsForPlace and pointsForBucket", () => {
  it("uses defaults", () => {
    assert.equal(pointsForPlace(DEFAULT_TABLE, 1), 450);
    assert.equal(pointsForPlace(DEFAULT_TABLE, 3), 180);
    assert.equal(pointsForBucket(DEFAULT_TABLE, "quarters"), 80);
    assert.equal(pointsForBucket(DEFAULT_TABLE, "groups"), 40);
  });

  it("resolves placementPoints from award", () => {
    assert.equal(
      placementPoints(DEFAULT_TABLE, {teamId: "t1", place: 2}),
      280,
    );
    assert.equal(
      placementPoints(DEFAULT_TABLE, {teamId: "t1", bucket: "groups"}),
      40,
    );
  });
});

describe("resolveLeaguePlacementsFromMatch", () => {
  const noThirdPlace = {
    hasThirdPlaceMatch: false,
    isDoubleElimination: false,
    maxLbRound: 0,
  };

  it("awards 1st and 2nd on Final", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "Final"}),
      noThirdPlace,
    );
    assert.deepEqual(awards, [
      {teamId: "team-a", place: 1},
      {teamId: "team-b", place: 2},
    ]);
  });

  it("awards 3rd and 4th on Third Place", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "Third Place"}),
      {...noThirdPlace, hasThirdPlaceMatch: true},
    );
    assert.deepEqual(awards, [
      {teamId: "team-a", place: 3},
      {teamId: "team-b", place: 4},
    ]);
  });

  it("awards quarters to QF loser", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "Quarter-Final"}),
      noThirdPlace,
    );
    assert.deepEqual(awards, [{teamId: "team-b", bucket: "quarters"}]);
  });

  it("defers semi loser when third place match exists", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "Semi-Final"}),
      {...noThirdPlace, hasThirdPlaceMatch: true},
    );
    assert.deepEqual(awards, []);
  });

  it("awards 3rd to semi loser without third place match", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "Semi-Final"}),
      noThirdPlace,
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 3}]);
  });

  it("awards 3rd to knockout round 1 loser numa chave de 4 (final round 2)", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "knockout", round: 1}),
      {...noThirdPlace, knockoutFinalRound: 2},
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 3}]);
  });

  it("legado: sem knockoutFinalRound, round 1 ainda é semifinal", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "knockout", round: 1}),
      noThirdPlace,
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 3}]);
  });

  it("chave de 8: round 1 (oitavas/quartas) perdedor vai p/ 'quarters'", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "knockout", round: 1}),
      {...noThirdPlace, knockoutFinalRound: 3},
    );
    assert.deepEqual(awards, [{teamId: "team-b", bucket: "quarters"}]);
  });

  it("chave de 8: round 2 (semifinal) perdedor sem 3º lugar vira 3º", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "knockout", round: 2}),
      {...noThirdPlace, knockoutFinalRound: 3},
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 3}]);
  });

  it("chave de 8: semifinal com disputa de 3º lugar é adiada", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "knockout", round: 2}),
      {
        ...noThirdPlace,
        hasThirdPlaceMatch: true,
        knockoutFinalRound: 3,
      },
    );
    assert.deepEqual(awards, []);
  });

  it("ignores group matches", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "group", isGroupMatch: true}),
      noThirdPlace,
    );
    assert.deepEqual(awards, []);
  });

  it("ignores incomplete matches", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      {
        status: "In Progress",
        matchType: "Final",
        teamAId: "team-a",
        teamBId: "team-b",
        winnerId: "team-a",
      },
      noThirdPlace,
    );
    assert.deepEqual(awards, []);
  });

  it("ignores WB losses in double elimination", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "WB", round: 1}),
      {...noThirdPlace, isDoubleElimination: true, maxLbRound: 2},
    );
    assert.deepEqual(awards, []);
  });

  it("awards 3rd on last LB round in double elimination", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "LB", round: 2}),
      {...noThirdPlace, isDoubleElimination: true, maxLbRound: 2},
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 3}]);
  });

  it("awards 4th on penultimate LB round in double elimination", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "LB", round: 1}),
      {...noThirdPlace, isDoubleElimination: true, maxLbRound: 2},
    );
    assert.deepEqual(awards, [{teamId: "team-b", place: 4}]);
  });

  it("awards quarters on early LB elimination", () => {
    const awards = resolveLeaguePlacementsFromMatch(
      completedMatch({matchType: "LB", round: 1}),
      {...noThirdPlace, isDoubleElimination: true, maxLbRound: 4},
    );
    assert.deepEqual(awards, [{teamId: "team-b", bucket: "quarters"}]);
  });

  // Incidente 18/08 (Copa Goiás): a disputa de 3º lugar tinha winnerId igual ao
  // id do TORNEIO. Sem guarda, o loser virava teamAId e o 3º lugar era premiado
  // a um time inexistente — com dois times marcados em 4º na mesma categoria.
  it("nega colocação quando o vencedor não é nenhum dos dois lados", () => {
    const strayWinner = {winnerId: "tournament-copa-goias"};
    assert.deepEqual(
      resolveLeaguePlacementsFromMatch(
        completedMatch({matchType: "Third Place", ...strayWinner}),
        {hasThirdPlaceMatch: true},
      ),
      [],
    );
    assert.deepEqual(
      resolveLeaguePlacementsFromMatch(
        completedMatch({matchType: "Final", ...strayWinner}),
        noThirdPlace,
      ),
      [],
    );
    assert.deepEqual(
      resolveLeaguePlacementsFromMatch(
        completedMatch({matchType: "Semifinal", ...strayWinner}),
        noThirdPlace,
      ),
      [],
    );
    assert.deepEqual(
      resolveLeaguePlacementsFromMatch(
        completedMatch({matchType: "LB", round: 2, ...strayWinner}),
        {...noThirdPlace, isDoubleElimination: true, maxLbRound: 2},
      ),
      [],
    );
  });
});

describe("effectivePointsFromStageResults", () => {
  const stages = [
    {points: 450},
    {points: 280},
    {points: 180},
    {points: 120},
    {points: 80},
    {points: 40},
  ];

  it("sums all stages when mode is all_stages", () => {
    assert.equal(
      effectivePointsFromStageResults(stages, "all_stages"),
      1150,
    );
  });

  it("keeps top 4 for best_4_of_6", () => {
    assert.equal(
      effectivePointsFromStageResults(stages, "best_4_of_6"),
      1030,
    );
  });

  it("keeps top 3 for best_3_of_5", () => {
    assert.equal(
      effectivePointsFromStageResults(stages, "best_3_of_5"),
      910,
    );
  });

  it("ignores invalid points", () => {
    assert.equal(
      effectivePointsFromStageResults(
        [{points: 100}, {points: "x"}, {points: -5}, {points: 50}],
        "best_3_of_5",
      ),
      150,
    );
  });
});

describe("loadTeamAthleteIds", () => {
  const projectId = "proj-test";
  const teamPath = (teamId: string) =>
    `artifacts/${projectId}/public/data/teams/${teamId}`;
  const db = (fake: FakeFirestore) => fake as unknown as Firestore;

  it("usa memberUids quando existir (equipe trio/quarteto/quinteto)", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(teamPath("team-1"), {
      memberUids: ["cap", "m2", "m3", "m4"],
      player1Id: "cap",
      player2Id: "m2",
    });
    assert.deepEqual(
      await loadTeamAthleteIds(db(fake), projectId, "team-1"),
      ["cap", "m2", "m3", "m4"],
    );
  });

  it("deduplica e ignora entradas vazias de memberUids", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(teamPath("team-1"), {
      memberUids: ["cap", " ", "cap", "m2"],
    });
    assert.deepEqual(
      await loadTeamAthleteIds(db(fake), projectId, "team-1"),
      ["cap", "m2"],
    );
  });

  it("cai em player1Id/player2Id na dupla legada sem memberUids", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(teamPath("team-1"), {player1Id: "p1", player2Id: "p2"});
    assert.deepEqual(
      await loadTeamAthleteIds(db(fake), projectId, "team-1"),
      ["p1", "p2"],
    );
  });

  it("retorna vazio para doc inexistente", async () => {
    const fake = new FakeFirestore();
    assert.deepEqual(
      await loadTeamAthleteIds(db(fake), projectId, "team-x"),
      [],
    );
  });
});

describe("tryAwardLeagueStagePointsForMatch — bucket groups por preset", () => {
  const PROJECT = "proj";

  function leagueSeededDb(categoryPresetFields: Record<string, unknown>): FakeFirestore {
    const fake = new FakeFirestore();
    fake.seedDoc("tournaments/T1", {
      leagueId: "L1",
      leagueStageId: "stage-1",
      leagueStageOrder: 1,
      categories: [{categoryName: "C1", ...categoryPresetFields}],
    });
    fake.seedDoc("leagues/L1", {});
    fake.seedDoc(`artifacts/${PROJECT}/public/data/teams/tA`, {player1Id: "a1", player2Id: "a2"});
    fake.seedDoc(`artifacts/${PROJECT}/public/data/teams/tB`, {player1Id: "b1", player2Id: "b2"});
    fake.seedDoc(`artifacts/${PROJECT}/public/data/teams/tC`, {player1Id: "c1"});
    // A final marca tA/tB como times de mata-mata; tC fica de fora (só grupos).
    fake.seedDoc(`artifacts/${PROJECT}/public/data/matches/m-final`, finalMatch());
    for (const teamId of ["tA", "tB", "tC"]) {
      fake.seedDoc(`artifacts/${PROJECT}/public/data/inscriptions/i-${teamId}`, {
        tournamentId: "T1",
        categoryId: "C1",
        teamId,
        isPaid: true,
      });
    }
    return fake;
  }

  function finalMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "m-final",
      status: "Completed",
      tournamentId: "T1",
      categoryId: "C1",
      teamAId: "tA",
      teamBId: "tB",
      winnerId: "tA",
      matchType: "Final",
      ...overrides,
    };
  }

  it("Livre não concede bucket groups (times fora do mata-mata ficam sem pontos)", async () => {
    const fake = leagueSeededDb({level: "Open", minLevel: "Iniciante 1"});
    const result = await tryAwardLeagueStagePointsForMatch(
      fake as never,
      PROJECT,
      finalMatch(),
    );

    assert.equal(
      fake.store.get(`artifacts/${PROJECT}/public/data/leagueTeamRankings/L1_C1_tC`),
      undefined,
    );
    // A final segue pontuando normalmente (não é o bucket groups).
    assert.equal(result.teamsUpdated, 2);
  });

  it("Intermediário (controle) segue concedendo groups", async () => {
    const fake = leagueSeededDb({level: "Intermediário 2", minLevel: "Intermediário 1"});
    const result = await tryAwardLeagueStagePointsForMatch(
      fake as never,
      PROJECT,
      finalMatch(),
    );

    const groupsTeam = fake.store.get(
      `artifacts/${PROJECT}/public/data/leagueTeamRankings/L1_C1_tC`,
    )!;
    assert.equal(groupsTeam.totalPoints, 40);
    assert.equal(result.teamsUpdated, 3);
  });
});

describe("escada por fase alcançada — tabela da liga", () => {
  it("default ganha oitavas e 16-avos", () => {
    assert.strictEqual(pointsForBucket({}, "r16"), 60);
    assert.strictEqual(pointsForBucket({}, "r32"), 45);
  });

  it("tabela customizada SEM os degraus novos cai no default deles", () => {
    // Liga criada antes desta mudança: só tem as chaves antigas.
    const antiga = {"1": 500, "2": 300, "3": 200, "4": 150, quarters: 90, groups: 50};
    assert.strictEqual(pointsForBucket(antiga, "quarters"), 90); // respeita o custom
    assert.strictEqual(pointsForBucket(antiga, "r16"), 60); // default do degrau novo
    assert.strictEqual(pointsForBucket(antiga, "r32"), 45);
  });

  it("degrau customizado é respeitado", () => {
    assert.strictEqual(pointsForBucket({r16: 70}, "r16"), 70);
  });
});

import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  aggregateRankingResults,
  athleteRankingsPath,
  finalPlaceForAward,
  globalPointsForAward,
  isGlobalRankingEligible,
  teamRankingsPath,
  tournamentCategoryResultsPath,
  tryAwardGlobalRankingForMatch,
  upsertRankingResult,
} from "./tournament-ranking";

const PROJECT = "proj";
const ENDED_AT = Timestamp.fromDate(new Date("2026-06-01T18:00:00Z"));

describe("finalPlaceForAward / globalPointsForAward", () => {
  it("mapeia colocação → finalPlace e pontos da tabela", () => {
    assert.equal(finalPlaceForAward({teamId: "t", place: 1}), 1);
    assert.equal(finalPlaceForAward({teamId: "t", bucket: "quarters"}), 5);
    assert.equal(finalPlaceForAward({teamId: "t", bucket: "groups"}), 9);

    assert.equal(globalPointsForAward({teamId: "t", place: 1}, 1), 100);
    assert.equal(globalPointsForAward({teamId: "t", place: 2}, 1), 80);
    assert.equal(globalPointsForAward({teamId: "t", place: 3}, 1), 60);
    assert.equal(globalPointsForAward({teamId: "t", place: 4}, 1), 50);
    assert.equal(globalPointsForAward({teamId: "t", bucket: "quarters"}, 1), 33);
    assert.equal(globalPointsForAward({teamId: "t", bucket: "groups"}, 1), 10);
  });

  it("aplica rankingWeight (peso por grade) com saneamento", () => {
    assert.equal(globalPointsForAward({teamId: "t", place: 1}, 1.5), 150);
    assert.equal(globalPointsForAward({teamId: "t", place: 1}, 0), 100);
    assert.equal(globalPointsForAward({teamId: "t", place: 1}, Number.NaN), 100);
  });
});

describe("aggregateRankingResults", () => {
  it("soma os melhores 5 por ano (best-N) e o total entre anos", () => {
    const results = [40, 100, 10, 60, 33, 80].map((points, index) => ({
      tournamentId: `t${index}`,
      categoryId: "c",
      finalPlace: 1,
      points,
      year: 2026,
    }));
    results.push({tournamentId: "old", categoryId: "c", finalPlace: 1, points: 50, year: 2025});

    const aggregates = aggregateRankingResults(results);
    // 2026: melhores 5 de [100,80,60,40,33,10] = 313 (o 10 fica de fora).
    assert.equal(aggregates.pointsByYear["2026"], 313);
    assert.equal(aggregates.pointsByYear["2025"], 50);
    assert.equal(aggregates.totalPoints, 363);
    assert.equal(aggregates.tournamentsCount, 7);
  });
});

describe("upsertRankingResult", () => {
  const entry = {tournamentId: "t1", categoryId: "c1", finalPlace: 2, points: 80, year: 2026};

  it("insere, substitui por chave tournamentId_categoryId e detecta no-op", () => {
    const inserted = upsertRankingResult([], entry)!;
    assert.equal(inserted.length, 1);

    // Mesmo resultado → no-op (null) p/ não reescrever o doc à toa.
    assert.equal(upsertRankingResult(inserted, entry), null);

    // Correção (novo finalPlace) substitui a entrada, sem duplicar.
    const corrected = upsertRankingResult(inserted, {...entry, finalPlace: 1, points: 100})!;
    assert.equal(corrected.length, 1);
    assert.equal(corrected[0].points, 100);
  });
});

// ─── Fluxo completo com Firestore fake ───────────────────────────────────────

function seededDb(opts: {paidTeams?: number} = {}): FakeFirestore {
  const paidTeams = opts.paidTeams ?? 10;
  const db = new FakeFirestore();
  db.seedDoc("tournaments/T1", {sport: "beachVolleyball"});
  db.seedDoc(`artifacts/${PROJECT}/public/data/teams/tA`, {player1Id: "a1", player2Id: "a2"});
  db.seedDoc(`artifacts/${PROJECT}/public/data/teams/tB`, {player1Id: "b1", player2Id: "b2"});
  // A final em `matches` marca tA/tB como times de mata-mata (o bucket "groups"
  // não pode engolir o pódio); as inscrições pagas dão o tamanho da categoria
  // pro gate de elegibilidade.
  db.seedDoc(`artifacts/${PROJECT}/public/data/matches/m-final`, finalMatch());
  const teamIds = ["tA", "tB"];
  for (let i = 1; i <= Math.max(0, paidTeams - 2); i++) teamIds.push(`tG${i}`);
  teamIds.slice(0, paidTeams).forEach((teamId, index) => {
    db.seedDoc(`artifacts/${PROJECT}/public/data/inscriptions/i${index}`, {
      tournamentId: "T1",
      categoryId: "C1",
      teamId,
      isPaid: true,
    });
  });
  return db;
}

function finalMatch(overrides: DocData = {}): DocData {
  return {
    id: "m-final",
    status: "Completed",
    tournamentId: "T1",
    categoryId: "C1",
    teamAId: "tA",
    teamBId: "tB",
    winnerId: "tA",
    matchType: "Final",
    matchEndedAt: ENDED_AT,
    ...overrides,
  };
}

describe("tryAwardGlobalRankingForMatch", () => {
  it("final concede 1º/2º e alimenta resultados + agregados (sem leagueId)", async () => {
    const db = seededDb();
    const result = await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    assert.equal(result.awarded, true);

    const champion = db.store.get(
      `${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`,
    )!;
    assert.equal(champion.finalPlace, 1);
    assert.equal(champion.pointsEarned, 100);
    assert.equal(champion.year, 2026);

    const runnerUp = db.store.get(
      `${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tB`,
    )!;
    assert.equal(runnerUp.finalPlace, 2);
    assert.equal(runnerUp.pointsEarned, 80);

    const teamAgg = db.store.get(`${teamRankingsPath(PROJECT)}/tA`)!;
    assert.equal(teamAgg.totalPoints, 100);
    assert.equal(teamAgg.tournamentsCount, 1);
    assert.deepEqual(teamAgg.pointsByYear, {"2026": 100});

    for (const uid of ["a1", "a2"]) {
      const athleteAgg = db.store.get(`${athleteRankingsPath(PROJECT)}/${uid}`)!;
      assert.equal(athleteAgg.totalPoints, 100, uid);
    }
    for (const uid of ["b1", "b2"]) {
      const athleteAgg = db.store.get(`${athleteRankingsPath(PROJECT)}/${uid}`)!;
      assert.equal(athleteAgg.totalPoints, 80, uid);
    }
  });

  it("re-run é idempotente (upsert não duplica nem soma de novo)", async () => {
    const db = seededDb();
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    const rerun = await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    assert.equal(rerun.teamsUpdated, 0);

    const teamAgg = db.store.get(`${teamRankingsPath(PROJECT)}/tA`)!;
    assert.equal(teamAgg.totalPoints, 100);
    assert.equal((teamAgg.results as unknown[]).length, 1);
  });

  it("correção de vencedor troca as colocações via upsert", async () => {
    const db = seededDb();
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch({winnerId: "tB"}));

    const teamA = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`)!;
    assert.equal(teamA.finalPlace, 2);
    const aggA = db.store.get(`${teamRankingsPath(PROJECT)}/tA`)!;
    assert.equal(aggA.totalPoints, 80);
    const aggB = db.store.get(`${teamRankingsPath(PROJECT)}/tB`)!;
    assert.equal(aggB.totalPoints, 100);
  });

  it("times pagos fora do mata-mata pontuam pela fase de grupos", async () => {
    const db = seededDb();
    db.seedDoc(`artifacts/${PROJECT}/public/data/teams/tC`, {player1Id: "c1"});
    db.seedDoc(`artifacts/${PROJECT}/public/data/inscriptions/i1`, {
      tournamentId: "T1",
      categoryId: "C1",
      teamId: "tC",
      isPaid: true,
    });
    // Times do mata-mata detectados pelas partidas não-grupo da categoria.
    db.seedDoc(`artifacts/${PROJECT}/public/data/matches/m-final`, finalMatch());

    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    const groupsTeam = db.store.get(
      `${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tC`,
    )!;
    assert.equal(groupsTeam.finalPlace, 9);
    assert.equal(groupsTeam.pointsEarned, 10);
  });

  it("partida de grupo não concede colocação", async () => {
    const db = seededDb();
    const result = await tryAwardGlobalRankingForMatch(
      db as never,
      PROJECT,
      finalMatch({matchType: "group", isGroupMatch: true}),
    );
    assert.equal(result.awarded, false);
  });

  it("rankingWeight do torneio multiplica os pontos", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {sport: "beachVolleyball", rankingWeight: 2});
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    const champion = db.store.get(
      `${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`,
    )!;
    assert.equal(champion.pointsEarned, 200);
  });
});

describe("isGlobalRankingEligible", () => {
  it("etapa de liga é sempre elegível, mesmo pequena e com toggle off", () => {
    assert.equal(
      isGlobalRankingEligible({isLeagueStage: true, rankingEnabled: false, paidTeamsCount: 2}),
      true,
    );
  });

  it("toggle desligado bloqueia mesmo categoria cheia", () => {
    assert.equal(
      isGlobalRankingEligible({isLeagueStage: false, rankingEnabled: false, paidTeamsCount: 16}),
      false,
    );
  });

  it("menos de 10 duplas pagas é desafio: bloqueia", () => {
    assert.equal(
      isGlobalRankingEligible({isLeagueStage: false, rankingEnabled: true, paidTeamsCount: 9}),
      false,
    );
  });

  it("10+ pagas com toggle ligado pontua", () => {
    assert.equal(
      isGlobalRankingEligible({isLeagueStage: false, rankingEnabled: true, paidTeamsCount: 10}),
      true,
    );
  });
});

describe("gate de desafios no fluxo de premiação", () => {
  it("categoria com 9 duplas pagas não escreve nada (desafio)", async () => {
    const db = seededDb({paidTeams: 9});
    const result = await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    assert.equal(result.awarded, false);
    assert.equal(db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`), undefined);
    assert.equal(db.store.get(`${teamRankingsPath(PROJECT)}/tA`), undefined);
  });

  it("rankingEnabled: false não pontua mesmo com 10 pagas", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {sport: "beachVolleyball", rankingEnabled: false});
    const result = await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    assert.equal(result.awarded, false);
    assert.equal(db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`), undefined);
  });

  it("etapa de liga pontua mesmo com 2 duplas", async () => {
    const db = seededDb({paidTeams: 2});
    db.seedDoc("tournaments/T1", {sport: "beachVolleyball", leagueId: "L1"});
    const result = await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    assert.equal(result.awarded, true);
    const champion = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`)!;
    assert.equal(champion.finalPlace, 1);
  });
});

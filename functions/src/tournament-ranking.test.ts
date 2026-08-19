import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  aggregateRankingResults,
  athleteRankingsPath,
  bracketSizeFactor,
  DEFAULT_GLOBAL_POINTS,
  finalPlaceForAward,
  globalPointsForAward,
  isGlobalRankingEligible,
  RANKING_SCALE_VERSION,
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

    assert.equal(globalPointsForAward({teamId: "t", place: 1}, 1), 1000);
    assert.equal(globalPointsForAward({teamId: "t", place: 2}, 1), 800);
    assert.equal(globalPointsForAward({teamId: "t", place: 3}, 1), 600);
    assert.equal(globalPointsForAward({teamId: "t", place: 4}, 1), 500);
    assert.equal(globalPointsForAward({teamId: "t", bucket: "quarters"}, 1), 330);
    assert.equal(globalPointsForAward({teamId: "t", bucket: "groups"}, 1), 100);
  });

  it("aplica rankingWeight (peso por grade) com saneamento", () => {
    assert.equal(globalPointsForAward({teamId: "t", place: 1}, 1.5), 1500);
    assert.equal(globalPointsForAward({teamId: "t", place: 1}, 0), 1000);
    assert.equal(globalPointsForAward({teamId: "t", place: 1}, Number.NaN), 1000);
  });
});

describe("motor fase 3 — base ×10 e peso do preset", () => {
  it("RANKING_SCALE_VERSION carimba a base ×10 atual", () => {
    assert.strictEqual(RANKING_SCALE_VERSION, 2);
  });

  it("tabela-base reescalada ×10", () => {
    assert.deepStrictEqual(DEFAULT_GLOBAL_POINTS, {
      "1": 1000, "2": 800, "3": 600, "4": 500, quarters: 330, groups: 100,
    });
  });
  it("multiplier composto arredonda uma vez no final", () => {
    // Intermediário (0.25) nas quartas: 330 × 0.25 = 82.5 → 83
    assert.strictEqual(globalPointsForAward({teamId: "t", bucket: "quarters"}, 0.25), 83);
    // Iniciante (0.125) nos grupos: 100 × 0.125 = 12.5 → 13
    assert.strictEqual(globalPointsForAward({teamId: "t", bucket: "groups"}, 0.125), 13);
    // Elite (1.2) campeão: 1000 × 1.2 = 1200 — âncora da spec
    assert.strictEqual(globalPointsForAward({teamId: "t", place: 1}, 1.2), 1200);
  });
  it("multiplier inválido cai em 1 (paridade com o guard antigo)", () => {
    assert.strictEqual(globalPointsForAward({teamId: "t", place: 1}, NaN), 1000);
    assert.strictEqual(globalPointsForAward({teamId: "t", place: 1}, 0), 1000);
  });
});

describe("aggregateRankingResults", () => {
  it("soma TODOS os resultados do ano e o total entre anos", () => {
    const results = [40, 100, 10, 60, 33, 80].map((points, index) => ({
      tournamentId: `t${index}`,
      categoryId: "c",
      finalPlace: 1,
      points,
      year: 2026,
    }));
    results.push({tournamentId: "old", categoryId: "c", finalPlace: 1, points: 50, year: 2025});

    const aggregates = aggregateRankingResults(results);
    // Sem descarte: os 6 resultados de 2026 contam, inclusive o 6º (10).
    assert.equal(aggregates.pointsByYear["2026"], 323);
    assert.equal(aggregates.pointsByYear["2025"], 50);
    assert.equal(aggregates.totalPoints, 373);
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
    assert.equal(champion.pointsEarned, 1000);
    assert.equal(champion.year, 2026);
    assert.equal(champion.scaleVersion, RANKING_SCALE_VERSION);

    const runnerUp = db.store.get(
      `${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tB`,
    )!;
    assert.equal(runnerUp.finalPlace, 2);
    assert.equal(runnerUp.pointsEarned, 800);
    assert.equal(runnerUp.scaleVersion, RANKING_SCALE_VERSION);

    const teamAgg = db.store.get(`${teamRankingsPath(PROJECT)}/tA`)!;
    assert.equal(teamAgg.totalPoints, 1000);
    assert.equal(teamAgg.tournamentsCount, 1);
    assert.deepEqual(teamAgg.pointsByYear, {"2026": 1000});
    assert.equal(teamAgg.scaleVersion, RANKING_SCALE_VERSION);

    for (const uid of ["a1", "a2"]) {
      const athleteAgg = db.store.get(`${athleteRankingsPath(PROJECT)}/${uid}`)!;
      assert.equal(athleteAgg.totalPoints, 1000, uid);
      assert.equal(athleteAgg.scaleVersion, RANKING_SCALE_VERSION, uid);
    }
    for (const uid of ["b1", "b2"]) {
      const athleteAgg = db.store.get(`${athleteRankingsPath(PROJECT)}/${uid}`)!;
      assert.equal(athleteAgg.totalPoints, 800, uid);
      assert.equal(athleteAgg.scaleVersion, RANKING_SCALE_VERSION, uid);
    }
  });

  it("re-run é idempotente (upsert não duplica nem soma de novo)", async () => {
    const db = seededDb();
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    const rerun = await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    assert.equal(rerun.teamsUpdated, 0);

    const teamAgg = db.store.get(`${teamRankingsPath(PROJECT)}/tA`)!;
    assert.equal(teamAgg.totalPoints, 1000);
    assert.equal((teamAgg.results as unknown[]).length, 1);
  });

  it("correção de vencedor troca as colocações via upsert", async () => {
    const db = seededDb();
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch({winnerId: "tB"}));

    const teamA = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`)!;
    assert.equal(teamA.finalPlace, 2);
    const aggA = db.store.get(`${teamRankingsPath(PROJECT)}/tA`)!;
    assert.equal(aggA.totalPoints, 800);
    const aggB = db.store.get(`${teamRankingsPath(PROJECT)}/tB`)!;
    assert.equal(aggB.totalPoints, 1000);
  });

  it("doc não carimbado com resultados na escala antiga migra on-write ao ganhar novo prêmio (fase 3)", async () => {
    const db = seededDb();
    // Doc sobrevivente da era ×1 (pré-fase 3): sem `scaleVersion`, pontos na
    // escala antiga — simula exatamente o que fica na janela deploy→script
    // (mode A da corrida documentada no cabeçalho de
    // backfill-ranking-scale-x10.js) até o script rodar.
    db.seedDoc(`${teamRankingsPath(PROJECT)}/tA`, {
      teamId: "tA",
      results: [
        {tournamentId: "T-old", categoryId: "C-old", finalPlace: 3, points: 60, year: 2025},
      ],
      totalPoints: 60,
      tournamentsCount: 1,
      pointsByYear: {"2025": 60},
    });

    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    const teamAgg = db.store.get(`${teamRankingsPath(PROJECT)}/tA`)!;
    const results = teamAgg.results as Array<{tournamentId: string; points: number}>;
    assert.equal(results.length, 2);
    // Entrada antiga reescalada ×10 (60 → 600) ANTES do merge da nova (1000).
    const oldEntry = results.find((r) => r.tournamentId === "T-old")!;
    assert.equal(oldEntry.points, 600);
    assert.deepEqual(teamAgg.pointsByYear, {"2025": 600, "2026": 1000});
    assert.equal(teamAgg.totalPoints, 1600);
    assert.equal(teamAgg.scaleVersion, RANKING_SCALE_VERSION);
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
    assert.equal(groupsTeam.pointsEarned, 100);
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
    assert.equal(champion.pointsEarned, 2000);
  });

  it("rankingWeight <= 0 é saneado para 1 (Livre não paga como Elite)", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {
      sport: "beachVolleyball",
      rankingWeight: 0,
      categories: [{categoryName: "C1", level: "Open", minLevel: "Iniciante 1"}],
    });
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    const champion = db.store.get(
      `${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`,
    )!;
    // round(1000 × 0.125 (Livre) × 1 (rankingWeight 0 saneado p/ 1) × 1 (10
    // pagas)) = 125 — sem o saneamento, o guard do produto composto em
    // `globalPointsForAward` colapsava multiplier=0 pra 1 e pagava 1000.
    assert.equal(champion.pointsEarned, 125);
  });

  it("preset Open (peso 1) não altera os pontos base", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {
      sport: "beachVolleyball",
      categories: [{categoryName: "C1", level: "Open", minLevel: "Avançado 1"}],
    });
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    const champion = db.store.get(
      `${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`,
    )!;
    assert.equal(champion.pointsEarned, 1000);
  });

  it("preset Elite (peso 1.2) multiplica os pontos", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {
      sport: "beachVolleyball",
      categories: [{categoryName: "C1", level: "Open", minLevel: "Open"}],
    });
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    const champion = db.store.get(
      `${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`,
    )!;
    assert.equal(champion.pointsEarned, 1200);
  });

  it("categoria sem minLevel (legada) não deriva preset: peso 1", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {
      sport: "beachVolleyball",
      categories: [{categoryName: "C1", level: "Open"}],
    });
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    const champion = db.store.get(
      `${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`,
    )!;
    assert.equal(champion.pointsEarned, 1000);
  });

  it("Livre não concede bucket groups (mas mata-mata segue pontuando)", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {
      sport: "beachVolleyball",
      categories: [{categoryName: "C1", level: "Open", minLevel: "Iniciante 1"}],
    });
    db.seedDoc(`artifacts/${PROJECT}/public/data/teams/tC`, {player1Id: "c1"});
    db.seedDoc(`artifacts/${PROJECT}/public/data/inscriptions/i1`, {
      tournamentId: "T1",
      categoryId: "C1",
      teamId: "tC",
      isPaid: true,
    });

    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    // Fora do mata-mata: Livre não concede o bucket "groups" (D6 emendada).
    assert.equal(
      db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tC`),
      undefined,
    );

    // Colocação normal (perdedor da final) segue pontuando, com peso Livre (0.125).
    const runnerUp = db.store.get(
      `${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tB`,
    )!;
    assert.equal(runnerUp.finalPlace, 2);
    assert.equal(runnerUp.pointsEarned, 100);
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

describe("modulador por tamanho de chave", () => {
  it("degraus do fator", () => {
    assert.strictEqual(bracketSizeFactor(8), 1);
    assert.strictEqual(bracketSizeFactor(12), 1);
    assert.strictEqual(bracketSizeFactor(7), 0.6);
    assert.strictEqual(bracketSizeFactor(4), 0.6);
    assert.strictEqual(bracketSizeFactor(3), 0.25);
    assert.strictEqual(bracketSizeFactor(0), 0.25);
  });

  it("etapa de liga com 3 duplas pagas e categoria Elite aplica o fator 0.25 ao multiplier", async () => {
    const db = seededDb({paidTeams: 3});
    db.seedDoc("tournaments/T1", {
      sport: "beachVolleyball",
      leagueId: "L1",
      categories: [{categoryName: "C1", level: "Open", minLevel: "Open"}],
    });
    const result = await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    assert.equal(result.awarded, true);

    // round(1000 × 1.2 (Elite) × 0.25 (3 duplas pagas, <4)) = 300.
    const champion = db.store.get(
      `${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`,
    )!;
    assert.strictEqual(champion.pointsEarned, 300);
  });
});

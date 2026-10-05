import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {runRankingsBySportBackfillPage} from "./ranking-by-sport-backfill";
import {
  athleteRankingsBySportPath,
  teamRankingsBySportPath,
  tournamentCategoryResultsPath,
} from "./tournament-ranking";

const P = "proj";

function seed(): FakeFirestore {
  const db = new FakeFirestore();
  db.seedDoc("tournaments/TV", {sport: "beachVolleyball"});
  db.seedDoc("tournaments/TB", {sport: "beachTennis"});
  db.seedDoc("tournaments/TX", {sport: "xadrez"});
  db.seedDoc(`artifacts/${P}/public/data/teams/tA`, {player1Id: "a1", player2Id: "a2"});
  const results = tournamentCategoryResultsPath(P);
  db.seedDoc(`${results}/TV_C1_tA`, {tournamentId: "TV", categoryId: "C1", teamId: "tA", finalPlace: 1, pointsEarned: 1000, year: 2026, scaleVersion: 2});
  db.seedDoc(`${results}/TB_C1_tA`, {tournamentId: "TB", categoryId: "C1", teamId: "tA", finalPlace: 2, pointsEarned: 800, year: 2026, scaleVersion: 2});
  db.seedDoc(`${results}/TX_C1_tA`, {tournamentId: "TX", categoryId: "C1", teamId: "tA", finalPlace: 1, pointsEarned: 1000, year: 2026, scaleVersion: 2});
  // Resultado anterior à escala ×10: entra ×10 no doc por esporte (que nasce na escala atual).
  db.seedDoc(`${results}/TV_C2_tA`, {tournamentId: "TV", categoryId: "C2", teamId: "tA", finalPlace: 3, pointsEarned: 60, year: 2025});
  return db;
}

async function runAll(db: FakeFirestore, dryRun: boolean) {
  let startAfterId: string | undefined;
  let total = {processed: 0, stamped: 0, upserted: 0};
  for (let i = 0; i < 10; i++) {
    const page = await runRankingsBySportBackfillPage(db as never, P, {pageSize: 2, startAfterId, dryRun});
    total = {processed: total.processed + page.processed, stamped: total.stamped + page.stamped, upserted: total.upserted + page.upserted};
    if (page.done) break;
    startAfterId = page.nextStartAfterId ?? undefined;
  }
  return total;
}

describe("backfill do ranking por esporte", () => {
  it("dryRun conta e não escreve", async () => {
    const db = seed();
    const before = db.store.size;
    const total = await runAll(db, true);
    assert.equal(total.processed, 4);
    assert.equal(total.stamped, 3);
    assert.equal(db.store.size, before);
    assert.equal(db.store.get(`${tournamentCategoryResultsPath(P)}/TV_C1_tA`)!.sport, undefined);
  });

  it("grava sport nos resultados e reconstrói os docs por esporte; esporte desconhecido fica de fora", async () => {
    const db = seed();
    await runAll(db, false);
    assert.equal(db.store.get(`${tournamentCategoryResultsPath(P)}/TV_C1_tA`)!.sport, "VOLEI_PRAIA");
    assert.equal(db.store.get(`${tournamentCategoryResultsPath(P)}/TX_C1_tA`)!.sport, undefined);
    const volei = db.store.get(`${teamRankingsBySportPath(P)}/tA_VOLEI_PRAIA`)!;
    assert.equal(volei.totalPoints, 1600);
    assert.deepEqual(volei.pointsByYear, {"2026": 1000, "2025": 600});
    assert.equal(db.store.get(`${teamRankingsBySportPath(P)}/tA_BEACH_TENNIS`)!.totalPoints, 800);
    assert.equal(db.store.get(`${athleteRankingsBySportPath(P)}/a2_BEACH_TENNIS`)!.totalPoints, 800);
  });

  it("idempotente: rodar de novo não muda nada", async () => {
    const db = seed();
    await runAll(db, false);
    const snapshot = JSON.stringify(db.store.get(`${teamRankingsBySportPath(P)}/tA_VOLEI_PRAIA`)!.results);
    const again = await runAll(db, false);
    assert.equal(again.stamped, 0);
    assert.equal(again.upserted, 0);
    assert.equal(JSON.stringify(db.store.get(`${teamRankingsBySportPath(P)}/tA_VOLEI_PRAIA`)!.results), snapshot);
  });
});

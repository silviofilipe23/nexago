import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  applyReputationEvent,
  computeReputationScore,
  lateCancelEventId,
  matchCompletedEventId,
  noShowEventId,
  reviewReceivedEventId,
} from "./friendly-match-reputation";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const zeros = {gamesCompleted: 0, noShows: 0, lateCancellations: 0, ratingSum: 0, ratingCount: 0};

describe("computeReputationScore", () => {
  it("sem histórico negativo, score cheio", () => {
    assert.equal(computeReputationScore(zeros), 100);
    assert.equal(computeReputationScore({...zeros, gamesCompleted: 5}), 100);
  });

  it("no-show pesa 15, cancelamento tardio pesa 5", () => {
    assert.equal(computeReputationScore({...zeros, noShows: 1}), 85);
    assert.equal(computeReputationScore({...zeros, lateCancellations: 1}), 95);
    assert.equal(computeReputationScore({...zeros, noShows: 2, lateCancellations: 1}), 65);
  });

  it("média de estrelas ajusta em torno de 4 (±10 por estrela) e o teto é 100", () => {
    assert.equal(computeReputationScore({...zeros, ratingSum: 20, ratingCount: 4}), 100);
    assert.equal(computeReputationScore({...zeros, ratingSum: 9, ratingCount: 3}), 90);
    assert.equal(
      computeReputationScore({...zeros, noShows: 1, ratingSum: 1, ratingCount: 1}), 55);
  });

  it("piso é zero", () => {
    assert.equal(computeReputationScore({...zeros, noShows: 10}), 0);
  });
});

describe("ids determinísticos de eventos", () => {
  it("são estáveis por match/avaliador", () => {
    assert.equal(matchCompletedEventId("m1"), "match_completed_m1");
    assert.equal(noShowEventId("m1"), "no_show_m1");
    assert.equal(lateCancelEventId("m1"), "late_cancel_m1");
    assert.equal(reviewReceivedEventId("m1", "u2", "u3"), "review_received_m1_u2_u3");
  });
});

describe("applyReputationEvent", () => {
  it("jogo realizado: cria evento, atualiza summary e espelha em users", async () => {
    const fake = new FakeFirestore();
    const applied = await applyReputationEvent(
      db(fake), "u1", matchCompletedEventId("m1"), "match_completed", {matchId: "m1"});
    assert.equal(applied, true);
    assert.ok(fake.store.get("users/u1/reputationEvents/match_completed_m1"));
    const summary = fake.store.get("users/u1/reputation/summary")!;
    assert.equal(summary.gamesCompleted, 1);
    assert.equal(summary.score, 100);
    const mirror = fake.store.get("users/u1")!.reputation as Record<string, unknown>;
    assert.equal(mirror.score, 100);
    assert.equal(mirror.gamesCompleted, 1);
  });

  it("é idempotente por eventId", async () => {
    const fake = new FakeFirestore();
    await applyReputationEvent(
      db(fake), "u1", noShowEventId("m1"), "no_show", {matchId: "m1"});
    const second = await applyReputationEvent(
      db(fake), "u1", noShowEventId("m1"), "no_show", {matchId: "m1"});
    assert.equal(second, false);
    const summary = fake.store.get("users/u1/reputation/summary")!;
    assert.equal(summary.noShows, 1);
    assert.equal(summary.score, 85);
  });

  it("avaliação recebida acumula soma/contagem e recalcula média", async () => {
    const fake = new FakeFirestore();
    await applyReputationEvent(
      db(fake), "u1", reviewReceivedEventId("m1", "u2", "u9"), "review_received",
      {matchId: "m1", stars: 5});
    await applyReputationEvent(
      db(fake), "u1", reviewReceivedEventId("m2", "u3", "u9"), "review_received",
      {matchId: "m2", stars: 3});
    const summary = fake.store.get("users/u1/reputation/summary")!;
    assert.equal(summary.ratingSum, 8);
    assert.equal(summary.ratingCount, 2);
    assert.equal(summary.ratingAvg, 4);
    assert.equal(summary.score, 100);
  });

  it("cancelamento tardio penaliza e acumula com o resto", async () => {
    const fake = new FakeFirestore();
    await applyReputationEvent(
      db(fake), "u1", lateCancelEventId("m1"), "late_cancel", {matchId: "m1"});
    await applyReputationEvent(
      db(fake), "u1", noShowEventId("m2"), "no_show", {matchId: "m2"});
    const summary = fake.store.get("users/u1/reputation/summary")!;
    assert.equal(summary.lateCancellations, 1);
    assert.equal(summary.noShows, 1);
    assert.equal(summary.score, 80);
    const mirror = fake.store.get("users/u1")!.reputation as Record<string, unknown>;
    assert.equal(mirror.noShows, 1);
  });
});

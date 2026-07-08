import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  revealFriendlyMatchReviewsIfDue,
  submitFriendlyMatchReviewCore,
} from "./friendly-match-review";

const HOUR_MS = 60 * 60 * 1000;
const now = Date.UTC(2026, 6, 10, 12, 0, 0);
const revealAt = now + 72 * HOUR_MS;

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedCompleted(fake: FakeFirestore, id: string, overrides: DocData = {}): void {
  fake.seedDoc(`friendlyMatches/${id}`, {
    fromUid: "a",
    fromName: "Ana",
    toUid: "b",
    toName: "Bia",
    participantUids: ["a", "b"],
    status: "completed",
    completedAt: Timestamp.fromMillis(now - HOUR_MS),
    reviewRevealAt: Timestamp.fromMillis(revealAt),
    reviewSubmittedUids: [],
    history: [],
    ...overrides,
  });
}

async function assertHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava HttpsError ${code}, veio ${err.code}`);
    return true;
  });
}

describe("submitFriendlyMatchReviewCore", () => {
  it("primeira avaliação fica oculta: doc privado criado, nada de nota no doc principal", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1");
    const result = await submitFriendlyMatchReviewCore(
      db(fake), "a", {matchId: "m1", stars: 5, comment: "Jogaço"}, now);
    assert.equal(result.revealed, false);
    const hidden = fake.store.get("friendlyMatches/m1/privateReviews/a")!;
    assert.equal(hidden.stars, 5);
    assert.equal(hidden.revieweeUid, "b");
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "completed");
    assert.deepEqual(data.reviewSubmittedUids, ["a"]);
    assert.equal(data.reviews, undefined);
    assert.equal(result.notifications.length, 0);
  });

  it("segunda avaliação revela as duas, conclui o match e credita reputação cruzada", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1");
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", stars: 5}, now);
    const result = await submitFriendlyMatchReviewCore(
      db(fake), "b", {matchId: "m1", stars: 3}, now + HOUR_MS);
    assert.equal(result.revealed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "reviewed");
    assert.ok(data.reviewsRevealedAt instanceof Timestamp);
    const reviews = data.reviews as Record<string, {stars: number}>;
    assert.equal(reviews.a.stars, 5);
    assert.equal(reviews.b.stars, 3);
    // b recebeu 5 de a; a recebeu 3 de b.
    assert.equal(fake.store.get("users/b/reputation/summary")!.ratingSum, 5);
    assert.equal(fake.store.get("users/a/reputation/summary")!.ratingSum, 3);
    assert.ok(fake.store.get("users/b/reputationEvents/review_received_m1_a"));
    assert.ok(fake.store.get("users/a/reputationEvents/review_received_m1_b"));
    assert.equal(result.notifications.length, 2);
    assert.ok(result.notifications.every((n) => n.type === "friendly_match_reviewed"));
  });

  it("avaliação dupla do mesmo atleta é rejeitada", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1");
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", stars: 4}, now);
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", stars: 5}, now),
      "failed-precondition",
    );
  });

  it("rejeita não participante, status errado, stars inválidas e prazo vencido", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1");
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "intruso", {matchId: "m1", stars: 4}, now),
      "permission-denied",
    );
    for (const stars of [0, 6, 4.5]) {
      await assertHttpsError(
        submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", stars}, now),
        "invalid-argument",
      );
    }
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", stars: 4}, revealAt + 1),
      "failed-precondition",
    );
    seedCompleted(fake, "pending", {status: "confirmed"});
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "pending", stars: 4}, now),
      "failed-precondition",
    );
  });
});

describe("revealFriendlyMatchReviewsIfDue", () => {
  it("prazo vencido com uma avaliação → revela a que existe e credita só aquele reviewee", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1");
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", stars: 4}, now);
    const result = await revealFriendlyMatchReviewsIfDue(db(fake), "m1", revealAt + 1);
    assert.equal(result.revealed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "reviewed");
    const reviews = data.reviews as Record<string, {stars: number}>;
    assert.equal(reviews.a.stars, 4);
    assert.equal(reviews.b, undefined);
    assert.ok(fake.store.get("users/b/reputationEvents/review_received_m1_a"));
    assert.equal(fake.store.get("users/a/reputation/summary"), undefined);
    // Só quem recebeu avaliação é notificado.
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].userId, "b");
  });

  it("prazo vencido sem avaliações → encerra sem notas nem notificações; idempotente", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1");
    const result = await revealFriendlyMatchReviewsIfDue(db(fake), "m1", revealAt + 1);
    assert.equal(result.revealed, true);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "reviewed");
    assert.equal(result.notifications.length, 0);
    const again = await revealFriendlyMatchReviewsIfDue(db(fake), "m1", revealAt + 2);
    assert.equal(again.revealed, false);
  });

  it("não revela antes do prazo", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1");
    const result = await revealFriendlyMatchReviewsIfDue(db(fake), "m1", revealAt - 1);
    assert.equal(result.revealed, false);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "completed");
  });
});

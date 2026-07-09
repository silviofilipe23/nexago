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

function seedCompleted(fake: FakeFirestore, id: string, participantUids: string[], overrides: DocData = {}): void {
  fake.seedDoc(`friendlyMatches/${id}`, {
    organizerUid: "a",
    organizerName: "Ana",
    slots: participantUids.filter((p) => p !== "a").map((uid) => ({
      uid, name: `Atleta ${uid}`, photoUrl: null, status: "accepted",
    })),
    participantUids,
    status: "completed",
    completedAt: Timestamp.fromMillis(now - HOUR_MS),
    reviewRevealAt: Timestamp.fromMillis(revealAt),
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
  it("primeira avaliação de um par fica oculta: doc privado criado, nada no doc principal", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b"]);
    const result = await submitFriendlyMatchReviewCore(
      db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 5, comment: "Jogaço"}, now);
    assert.equal(result.revealed, false);
    const hidden = fake.store.get("friendlyMatches/m1/privateReviews/a_b")!;
    assert.equal(hidden.stars, 5);
    assert.equal(hidden.revieweeUid, "b");
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "completed");
    assert.equal(data.reviews, undefined);
    assert.equal(result.notifications.length, 0);
  });

  it("segunda avaliação do mesmo par revela as duas, credita reputação cruzada; match ainda não 'reviewed' (1:1 conclui)", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b"]);
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 5}, now);
    const result = await submitFriendlyMatchReviewCore(
      db(fake), "b", {matchId: "m1", revieweeUid: "a", stars: 3}, now + HOUR_MS);
    assert.equal(result.revealed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "reviewed"); // só 2 participantes: 1 par = grupo inteiro
    assert.ok(data.reviewsRevealedAt instanceof Timestamp);
    const reviews = data.reviews as Record<string, Record<string, DocData>>;
    assert.equal(reviews.a.b.stars, 5);
    assert.equal(reviews.b.a.stars, 3);
    // reviews.a.b é reconstruído a partir do doc PRIVADO (otherSnap) — não pode
    // vazar metadados do doc privado (reviewerUid/revieweeUid/createdAt) para
    // o mapa público `reviews`.
    assert.equal(reviews.a.b.reviewerUid, undefined);
    assert.equal(reviews.a.b.revieweeUid, undefined);
    assert.equal(reviews.a.b.createdAt, undefined);
    assert.deepEqual(Object.keys(reviews.a.b).sort(), ["stars"]);
    assert.equal(fake.store.get("users/b/reputation/summary")!.ratingSum, 5);
    assert.equal(fake.store.get("users/a/reputation/summary")!.ratingSum, 3);
    assert.ok(fake.store.get("users/b/reputationEvents/review_received_m1_a_b"));
    assert.ok(fake.store.get("users/a/reputationEvents/review_received_m1_b_a"));
    assert.equal(result.notifications.length, 2);
  });

  it("com 3 participantes: revelar um par não conclui o jogo até TODOS os pares revelarem", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b", "c"]);
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 5}, now);
    const abRevealed = await submitFriendlyMatchReviewCore(
      db(fake), "b", {matchId: "m1", revieweeUid: "a", stars: 4}, now);
    assert.equal(abRevealed.revealed, true); // par a-b revela na hora
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "completed"); // faltam os pares com c

    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "c", stars: 4}, now);
    await submitFriendlyMatchReviewCore(db(fake), "c", {matchId: "m1", revieweeUid: "a", stars: 4}, now);
    await submitFriendlyMatchReviewCore(db(fake), "b", {matchId: "m1", revieweeUid: "c", stars: 4}, now);
    const last = await submitFriendlyMatchReviewCore(
      db(fake), "c", {matchId: "m1", revieweeUid: "b", stars: 4}, now);
    assert.equal(last.revealed, true);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "reviewed"); // todos os 6 pares ordenados feitos
  });

  it("avaliação dupla do mesmo par é rejeitada", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b"]);
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 4}, now);
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 5}, now),
      "failed-precondition",
    );
  });

  it("rejeita não participante, avaliado inválido, status errado, stars inválidas e prazo vencido", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b"]);
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "intruso", {matchId: "m1", revieweeUid: "b", stars: 4}, now),
      "permission-denied",
    );
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "a", stars: 4}, now),
      "invalid-argument",
    );
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "ghost", stars: 4}, now),
      "invalid-argument",
    );
    for (const stars of [0, 6, 4.5]) {
      await assertHttpsError(
        submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars}, now),
        "invalid-argument",
      );
    }
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 4}, revealAt + 1),
      "failed-precondition",
    );
    seedCompleted(fake, "pending", ["a", "b"], {status: "confirmed"});
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "pending", revieweeUid: "b", stars: 4}, now),
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

import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {DAY_MS, HOUR_MS} from "./tournament-review-constants";
import {submitTournamentReviewCore} from "./tournament-review-submit";

const NOW = Date.UTC(2026, 9, 6, 15, 0, 0);
const INVITE = "users/u1/tournamentReviewInvites/t1";
const REVIEW = "tournamentReviews/t1_u1";

function setup(inviteExtra: Record<string, unknown> = {}) {
  const fake = new FakeFirestore();
  fake.seedDoc(INVITE, {
    tournamentId: "t1",
    organizerId: "org",
    status: "pending",
    closesAt: Timestamp.fromMillis(NOW + DAY_MS),
    submittedAt: null,
    ...inviteExtra,
  });
  return {fake, db: fake as unknown as Firestore};
}

function anonIds(): () => string {
  let n = 0;
  return () => `anon-${++n}`;
}

function isCode(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, code);
    return true;
  };
}

const millis = (value: unknown) => (value as Timestamp).toMillis();

describe("submitTournamentReviewCore", () => {
  it("primeira avaliação: grava o doc privado e marca o convite", async () => {
    const {fake, db} = setup();
    const result = await submitTournamentReviewCore(
      db, "u1", {tournamentId: "t1", overall: 4, aspects: {schedule: 2}, comment: "Atrasou"}, NOW, anonIds(),
    );
    assert.deepEqual(result, {ok: true, created: true});

    const review = fake.store.get(REVIEW)!;
    assert.equal(review.tournamentId, "t1");
    assert.equal(review.organizerId, "org");
    assert.equal(review.uid, "u1");
    assert.equal(review.overall, 4);
    assert.deepEqual(review.aspects, {schedule: 2});
    assert.equal(review.comment, "Atrasou");
    assert.equal(review.anonId, "anon-1");
    assert.equal(millis(review.createdAt), NOW);
    assert.equal(millis(review.updatedAt), NOW);

    const invite = fake.store.get(INVITE)!;
    assert.equal(invite.status, "submitted");
    assert.equal(millis(invite.submittedAt), NOW);
  });

  it("edição preserva anonId, createdAt e submittedAt, e substitui o resto", async () => {
    const {fake, db} = setup();
    const next = anonIds();
    await submitTournamentReviewCore(db, "u1", {tournamentId: "t1", overall: 4, aspects: {schedule: 2}}, NOW, next);
    const later = NOW + HOUR_MS;
    const result = await submitTournamentReviewCore(db, "u1", {tournamentId: "t1", overall: 2}, later, next);
    assert.deepEqual(result, {ok: true, created: false});

    const review = fake.store.get(REVIEW)!;
    assert.equal(review.anonId, "anon-1");
    assert.equal(millis(review.createdAt), NOW);
    assert.equal(millis(review.updatedAt), later);
    assert.equal(review.overall, 2);
    assert.deepEqual(review.aspects, {});
    assert.equal(review.comment, null);
    assert.equal(millis(fake.store.get(INVITE)!.submittedAt), NOW);
  });

  it("sem convite: permission-denied e nada gravado", async () => {
    const fake = new FakeFirestore();
    await assert.rejects(
      submitTournamentReviewCore(fake as unknown as Firestore, "u1", {tournamentId: "t1", overall: 5}, NOW),
      isCode("permission-denied"),
    );
    assert.equal(fake.store.has(REVIEW), false);
  });

  it("prazo vencido, inclusive no instante exato do fechamento com o convite ainda pending", async () => {
    const {fake, db} = setup({closesAt: Timestamp.fromMillis(NOW)});
    await assert.rejects(
      submitTournamentReviewCore(db, "u1", {tournamentId: "t1", overall: 5}, NOW),
      isCode("failed-precondition"),
    );
    assert.equal(fake.store.has(REVIEW), false);
  });

  it("convite expirado: failed-precondition", async () => {
    const {db} = setup({status: "expired"});
    await assert.rejects(
      submitTournamentReviewCore(db, "u1", {tournamentId: "t1", overall: 5}, NOW),
      isCode("failed-precondition"),
    );
  });

  it("entrada inválida é recusada sem gravar nada", async () => {
    const {fake, db} = setup();
    await assert.rejects(
      submitTournamentReviewCore(db, "u1", {tournamentId: "t1", overall: 9}, NOW),
      isCode("invalid-argument"),
    );
    assert.equal(fake.store.has(REVIEW), false);
    assert.equal(fake.store.get(INVITE)!.status, "pending");
  });
});

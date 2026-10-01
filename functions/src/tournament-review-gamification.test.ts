import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {awardTournamentReviewXp, tournamentReviewEventId} from "./tournament-review-gamification";

describe("XP da avaliação de torneio", () => {
  it("o id do evento é por torneio: editar a avaliação não paga de novo", () => {
    assert.equal(tournamentReviewEventId(" t1 "), "tournament_review_t1");
  });

  it("paga 10 XP uma vez só por torneio", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("users/u1/gamification/summary", {xp: 95});
    const db = fake as unknown as Firestore;
    let syncs = 0;
    const sync = async () => {
      syncs += 1;
    };

    assert.equal(await awardTournamentReviewXp(db, "u1", "t1", sync), true);
    assert.equal(await awardTournamentReviewXp(db, "u1", "t1", sync), false);

    const summary = fake.store.get("users/u1/gamification/summary")!;
    assert.equal(summary.xp, 105);
    assert.equal(summary.level, 1);
    assert.equal(summary.lastXpReason, "TOURNAMENT_REVIEW");
    const event = fake.store.get("users/u1/gamification_events/tournament_review_t1")!;
    assert.equal(event.type, "TOURNAMENT_REVIEW");
    assert.equal(event.tournamentId, "t1");
    assert.equal(event.xp, 10);
    assert.equal(syncs, 1);
  });

  it("uid ou torneio vazio não paga", async () => {
    const db = new FakeFirestore() as unknown as Firestore;
    const sync = async () => undefined;
    assert.equal(await awardTournamentReviewXp(db, " ", "t1", sync), false);
    assert.equal(await awardTournamentReviewXp(db, "u1", "", sync), false);
  });
});

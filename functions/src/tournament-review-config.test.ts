import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  loadTournamentReviewsConfig,
  parseTournamentReviewsConfig,
  TOURNAMENT_REVIEWS_CONFIG_PATH,
} from "./tournament-review-config";
import {
  anonymousReviewPath,
  reviewInvitePath,
  TOURNAMENT_REVIEW_ASPECTS,
  tournamentReviewDocId,
} from "./tournament-review-constants";

describe("parseTournamentReviewsConfig", () => {
  it("desligado quando o doc falta ou o valor não é exatamente true", () => {
    for (const raw of [undefined, null, {}, {enabled: "true"}, {enabled: 1}, {enabled: false}]) {
      assert.equal(parseTournamentReviewsConfig(raw).enabled, false);
    }
  });

  it("ligado só com enabled: true", () => {
    assert.equal(parseTournamentReviewsConfig({enabled: true}).enabled, true);
  });
});

describe("loadTournamentReviewsConfig", () => {
  it("lê appConfig/tournamentReviews", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    assert.equal((await loadTournamentReviewsConfig(db)).enabled, false);
    fake.seedDoc(TOURNAMENT_REVIEWS_CONFIG_PATH, {enabled: true});
    assert.equal((await loadTournamentReviewsConfig(db)).enabled, true);
  });
});

describe("caminhos e aspectos", () => {
  it("monta os caminhos que as rules e os clientes esperam", () => {
    assert.equal(tournamentReviewDocId("t1", "u1"), "t1_u1");
    assert.equal(reviewInvitePath("u1", "t1"), "users/u1/tournamentReviewInvites/t1");
    assert.equal(anonymousReviewPath("t1", "a1"), "tournaments/t1/anonymousReviews/a1");
  });

  it("a lista de aspectos é a da spec, nesta ordem", () => {
    assert.deepEqual(
      [...TOURNAMENT_REVIEW_ASPECTS],
      ["organization", "schedule", "refereeing", "venue", "prizes"],
    );
  });
});

import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {DAY_MS} from "./tournament-review-constants";
import {syncTournamentReviewDerivedDocs} from "./tournament-review-derived";

const NOW = Date.UTC(2026, 9, 6, 15, 0, 0);

function review(uid: string, tournamentId: string, overall: number, extra: Record<string, unknown> = {}) {
  return {
    tournamentId,
    organizerId: "org",
    uid,
    overall,
    aspects: {},
    comment: null,
    anonId: `anon-${uid}-${tournamentId}`,
    ...extra,
  };
}

function setup(withSummaryFor: string[] = ["t1"]) {
  const fake = new FakeFirestore();
  for (const tid of withSummaryFor) {
    fake.seedDoc(`tournamentReviewSummaries/${tid}`, {
      tournamentId: tid,
      organizerId: "org",
      tournamentName: "Copa",
      status: "open",
      eligibleCount: 10,
      count: 0,
      average: null,
      distribution: null,
      aspects: null,
      opensAt: Timestamp.fromMillis(NOW - DAY_MS),
      invitesComplete: true,
    });
  }
  const db = fake as unknown as Firestore;
  /** Simula a gravação da callable e roda o trigger com o mesmo before/after. */
  async function write(
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    key = 0.5,
  ) {
    const data = (after ?? before)!;
    const path = `tournamentReviews/${data.tournamentId}_${data.uid}`;
    if (after) fake.seedDoc(path, after);
    else fake.store.delete(path);
    await syncTournamentReviewDerivedDocs(db, before, after, NOW, () => key);
  }
  return {fake, write};
}

describe("syncTournamentReviewDerivedDocs", () => {
  it("1ª avaliação: cópia anônima sem identidade, resumo e reputação só com contagem", async () => {
    const {fake, write} = setup();
    await write(null, review("u1", "t1", 2, {comment: "Atrasou", aspects: {schedule: 1}}));

    assert.deepEqual(fake.store.get("tournaments/t1/anonymousReviews/anon-u1-t1"), {
      overall: 2,
      aspects: {schedule: 1},
      comment: "Atrasou",
      shuffleKey: 0.5,
    });
    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.count, 1);
    assert.equal(summary.average, null);
    assert.equal(summary.distribution, null);
    assert.equal(summary.status, "open");
    assert.equal(summary.eligibleCount, 10);
    assert.equal(summary.invitesComplete, true);
    assert.equal(summary.tournamentName, "Copa");
    const reputation = fake.store.get("organizerReputation/org")!;
    assert.equal(reputation.organizerId, "org");
    assert.equal(reputation.reviewsCount, 1);
    assert.equal(reputation.tournamentsRated, 1);
    assert.equal(reputation.average, null);
  });

  it("3 avaliações liberam média, distribuição e aspectos no resumo", async () => {
    const {fake, write} = setup();
    await write(null, review("u1", "t1", 5, {aspects: {venue: 4}}));
    await write(null, review("u2", "t1", 4));
    await write(null, review("u3", "t1", 3));
    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.count, 3);
    assert.equal(summary.average, 4);
    assert.deepEqual(summary.distribution, {"1": 0, "2": 0, "3": 1, "4": 1, "5": 1});
    assert.deepEqual(summary.aspects, {venue: {count: 1, average: 4}});
  });

  it("edição mantém o shuffleKey, e aspecto que perdeu a nota sai do resumo", async () => {
    const {fake, write} = setup();
    const first = review("u1", "t1", 5, {aspects: {venue: 4}});
    await write(null, first, 0.42);
    await write(null, review("u2", "t1", 4));
    await write(null, review("u3", "t1", 3));
    await write(first, review("u1", "t1", 5, {aspects: {}}), 0.99);

    assert.equal(fake.store.get("tournaments/t1/anonymousReviews/anon-u1-t1")!.shuffleKey, 0.42);
    assert.deepEqual(fake.store.get("tournamentReviewSummaries/t1")!.aspects, {});
  });

  it("avaliação apagada some da cópia anônima e da contagem", async () => {
    const {fake, write} = setup();
    const first = review("u1", "t1", 5);
    await write(null, first);
    await write(null, review("u2", "t1", 4));
    await write(null, review("u3", "t1", 3));
    await write(first, null);

    assert.equal(fake.store.has("tournaments/t1/anonymousReviews/anon-u1-t1"), false);
    const summary = fake.store.get("tournamentReviewSummaries/t1")!;
    assert.equal(summary.count, 2);
    assert.equal(summary.average, null);
  });

  it("reputação soma torneios diferentes do mesmo organizador", async () => {
    const {fake, write} = setup(["t1", "t2"]);
    await write(null, review("u1", "t1", 5));
    await write(null, review("u2", "t1", 3));
    await write(null, review("u1", "t2", 4));
    const reputation = fake.store.get("organizerReputation/org")!;
    assert.equal(reputation.reviewsCount, 3);
    assert.equal(reputation.tournamentsRated, 2);
    assert.equal(reputation.average, 4);
  });

  it("sem resumo do torneio: não inventa um, mas a cópia e a reputação saem", async () => {
    const {fake, write} = setup([]);
    await write(null, review("u1", "t9", 4));
    assert.equal(fake.store.has("tournamentReviewSummaries/t9"), false);
    assert.equal(fake.store.has("tournaments/t9/anonymousReviews/anon-u1-t9"), true);
    assert.equal(fake.store.get("organizerReputation/org")!.reviewsCount, 1);
  });
});

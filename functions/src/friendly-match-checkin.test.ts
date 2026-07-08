import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  checkInFriendlyMatchCore,
  closeFriendlyMatchCheckInIfDue,
} from "./friendly-match-checkin";

const HOUR_MS = 60 * 60 * 1000;
const now = Date.UTC(2026, 6, 10, 12, 0, 0);
const gameTime = now + 10 * 60 * 1000; // jogo daqui a 10 min (janela aberta)

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedConfirmed(fake: FakeFirestore, id: string, overrides: DocData = {}): void {
  fake.seedDoc(`friendlyMatches/${id}`, {
    fromUid: "a",
    fromName: "Ana",
    toUid: "b",
    toName: "Bia",
    participantUids: ["a", "b"],
    status: "confirmed",
    scheduledAt: Timestamp.fromMillis(gameTime),
    confirmedTime: Timestamp.fromMillis(gameTime),
    checkInOpenAt: Timestamp.fromMillis(gameTime - 30 * 60 * 1000),
    checkInCloseAt: Timestamp.fromMillis(gameTime + 24 * HOUR_MS),
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

describe("checkInFriendlyMatchCore", () => {
  it("primeiro check-in registra presença e cutuca o outro participante", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1");
    const result = await checkInFriendlyMatchCore(db(fake), "a", {matchId: "m1"}, now);
    assert.equal(result.completed, false);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "confirmed");
    const checkIns = data.checkIns as Record<string, Timestamp>;
    assert.ok(checkIns.a instanceof Timestamp);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].userId, "b");
    assert.equal(result.notifications[0].type, "friendly_match_checkin_nudge");
  });

  it("segundo check-in completa o jogo, agenda o reveal e credita reputação de ambos", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1");
    await checkInFriendlyMatchCore(db(fake), "a", {matchId: "m1"}, now);
    const result = await checkInFriendlyMatchCore(db(fake), "b", {matchId: "m1"}, now + 60000);
    assert.equal(result.completed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "completed");
    assert.ok(data.completedAt instanceof Timestamp);
    assert.equal(
      (data.reviewRevealAt as Timestamp).toMillis(),
      now + 60000 + 72 * HOUR_MS,
    );
    // Notifica os dois pedindo avaliação.
    assert.equal(result.notifications.length, 2);
    assert.ok(result.notifications.every((n) => n.type === "friendly_match_completed"));
    // Reputação creditada para os dois, idempotente por match.
    assert.ok(fake.store.get("users/a/reputationEvents/match_completed_m1"));
    assert.ok(fake.store.get("users/b/reputationEvents/match_completed_m1"));
    assert.equal(fake.store.get("users/a/reputation/summary")!.gamesCompleted, 1);
  });

  it("check-in repetido do mesmo atleta é no-op silencioso", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1");
    await checkInFriendlyMatchCore(db(fake), "a", {matchId: "m1"}, now);
    const again = await checkInFriendlyMatchCore(db(fake), "a", {matchId: "m1"}, now);
    assert.equal(again.completed, false);
    assert.equal(again.notifications.length, 0);
  });

  it("rejeita fora da janela, não participante e status errado", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "early", {
      checkInOpenAt: Timestamp.fromMillis(now + HOUR_MS),
    });
    await assertHttpsError(
      checkInFriendlyMatchCore(db(fake), "a", {matchId: "early"}, now),
      "failed-precondition",
    );
    seedConfirmed(fake, "late", {
      checkInCloseAt: Timestamp.fromMillis(now - 1),
    });
    await assertHttpsError(
      checkInFriendlyMatchCore(db(fake), "a", {matchId: "late"}, now),
      "failed-precondition",
    );
    seedConfirmed(fake, "m1");
    await assertHttpsError(
      checkInFriendlyMatchCore(db(fake), "intruso", {matchId: "m1"}, now),
      "permission-denied",
    );
    seedConfirmed(fake, "pending", {status: "sent"});
    await assertHttpsError(
      checkInFriendlyMatchCore(db(fake), "a", {matchId: "pending"}, now),
      "failed-precondition",
    );
  });
});

describe("closeFriendlyMatchCheckInIfDue", () => {
  const afterClose = gameTime + 25 * HOUR_MS;

  it("um só check-in → no_show com penalidade apenas para o ausente", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", {checkIns: {a: Timestamp.fromMillis(gameTime)}});
    const result = await closeFriendlyMatchCheckInIfDue(db(fake), "m1", afterClose);
    assert.equal(result.closed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "no_show");
    assert.deepEqual(data.noShowUids, ["b"]);
    // Penalidade só no ausente.
    assert.ok(fake.store.get("users/b/reputationEvents/no_show_m1"));
    assert.equal(fake.store.get("users/b/reputation/summary")!.noShows, 1);
    assert.equal(fake.store.get("users/a/reputation/summary"), undefined);
    assert.equal(result.notifications.length, 2);
  });

  it("zero check-ins → no_show sem penalidade para ninguém", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1");
    const result = await closeFriendlyMatchCheckInIfDue(db(fake), "m1", afterClose);
    assert.equal(result.closed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "no_show");
    assert.deepEqual(data.noShowUids, []);
    assert.equal(fake.store.get("users/a/reputation/summary"), undefined);
    assert.equal(fake.store.get("users/b/reputation/summary"), undefined);
  });

  it("não fecha antes da hora nem jogo que já saiu de confirmed; idempotente", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1");
    const early = await closeFriendlyMatchCheckInIfDue(db(fake), "m1", gameTime);
    assert.equal(early.closed, false);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "confirmed");

    seedConfirmed(fake, "done", {status: "completed"});
    const done = await closeFriendlyMatchCheckInIfDue(db(fake), "done", afterClose);
    assert.equal(done.closed, false);

    seedConfirmed(fake, "m2");
    await closeFriendlyMatchCheckInIfDue(db(fake), "m2", afterClose);
    const again = await closeFriendlyMatchCheckInIfDue(db(fake), "m2", afterClose);
    assert.equal(again.closed, false);
    assert.equal(again.notifications.length, 0);
  });
});

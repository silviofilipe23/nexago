import assert from "node:assert/strict";
import {test} from "node:test";
import type {Firestore} from "firebase-admin/firestore";

import {FakeFirestore} from "./fake-firestore.test-helper";
import {syncSandRankForUser} from "./sand-rank-sync";
import {rewardsForTrackIndex} from "./sand-rank-engine";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

type NotifyCall = {userId: string; title: string};

function makeNotifier(calls: NotifyCall[]) {
  return async (input: {userId: string; title: string}) => {
    calls.push({userId: input.userId, title: input.title});
    return {sent: 1, failed: 0};
  };
}

test("primeiro sync em xp 0 concede recompensas do degrau 0 sem push", async () => {
  const {fake, db} = makeDb();
  fake.seedDoc("users/u1/gamification/summary", {xp: 0});
  const calls: NotifyCall[] = [];

  const result = await syncSandRankForUser(db, "u1", {
    notifier: makeNotifier(calls) as never,
  });

  assert.equal(result.trackIndex, 0);
  assert.equal(result.promoted, false);
  assert.deepEqual(
    result.grantedRewardIds.sort(),
    rewardsForTrackIndex(0).map((r) => r.id).sort(),
  );
  assert.equal(calls.length, 0);

  const summary = fake.store.get("users/u1/gamification/summary")!;
  assert.equal(summary["sandRankCode"], "INICIANTE");
  assert.equal(summary["sandRankDivision"], 3);
  assert.equal(summary["sandRankTrackIndex"], 0);
  assert.equal(summary["highestSandRankTrackIndex"], 0);

  const user = fake.store.get("users/u1")!;
  assert.deepEqual(user["sandRank"], {
    code: "INICIANTE",
    division: 3,
    trackIndex: 0,
  });
  const cosmetics = user["sandRankCosmetics"] as Record<string, unknown>;
  assert.equal(cosmetics["frameId"], "FRAME_INICIANTE");
});

test("promoção multi-degrau concede todos os intermediários e 1 push só", async () => {
  const {fake, db} = makeDb();
  // xp 500 → Competidor III (trackIndex 3): degraus 0..3 pendentes.
  fake.seedDoc("users/u1/gamification/summary", {xp: 500});
  const calls: NotifyCall[] = [];

  const result = await syncSandRankForUser(db, "u1", {
    notifier: makeNotifier(calls) as never,
  });

  assert.equal(result.trackIndex, 3);
  assert.equal(result.promoted, true);
  assert.equal(calls.length, 1);

  for (const i of [0, 1, 2, 3]) {
    const event = fake.store.get(`users/u1/gamification_events/rank_track_${i}`);
    assert.ok(event, `evento rank_track_${i} ausente`);
  }
  assert.ok(fake.store.get("users/u1/gamification_rewards/TITLE_INICIANTE"));
  assert.ok(fake.store.get("users/u1/gamification_rewards/FRAME_COMPETIDOR"));

  const summary = fake.store.get("users/u1/gamification/summary")!;
  assert.equal(summary["sandRankCode"], "COMPETIDOR");
  assert.equal(summary["sandRankTrackIndex"], 3);

  // Auto-equip: última moldura de entrada de elo + último título.
  const user = fake.store.get("users/u1")!;
  const cosmetics = user["sandRankCosmetics"] as Record<string, unknown>;
  assert.equal(cosmetics["frameId"], "FRAME_COMPETIDOR");
  assert.equal(cosmetics["titleId"], "TITLE_INICIANTE");
});

test("sync 2x é idempotente (sem recompensa duplicada, sem push extra)", async () => {
  const {fake, db} = makeDb();
  fake.seedDoc("users/u1/gamification/summary", {xp: 500});
  const calls: NotifyCall[] = [];
  const notifier = makeNotifier(calls) as never;

  await syncSandRankForUser(db, "u1", {notifier});
  const storeSizeAfterFirst = fake.store.size;
  const second = await syncSandRankForUser(db, "u1", {notifier});

  assert.equal(second.promoted, false);
  assert.deepEqual(second.grantedRewardIds, []);
  assert.equal(calls.length, 1);
  assert.equal(fake.store.size, storeSizeAfterFirst);
});

test("skipPush suprime a notificação mas concede tudo (backfill)", async () => {
  const {fake, db} = makeDb();
  fake.seedDoc("users/u1/gamification/summary", {xp: 1500});
  const calls: NotifyCall[] = [];

  const result = await syncSandRankForUser(db, "u1", {
    skipPush: true,
    notifier: makeNotifier(calls) as never,
  });

  assert.equal(result.trackIndex, 6); // Desafiante III
  assert.equal(result.promoted, true);
  assert.equal(calls.length, 0);
  assert.ok(fake.store.get("users/u1/gamification_rewards/PERK_STREAK_SHIELD_1"));
});

test("cruzar marco de escudo credita escudos imediatamente", async () => {
  const {fake, db} = makeDb();
  fake.seedDoc("users/u1/gamification/summary", {
    xp: 1400,
    sandRankTrackIndex: 5,
    highestSandRankTrackIndex: 5,
  });

  await syncSandRankForUser(db, "u1", {skipPush: true});

  const summary = fake.store.get("users/u1/gamification/summary")!;
  assert.equal(summary["streakShieldsAvailable"], 1);
  assert.equal(typeof summary["streakShieldMonthKey"], "string");
});

test("xp corrigido para baixo não rebaixa o elo persistido", async () => {
  const {fake, db} = makeDb();
  fake.seedDoc("users/u1/gamification/summary", {
    xp: 100, // regrediu artificialmente
    sandRankCode: "COMPETIDOR",
    sandRankDivision: 3,
    sandRankTrackIndex: 3,
    highestSandRankTrackIndex: 3,
  });

  const result = await syncSandRankForUser(db, "u1", {skipPush: true});

  assert.equal(result.trackIndex, 3);
  const summary = fake.store.get("users/u1/gamification/summary")!;
  assert.equal(summary["sandRankTrackIndex"], 3);
  assert.equal(summary["sandRankCode"], "COMPETIDOR");
});

test("no-op quando espelho já está consistente", async () => {
  const {fake, db} = makeDb();
  fake.seedDoc("users/u1/gamification/summary", {
    xp: 500,
    sandRankCode: "COMPETIDOR",
    sandRankDivision: 3,
    sandRankTrackIndex: 3,
    highestSandRankTrackIndex: 3,
  });
  const before = fake.store.get("users/u1/gamification/summary");

  const result = await syncSandRankForUser(db, "u1", {skipPush: true});

  assert.equal(result.promoted, false);
  assert.deepEqual(result.grantedRewardIds, []);
  assert.deepEqual(fake.store.get("users/u1/gamification/summary"), before);
  assert.equal(fake.store.get("users/u1"), undefined);
});

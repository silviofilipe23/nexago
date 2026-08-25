import {describe, it} from "node:test";
import assert from "node:assert/strict";
import * as adminAuth from "firebase-admin/auth";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {updateMatchOpsSettingsCore} from "./organizer-match-ops";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function mockAuthUser(customClaims: Record<string, unknown> = {}): void {
  (adminAuth as unknown as {getAuth: () => {getUser: (uid: string) => Promise<{customClaims: Record<string, unknown>}>}}).getAuth =
    () => ({
      getUser: async () => ({customClaims}),
    });
}

async function assertHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava HttpsError ${code}, veio ${err.code}`);
    return true;
  });
}

describe("updateMatchOpsSettingsCore", () => {
  it("liga a flag e preserva os outros campos de matchOps", async () => {
    mockAuthUser();
    const fake = new FakeFirestore();
    fake.seedDoc("tournaments/t1", {
      managerId: "owner-1",
      matchOps: {defaultMatchDurationMin: 45, minRestBetweenMatchesMin: 20},
    });

    const result = await updateMatchOpsSettingsCore(db(fake), "owner-1", "t1", true);

    assert.deepEqual(result, {ok: true, dynamicRescheduleEnabled: true});
    const tournament = (await fake.doc("tournaments/t1").get()).data();
    const matchOps = tournament?.matchOps as Record<string, unknown>;
    assert.equal(matchOps.dynamicRescheduleEnabled, true);
    assert.equal(matchOps.defaultMatchDurationMin, 45);
    assert.equal(matchOps.minRestBetweenMatchesMin, 20);
  });

  it("rejeita quem não é dono/staff do torneio", async () => {
    mockAuthUser();
    const fake = new FakeFirestore();
    fake.seedDoc("tournaments/t1", {managerId: "owner-1", matchOps: {}});

    await assertHttpsError(
      updateMatchOpsSettingsCore(db(fake), "intruso", "t1", true),
      "permission-denied",
    );
  });
});

import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {getMySubscriptionsCore} from "./arena-schedule-athlete";
import {ARENA, makeDb, today} from "./arena-schedule.test-helper";

describe("Meu plano: débito automático", () => {
  it("devolve só a autorização do próprio atleta", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaScheduleSubscriptions/s1", {
      arenaId: ARENA, planId: "p1", status: "active", memberAthleteIds: ["u1", "u2"],
      autopayAthleteIds: ["u1", "u2"],
      autopay: {
        u1: {enabled: true, brand: "VISA", last4: "4242", consentText: "x"},
        u2: {enabled: true, brand: "MASTERCARD", last4: "1111", consentText: "y"},
      },
    });
    const u1 = (await getMySubscriptionsCore(db, "u1", today(), Date.now())).subscriptions[0] as Record<string, unknown>;
    assert.deepEqual(Object.keys(u1["autopay"] as object), ["u1"]);
    assert.equal(u1["autopayAthleteIds"], undefined);
    assert.equal(JSON.stringify(u1).includes("1111"), false);

    fake.seedDoc("arenaScheduleSubscriptions/s2", {
      arenaId: ARENA, planId: "p1", status: "active", memberAthleteIds: ["u3"],
      autopay: {u1: {enabled: true, brand: "VISA", last4: "4242"}},
    });
    const u3 = (await getMySubscriptionsCore(db, "u3", today(), Date.now())).subscriptions[0] as Record<string, unknown>;
    assert.equal(u3["autopay"], undefined);
  });
});

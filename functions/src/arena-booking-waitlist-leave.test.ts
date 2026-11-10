import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  ARENA_BOOKING_WAITLIST,
  expirePastWaitingEntriesCore,
  leaveWaitlistCore,
  waitlistSlotStarted,
} from "./arena-booking-waitlist";

// Terça 10/11/2026 18:00 em SP (21:00 UTC).
const NOW_MS = Date.UTC(2026, 10, 10, 21, 0, 0);

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function entry(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    arenaId: "a1",
    courtId: "q1",
    date: "2026-11-10",
    startTime: "19:00",
    endTime: "20:00",
    athleteId: "uid1",
    status: "waiting",
    ...extra,
  };
}

describe("leaveWaitlistCore", () => {
  it("o dono sai da fila: `expired` com o motivo, que os apps antigos já escondem", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`${ARENA_BOOKING_WAITLIST}/w1`, entry());
    const result = await leaveWaitlistCore(db(fake), "uid1", "w1");
    assert.deepEqual(result, {waitlistId: "w1", status: "expired"});
    const saved = fake.store.get(`${ARENA_BOOKING_WAITLIST}/w1`);
    assert.equal(saved?.["status"], "expired");
    assert.equal(saved?.["expiredReason"], "left_by_athlete");
  });

  it("também sai quando já foi chamado (`notified`)", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`${ARENA_BOOKING_WAITLIST}/w1`, entry({status: "notified"}));
    assert.equal((await leaveWaitlistCore(db(fake), "uid1", "w1")).status, "expired");
  });

  it("outro atleta não tira ninguém da fila", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`${ARENA_BOOKING_WAITLIST}/w1`, entry());
    await assert.rejects(
      leaveWaitlistCore(db(fake), "intruso", "w1"),
      (e: {code?: string}) => e.code === "permission-denied",
    );
    assert.equal(fake.store.get(`${ARENA_BOOKING_WAITLIST}/w1`)?.["status"], "waiting");
  });

  it("entrada já encerrada não muda (sair de novo não falha)", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`${ARENA_BOOKING_WAITLIST}/w1`, entry({status: "converted"}));
    const result = await leaveWaitlistCore(db(fake), "uid1", "w1");
    assert.equal(result.status, "converted");
  });

  it("entrada inexistente devolve not-found", async () => {
    await assert.rejects(
      leaveWaitlistCore(db(new FakeFirestore()), "uid1", "nada"),
      (e: {code?: string}) => e.code === "not-found",
    );
  });
});

describe("waitlistSlotStarted", () => {
  it("compara com o início na parede de São Paulo", () => {
    assert.equal(waitlistSlotStarted(entry({startTime: "18:00"}), NOW_MS), true);
    assert.equal(waitlistSlotStarted(entry({startTime: "19:00"}), NOW_MS), false);
    assert.equal(waitlistSlotStarted(entry({date: "2026-11-09"}), NOW_MS), true);
  });

  it("sem data ou hora utilizável não encerra", () => {
    assert.equal(waitlistSlotStarted(entry({date: ""}), NOW_MS), false);
  });
});

describe("expirePastWaitingEntriesCore", () => {
  it("encerra só as `waiting` de horário já começado", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`${ARENA_BOOKING_WAITLIST}/ontem`, entry({date: "2026-11-09"}));
    fake.seedDoc(`${ARENA_BOOKING_WAITLIST}/futura`, entry());
    fake.seedDoc(`${ARENA_BOOKING_WAITLIST}/chamada`, entry({date: "2026-11-09", status: "notified"}));

    const count = await expirePastWaitingEntriesCore(db(fake), NOW_MS);

    assert.equal(count, 1);
    const ontem = fake.store.get(`${ARENA_BOOKING_WAITLIST}/ontem`);
    assert.equal(ontem?.["status"], "expired");
    assert.equal(ontem?.["expiredReason"], "slot_started");
    assert.equal(fake.store.get(`${ARENA_BOOKING_WAITLIST}/futura`)?.["status"], "waiting");
    // `notified` segue a janela de 15 min do sweeper original.
    assert.equal(fake.store.get(`${ARENA_BOOKING_WAITLIST}/chamada`)?.["status"], "notified");
  });
});

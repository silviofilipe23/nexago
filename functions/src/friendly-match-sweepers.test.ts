import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  expireFriendlyMatchSlotIfDue,
  sendFriendlyMatchReminderIfDue,
} from "./friendly-match-sweepers";

const HOUR_MS = 60 * 60 * 1000;
const now = Date.UTC(2026, 6, 10, 12, 0, 0);

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

// NOTE(task-10): `seedMatch` (old fromUid/toUid schema) is kept here because
// `seedConfirmed` below (sendFriendlyMatchReminderIfDue tests, out of scope
// for this task per the plan — that's Task 12) still depends on it. Only the
// expire-related describe block below was migrated to the new slots[] schema
// via `seedFilling`/`slot`.
function seedMatch(fake: FakeFirestore, id: string, overrides: DocData = {}): void {
  fake.seedDoc(`friendlyMatches/${id}`, {
    fromUid: "a",
    fromName: "Ana",
    toUid: "b",
    toName: "Bia",
    participantUids: ["a", "b"],
    status: "sent",
    scheduledAt: Timestamp.fromMillis(now + 48 * HOUR_MS),
    expiresAt: Timestamp.fromMillis(now - 1),
    history: [{status: "sent", actorUid: "a", at: Timestamp.fromMillis(now - 24 * HOUR_MS)}],
    ...overrides,
  });
}

function seedFilling(fake: FakeFirestore, id: string, slots: DocData[], overrides: DocData = {}): void {
  fake.seedDoc(`friendlyMatches/${id}`, {
    organizerUid: "a",
    organizerName: "Ana",
    slotsTotal: slots.length,
    slots,
    participantUids: ["a"],
    pendingSlotUids: slots.filter((s) => s.status === "invited" || s.status === "countered").map((s) => s.uid),
    status: "filling",
    scheduledAt: Timestamp.fromMillis(now + 48 * HOUR_MS),
    history: [{status: "filling", actorUid: "a", at: Timestamp.fromMillis(now - 24 * HOUR_MS)}],
    ...overrides,
  });
}

function slot(uid: string, name: string, expiresAt: number, status = "invited"): DocData {
  return {uid, name, photoUrl: null, status, invitedAt: Timestamp.fromMillis(now - 24 * HOUR_MS),
    respondedAt: null, expiresAt: Timestamp.fromMillis(expiresAt)};
}

describe("expireFriendlyMatchSlotIfDue", () => {
  it("vaga invited vencida → expired, história registrada, notifica o organizador", async () => {
    const fake = new FakeFirestore();
    seedFilling(fake, "m1", [slot("b", "Bia", now - 1)]);
    const result = await expireFriendlyMatchSlotIfDue(db(fake), "m1", 0, now);
    assert.equal(result.expired, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    const slots = data.slots as Array<{status: string}>;
    assert.equal(slots[0].status, "expired");
    assert.deepEqual(data.pendingSlotUids, []);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].userId, "a");
    assert.equal(result.notifications[0].type, "friendly_match_slot_expired");
  });

  it("não expira jogo que já saiu de filling; é idempotente", async () => {
    const fake = new FakeFirestore();
    seedFilling(fake, "m1", [slot("b", "Bia", now - 1)], {status: "confirmed"});
    const result = await expireFriendlyMatchSlotIfDue(db(fake), "m1", 0, now);
    assert.equal(result.expired, false);

    seedFilling(fake, "m2", [slot("b", "Bia", now - 1)]);
    await expireFriendlyMatchSlotIfDue(db(fake), "m2", 0, now);
    const again = await expireFriendlyMatchSlotIfDue(db(fake), "m2", 0, now);
    assert.equal(again.expired, false);
    assert.equal(again.notifications.length, 0);
  });

  it("não expira vaga ainda dentro do prazo", async () => {
    const fake = new FakeFirestore();
    seedFilling(fake, "m1", [slot("b", "Bia", now + HOUR_MS)]);
    const result = await expireFriendlyMatchSlotIfDue(db(fake), "m1", 0, now);
    assert.equal(result.expired, false);
    assert.equal((fake.store.get("friendlyMatches/m1")!.slots as Array<{status: string}>)[0].status, "invited");
  });

  it("com múltiplas vagas, só expira a vencida e mantém as outras intactas", async () => {
    const fake = new FakeFirestore();
    seedFilling(fake, "m1", [slot("b", "Bia", now - 1), slot("c", "Caio", now + HOUR_MS)]);
    await expireFriendlyMatchSlotIfDue(db(fake), "m1", 0, now);
    const data = fake.store.get("friendlyMatches/m1")!;
    const slots = data.slots as Array<{uid: string; status: string}>;
    assert.equal(slots[0].status, "expired");
    assert.equal(slots[1].status, "invited");
    assert.deepEqual(data.pendingSlotUids, ["c"]);
  });
});

describe("sendFriendlyMatchReminderIfDue", () => {
  function seedConfirmed(fake: FakeFirestore, id: string, overrides: DocData = {}): void {
    seedMatch(fake, id, {
      status: "confirmed",
      confirmedTime: Timestamp.fromMillis(now + 20 * HOUR_MS),
      scheduledAt: Timestamp.fromMillis(now + 20 * HOUR_MS),
      reminder24hAt: Timestamp.fromMillis(now - 60 * 1000),
      reminder2hAt: Timestamp.fromMillis(now + 18 * HOUR_MS),
      expiresAt: Timestamp.fromMillis(now + 100 * HOUR_MS),
      ...overrides,
    });
  }

  it("lembrete 24h vencido → notifica os DOIS participantes e anula o campo (lock)", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1");
    const result = await sendFriendlyMatchReminderIfDue(db(fake), "m1", "24h", now);
    assert.equal(result.sent, true);
    assert.equal(result.notifications.length, 2);
    const targets = result.notifications.map((n) => n.userId).sort();
    assert.deepEqual(targets, ["a", "b"]);
    assert.equal(result.notifications[0].type, "friendly_match_reminder");
    assert.equal(fake.store.get("friendlyMatches/m1")!.reminder24hAt, null);
  });

  it("segunda passada não reenvia (campo anulado)", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1");
    await sendFriendlyMatchReminderIfDue(db(fake), "m1", "24h", now);
    const again = await sendFriendlyMatchReminderIfDue(db(fake), "m1", "24h", now);
    assert.equal(again.sent, false);
    assert.equal(again.notifications.length, 0);
  });

  it("não envia antes da hora nem para jogo que deixou de estar confirmado", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "early", {reminder24hAt: Timestamp.fromMillis(now + HOUR_MS)});
    const early = await sendFriendlyMatchReminderIfDue(db(fake), "early", "24h", now);
    assert.equal(early.sent, false);

    seedConfirmed(fake, "gone", {status: "cancelled"});
    const gone = await sendFriendlyMatchReminderIfDue(db(fake), "gone", "24h", now);
    assert.equal(gone.sent, false);
  });

  it("lembrete 2h usa o campo próprio", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", {reminder2hAt: Timestamp.fromMillis(now - 1)});
    const result = await sendFriendlyMatchReminderIfDue(db(fake), "m1", "2h", now);
    assert.equal(result.sent, true);
    assert.equal(fake.store.get("friendlyMatches/m1")!.reminder2hAt, null);
    // O de 24h continua agendado.
    assert.ok(fake.store.get("friendlyMatches/m1")!.reminder24hAt instanceof Timestamp);
  });
});

import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  expireFriendlyMatchIfDue,
  sendFriendlyMatchReminderIfDue,
} from "./friendly-match-sweepers";

const HOUR_MS = 60 * 60 * 1000;
const now = Date.UTC(2026, 6, 10, 12, 0, 0);

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

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

describe("expireFriendlyMatchIfDue", () => {
  it("convite sent vencido → expired, história registrada, notifica o remetente", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "m1");
    const result = await expireFriendlyMatchIfDue(db(fake), "m1", now);
    assert.equal(result.expired, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "expired");
    const history = data.history as Array<{status: string; actorUid: string}>;
    const last = history[history.length - 1];
    assert.equal(last.status, "expired");
    assert.equal(last.actorUid, "system");
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].userId, "a");
    assert.equal(result.notifications[0].type, "friendly_match_expired");
  });

  it("contraproposta vencida → notifica o destinatário (dono da proposta vigente)", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "m1", {status: "countered"});
    const result = await expireFriendlyMatchIfDue(db(fake), "m1", now);
    assert.equal(result.expired, true);
    assert.equal(result.notifications[0].userId, "b");
  });

  it("é idempotente e respeita corrida com transição concorrente", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "m1", {status: "confirmed"});
    const confirmed = await expireFriendlyMatchIfDue(db(fake), "m1", now);
    assert.equal(confirmed.expired, false);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "confirmed");

    seedMatch(fake, "m2");
    await expireFriendlyMatchIfDue(db(fake), "m2", now);
    const again = await expireFriendlyMatchIfDue(db(fake), "m2", now);
    assert.equal(again.expired, false);
    assert.equal(again.notifications.length, 0);
  });

  it("não expira convite ainda dentro do prazo (re-checagem na transação)", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "m1", {expiresAt: Timestamp.fromMillis(now + HOUR_MS)});
    const result = await expireFriendlyMatchIfDue(db(fake), "m1", now);
    assert.equal(result.expired, false);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "sent");
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

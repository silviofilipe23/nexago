import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {processArenaClubSessionAsaasNotification} from "./asaas-arena-club-webhook";
import {parseClubSessionPaymentRef} from "./arena-club-constants";
import {holdCashback} from "./athlete-wallet";

const SESSION_PATH = "arenaClubSessions/club_c1_2026-07-24";
const PARTICIPANT_PATH = `${SESSION_PATH}/clubParticipants/uid1`;
const PROCESSED_PATH = "artifacts/p/public/data/asaas_processed_payments/pay1";
const EXTERNAL_REF = "arenaClubSession:club_c1_2026-07-24:uid1";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function seedSession(
  fake: FakeFirestore,
  overrides: Record<string, unknown> = {},
): void {
  fake.seedDoc(SESSION_PATH.replace("arenaClubSessions/", "arenaClubSessions/"), {
    clubId: "c1",
    arenaId: "arena1",
    arenaName: "Arena Sol",
    clubName: "Clubinho de sexta",
    date: "2026-07-24",
    startTime: "15:00",
    status: "scheduled",
    capacity: 2,
    confirmedCount: 0,
    pendingCount: 1,
    priceReais: 15,
    ...overrides,
  });
}

function seedParticipant(
  fake: FakeFirestore,
  overrides: Record<string, unknown> = {},
): void {
  fake.seedDoc(PARTICIPANT_PATH, {
    athleteId: "uid1",
    status: "pending_payment",
    amountReais: 15,
    asaasPaymentId: "pay1",
    ...overrides,
  });
}

function makeDeps() {
  const refunds: string[] = [];
  const notified: string[] = [];
  return {
    refunds,
    notified,
    deps: {
      refund: async (id: string) => {
        refunds.push(id);
      },
      notify: async (input: {userId: string}) => {
        notified.push(input.userId);
      },
    },
  };
}

function processedRefOf(db: Firestore): DocumentReference {
  return db.doc(PROCESSED_PATH) as DocumentReference;
}

const paidPayment = {
  status: "RECEIVED",
  value: 15,
  externalReference: EXTERNAL_REF,
};

describe("arena-club-constants.parseClubSessionPaymentRef", () => {
  it("extrai sessionId e uid", () => {
    assert.deepEqual(parseClubSessionPaymentRef(EXTERNAL_REF), {
      sessionId: "club_c1_2026-07-24",
      athleteUid: "uid1",
    });
    assert.equal(parseClubSessionPaymentRef("arenaBooking:x"), null);
    assert.equal(parseClubSessionPaymentRef("arenaClubSession:semUid"), null);
  });
});

describe("asaas-arena-club-webhook RECEIVED", () => {
  it("confirma o pendente, atualiza contadores e credita 5% sem piso", async () => {
    const {fake, db} = makeDb();
    seedSession(fake);
    seedParticipant(fake);
    const {deps, notified} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), deps,
    );

    const p = fake.store.get(PARTICIPANT_PATH)!;
    assert.equal(p["status"], "confirmed");
    assert.equal(p["platformFeeReais"], 0.75);
    assert.equal(p["netReais"], 14.25);

    const session = fake.store.get(SESSION_PATH)!;
    assert.equal(session["confirmedCount"], 1);
    assert.equal(session["pendingCount"], 0);

    const wallet = fake.store.get("arenaWallets/arena1")!;
    assert.equal(wallet["availableReais"], 14.25);

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed["outcome"], "approved");
    assert.deepEqual(notified, ["uid1"]);
  });

  it("é idempotente quando o payment já foi processado", async () => {
    const {fake, db} = makeDb();
    seedSession(fake);
    seedParticipant(fake);
    fake.seedDoc(PROCESSED_PATH, {outcome: "approved"});
    const {deps} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), deps,
    );

    const p = fake.store.get(PARTICIPANT_PATH)!;
    assert.equal(p["status"], "pending_payment"); // intocado
    assert.equal(fake.store.get(SESSION_PATH)!["confirmedCount"], 0);
  });

  it("pagamento tardio (expired) com vaga livre ainda confirma", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {pendingCount: 0});
    seedParticipant(fake, {status: "expired"});
    const {deps} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), deps,
    );

    assert.equal(fake.store.get(PARTICIPANT_PATH)!["status"], "confirmed");
    const session = fake.store.get(SESSION_PATH)!;
    assert.equal(session["confirmedCount"], 1);
    assert.equal(session["pendingCount"], 0);
  });

  it("pagamento tardio com lista cheia → estorno automático sem crédito", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {capacity: 1, confirmedCount: 1, pendingCount: 0});
    seedParticipant(fake, {status: "expired"});
    const {deps, refunds} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), deps,
    );

    assert.deepEqual(refunds, ["pay1"]);
    const p = fake.store.get(PARTICIPANT_PATH)!;
    assert.equal(p["status"], "canceled_by_arena_refunded");
    assert.equal(p["refundStatus"], "done");
    assert.equal(fake.store.has("arenaWallets/arena1"), false);
    assert.equal(fake.store.get(PROCESSED_PATH)!["outcome"], "refunded_session_full");
  });

  it("sessão cancelada → estorno automático", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {status: "canceled"});
    seedParticipant(fake);
    const {deps, refunds} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), deps,
    );

    assert.deepEqual(refunds, ["pay1"]);
    assert.equal(
      fake.store.get(PARTICIPANT_PATH)!["status"],
      "canceled_by_arena_refunded",
    );
  });

  it("estorno automático que falha NÃO grava processedRef (retry do webhook)", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {status: "canceled"});
    seedParticipant(fake);

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db),
      {
        refund: async () => {
          throw new Error("asaas fora do ar");
        },
        notify: async () => undefined,
      },
    );

    assert.equal(fake.store.has(PROCESSED_PATH), false);
    assert.equal(fake.store.get(PARTICIPANT_PATH)!["refundStatus"], "failed");
  });
});

describe("asaas-arena-club-webhook eventos negativos", () => {
  it("OVERDUE expira o pendente e libera a vaga", async () => {
    const {fake, db} = makeDb();
    seedSession(fake);
    seedParticipant(fake);
    const {deps} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db,
      "pay1",
      {status: "OVERDUE", value: 15, externalReference: EXTERNAL_REF},
      processedRefOf(db),
      deps,
    );

    assert.equal(fake.store.get(PARTICIPANT_PATH)!["status"], "expired");
    assert.equal(fake.store.get(SESSION_PATH)!["pendingCount"], 0);
    assert.equal(fake.store.get(PROCESSED_PATH)!["outcome"], "expired");
  });

  it("REFUNDED de estorno iniciado por nós só registra", async () => {
    const {fake, db} = makeDb();
    seedSession(fake);
    seedParticipant(fake, {status: "canceled_refunded"});
    const {deps} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db,
      "pay1",
      {status: "REFUNDED", value: 15, externalReference: EXTERNAL_REF},
      processedRefOf(db),
      deps,
    );

    assert.equal(fake.store.get(PARTICIPANT_PATH)!["status"], "canceled_refunded");
    assert.equal(fake.store.get(PROCESSED_PATH)!["outcome"], "already_resolved");
  });
});

describe("processArenaClubSessionAsaasNotification — cashback", () => {
  const NOW_MS = Date.now();

  it("saldo aplicado: participante e arena ficam com o bruto; reserva capturada", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {startAt: Timestamp.fromMillis(Date.UTC(2026, 6, 24, 18, 0, 0))});
    fake.seedDoc("athleteWallets/uid1/lots/old", {
      uid: "uid1", sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: 2000, remainingCents: 2000, status: "available",
      eventAt: Timestamp.fromMillis(NOW_MS - 1000), releasedAt: Timestamp.fromMillis(NOW_MS - 1000),
      expiresAt: Timestamp.fromMillis(NOW_MS + 90 * 86_400_000), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW_MS - 1000),
    });
    const {holdId} = await holdCashback(db, {
      uid: "uid1", maxCents: 1000, sourceType: "club", sourceId: "club_c1_2026-07-24",
      trackingPath: PARTICIPANT_PATH, label: "Clubinho", nowMs: NOW_MS,
    });
    seedParticipant(fake, {cashbackAppliedCents: 1000, cashbackHoldId: holdId});

    await processArenaClubSessionAsaasNotification(
      db, "pay1", {...paidPayment, value: 5}, processedRefOf(db), makeDeps().deps,
    );

    const participant = fake.store.get(PARTICIPANT_PATH)!;
    assert.equal(participant.status, "confirmed");
    assert.equal(participant.amountReais, 15);
    assert.equal(participant.platformFeeReais, 0.75);
    assert.equal(participant.netReais, 14.25);
    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.get(PROCESSED_PATH)!.cashbackStatus, "done");
  });

  it("cashback ligado: lote pendente até a sessão começar", async () => {
    const {fake, db} = makeDb();
    const startMs = Date.UTC(2026, 6, 24, 18, 0, 0);
    seedSession(fake, {startAt: Timestamp.fromMillis(startMs)});
    seedParticipant(fake);
    fake.seedDoc("appConfig/cashback", {enabled: true});

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), makeDeps().deps,
    );

    const lot = fake.store.get("athleteWallets/uid1/lots/pay1")!;
    // Taxa do clubinho = 5% de R$ 15 = R$ 0,75 → teto R$ 0,37; 2% = R$ 0,30.
    assert.equal(lot.earnedCents, 30);
    assert.equal(lot.sourceType, "club");
    assert.equal(lot.label, "Clubinho · Clubinho de sexta");
    assert.equal((lot.eventAt as Timestamp).toMillis(), startMs);
  });
});

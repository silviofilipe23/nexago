import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {attachHoldPayment, holdCashback} from "./athlete-wallet";
import {applyCashbackIntent, cashbackIntentFields, buildCashbackIntent} from "./cashback-intent";
import {DEFAULT_CASHBACK_CONFIG} from "./cashback-config";
import {
  asaasVerdictForHold,
  decideHoldAction,
  runCashbackHoldSweep,
  type HoldSweepAsaas,
} from "./cashback-hold-sweeper";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";
import {processArenaBookingAsaasNotification} from "./asaas-arena-booking-webhook";

const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);
const MIN = 60 * 1000;
const UID = "ath1";
const W = `athleteWallets/${UID}`;
const PROCESSED = "artifacts/p/public/data/asaas_processed_payments";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  // Contas vivas: a intenção de cashback de conta excluída é encerrada sem ganho.
  fake.seedDoc("users/ath1", {fullName: "Atleta"});
  return {fake, db: fake as unknown as Firestore};
}

/** Asaas de mentira: GET responde pelo mapa (Error = falha); DELETE registra e pode falhar. */
function stubAsaas(
  payments: Record<string, AsaasPaymentDetails | Error> = {},
  opts: {deleteError?: Error} = {},
): {asaas: HoldSweepAsaas; calls: {get: string[]; delete: string[]}} {
  const calls = {get: [] as string[], delete: [] as string[]};
  return {
    calls,
    asaas: {
      getPayment: async (paymentId) => {
        calls.get.push(paymentId);
        const answer = payments[paymentId];
        if (answer instanceof Error) throw answer;
        if (!answer) throw new Error(`GET inesperado: ${paymentId}`);
        return answer;
      },
      deletePayment: async (paymentId) => {
        calls.delete.push(paymentId);
        if (opts.deleteError) throw opts.deleteError;
      },
    },
  };
}

function seedLot(fake: FakeFirestore, cents = 1000): void {
  fake.seedDoc(`${W}/lots/l1`, {
    uid: UID, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
    label: "Reserva", earnedCents: cents, remainingCents: cents, status: "available",
    eventAt: Timestamp.fromMillis(NOW - 1e9), releasedAt: Timestamp.fromMillis(NOW - 1e9),
    expiresAt: Timestamp.fromMillis(NOW + 1e10), expiryWarnedAt: null,
    createdAt: Timestamp.fromMillis(NOW - 1e9),
  });
}

describe("decideHoldAction", () => {
  const base = {holdPaymentId: "pay1", holdCreatedAtMs: NOW - 10 * MIN, nowMs: NOW};

  it("reserva sem cobrança ligada: espera 15 min e depois devolve", () => {
    assert.equal(decideHoldAction({...base, sourceType: "booking", holdPaymentId: null, holdCreatedAtMs: NOW - 5 * MIN, tracking: null}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "booking", holdPaymentId: null, holdCreatedAtMs: NOW - 16 * MIN, tracking: null}), "release");
  });

  it("registro sumido ou de outra cobrança devolve", () => {
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: null}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: {asaasPaymentId: "outra", status: "pending_payment"}}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: {asaasPaymentId: null, status: "confirmed", paymentStatus: "split_pending"}}), "release");
  });

  it("inscrição: pago captura, pendente espera, cancelado devolve", () => {
    const t = (status: string) => ({asaasPaymentId: "pay1", status});
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("paid")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("pending")}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("cancelled")}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "registration", tracking: t("expired")}), "release");
  });

  it("reserva: paga ou parcial captura, aguardando espera, cancelada devolve", () => {
    const t = (status: string, paymentStatus: string) => ({asaasPaymentId: "pay1", status, paymentStatus});
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("confirmed", "paid")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("confirmed", "partial")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("pending_payment", "pending")}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "booking", tracking: t("cancelled", "expired")}), "release");
  });

  it("clubinho: confirmado captura, aguardando espera, saiu devolve", () => {
    const t = (status: string) => ({asaasPaymentId: "pay1", status});
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("confirmed")}), "capture");
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("pending_payment")}), "keep");
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("expired")}), "release");
    assert.equal(decideHoldAction({...base, sourceType: "club", tracking: t("canceled_by_arena_refunded")}), "release");
  });
});

describe("runCashbackHoldSweep", () => {
  async function seedHold(
    fake: FakeFirestore,
    db: Firestore,
    trackingPath: string,
    sourceType: "registration" | "booking" | "club",
    createdAtMs: number,
    paymentId: string | null,
  ): Promise<string> {
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 100, sourceType, sourceId: "x",
      trackingPath, label: "Teste", nowMs: createdAtMs,
    });
    if (paymentId) await attachHoldPayment(db, UID, holdId!, paymentId);
    return holdId!;
  }

  it("devolve as mortas, captura as pagas, mantém as abertas e ignora as recém-criadas", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(`${W}/lots/l1`, {
      uid: UID, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: 1000, remainingCents: 1000, status: "available",
      eventAt: Timestamp.fromMillis(NOW - 1e9), releasedAt: Timestamp.fromMillis(NOW - 1e9),
      expiresAt: Timestamp.fromMillis(NOW + 1e10), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW - 1e9),
    });
    fake.seedDoc("t/dead", {asaasPaymentId: "payDead", status: "cancelled"});
    fake.seedDoc("arenaBookings/paid", {asaasPaymentId: "payPaid", status: "confirmed", paymentStatus: "paid"});
    fake.seedDoc("arenaClubSessions/s/clubParticipants/ath1", {asaasPaymentId: "payOpen", status: "pending_payment"});
    fake.seedDoc("t/young", {asaasPaymentId: "payYoung", status: "cancelled"});

    const dead = await seedHold(fake, db, "t/dead", "registration", NOW - 10 * MIN, "payDead");
    const paid = await seedHold(fake, db, "arenaBookings/paid", "booking", NOW - 10 * MIN, "payPaid");
    const open = await seedHold(fake, db, "arenaClubSessions/s/clubParticipants/ath1", "club", NOW - 10 * MIN, "payOpen");
    const young = await seedHold(fake, db, "t/young", "registration", NOW - 1 * MIN, "payYoung");
    const {asaas, calls} = stubAsaas({payDead: {status: "PENDING"}});

    const stats = await runCashbackHoldSweep(db, "p", NOW, asaas);

    assert.equal(fake.store.get(`${W}/holds/${dead}`)!.status, "released");
    assert.equal(fake.store.get(`${W}/holds/${paid}`)!.status, "captured");
    assert.equal(fake.store.get(`${W}/holds/${open}`)!.status, "open");
    assert.equal(fake.store.get(`${W}/holds/${young}`)!.status, "open");
    assert.equal(stats.released, 1);
    assert.equal(stats.captured, 1);
    assert.equal(stats.kept, 1);
    // Só a que ia ser devolvida consulta o Asaas — e a cobrança viva é apagada antes.
    assert.deepEqual(calls.get, ["payDead"]);
    assert.deepEqual(calls.delete, ["payDead"]);
  });

  it("reaplica intenção pendente e desiste depois do limite", async () => {
    const {fake, db} = makeDb();
    const intent = buildCashbackIntent({
      uid: UID, sourceType: "booking", sourceId: "b1", tournamentId: null, arenaId: "a1",
      label: "Reserva", eventAtMs: NOW + 1e9, cashReais: 100, appliedCents: 0, feeReais: 8,
      holdId: null, config: {...DEFAULT_CASHBACK_CONFIG, enabled: true},
    });
    fake.seedDoc(`${PROCESSED}/payOk`, {outcome: "approved", ...cashbackIntentFields(intent)});
    fake.seedDoc(`${PROCESSED}/payStuck`, {
      outcome: "approved",
      ...cashbackIntentFields({...intent, attempts: 10, lastError: "boom"}),
    });

    const stats = await runCashbackHoldSweep(db, "p", NOW, stubAsaas().asaas);

    assert.equal(fake.store.get(`${PROCESSED}/payOk`)!.cashbackStatus, "done");
    assert.equal(fake.store.get(`${W}/lots/payOk`)!.status, "pending");
    assert.equal(fake.store.get(`${PROCESSED}/payStuck`)!.cashbackStatus, "failed");
    assert.equal(stats.intentsDone, 1);
    assert.equal(stats.intentsGivenUp, 1);
  });

  it("intenção pendente há menos de 2 min fica com o webhook que acabou de gravá-la", async () => {
    const {fake, db} = makeDb();
    const intent = buildCashbackIntent({
      uid: UID, sourceType: "booking", sourceId: "b1", tournamentId: null, arenaId: "a1",
      label: "Reserva", eventAtMs: NOW + 1e9, cashReais: 100, appliedCents: 0, feeReais: 8,
      holdId: null, config: {...DEFAULT_CASHBACK_CONFIG, enabled: true},
    });
    fake.seedDoc(`${PROCESSED}/payYoung`, {
      outcome: "approved", processedAt: Timestamp.fromMillis(NOW - 30 * 1000),
      ...cashbackIntentFields(intent),
    });
    fake.seedDoc(`${PROCESSED}/payOld`, {
      outcome: "approved", processedAt: Timestamp.fromMillis(NOW - 3 * MIN),
      ...cashbackIntentFields(intent),
    });

    const stats = await runCashbackHoldSweep(db, "p", NOW, stubAsaas().asaas);

    assert.equal(fake.store.get(`${PROCESSED}/payYoung`)!.cashbackStatus, "pending");
    assert.equal(fake.store.has(`${W}/lots/payYoung`), false);
    assert.equal(
      (fake.store.get(`${PROCESSED}/payYoung`)!.cashback as {attempts: number}).attempts,
      0,
    );
    assert.equal(fake.store.get(`${PROCESSED}/payOld`)!.cashbackStatus, "done");
    assert.equal(stats.intentsDone, 1);

    // Passada seguinte, já com mais de 2 min: reaplica.
    await runCashbackHoldSweep(db, "p", NOW + 2 * MIN, stubAsaas().asaas);
    assert.equal(fake.store.get(`${PROCESSED}/payYoung`)!.cashbackStatus, "done");
  });

  it("retoma estorno interrompido (cashbackStatus 'reversing') e conta em reversalsRetried", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(`${W}/lots/old`, {
      uid: UID, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: 1000, remainingCents: 1000, status: "available",
      eventAt: Timestamp.fromMillis(NOW - 1e9), releasedAt: Timestamp.fromMillis(NOW - 1e9),
      expiresAt: Timestamp.fromMillis(NOW + 1e10), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW - 1e9),
    });
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 100, sourceType: "club", sourceId: "s1",
      trackingPath: "arenaClubSessions/s1/clubParticipants/ath1", label: "Clubinho", nowMs: NOW,
    });
    const intent = buildCashbackIntent({
      uid: UID, sourceType: "club", sourceId: "s1", tournamentId: null, arenaId: "a1",
      label: "Clubinho", eventAtMs: NOW + 1e9, cashReais: 5, appliedCents: 100, feeReais: 0.75,
      holdId, config: {...DEFAULT_CASHBACK_CONFIG, enabled: true},
    });
    fake.seedDoc(`${PROCESSED}/payStuckReversal`, {outcome: "approved", ...cashbackIntentFields(intent)});
    const ref = db.doc(`${PROCESSED}/payStuckReversal`) as DocumentReference;
    await applyCashbackIntent(db, ref, "payStuckReversal", NOW);
    // Simula o roteador caindo logo depois de marcar "reversing", antes de
    // desfazer lote e saldo.
    await ref.set({cashbackStatus: "reversing"}, {merge: true});

    const stats = await runCashbackHoldSweep(db, "p", NOW, stubAsaas().asaas);

    assert.equal(fake.store.get(`${W}/lots/payStuckReversal`)!.status, "cancelled");
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "refunded");
    assert.equal(fake.store.get(`${PROCESSED}/payStuckReversal`)!.cashbackStatus, "reversed");
    assert.equal(stats.reversalsRetried, 1);
  });
});

describe("asaasVerdictForHold", () => {
  it("pago captura; apagado ou estornado devolve; ainda pagável apaga antes; disputa ou status vazio espera", () => {
    for (const status of ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]) {
      assert.equal(asaasVerdictForHold({status}), "capture", status);
    }
    assert.equal(asaasVerdictForHold({status: "PENDING", deleted: true}), "release");
    assert.equal(asaasVerdictForHold({status: "OVERDUE", deleted: true}), "release");
    assert.equal(asaasVerdictForHold({status: "REFUNDED"}), "release");
    for (const status of ["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS", "ALGO_NOVO"]) {
      assert.equal(asaasVerdictForHold({status}), "delete_then_release", status);
    }
    for (const status of ["REFUND_REQUESTED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"]) {
      assert.equal(asaasVerdictForHold({status}), "wait", status);
    }
    assert.equal(asaasVerdictForHold({}), "wait");
  });
});

describe("runCashbackHoldSweep — confere o Asaas antes de devolver (C2)", () => {
  async function seedHoldOn(
    db: Firestore,
    trackingPath: string,
    sourceType: "registration" | "booking" | "club",
    paymentId: string | null,
    createdAtMs = NOW - 10 * MIN,
  ): Promise<string> {
    const {holdId} = await holdCashback(db, {
      uid: UID, maxCents: 300, sourceType, sourceId: "x", trackingPath, label: "Teste", nowMs: createdAtMs,
    });
    if (paymentId) await attachHoldPayment(db, UID, holdId!, paymentId);
    return holdId!;
  }

  it("atleta cancela a própria reserva por escrita direta com o PIX ainda vivo: a cobrança é apagada antes de devolver", async () => {
    const {fake, db} = makeDb();
    seedLot(fake);
    fake.seedDoc("arenaBookings/b1", {asaasPaymentId: "payA", status: "cancelled", paymentStatus: "pending"});
    const holdId = await seedHoldOn(db, "arenaBookings/b1", "booking", "payA");
    const {asaas, calls} = stubAsaas({payA: {status: "PENDING"}});

    const stats = await runCashbackHoldSweep(db, "p", NOW, asaas);

    assert.deepEqual(calls.delete, ["payA"]);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "released");
    assert.equal(stats.released, 1);
    assert.equal(stats.chargesDeleted, 1);
  });

  it("vale nos três fluxos: inscrição, reserva e clubinho apagam a cobrança pagável antes de devolver", async () => {
    const {fake, db} = makeDb();
    seedLot(fake);
    fake.seedDoc("t/reg", {asaasPaymentId: "payR", status: "cancelled"});
    fake.seedDoc("arenaBookings/b1", {asaasPaymentId: "payB", status: "cancelled", paymentStatus: "pending"});
    fake.seedDoc("arenaClubSessions/s/clubParticipants/ath1", {asaasPaymentId: "payC", status: "expired"});
    const reg = await seedHoldOn(db, "t/reg", "registration", "payR");
    const booking = await seedHoldOn(db, "arenaBookings/b1", "booking", "payB");
    const club = await seedHoldOn(db, "arenaClubSessions/s/clubParticipants/ath1", "club", "payC");
    const {asaas, calls} = stubAsaas({
      payR: {status: "OVERDUE"},
      payB: {status: "AWAITING_RISK_ANALYSIS"},
      payC: {status: "PENDING"},
    });

    await runCashbackHoldSweep(db, "p", NOW, asaas);

    assert.deepEqual([...calls.delete].sort(), ["payB", "payC", "payR"]);
    for (const holdId of [reg, booking, club]) {
      assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "released");
    }
  });

  it("registro diz morto mas o Asaas diz pago: captura em vez de devolver, sem apagar", async () => {
    const {fake, db} = makeDb();
    seedLot(fake);
    fake.seedDoc("arenaBookings/b1", {asaasPaymentId: "payA", status: "cancelled", paymentStatus: "pending"});
    fake.seedDoc("arenaBookings/b2", {asaasPaymentId: null, status: "pending_payment"});
    fake.seedDoc("arenaBookings/b3", {asaasPaymentId: "payOutra", status: "pending_payment"});
    const a = await seedHoldOn(db, "arenaBookings/b1", "booking", "payA");
    const b = await seedHoldOn(db, "arenaBookings/b2", "booking", "payB");
    const c = await seedHoldOn(db, "arenaBookings/b3", "booking", "payC");
    const {asaas, calls} = stubAsaas({
      payA: {status: "RECEIVED"},
      payB: {status: "CONFIRMED"},
      payC: {status: "RECEIVED_IN_CASH"},
    });

    const stats = await runCashbackHoldSweep(db, "p", NOW, asaas);

    assert.deepEqual(calls.delete, []);
    for (const holdId of [a, b, c]) {
      assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "captured");
    }
    assert.equal(stats.captured, 3);
    assert.equal(stats.released, 0);
  });

  it("cobrança já apagada ou estornada: devolve sem apagar de novo", async () => {
    const {fake, db} = makeDb();
    seedLot(fake);
    fake.seedDoc("t/a", {asaasPaymentId: "payDel", status: "cancelled"});
    fake.seedDoc("t/b", {asaasPaymentId: "payRef", status: "cancelled"});
    const a = await seedHoldOn(db, "t/a", "registration", "payDel");
    const b = await seedHoldOn(db, "t/b", "registration", "payRef");
    const {asaas, calls} = stubAsaas({
      payDel: {status: "PENDING", deleted: true},
      payRef: {status: "REFUNDED"},
    });

    await runCashbackHoldSweep(db, "p", NOW, asaas);

    assert.deepEqual(calls.delete, []);
    assert.equal(fake.store.get(`${W}/holds/${a}`)!.status, "released");
    assert.equal(fake.store.get(`${W}/holds/${b}`)!.status, "released");
  });

  it("GET do Asaas falha: mantém a reserva aberta, conta a falha e tenta na próxima passada", async () => {
    const {fake, db} = makeDb();
    seedLot(fake);
    fake.seedDoc("arenaBookings/b1", {asaasPaymentId: "payA", status: "cancelled", paymentStatus: "pending"});
    const holdId = await seedHoldOn(db, "arenaBookings/b1", "booking", "payA");
    const {asaas, calls} = stubAsaas({payA: new Error("Asaas fora do ar")});

    const stats = await runCashbackHoldSweep(db, "p", NOW, asaas);

    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "open");
    assert.deepEqual(calls.delete, []);
    assert.equal(stats.asaasFailed, 1);
    assert.equal(stats.kept, 1);
    assert.equal(stats.released, 0);

    // Próxima passada, Asaas de volta: apaga e devolve.
    const retry = stubAsaas({payA: {status: "PENDING"}});
    await runCashbackHoldSweep(db, "p", NOW + 5 * MIN, retry.asaas);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "released");
  });

  it("DELETE do Asaas falha (ex.: pagaram entre o GET e o DELETE): mantém a reserva aberta", async () => {
    const {fake, db} = makeDb();
    seedLot(fake);
    fake.seedDoc("arenaClubSessions/s/clubParticipants/ath1", {asaasPaymentId: "payC", status: "expired"});
    const holdId = await seedHoldOn(db, "arenaClubSessions/s/clubParticipants/ath1", "club", "payC");
    const {asaas, calls} = stubAsaas({payC: {status: "PENDING"}}, {deleteError: new Error("não pode remover")});

    const stats = await runCashbackHoldSweep(db, "p", NOW, asaas);

    assert.deepEqual(calls.delete, ["payC"]);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "open");
    assert.equal(stats.asaasFailed, 1);
    assert.equal(stats.released, 0);
  });

  it("estorno ou disputa em andamento: espera o desfecho, sem apagar nem devolver", async () => {
    const {fake, db} = makeDb();
    seedLot(fake);
    fake.seedDoc("t/a", {asaasPaymentId: "payA", status: "cancelled"});
    const holdId = await seedHoldOn(db, "t/a", "registration", "payA");
    const {asaas, calls} = stubAsaas({payA: {status: "REFUND_REQUESTED"}});

    const stats = await runCashbackHoldSweep(db, "p", NOW, asaas);

    assert.deepEqual(calls.delete, []);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "open");
    assert.equal(stats.kept, 1);
  });

  it("reserva que nunca ganhou cobrança devolve depois de 15 min sem consultar o Asaas", async () => {
    const {fake, db} = makeDb();
    seedLot(fake);
    const holdId = await seedHoldOn(db, "arenaBookings/b1", "booking", null, NOW - 16 * MIN);
    const {asaas, calls} = stubAsaas();

    await runCashbackHoldSweep(db, "p", NOW, asaas);

    assert.deepEqual(calls.get, []);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "released");
  });

  it("captura pela varredura e depois o webhook do mesmo pagamento: o saldo é debitado uma vez só", async () => {
    const {fake, db} = makeDb();
    seedLot(fake, 1000);
    fake.seedDoc("arenas/arena1", {name: "Arena X"});
    fake.seedDoc("arenaBookings/b1", {
      athleteId: UID, arenaId: "arena1", paymentChannel: "pix",
      // Escrita direta do cliente cancelou a reserva com o PIX vivo; o atleta pagou.
      status: "cancelled", paymentStatus: "pending",
      amountReais: 100, amountToPayNowReais: 100, amountDueOnsiteReais: 0, paymentFraction: 1,
      asaasPaymentId: "payA",
    });
    const holdId = await seedHoldOn(db, "arenaBookings/b1", "booking", "payA");
    const {asaas} = stubAsaas({payA: {status: "RECEIVED"}});

    await runCashbackHoldSweep(db, "p", NOW, asaas);
    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "captured");

    await processArenaBookingAsaasNotification(
      db, "payA",
      {status: "RECEIVED", value: 97, externalReference: "arenaBooking:b1"},
      db.doc(`${PROCESSED}/payA`) as DocumentReference,
    );

    assert.equal(fake.store.get(`${W}/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.get(`${W}/lots/l1`)!.remainingCents, 700);
    const redeems = [...fake.store.entries()]
      .filter(([path, data]) => path.startsWith(`${W}/ledger/`) && data.type === "redeem");
    assert.equal(redeems.length, 1);
    assert.equal(redeems[0][1].amountCents, 300);
    assert.equal(fake.store.get("arenaBookings/b1")!.amountPaidOnlineReais, 100);
  });
});

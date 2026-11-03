import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {Timestamp} from "firebase-admin/firestore";
import {
  activatePendingSubscriptionCore,
  cancelMySubscriptionCore,
  createSubscriptionCore,
  expirePendingSubscriptionCore,
  paysAtSignup,
  type CreateSubscriptionRequest,
} from "./arena-schedule-subscriptions";
import {
  PAYMENT_WINDOW_CLOSED_MESSAGE,
  activatesSubscription,
  expireSchedulePendingPayments,
  getScheduleChargeCheckoutCore,
  type ScheduleAsaasDeps,
} from "./arena-schedule-asaas";
import {PENDING_PAYMENT_BLOCK_MESSAGE, SIGNUP_PAYMENT_WINDOW_MS} from "./arena-schedule-plan-constants";
import {ARENA, docsIn, holder, makeDb, planData, pushes, seedArena, today, weekdayIn} from "./arena-schedule.test-helper";
import type {FakeFirestore} from "./fake-firestore.test-helper";

// Assinatura pelo app com Pix/cartão: segura o horário 30 min até pagar a 1ª mensalidade.

const NOW = Date.now();

function request(overrides: Partial<CreateSubscriptionRequest> = {}): CreateSubscriptionRequest {
  return {
    arenaId: ARENA, planId: "p1", holder: holder("u1"), memberAthleteIds: [],
    weekdays: [weekdayIn(2)], startTime: "19:00", preferredCourtId: null, strictCourt: false,
    cycle: "monthly", paymentMethod: "pix_auto", startDate: today(), source: "athlete",
    createdByUid: "u1", audience: "athlete", ...overrides,
  };
}

/** Arena apta a cobrar online (pagamento online + chave PIX). */
function seedOnlineArena(fake: FakeFirestore): void {
  seedArena(fake);
  fake.seedDoc(`arenas/${ARENA}`, {
    name: "Arena CFC", managerUserId: "mgr", planTier: "pro", planStatus: "active",
    onlinePaymentEnabled: true, payoutPixKey: "pix@arena.com.br",
  });
}

function deps(over: Partial<ScheduleAsaasDeps> = {}): ScheduleAsaasDeps {
  return {
    resolveCustomer: async () => "cus_u1",
    registerCustomer: async () => "cus_u1",
    createPayment: async (i) => ({paymentId: `pay_${i.groupId}`, invoiceUrl: `https://asaas.test/i/${i.groupId}`, status: "PENDING"}),
    deletePayment: async () => undefined,
    getPayment: async (id) => ({id, status: "PENDING"}),
    fetchPixQrCode: async (id) => ({qrCode: `pix-${id}`, qrCodeBase64: ""}),
    notify: async () => undefined,
    sleep: async () => undefined,
    ...over,
  };
}

const sub = (fake: FakeFirestore, id: string) => fake.store.get(`arenaScheduleSubscriptions/${id}`)!;
const occupied = (fake: FakeFirestore) => fake.store.get(`arenas/${ARENA}/schedulePlans/p1`)!["occupiedCount"];

async function rejects(p: Promise<unknown>, code: string, message?: string): Promise<void> {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof HttpsError, String(e));
    assert.equal(e.code, code);
    if (message) assert.equal(e.message, message);
    return true;
  });
}

describe("assinatura aguardando pagamento — nascimento", () => {
  it("só o atleta, com Pix/cartão, arena online e parte do titular ≥ R$ 5", () => {
    const base = {audience: "athlete" as const, holderAthleteId: "u1", paymentMethod: "pix_auto", onlineBilling: true, holderShareReais: 90};
    assert.equal(paysAtSignup(base), true);
    assert.equal(paysAtSignup({...base, paymentMethod: "card"}), true);
    assert.equal(paysAtSignup({...base, paymentMethod: "onsite"}), false);
    assert.equal(paysAtSignup({...base, audience: "manager"}), false);
    assert.equal(paysAtSignup({...base, onlineBilling: false}), false);
    assert.equal(paysAtSignup({...base, holderShareReais: 4.99}), false);
    assert.equal(paysAtSignup({...base, holderAthleteId: null}), false);
  });

  it("nasce aguardando pagamento por 30 min, segurando a vaga e o horário", async () => {
    const {fake, db} = makeDb();
    seedOnlineArena(fake);
    const out = await createSubscriptionCore(db, request(), today(), NOW);
    assert.equal(out.status, "pending_payment");
    assert.equal(out.paymentDeadline, new Date(NOW + SIGNUP_PAYMENT_WINDOW_MS).toISOString());
    const s = sub(fake, out.subscriptionId);
    assert.equal(s["status"], "pending_payment");
    assert.equal((s["pendingPaymentUntil"] as Timestamp).toMillis(), NOW + SIGNUP_PAYMENT_WINDOW_MS);
    assert.equal(occupied(fake), 1);
    // Mesmo plano enquanto aguarda: cai na trava de um pendente por vez.
    await rejects(createSubscriptionCore(db, request(), today(), NOW), "failed-precondition", PENDING_PAYMENT_BLOCK_MESSAGE);
  });

  it("com um plano aguardando pagamento, o atleta não assina outro até pagar ou desistir", async () => {
    const {fake, db} = makeDb();
    seedOnlineArena(fake);
    fake.seedDoc(`arenas/${ARENA}/schedulePlans/p2`, planData({name: "Outro plano"}));
    const first = await createSubscriptionCore(db, request(), today(), NOW);
    await rejects(createSubscriptionCore(db, request({planId: "p2", paymentMethod: "onsite"}), today(), NOW),
      "failed-precondition", PENDING_PAYMENT_BLOCK_MESSAGE);
    // O gestor cadastrando pela arena não é barrado.
    const byManager = await createSubscriptionCore(db,
      request({planId: "p2", audience: "manager", source: "arena", createdByUid: "mgr", startTime: "20:00"}), today(), NOW);
    assert.equal(byManager.status, "active");
    // Desistiu: libera para assinar de novo.
    await cancelMySubscriptionCore(db, "u1", first.subscriptionId, today());
    assert.equal((await createSubscriptionCore(db, request(), today(), NOW)).status, "pending_payment");
  });

  it("na arena, gestor ou arena sem cobrança online: nasce ativa como antes", async () => {
    const onsite = makeDb();
    seedOnlineArena(onsite.fake);
    assert.equal((await createSubscriptionCore(onsite.db, request({paymentMethod: "onsite"}), today(), NOW)).status, "active");
    const offline = makeDb();
    seedArena(offline.fake);
    const out = await createSubscriptionCore(offline.db, request(), today(), NOW);
    assert.equal(out.status, "active");
    assert.equal(out.paymentDeadline, null);
  });
});

describe("assinatura aguardando pagamento — paga ou vence", () => {
  it("1ª mensalidade do titular paga ativa a assinatura (uma vez)", async () => {
    const {fake, db} = makeDb();
    seedOnlineArena(fake);
    const out = await createSubscriptionCore(db, request(), today(), NOW);
    const charge = fake.store.get(`arenaScheduleCharges/${out.firstCharge.chargeId}`)!;
    assert.equal(activatesSubscription(charge, {...charge, status: "paid"}), true);
    assert.equal(activatesSubscription(charge, {...charge, status: "paid", payerIndex: 1}), false);
    assert.equal(activatesSubscription({...charge, status: "paid"}, {...charge, status: "paid"}), false);

    pushes.length = 0;
    assert.equal(await activatePendingSubscriptionCore(db, out.subscriptionId), true);
    assert.equal(sub(fake, out.subscriptionId)["status"], "active");
    assert.equal(sub(fake, out.subscriptionId)["pendingPaymentUntil"], null);
    assert.deepEqual(pushes.map((p) => p.type), ["schedule_plan_subscribed"]);
    assert.equal(await activatePendingSubscriptionCore(db, out.subscriptionId), false);
  });

  it("prazo vencido libera tudo: horário, cobrança, vaga; antes do prazo ou paga, não", async () => {
    const {fake, db} = makeDb();
    seedOnlineArena(fake);
    const out = await createSubscriptionCore(db, request(), today(), NOW);
    const seriesId = (sub(fake, out.subscriptionId)["slots"] as Array<{seriesId: string}>)[0]!.seriesId;
    assert.ok(docsIn(fake, `arenaBookings/rec_${seriesId}_`).some(([, b]) => b["status"] === "active"));

    assert.equal(await expirePendingSubscriptionCore(db, out.subscriptionId, today(), NOW + 60_000), false);
    assert.equal(await expirePendingSubscriptionCore(db, out.subscriptionId, today(), NOW + SIGNUP_PAYMENT_WINDOW_MS + 1), true);
    const s = sub(fake, out.subscriptionId);
    assert.equal(s["status"], "canceled");
    assert.equal(s["cancelReason"], "Pagamento não feito no prazo");
    assert.equal(fake.store.get(`arenaScheduleCharges/${out.firstCharge.chargeId}`)!["status"], "canceled");
    assert.equal(fake.store.get(`arenaRecurringBookings/${seriesId}`)!["status"], "canceled");
    assert.equal(docsIn(fake, `arenaBookings/rec_${seriesId}_`).filter(([, b]) => b["status"] === "active").length, 0);
    assert.equal(occupied(fake), 0);

    const paid = makeDb();
    seedOnlineArena(paid.fake);
    const p = await createSubscriptionCore(paid.db, request(), today(), NOW);
    paid.fake.seedDoc(`arenaScheduleCharges/${p.firstCharge.chargeId}`, {
      ...paid.fake.store.get(`arenaScheduleCharges/${p.firstCharge.chargeId}`)!, status: "paid",
    });
    assert.equal(await expirePendingSubscriptionCore(paid.db, p.subscriptionId, today(), NOW + SIGNUP_PAYMENT_WINDOW_MS + 1), false);
  });

  it("varredura: vence quem passou do prazo; pago no Asaas sem webhook espera", async () => {
    const {fake, db} = makeDb();
    seedOnlineArena(fake);
    const late = await createSubscriptionCore(db, request(), today(), NOW);
    const paidAtAsaas = await createSubscriptionCore(db, request({holder: holder("u2"), createdByUid: "u2"}), today(), NOW);
    fake.seedDoc("arenaScheduleAsaasPayments/g2", {state: "open", paymentId: "pay_g2"});
    const c2 = `arenaScheduleCharges/${paidAtAsaas.firstCharge.chargeId}`;
    fake.seedDoc(c2, {...fake.store.get(c2)!, asaas: {groupId: "g2", state: "open"}});

    const out = await expireSchedulePendingPayments(db, new Date(NOW + SIGNUP_PAYMENT_WINDOW_MS + 1), deps({
      getPayment: async (id) => ({id, status: id === "pay_g2" ? "CONFIRMED" : "PENDING"}),
    }));
    assert.deepEqual(out, {expired: 1, waitingWebhook: 1});
    assert.equal(sub(fake, late.subscriptionId)["status"], "canceled");
    assert.equal(sub(fake, paidAtAsaas.subscriptionId)["status"], "pending_payment");
  });

  it("desistir antes de pagar libera na hora", async () => {
    const {fake, db} = makeDb();
    seedOnlineArena(fake);
    const out = await createSubscriptionCore(db, request(), today(), NOW);
    pushes.length = 0;
    assert.deepEqual(await cancelMySubscriptionCore(db, "u1", out.subscriptionId, today()), {endsOn: today()});
    assert.equal(sub(fake, out.subscriptionId)["status"], "canceled");
    assert.equal(sub(fake, out.subscriptionId)["cancelReason"], "Atleta desistiu antes de pagar");
    assert.equal(occupied(fake), 0);
    assert.equal(pushes.length, 0, "quem desistiu não recebe push de prazo vencido");
  });

  it("pagamento depois do prazo é recusado na tela", async () => {
    const {fake, db} = makeDb();
    seedOnlineArena(fake);
    const out = await createSubscriptionCore(db, request(), today(), NOW - SIGNUP_PAYMENT_WINDOW_MS - 1);
    assert.equal(sub(fake, out.subscriptionId)["status"], "pending_payment");
    await rejects(getScheduleChargeCheckoutCore(db, "u1", out.firstCharge.chargeId, undefined, "pix", deps()),
      "failed-precondition", PAYMENT_WINDOW_CLOSED_MESSAGE);
  });
});

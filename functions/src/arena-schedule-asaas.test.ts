import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {getApps, initializeApp} from "firebase-admin/app";
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import type {FakeFirestore} from "./fake-firestore.test-helper";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {monthKeyOf} from "./arena-class-ledger";
import {DEFAULT_PLAN_RULES} from "./arena-schedule-plan-constants";
import {getPlanAvailabilityCore, saveScheduleRulesCore} from "./arena-schedule-plans";
import {
  cancelScheduleChargeCore,
  onlineInvoiceUrlOf,
  reactivateIfClearCore,
  registerSchedulePaymentCore,
} from "./arena-schedule-billing";
import {createSubscriptionCore, pauseSubscriptionCore, resumeSubscriptionCore} from "./arena-schedule-subscriptions";
import {
  CPF_REQUIRED_MESSAGE,
  ONSITE_ONLY_MESSAGE,
  decideScheduleBillingMode,
  autopayLeftOpen,
  decideScheduleChargeBilling,
  ensureScheduleAsaasPayment,
  expireSchedulePendingPayments,
  onArenaScheduleAsaasPaymentWritten,
  requestScheduleGroupVoid,
  skipScheduleAutopay,
  MAX_VOID_ATTEMPTS,
  getScheduleChargeCheckoutCore,
  getScheduleChargePaymentLinkCore,
  reconcileScheduleAsaasPayments,
  requestScheduleAsaasVoid,
  scheduleChargeTriggerAction,
  voidScheduleAsaasPayment,
  type ScheduleAsaasDeps,
} from "./arena-schedule-asaas";
import {
  parseSchedulePaymentRef,
  parseScheduleTokenAttempt,
  processArenaScheduleAsaasNotification,
} from "./asaas-arena-schedule-webhook";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";
import {ARENA, MANAGER, docsIn, holder, makeDb, planData, pushes, seedArena, today, weekdayIn} from "./arena-schedule.test-helper";
import {scheduleNotifier} from "./arena-schedule-plans";
import {getAsaasEnvTag} from "./asaas-client";

const CPF = "52998224725";
const CHARGES = "arenaScheduleCharges";
const GROUPS = "arenaScheduleAsaasPayments";

type Data = Record<string, unknown>;

/** Arena apta a receber online (pagamento online + chave PIX), regra ligada, assinatura e mensalidade `c1`. */
function seedOnline(fake: FakeFirestore, opts: {
  rule?: boolean; arena?: Data; sub?: Data; charge?: Data;
} = {}): void {
  seedArena(fake);
  fake.seedDoc(`arenas/${ARENA}`, {
    name: "Arena CFC", managerUserId: MANAGER, planTier: "pro", planStatus: "active",
    onlinePaymentEnabled: true, payoutPixKey: "pix@arena.com.br", ...opts.arena,
  });
  fake.seedDoc(`arenas/${ARENA}/scheduleSettings/rules`, {onlineBillingEnabled: opts.rule ?? true});
  fake.seedDoc("arenaScheduleSubscriptions/s1", {
    arenaId: ARENA, arenaName: "Arena CFC", planName: "Fixo 1x", status: "active", paymentMethod: "pix_auto",
    holderAthleteId: "u1", holderName: "Atleta u1", memberAthleteIds: ["u1"], slots: [],
    planSnapshot: {overdueReleaseDays: 3, rules: DEFAULT_PLAN_RULES}, ...opts.sub,
  });
  fake.seedDoc(`${CHARGES}/c1`, {
    arenaId: ARENA, subscriptionId: "s1", planName: "Fixo 1x", holderName: "Atleta u1", period: "2026-12", kind: "monthly",
    payerIndex: 0, payerName: "Atleta u1", payerAthleteId: "u1", visibleTo: ["u1"], amountReais: 300,
    dueDate: "2026-12-05", status: "open", paymentMethod: null, billingMode: null, remindersSent: [], ...opts.charge,
  });
}

function fakeDeps(over: Partial<ScheduleAsaasDeps> = {}, customers: Record<string, string> = {u1: "cus_u1"}) {
  const calls = {
    created: [] as string[], deleted: [] as string[], registered: [] as Array<[string, string]>,
    pushes: [] as Array<{userId: string; type: string; data: Record<string, string>}>,
    qr: [] as string[],
  };
  const known = new Map(Object.entries(customers));
  const deps: ScheduleAsaasDeps = {
    resolveCustomer: async (uid) => known.get(uid) ?? null,
    registerCustomer: async (uid, cpf) => {
      calls.registered.push([uid, cpf]);
      known.set(uid, `cus_${uid}`);
      return `cus_${uid}`;
    },
    createPayment: async (input) => {
      calls.created.push(input.groupId);
      return {paymentId: `pay_${input.groupId}`, invoiceUrl: `https://asaas.test/i/${input.groupId}`, status: "PENDING"};
    },
    deletePayment: async (id) => {
      calls.deleted.push(id);
    },
    getPayment: async (id) => ({id, status: "PENDING"}),
    fetchPixQrCode: async (id) => {
      calls.qr.push(id);
      return {qrCode: `pix-${id}`, qrCodeBase64: "aW1n"};
    },
    notify: async (i) => {
      calls.pushes.push({userId: i.userId, type: i.type, data: i.data});
    },
    sleep: async () => undefined,
    ...over,
  };
  return {deps, calls};
}

const charge = (fake: FakeFirestore, id = "c1") => fake.store.get(`${CHARGES}/${id}`)!;
const group = (fake: FakeFirestore, id: string) => fake.store.get(`${GROUPS}/${id}`)!;
const mirror = (fake: FakeFirestore, id = "c1") => (charge(fake, id)["asaas"] ?? {}) as Data;

async function openGroup(fake: FakeFirestore, db: Firestore) {
  const {groupId} = await decideScheduleChargeBilling(db, "c1");
  const {deps, calls} = fakeDeps();
  await ensureScheduleAsaasPayment(db, groupId!, deps);
  return {groupId: groupId!, deps, calls};
}

function processedRef(db: Firestore, paymentId: string) {
  return db.doc(`artifacts/p/public/data/asaas_processed_payments/${paymentId}`);
}

function payment(groupId: string, over: Partial<AsaasPaymentDetails> = {}): AsaasPaymentDetails {
  return {
    id: `pay_${groupId}`, status: "RECEIVED", value: 300, netValue: 300, billingType: "PIX",
    externalReference: `arenaSchedulePayment:${groupId}`, ...over,
  };
}

function webhookDeps(refunds: string[] = [], reactivated: string[] = []) {
  return {
    refund: async (id: string) => {
      refunds.push(id);
    },
    now: () => new Date(),
    reactivate: async (_db: Firestore, subId: string) => {
      reactivated.push(subId);
      return true;
    },
  };
}

async function rejectsWith(p: Promise<unknown>, code: string, message?: string): Promise<void> {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof HttpsError, `esperava HttpsError, veio ${String(e)}`);
    assert.equal(e.code, code);
    if (message != null) assert.equal(e.message, message);
    return true;
  });
}

describe("planos de horário online — decisão manual × asaas", () => {
  it("regra: desligada, 'Na arena', sem conta e abaixo do mínimo ficam manuais", () => {
    const sub = {paymentMethod: "pix_auto"};
    const c = {payerAthleteId: "u1", amountReais: 300};
    assert.equal(decideScheduleBillingMode({onlineBilling: true, sub, charge: c}), "asaas");
    assert.equal(decideScheduleBillingMode({onlineBilling: false, sub, charge: c}), "manual");
    assert.equal(decideScheduleBillingMode({onlineBilling: true, sub: {paymentMethod: "onsite"}, charge: c}), "manual");
    assert.equal(decideScheduleBillingMode({onlineBilling: true, sub, charge: {...c, payerAthleteId: null}}), "manual");
    assert.equal(decideScheduleBillingMode({onlineBilling: true, sub, charge: {...c, amountReais: 4.99}}), "manual");
  });

  it("ligada: cria o grupo pendente e o espelho; decidir de novo não cria outro", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const out = await decideScheduleChargeBilling(db, "c1");
    assert.equal(out.billingMode, "asaas");
    const g = group(fake, out.groupId!);
    assert.equal(g["state"], "pending");
    assert.equal(g["chargeId"], "c1");
    assert.equal(g["subscriptionId"], "s1");
    assert.equal(g["payerAthleteId"], "u1");
    assert.equal(g["customerAthleteId"], null);
    assert.equal(g["amountReais"], 300);
    assert.equal(g["dueDate"], "2026-12-05");
    assert.match(String(g["description"]), /Fixo 1x/);
    assert.equal(charge(fake)["billingMode"], "asaas");
    assert.deepEqual(mirror(fake), {groupId: out.groupId, state: "pending", invoiceUrl: null, status: null});

    const again = await decideScheduleChargeBilling(db, "c1");
    assert.equal(again.groupId, out.groupId);
    assert.equal(docsIn(fake, `${GROUPS}/`).length, 1);
  });

  it("regra desligada, 'Na arena' ou arena sem chave PIX: manual, sem grupo", async () => {
    for (const opts of [{rule: false}, {sub: {paymentMethod: "onsite"}}, {arena: {payoutPixKey: ""}}]) {
      const {fake, db} = makeDb();
      seedOnline(fake, opts);
      assert.deepEqual(await decideScheduleChargeBilling(db, "c1"), {billingMode: "manual", groupId: null, autopay: false});
      assert.equal(charge(fake)["billingMode"], "manual");
      assert.equal(docsIn(fake, `${GROUPS}/`).length, 0);
    }
  });

  it("mensalidade nasce 'a decidir'; antiga (sem o campo) não é tocada pelo gatilho", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {firstCharge} = await createSubscriptionCore(db, {
      arenaId: ARENA, planId: "p1", holder: holder("u1"), memberAthleteIds: [], weekdays: [weekdayIn(2)],
      startTime: "19:00", preferredCourtId: null, strictCourt: false, cycle: "monthly", paymentMethod: "pix_auto",
      startDate: today(), source: "athlete", createdByUid: "u1", audience: "athlete",
    }, today(), Date.now());
    assert.equal(charge(fake, firstCharge.chargeId)["billingMode"], null);

    assert.equal(scheduleChargeTriggerAction(undefined, {status: "open", billingMode: null}), "decide");
    assert.equal(scheduleChargeTriggerAction(undefined, {status: "open"}), null);
    // As escritas do próprio gatilho não disparam de novo.
    const decided = {status: "open", billingMode: "asaas", asaas: {groupId: "g1", state: "pending"}};
    assert.equal(scheduleChargeTriggerAction({status: "open", billingMode: null}, decided), null);
    assert.equal(scheduleChargeTriggerAction(decided, {...decided, asaas: {groupId: "g1", state: "open"}}), null);
    const voided = {...decided, status: "paid", asaas: {groupId: "g1", state: "voiding"}};
    assert.equal(scheduleChargeTriggerAction(decided, {...decided, status: "paid"}), "void");
    assert.equal(scheduleChargeTriggerAction({...decided, status: "paid"}, voided), null);
    assert.equal(scheduleChargeTriggerAction(decided, {...decided, status: "paid", paidVia: "asaas"}), null);
  });
});

describe("planos de horário online — worker", () => {
  it("cria uma vez só, espelha o link e avisa o pagador", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await decideScheduleChargeBilling(db, "c1");
    const {deps, calls} = fakeDeps();
    assert.equal((await ensureScheduleAsaasPayment(db, groupId!, deps)).state, "open");
    assert.equal((await ensureScheduleAsaasPayment(db, groupId!, deps)).state, "open");
    assert.equal(calls.created.length, 1);
    assert.equal(group(fake, groupId!)["paymentId"], `pay_${groupId}`);
    assert.equal(mirror(fake)["state"], "open");
    assert.equal(mirror(fake)["invoiceUrl"], `https://asaas.test/i/${groupId}`);
    assert.equal(calls.pushes.length, 1);
    assert.equal(calls.pushes[0]!.type, "schedule_plan_charge_link");
    assert.deepEqual(calls.pushes[0]!.data, {
      chargeId: "c1", subscriptionId: "s1", arenaId: ARENA, invoiceUrl: `https://asaas.test/i/${groupId}`,
      webUrl: `https://asaas.test/i/${groupId}`, url: "/meus-planos-horario",
    });
    assert.equal(onlineInvoiceUrlOf(charge(fake)), `https://asaas.test/i/${groupId}`);
  });

  it("sem CPF fica needs_cpf; sair de 'em aberto' anula direto (nada no Asaas)", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await decideScheduleChargeBilling(db, "c1");
    const {deps, calls} = fakeDeps({}, {});
    assert.equal((await ensureScheduleAsaasPayment(db, groupId!, deps)).state, "needs_cpf");
    assert.equal(mirror(fake)["state"], "needs_cpf");
    assert.equal(onlineInvoiceUrlOf(charge(fake)), "");
    await cancelScheduleChargeCore(db, MANAGER, "c1", today());
    assert.equal(await requestScheduleAsaasVoid(db, "c1"), "void");
    assert.equal(group(fake, groupId!)["state"], "void");
    assert.deepEqual(calls.deleted, []);
  });

  it("baixa manual anula o link: apaga no Asaas e o espelho vira void", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId, deps, calls} = await openGroup(fake, db);
    await registerSchedulePaymentCore(db, MANAGER, "c1", "cash", null, today());
    assert.equal(await requestScheduleAsaasVoid(db, "c1"), "voiding");
    assert.equal(group(fake, groupId)["voidReason"], "manual_payment");
    assert.deepEqual(await voidScheduleAsaasPayment(db, groupId, deps), {state: "void"});
    assert.deepEqual(calls.deleted, [`pay_${groupId}`]);
    assert.equal(mirror(fake)["state"], "void");
    assert.equal(charge(fake)["status"], "paid");
    assert.equal(charge(fake)["paymentMethod"], "cash");
  });

  it("cancelar a mensalidade anula o grupo vivo", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId, deps, calls} = await openGroup(fake, db);
    await cancelScheduleChargeCore(db, MANAGER, "c1", today());
    assert.equal(await requestScheduleAsaasVoid(db, "c1"), "voiding");
    await voidScheduleAsaasPayment(db, groupId, deps);
    assert.deepEqual(calls.deleted, [`pay_${groupId}`]);
    assert.equal(group(fake, groupId)["state"], "void");
  });

  it("pausa cancela a mensalidade do mês pausado e anula o link dela", async () => {
    const {fake, db} = makeDb();
    const month = monthKeyOf(addDaysToDateKey(today(), 40));
    seedOnline(fake, {
      sub: {planSnapshot: {overdueReleaseDays: 3, rules: {...DEFAULT_PLAN_RULES, pause: {enabled: true, maxDaysPerYear: 90}}}},
      charge: {period: month, dueDate: `${month}-05`},
    });
    const {groupId, deps, calls} = await openGroup(fake, db);
    await pauseSubscriptionCore(db, "u1", "s1", addDaysToDateKey(today(), 75), today());
    assert.equal(charge(fake)["status"], "canceled");
    assert.equal(charge(fake)["cancelReason"], "paused");
    assert.equal(await requestScheduleAsaasVoid(db, "c1"), "voiding");
    assert.equal(group(fake, groupId)["voidReason"], "paused");
    await voidScheduleAsaasPayment(db, groupId, deps);
    assert.deepEqual(calls.deleted, [`pay_${groupId}`]);
  });

  it("anulado enquanto a cobrança nascia: apaga o que nasceu", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await decideScheduleChargeBilling(db, "c1");
    const {deps, calls} = fakeDeps({
      createPayment: async (input) => {
        // Gestor deu baixa no meio da criação: o gatilho da mensalidade pede a anulação e o void roda.
        await registerSchedulePaymentCore(db, MANAGER, "c1", "pix", null, today());
        await requestScheduleAsaasVoid(db, "c1");
        await voidScheduleAsaasPayment(db, input.groupId, fakeDeps().deps);
        return {paymentId: "pay_late", invoiceUrl: "https://asaas.test/late", status: "PENDING"};
      },
    });
    assert.deepEqual(await ensureScheduleAsaasPayment(db, groupId!, deps), {state: "void"});
    assert.deepEqual(calls.deleted, ["pay_late"]);
    assert.equal(calls.pushes.length, 0);
  });
});

describe("planos de horário online — Pagar (callable)", () => {
  it("sem CPF guardado nem digitado: pede o CPF com a mensagem exata", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await decideScheduleChargeBilling(db, "c1");
    const {deps} = fakeDeps({}, {});
    await ensureScheduleAsaasPayment(db, groupId!, deps);
    await rejectsWith(getScheduleChargePaymentLinkCore(db, "u1", "c1", undefined, deps), "failed-precondition", CPF_REQUIRED_MESSAGE);
  });

  it("com CPF: grava o cliente, cria grupo novo cobrado de quem pediu e devolve o link", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId: oldId} = await decideScheduleChargeBilling(db, "c1");
    const {deps, calls} = fakeDeps({}, {});
    await ensureScheduleAsaasPayment(db, oldId!, deps);

    const out = await getScheduleChargePaymentLinkCore(db, "u1", "c1", "529.982.247-25", deps);
    assert.deepEqual(calls.registered, [["u1", CPF]]);
    const newId = String(mirror(fake)["groupId"]);
    assert.notEqual(newId, oldId);
    assert.equal(out.invoiceUrl, `https://asaas.test/i/${newId}`);
    assert.equal(group(fake, oldId!)["state"], "void");
    assert.equal(group(fake, newId)["customerAthleteId"], "u1");
    assert.equal(group(fake, newId)["state"], "open");
    // Quem está pagando não recebe push "mensalidade disponível".
    assert.equal(calls.pushes.length, 0);
  });

  it("link pronto devolve sem criar nada; CPF inválido é recusado", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId, deps, calls} = await openGroup(fake, db);
    assert.deepEqual(await getScheduleChargePaymentLinkCore(db, "u1", "c1", undefined, deps),
      {invoiceUrl: `https://asaas.test/i/${groupId}`});
    assert.equal(calls.created.length, 1);
    await rejectsWith(getScheduleChargePaymentLinkCore(db, "u1", "c1", "123", deps), "invalid-argument");
  });

  it("quem não vê a mensalidade é recusado; mensalidade manual é paga na arena", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake, {rule: false});
    const {deps} = fakeDeps();
    await rejectsWith(getScheduleChargePaymentLinkCore(db, "u9", "c1", CPF, deps), "permission-denied");
    // Ainda a decidir: o callable decide (regra desligada → manual) e recusa.
    await rejectsWith(getScheduleChargePaymentLinkCore(db, "u1", "c1", CPF, deps), "failed-precondition", ONSITE_ONLY_MESSAGE);
    assert.equal(charge(fake)["billingMode"], "manual");
  });

  it("grupo ainda sendo criado por outro: espera curta e responde 'ainda gerando'", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await decideScheduleChargeBilling(db, "c1");
    fake.seedDoc(`${GROUPS}/${groupId}`, {...group(fake, groupId!), state: "creating"});
    let sleeps = 0;
    const {deps} = fakeDeps({sleep: async () => {
      sleeps += 1;
    }});
    await rejectsWith(getScheduleChargePaymentLinkCore(db, "u1", "c1", undefined, deps, {waitMs: 0}), "unavailable",
      "O link ainda está sendo gerado. Tente de novo em instantes.");
    assert.equal(sleeps, 0);
  });
});

describe("planos de horário online — webhook e caixa", () => {
  it("PIX recebido: mensalidade paga online, caixa creditado (Pro 6%) e suspensa reativada", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake, {sub: {status: "suspended"}});
    const {groupId} = await openGroup(fake, db);
    const ref = processedRef(db, `pay_${groupId}`);
    const reactivated: string[] = [];
    await processArenaScheduleAsaasNotification(db, `pay_${groupId}`, payment(groupId), ref, webhookDeps([], reactivated));
    await processArenaScheduleAsaasNotification(db, `pay_${groupId}`, payment(groupId), ref, webhookDeps([], reactivated));

    const c = charge(fake);
    assert.equal(c["status"], "paid");
    assert.equal(c["paidVia"], "asaas");
    assert.equal(c["onlineBillingType"], "PIX");
    assert.equal(c["asaasPaymentId"], `pay_${groupId}`);
    assert.equal(c["platformFeeReais"], 18);
    assert.equal(c["paymentMethod"], null);
    assert.equal(c["paidOn"], today());
    assert.equal((c["asaas"] as Data)["state"], "paid");
    assert.equal(group(fake, groupId)["state"], "paid");
    assert.equal(fake.store.get(`arenaWallets/${ARENA}`)!["availableReais"], 282);
    const ledger = docsIn(fake, `arenaWallets/${ARENA}/ledger/`);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]![1]["source"], "schedule_plan");
    assert.equal(ledger[0]![1]["subscriptionId"], "s1");
    assert.equal(ledger[0]![1]["scheduleChargeId"], "c1");
    assert.deepEqual(reactivated, ["s1"]);
    // Pago online não é anulado pelo gatilho.
    assert.equal(await requestScheduleAsaasVoid(db, "c1"), null);
  });

  it("reativação real: suspensa sem outra atrasada volta a ativa", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake, {sub: {status: "suspended"}, charge: {dueDate: addDaysToDateKey(today(), -10)}});
    const {groupId} = await openGroup(fake, db);
    assert.equal(fake.store.get("arenaScheduleSubscriptions/s1")!["status"], "suspended");
    await processArenaScheduleAsaasNotification(db, `pay_${groupId}`, payment(groupId), processedRef(db, `pay_${groupId}`),
      {...webhookDeps(), reactivate: (d, subId, todayKey) => reactivateIfClearCore(d, subId, todayKey)});
    assert.equal(fake.store.get("arenaScheduleSubscriptions/s1")!["status"], "active");
  });

  it("cartão: autorizado paga e segura no 'a liberar'; liquidado credita", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await openGroup(fake, db);
    const ref = processedRef(db, `pay_${groupId}`);
    const card = {billingType: "CREDIT_CARD", netValue: 290};
    await processArenaScheduleAsaasNotification(db, `pay_${groupId}`, payment(groupId, {...card, status: "CONFIRMED"}), ref, webhookDeps());
    assert.equal(charge(fake)["status"], "paid");
    assert.equal(charge(fake)["onlineBillingType"], "CREDIT_CARD");
    let wallet = fake.store.get(`arenaWallets/${ARENA}`)!;
    // 300 − 18 (taxa) − 10 (cartão) = 272 a liberar.
    assert.equal(wallet["awaitingSettlementReais"], 272);
    assert.ok(!wallet["availableReais"]);
    await processArenaScheduleAsaasNotification(db, `pay_${groupId}`, payment(groupId, {...card, status: "RECEIVED"}), ref, webhookDeps());
    wallet = fake.store.get(`arenaWallets/${ARENA}`)!;
    assert.equal(wallet["availableReais"], 272);
    assert.equal(wallet["awaitingSettlementReais"], 0);
  });

  it("pago com o grupo anulado (baixa manual antes): estorna e não mexe na mensalidade nem no caixa", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId, deps} = await openGroup(fake, db);
    await registerSchedulePaymentCore(db, MANAGER, "c1", "cash", null, today());
    await requestScheduleAsaasVoid(db, "c1");
    // O DELETE falhou porque o atleta já pagou: a consulta confirma e o grupo fecha como void.
    assert.deepEqual(await voidScheduleAsaasPayment(db, groupId, {...deps, deletePayment: async () => {
      throw new Error("já pago");
    }, getPayment: async (id) => ({id, status: "RECEIVED"})}), {state: "void"});
    const refunds: string[] = [];
    await processArenaScheduleAsaasNotification(db, `pay_${groupId}`, payment(groupId), processedRef(db, `pay_${groupId}`), webhookDeps(refunds));
    assert.deepEqual(refunds, [`pay_${groupId}`]);
    assert.equal(charge(fake)["paymentMethod"], "cash");
    assert.equal(charge(fake)["paidVia"], undefined);
    assert.equal(fake.store.has(`arenaWallets/${ARENA}`), false);
  });

  it("referência: só aceita o prefixo do plano com id simples", () => {
    assert.equal(parseSchedulePaymentRef("arenaSchedulePayment:g1"), "g1");
    assert.equal(parseSchedulePaymentRef("arenaClassPayment:g1"), null);
    assert.equal(parseSchedulePaymentRef("arenaSchedulePayment:a/b"), null);
  });

  it("referência da cobrança com token: grupo antes do 2º ':' e a tentativa depois do 't'", () => {
    assert.equal(parseScheduleTokenAttempt("arenaSchedulePayment:g1:tabc"), "abc");
    assert.equal(parseSchedulePaymentRef("arenaSchedulePayment:g1:tabc"), "g1");
    assert.equal(parseScheduleTokenAttempt("arenaSchedulePayment:g1"), null);
    assert.equal(parseScheduleTokenAttempt("arenaSchedulePayment:g1:abc"), null);
    assert.equal(parseScheduleTokenAttempt("arenaClassPayment:g1:tabc"), null);
  });

  it("token: webhook antes da resposta do POST credita o caixa sem a taxa do cartão", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake, {charge: {
      billingMode: "asaas", asaas: {groupId: "g1", state: "autopay", invoiceUrl: null, status: null},
      autopay: {state: "charging", attempts: 1},
    }});
    fake.seedDoc(`${GROUPS}/g1`, {
      chargeId: "c1", arenaId: ARENA, subscriptionId: "s1", state: "autopay", amountReais: 300, paymentId: null,
      tokenCharges: {abc: {paymentId: null, source: "autopay", status: "charging", feeCents: 1246, processingCents: 1246,
        chargedReais: 312.46}},
    });
    const p = {
      id: "pay_t", status: "CONFIRMED", billingType: "CREDIT_CARD", value: 312.46, netValue: 300,
      externalReference: "arenaSchedulePayment:g1:tabc",
    };
    await processArenaScheduleAsaasNotification(db, "pay_t", p, processedRef(db, "pay_t"), webhookDeps());
    assert.equal(charge(fake)["status"], "paid");
    assert.equal(charge(fake)["asaasPaymentId"], "pay_t");
    assert.equal(charge(fake)["platformFeeReais"], 18);
    assert.equal(fake.store.get(`arenaWallets/${ARENA}`)!["awaitingSettlementReais"], 282);
  });

  it("token: deleted/OVERDUE/negativo de uma cobrança :t… não anula nem carimba o grupo do link", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake, {charge: {
      billingMode: "asaas", asaas: {groupId: "g1", state: "open", invoiceUrl: "https://asaas.test/i/g1", status: "PENDING"},
      autopay: {state: "retry", attempts: 1},
    }});
    fake.seedDoc(`${GROUPS}/g1`, {
      chargeId: "c1", arenaId: ARENA, subscriptionId: "s1", state: "open", amountReais: 300, paymentId: "pay_g1",
      invoiceUrl: "https://asaas.test/i/g1", asaasStatus: "PENDING",
      tokenCharges: {abc: {paymentId: "pay_t", source: "autopay", status: "refused", chargedReais: 312.46}},
    });
    const base = {id: "pay_t", billingType: "CREDIT_CARD", value: 312.46, externalReference: "arenaSchedulePayment:g1:tabc"};
    for (const [i, p] of [
      {...base, status: "PENDING", deleted: true},
      {...base, status: "OVERDUE"},
      {...base, status: "REFUNDED"},
    ].entries()) {
      await processArenaScheduleAsaasNotification(db, "pay_t", p, processedRef(db, `pay_t${i}`), webhookDeps());
    }
    const g = group(fake, "g1");
    assert.equal(g["state"], "open");
    assert.equal(g["asaasStatus"], "PENDING");
    assert.equal(g["voidReason"], undefined);
    assert.equal(((g["tokenCharges"] as Data)["abc"] as Data)["asaasStatus"], "REFUNDED");
    assert.equal(((g["tokenCharges"] as Data)["abc"] as Data)["status"], "refused");
    assert.equal(mirror(fake)["state"], "open");
    assert.equal(mirror(fake)["status"], "PENDING");
    assert.equal(charge(fake)["status"], "open");
  });
});

describe("planos de horário online — varredura", () => {
  it("decide esquecidas, retenta falhas e reconcilia o pago com webhook perdido", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake, {charge: {dueDate: today()}});
    let fail = true;
    const {deps} = fakeDeps({createPayment: async (input) => {
      if (fail) throw new Error("timeout");
      return {paymentId: `pay_${input.groupId}`, invoiceUrl: `https://asaas.test/i/${input.groupId}`, status: "PENDING"};
    }});

    const first = await reconcileScheduleAsaasPayments(db, new Date(), deps);
    assert.equal(first.decided, 1);
    const groupId = String(mirror(fake)["groupId"]);
    assert.equal(group(fake, groupId)["state"], "failed");
    assert.equal(mirror(fake)["state"], "failed");

    fail = false;
    const second = await reconcileScheduleAsaasPayments(db, new Date(), deps);
    assert.equal(second.created, 1);
    assert.equal(group(fake, groupId)["state"], "open");

    // O webhook do pagamento se perdeu: a varredura consulta e processa.
    fake.seedDoc(`${GROUPS}/${groupId}`, {...group(fake, groupId), lastCheckedAt: null});
    const paid = {...deps, getPayment: async (id: string) => payment(groupId, {id})};
    const third = await reconcileScheduleAsaasPayments(db, new Date(), paid);
    assert.equal(third.reconciled, 1);
    assert.equal(charge(fake)["status"], "paid");
    assert.equal(charge(fake)["paidVia"], "asaas");
  });
});

describe("planos de horário online — regras e disponibilidade", () => {
  it("ligar exige pagamento online e chave PIX; salvar sem o campo mantém o gravado", async () => {
    const noPix = makeDb();
    seedOnline(noPix.fake, {rule: false, arena: {payoutPixKey: ""}});
    await rejectsWith(saveScheduleRulesCore(noPix.db, MANAGER, {arenaId: ARENA, onlineBillingEnabled: true}), "failed-precondition",
      "Cadastre a chave PIX de repasse da arena para receber os planos de horário online.");
    const noOnline = makeDb();
    seedOnline(noOnline.fake, {rule: false, arena: {onlinePaymentEnabled: false}});
    await rejectsWith(saveScheduleRulesCore(noOnline.db, MANAGER, {arenaId: ARENA, onlineBillingEnabled: true}), "failed-precondition",
      "Ative o pagamento online da arena antes de cobrar os planos de horário online.");

    const {fake, db} = makeDb();
    seedOnline(fake, {rule: false});
    assert.equal((await saveScheduleRulesCore(db, MANAGER, {arenaId: ARENA, onlineBillingEnabled: true})).onlineBillingEnabled, true);
    const kept = await saveScheduleRulesCore(db, MANAGER, {arenaId: ARENA, primeCapPercent: 60});
    assert.equal(kept.onlineBillingEnabled, true);
    assert.equal(fake.store.get(`arenas/${ARENA}/scheduleSettings/rules`)!["onlineBillingEnabled"], true);
    await rejectsWith(saveScheduleRulesCore(db, MANAGER, {arenaId: ARENA, onlineBillingEnabled: "sim"}), "invalid-argument");
  });

  it("disponibilidade diz se a cobrança é online", async () => {
    const on = makeDb();
    seedOnline(on.fake);
    on.fake.seedDoc(`arenas/${ARENA}/schedulePlans/p1`, planData());
    const outOn = await getPlanAvailabilityCore(on.db, "u1", ARENA, "p1", today(), Date.now());
    assert.equal(outOn.onlineBilling, true);
    const off = makeDb();
    seedOnline(off.fake, {rule: false});
    const outOff = await getPlanAvailabilityCore(off.db, "u1", ARENA, "p1", today(), Date.now());
    assert.equal(outOff.onlineBilling, false);
  });
});

describe("planos de horário online — ligada por padrão", () => {
  it("regra nunca salva: arena apta cobra online; sem chave PIX, não; `false` do gestor desliga", async () => {
    const apt = makeDb();
    seedOnline(apt.fake);
    apt.fake.store.delete(`arenas/${ARENA}/scheduleSettings/rules`);
    apt.fake.seedDoc(`arenas/${ARENA}/schedulePlans/p1`, planData());
    assert.equal((await getPlanAvailabilityCore(apt.db, "u1", ARENA, "p1", today(), Date.now())).onlineBilling, true);
    assert.equal((await decideScheduleChargeBilling(apt.db, "c1")).billingMode, "asaas");

    const noPix = makeDb();
    seedOnline(noPix.fake, {arena: {payoutPixKey: ""}});
    noPix.fake.store.delete(`arenas/${ARENA}/scheduleSettings/rules`);
    noPix.fake.seedDoc(`arenas/${ARENA}/schedulePlans/p1`, planData());
    assert.equal((await getPlanAvailabilityCore(noPix.db, "u1", ARENA, "p1", today(), Date.now())).onlineBilling, false);
    // Salvar outra regra numa arena sem chave PIX não esbarra na exigência de ligar.
    assert.equal((await saveScheduleRulesCore(noPix.db, MANAGER, {arenaId: ARENA, primeCapPercent: 60})).primeCapPercent, 60);

    const off = makeDb();
    seedOnline(off.fake, {rule: false});
    assert.equal((await decideScheduleChargeBilling(off.db, "c1")).billingMode, "manual");
  });
});

describe("planos de horário online — regressões da revisão", () => {
  it("1. webhook e varredura no mesmo pagamento: a 2ª execução não estorna nem credita de novo", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await openGroup(fake, db);
    const ref = processedRef(db, `pay_${groupId}`);
    // A 2ª execução leu o doc de processados (fora da transação) antes de a 1ª gravar.
    const staleRef = {...ref, get: async () => ({exists: false, id: ref.id, data: () => undefined})} as unknown as typeof ref;
    const refunds: string[] = [];
    await processArenaScheduleAsaasNotification(db, `pay_${groupId}`, payment(groupId), ref, webhookDeps(refunds));
    await processArenaScheduleAsaasNotification(db, `pay_${groupId}`, payment(groupId), staleRef, webhookDeps(refunds));
    assert.deepEqual(refunds, []);
    assert.equal(fake.store.get(ref.path)!["outcome"], "approved");
    assert.equal(charge(fake)["status"], "paid");
    assert.equal(fake.store.get(`arenaWallets/${ARENA}`)!["availableReais"], 282);
    assert.equal(docsIn(fake, `arenaWallets/${ARENA}/ledger/`).length, 1);
  });

  it("3b. pago um grupo que a mensalidade não aponta mais: estorna e a mensalidade segue aberta", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await openGroup(fake, db);
    fake.seedDoc(`${CHARGES}/c1`, {...charge(fake), asaas: {groupId: "outro", state: "pending", invoiceUrl: null, status: null}});
    const refunds: string[] = [];
    await processArenaScheduleAsaasNotification(db, `pay_${groupId}`, payment(groupId), processedRef(db, `pay_${groupId}`), webhookDeps(refunds));
    assert.deepEqual(refunds, [`pay_${groupId}`]);
    assert.equal(charge(fake)["status"], "open");
    assert.equal(fake.store.has(`arenaWallets/${ARENA}`), false);
  });

  it("2. Asaas falha depois da anulação: o grupo segue void e a varredura não recria nem avisa", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await decideScheduleChargeBilling(db, "c1");
    const {deps, calls} = fakeDeps({
      createPayment: async (input) => {
        calls.created.push(input.groupId);
        await registerSchedulePaymentCore(db, MANAGER, "c1", "pix", null, today());
        await requestScheduleAsaasVoid(db, "c1");
        await voidScheduleAsaasPayment(db, input.groupId, fakeDeps().deps);
        throw new Error("timeout");
      },
    });
    assert.deepEqual(await ensureScheduleAsaasPayment(db, groupId!, deps), {state: "void"});
    assert.equal(group(fake, groupId!)["state"], "void");
    await reconcileScheduleAsaasPayments(db, new Date(), deps);
    assert.equal(calls.created.length, 1);
    assert.equal(calls.pushes.length, 0);
    assert.equal(group(fake, groupId!)["state"], "void");
  });

  it("2. reivindicar grupo de mensalidade já resolvida (gatilho perdido) anula sem chamar o Asaas", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await decideScheduleChargeBilling(db, "c1");
    fake.seedDoc(`${CHARGES}/c1`, {...charge(fake), status: "canceled", cancelReason: "subscription_ended"});
    const {deps, calls} = fakeDeps();
    assert.deepEqual(await ensureScheduleAsaasPayment(db, groupId!, deps), {state: "void"});
    assert.equal(group(fake, groupId!)["voidReason"], "subscription_ended");
    assert.deepEqual(calls.created, []);
  });

  it("3a. varredura anula grupos de mensalidades resolvidas sem o gatilho", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId, deps, calls} = await openGroup(fake, db);
    // Baixa manual cujo gatilho se perdeu.
    fake.seedDoc(`${CHARGES}/c1`, {...charge(fake), status: "paid", paymentMethod: "cash"});
    fake.seedDoc(`${GROUPS}/gcpf`, {chargeId: "c1", state: "needs_cpf", updatedAt: null});
    const out = await reconcileScheduleAsaasPayments(db, new Date(), deps);
    assert.equal(out.staleVoided, 2);
    assert.equal(group(fake, "gcpf")["state"], "void");
    assert.equal(group(fake, groupId)["voidReason"], "manual_payment");
    // O voiding sai na mesma varredura (sem `updatedAt` recente).
    assert.equal(group(fake, groupId)["state"], "void");
    assert.deepEqual(calls.deleted, [`pay_${groupId}`]);
  });

  it("3c. pausa e volta no mesmo dia com o gatilho atrasado: a volta anula o grupo da mensalidade regravada", async () => {
    const {fake, db} = makeDb();
    seedArena(fake, {plan: planData({timesPerWeek: 7})});
    fake.seedDoc(`arenas/${ARENA}/scheduleSettings/rules`, {onlineBillingEnabled: true});
    const todayKey = today();
    const midnight = Date.parse(`${todayKey}T03:00:00Z`); // 00:00 em Brasília
    const {subscriptionId} = await createSubscriptionCore(db, {
      arenaId: ARENA, planId: "p1", holder: holder("u1"), memberAthleteIds: [], weekdays: [1, 2, 3, 4, 5, 6, 7],
      startTime: "20:00", preferredCourtId: null, strictCourt: false, cycle: "monthly", paymentMethod: "pix_auto",
      startDate: todayKey, source: "athlete", createdByUid: "u1", audience: "athlete",
    }, todayKey, midnight);
    const month = monthKeyOf(todayKey);
    const chargeId = `${subscriptionId}_${month}_0`;
    const prevMonth = monthKeyOf(addDaysToDateKey(`${month}-01`, -1));
    fake.seedDoc(`arenaScheduleSubscriptions/${subscriptionId}`, {
      ...fake.store.get(`arenaScheduleSubscriptions/${subscriptionId}`)!,
      status: "paused", pausedUntil: addDaysToDateKey(todayKey, 5), billedThrough: prevMonth,
    });
    // A pausa cancelou a mensalidade, mas o gatilho que anularia o link ainda não rodou.
    fake.seedDoc(`${CHARGES}/${chargeId}`, {
      ...fake.store.get(`${CHARGES}/${chargeId}`)!, status: "canceled", cancelReason: "paused", billingMode: "asaas",
      asaas: {groupId: "gOld", state: "open", invoiceUrl: "https://asaas.test/i/gOld", status: "PENDING"},
    });
    fake.seedDoc(`${GROUPS}/gOld`, {chargeId, state: "open", paymentId: "pay_gOld"});

    await resumeSubscriptionCore(db, null, subscriptionId, todayKey, midnight);
    const rewritten = charge(fake, chargeId);
    assert.equal(rewritten["status"], "open");
    assert.equal(rewritten["billingMode"], null);
    assert.equal(rewritten["asaas"], undefined);
    assert.equal(group(fake, "gOld")["state"], "voiding");
    assert.equal(group(fake, "gOld")["voidReason"], "paused");
    // O gatilho atrasado da pausa vê a mensalidade já regravada e não faz nada.
    assert.equal(await requestScheduleAsaasVoid(db, chargeId), null);
  });

  it("4. DELETE com falha passageira mantém voiding e tenta de novo até o limite", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId, deps} = await openGroup(fake, db);
    await cancelScheduleChargeCore(db, MANAGER, "c1", today());
    await requestScheduleAsaasVoid(db, "c1");
    const flaky = {...deps, deletePayment: async () => {
      throw new Error("503");
    }};
    // Ainda cobrável no Asaas: segue voiding.
    assert.deepEqual(await voidScheduleAsaasPayment(db, groupId, {...flaky, getPayment: async (id) => ({id, status: "PENDING"})}),
      {state: "voiding"});
    // Nem a consulta respondeu: segue voiding.
    assert.deepEqual(await voidScheduleAsaasPayment(db, groupId, {...flaky, getPayment: async () => {
      throw new Error("timeout");
    }}), {state: "voiding"});
    assert.equal(group(fake, groupId)["voidAttempts"], 2);
    for (let i = 3; i < MAX_VOID_ATTEMPTS; i++) {
      assert.equal((await voidScheduleAsaasPayment(db, groupId, {...flaky, getPayment: async (id) => ({id, status: "OVERDUE"})})).state, "voiding");
    }
    // Na 10ª, fecha mesmo assim (com o erro guardado).
    assert.deepEqual(await voidScheduleAsaasPayment(db, groupId, {...flaky, getPayment: async (id) => ({id, status: "PENDING"})}),
      {state: "void"});
    assert.equal(group(fake, groupId)["voidError"], "503");
  });
});

describe("planos de horário online — tela de pagamento (Pix no app)", () => {
  it("Pix: QR da mesma cobrança do link, sem criar outra; cartão: só o link", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId, deps, calls} = await openGroup(fake, db);
    const pix = await getScheduleChargeCheckoutCore(db, "u1", "c1", undefined, "pix", deps);
    assert.equal(pix.invoiceUrl, `https://asaas.test/i/${groupId}`);
    assert.equal(pix.qrCode, `pix-pay_${groupId}`);
    assert.equal(pix.qrCodeBase64, "aW1n");
    assert.equal(pix.amountReais, Number(charge(fake)["amountReais"]));
    assert.deepEqual(calls.qr, [`pay_${groupId}`]);
    assert.equal(calls.created.length, 1, "não cria cobrança nova");

    const card = await getScheduleChargeCheckoutCore(db, "u1", "c1", undefined, "card", deps);
    assert.equal(card.invoiceUrl, `https://asaas.test/i/${groupId}`);
    assert.equal(card.qrCode, undefined);
    assert.equal(calls.qr.length, 1);
  });

  it("QR que falha vira mensagem amigável", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {deps} = await openGroup(fake, db);
    deps.fetchPixQrCode = async () => {
      throw new Error("ASAAS_PIX_QR_MISSING");
    };
    await rejectsWith(getScheduleChargeCheckoutCore(db, "u1", "c1", undefined, "pix", deps), "unavailable");
  });
});

describe("planos de horário online — cartão com as taxas por cima", () => {
  async function cardCheckout(fake: FakeFirestore, db: Firestore) {
    const {groupId, deps, calls} = await openGroup(fake, db);
    const cardCalls: Array<{valueReais: number; feeCents: number; customerId: string}> = [];
    deps.cardFeeTerms = async () => ({anticipationPercent: 1.33, processingPercent: 2.99, fixedReais: 0.49});
    deps.createCardPayment = async (input) => {
      cardCalls.push({valueReais: input.valueReais, feeCents: input.feeCents, customerId: input.customerId});
      return {paymentId: `card_${input.groupId}`, invoiceUrl: `https://asaas.test/c/${input.groupId}`};
    };
    const out = await getScheduleChargeCheckoutCore(db, "u1", "c1", undefined, "card", deps);
    return {groupId, deps, calls, cardCalls, out};
  }

  it("cartão: cobrança à parte com as taxas por cima; a fatura do Pix fica como está", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId, calls, cardCalls, out} = await cardCheckout(fake, db);

    // (300 + 3,99 de antecipação + 0,49) / 0,9701 = 313,86… → 313,87.
    assert.deepEqual(cardCalls, [{valueReais: 313.87, feeCents: 1387, customerId: "cus_u1"}]);
    assert.equal(out.invoiceUrl, `https://asaas.test/c/${groupId}`);
    assert.equal(out.amountReais, 300);
    assert.equal(out.chargedReais, 313.87);
    assert.equal(out.cardFeeReais, 13.87);
    assert.equal(out.cardFeePercent, 1.33);
    assert.equal(out.cardProcessingPercent, 2.99);
    assert.equal(out.cardFixedReais, 0.49);
    assert.deepEqual(group(fake, groupId)["cardCharges"], {[`card_${groupId}`]: {feeCents: 1387, processingCents: 988}});
    assert.equal(group(fake, groupId)["paymentId"], `pay_${groupId}`, "a fatura do Pix segue a do grupo");
    assert.equal(calls.created.length, 1);
  });

  it("sem taxa (dublê antigo ou Asaas em 0): o cartão vai pela fatura de sempre", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId, deps} = await openGroup(fake, db);
    deps.cardFeeTerms = async () => ({anticipationPercent: 0, processingPercent: 0, fixedReais: 0});
    deps.createCardPayment = async () => {
      throw new Error("não devia criar");
    };
    const out = await getScheduleChargeCheckoutCore(db, "u1", "c1", undefined, "card", deps);
    assert.equal(out.invoiceUrl, `https://asaas.test/i/${groupId}`);
    assert.equal(out.cardFeeReais, undefined);
  });

  it("webhook: a taxa sai do bruto, a antecipação é pedida e o caixa credita quando ela cai", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await cardCheckout(fake, db);
    const cardId = `card_${groupId}`;
    const ref = processedRef(db, cardId);
    const anticipations: string[] = [];
    const deps = {...webhookDeps(), requestAnticipation: async (id: string) => {
      anticipations.push(id);
      return {id: "ant1", status: "PENDING"};
    }};
    // R$ 313,87 no cartão; o Asaas fica com 0,49 + 2,99% = R$ 9,87 (o atleta cobriu R$ 9,88).
    const card = {id: cardId, billingType: "CREDIT_CARD", value: 313.87, netValue: 304};

    await processArenaScheduleAsaasNotification(db, cardId, payment(groupId, {...card, status: "CONFIRMED"}), ref, deps);
    assert.equal(charge(fake)["status"], "paid");
    assert.equal(charge(fake)["asaasPaymentId"], cardId);
    // A taxa da NexaGO é sobre o plano (300), não sobre o cobrado.
    assert.equal(charge(fake)["platformFeeReais"], 18);
    // 300 − 18 da NexaGO; o processamento foi pago pelo atleta.
    assert.equal(fake.store.get(`arenaWallets/${ARENA}`)!["awaitingSettlementReais"], 282);
    assert.deepEqual(anticipations, [cardId]);

    await processArenaScheduleAsaasNotification(
      db, cardId, payment(groupId, {...card, status: "CONFIRMED"}), ref, deps, {anticipationCredited: true},
    );
    let wallet = fake.store.get(`arenaWallets/${ARENA}`)!;
    assert.equal(wallet["availableReais"], 282);
    assert.equal(wallet["awaitingSettlementReais"], 0);
    const ledger = docsIn(fake, `arenaWallets/${ARENA}/ledger/`);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]![1]["cardFeeReais"], 13.87);
    assert.equal(ledger[0]![1]["gatewayFeeReais"], 0);

    // A liquidação não credita de novo; reentrega do CONFIRMED não pede de novo.
    await processArenaScheduleAsaasNotification(db, cardId, payment(groupId, {...card, status: "RECEIVED"}), ref, deps);
    await processArenaScheduleAsaasNotification(db, cardId, payment(groupId, {...card, status: "CONFIRMED"}), ref, deps);
    wallet = fake.store.get(`arenaWallets/${ARENA}`)!;
    assert.equal(wallet["availableReais"], 282);
    assert.equal(docsIn(fake, `arenaWallets/${ARENA}/ledger/`).length, 1);
    assert.deepEqual(anticipations, [cardId]);
  });

  it("pagou no cartão e depois a fatura do Pix também: a segunda é estornada", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake);
    const {groupId} = await cardCheckout(fake, db);
    const cardId = `card_${groupId}`;
    const refunds: string[] = [];
    await processArenaScheduleAsaasNotification(db, cardId,
      payment(groupId, {id: cardId, billingType: "CREDIT_CARD", value: 313.87, netValue: 304, status: "CONFIRMED"}),
      processedRef(db, cardId), webhookDeps(refunds));
    await processArenaScheduleAsaasNotification(db, `pay_${groupId}`, payment(groupId),
      processedRef(db, `pay_${groupId}`), webhookDeps(refunds));
    assert.deepEqual(refunds, [`pay_${groupId}`]);
    assert.equal(charge(fake)["asaasPaymentId"], cardId);
  });
});

describe("planos de horário online — débito automático", () => {
  function seedAuto(fake: FakeFirestore, o: {
    flag?: boolean; consent?: boolean; card?: Data | null; sub?: Data; charge?: Data;
  } = {}): void {
    seedOnline(fake, {
      sub: {autopay: {u1: {enabled: o.consent !== false}}, memberAthleteIds: ["u1", "u2"], ...o.sub},
      charge: o.charge,
    });
    if (o.flag !== false) fake.seedDoc("appConfig/payments", {scheduleCardAutopay: true});
    if (o.card !== null) {
      fake.seedDoc("users/u1/asaas/savedCard", {
        creditCardToken: "tok", brand: "VISA", last4: "4242", expiryMonth: 12, expiryYear: 2099,
        holderName: "Atleta u1", customerId: "cus_u1", env: getAsaasEnvTag(), remoteIp: "1.1.1.1", ...o.card,
      });
    }
  }

  it("decide with autopay schedules and creates no group", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    pushes.length = 0;
    const out = await decideScheduleChargeBilling(db, "c1");
    assert.deepEqual(out, {billingMode: "asaas", groupId: null, autopay: true});
    const c = charge(fake);
    assert.equal(c["billingMode"], "asaas");
    assert.deepEqual(c["autopay"], {
      state: "scheduled", scheduledFor: "2026-12-05", attempts: 0, lastAttemptAt: null, lastError: null, needsLink: false,
      brand: "VISA", last4: "4242", chargedReais: null,
    });
    assert.equal(c["asaas"], undefined);
    assert.equal(docsIn(fake, `${GROUPS}/`).length, 0);
    assert.equal(pushes.filter((p) => p.type === "schedule_plan_charge_link").length, 0);
  });

  it("decide without autopay keeps today's link", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake, {sub: {autopay: {}}});
    const out = await decideScheduleChargeBilling(db, "c1");
    assert.equal(out.autopay, false);
    assert.equal(group(fake, out.groupId!)["state"], "pending");
    assert.equal(charge(fake)["autopay"], undefined);
  });

  it("rateio: o débito de um não muda o link do outro", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    fake.seedDoc(`${CHARGES}/c2`, {
      ...charge(fake), payerIndex: 1, payerName: "Atleta u2", payerAthleteId: "u2", visibleTo: ["u2"],
    });
    await decideScheduleChargeBilling(db, "c1");
    const out2 = await decideScheduleChargeBilling(db, "c2");
    assert.equal(charge(fake, "c1")["autopay"] != null, true);
    assert.equal(group(fake, out2.groupId!)["state"], "pending");
    assert.equal(charge(fake, "c2")["autopay"], undefined);
  });

  it("expired card falls back to the link and warns", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake, {card: {expiryMonth: 11, expiryYear: 2026}});
    const sent: Array<{title: string; body: string; type: string}> = [];
    const original = scheduleNotifier.send;
    scheduleNotifier.send = async (input) => {
      sent.push({title: input.title, body: input.body, type: input.type});
      return {sent: 1, failed: 0};
    };
    try {
      const out = await decideScheduleChargeBilling(db, "c1");
      assert.equal(out.autopay, false);
      assert.equal(group(fake, out.groupId!)["state"], "pending");
    } finally {
      scheduleNotifier.send = original;
    }
    assert.deepEqual(sent, [{
      type: "schedule_plan_autopay_card_expired", title: "Seu cartão venceu",
      body: "O cartão final 4242 venceu. Pague o plano Fixo 1x por Pix ou cartão e salve um cartão novo.",
    }]);
  });

  it("flag off → link", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake, {flag: false});
    const out = await decideScheduleChargeBilling(db, "c1");
    assert.equal(group(fake, out.groupId!)["state"], "pending");
    assert.equal(charge(fake)["autopay"], undefined);
  });

  it("leaving open skips the debit", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    await decideScheduleChargeBilling(db, "c1");
    const before = {...charge(fake)};
    await registerSchedulePaymentCore(db, MANAGER, "c1", "cash", null, today());
    const after = charge(fake);
    assert.equal(autopayLeftOpen(before, after), true);
    assert.equal(autopayLeftOpen(before, before), false);
    assert.equal(await skipScheduleAutopay(db, "c1", "charge_resolved"), true);
    assert.equal((charge(fake)["autopay"] as Data)["state"], "skipped");
    assert.equal((charge(fake)["autopay"] as Data)["lastError"], "charge_resolved");
    assert.equal(await skipScheduleAutopay(db, "c1", "again"), false);
  });

  it("void of an autopay group is immediate", async () => {
    const {fake, db} = makeDb();
    seedOnline(fake, {charge: {status: "canceled", billingMode: "asaas", asaas: {groupId: "g1", state: "autopay"}}});
    fake.seedDoc(`${GROUPS}/g1`, {chargeId: "c1", state: "autopay"});
    assert.equal(await requestScheduleGroupVoid(db, "g1"), "void");
    assert.equal(group(fake, "g1")["state"], "void");
  });

  it("Pagar with an autopay group: link now, the scheduled debit stays (retry)", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake, {sub: {autopay: {}}});
    const {groupId} = await decideScheduleChargeBilling(db, "c1");
    fake.seedDoc(`${GROUPS}/${groupId}`, {...group(fake, groupId!), state: "autopay", customerAthleteId: "u1"});
    fake.seedDoc(`${CHARGES}/c1`, {
      ...charge(fake), asaas: {...mirror(fake), state: "autopay"},
      autopay: {state: "retry", scheduledFor: "2026-12-06", attempts: 1, lastError: "Saldo insuficiente.", needsLink: false},
    });
    const {deps, calls} = fakeDeps();
    const out = await getScheduleChargePaymentLinkCore(db, "u1", "c1", undefined, deps);
    assert.equal(out.invoiceUrl, `https://asaas.test/i/${groupId}`);
    assert.deepEqual(calls.created, [groupId]);
    assert.equal(group(fake, groupId!)["state"], "open");
    assert.equal(mirror(fake)["groupId"], groupId);
    assert.equal((charge(fake)["autopay"] as Data)["state"], "retry");
    assert.equal((charge(fake)["autopay"] as Data)["scheduledFor"], "2026-12-06");
    // Quem está pagando não recebe push "mensalidade disponível".
    assert.equal(calls.pushes.length, 0);
  });

  it("autopay group does not trigger the Asaas worker", async () => {
    const {deps, calls} = fakeDeps();
    void deps;
    if (getApps().length === 0) initializeApp({projectId: "demo-autopay"});
    const run = (onArenaScheduleAsaasPaymentWritten as unknown as {run: (e: unknown) => Promise<void>}).run;
    await run({
      params: {groupId: "g1"},
      data: {before: {data: () => ({state: "pending"})}, after: {data: () => ({state: "autopay"})}},
    });
    assert.deepEqual(calls.created, []);
  });

  describe("first charge paid by token counts for the 30-min window", () => {
    const NOW = Date.parse("2026-12-01T12:00:00Z");
    function seedPending(fake: FakeFirestore, tokenCharges: Data): void {
      seedOnline(fake, {
        sub: {status: "pending_payment", pendingPaymentUntil: new Date(NOW - 1000)},
        charge: {kind: "first", asaas: {groupId: "g1", state: "autopay"}, billingMode: "asaas"},
      });
      fake.seedDoc(`${GROUPS}/g1`, {chargeId: "c1", state: "autopay", paymentId: null, tokenCharges});
    }

    it("status paid", async () => {
      const {fake, db} = makeDb();
      seedPending(fake, {t1: {paymentId: "pay_t1", status: "paid"}});
      const {deps} = fakeDeps();
      assert.deepEqual(await expireSchedulePendingPayments(db, new Date(NOW), deps), {expired: 0, waitingWebhook: 1});
    });

    it("charging confirmed at Asaas", async () => {
      const {fake, db} = makeDb();
      seedPending(fake, {t1: {paymentId: "pay_t1", status: "charging"}});
      const {deps} = fakeDeps({getPayment: async (id) => ({id, status: "CONFIRMED"})});
      assert.deepEqual(await expireSchedulePendingPayments(db, new Date(NOW), deps), {expired: 0, waitingWebhook: 1});
    });
  });
});

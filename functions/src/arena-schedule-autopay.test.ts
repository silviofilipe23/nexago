import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import type {FakeFirestore} from "./fake-firestore.test-helper";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {DEFAULT_PLAN_RULES} from "./arena-schedule-plan-constants";
import {ensureScheduleChargeLinkGroup} from "./arena-schedule-asaas";
import {
  AUTOPAY_ARENA_OFFLINE_MESSAGE,
  AUTOPAY_CONSENT_MESSAGE,
  AUTOPAY_NOT_MEMBER_MESSAGE,
  AUTOPAY_NO_CARD_MESSAGE,
  AUTOPAY_SUB_ENDED_MESSAGE,
  AUTOPAY_UNAVAILABLE_MESSAGE,
  disableAllScheduleAutopayCore,
  getScheduleAutopayPreviewCore,
  removeMyPaymentCardCore,
  setScheduleAutopayCore,
} from "./arena-schedule-autopay";
import {
  AUTOPAY_BUSY_MESSAGE,
  CARD_REFUSED_MESSAGE,
  payScheduleChargeWithSavedCardCore,
} from "./arena-schedule-autopay-pay";
import {PAYMENT_WINDOW_CLOSED_MESSAGE} from "./arena-schedule-asaas";
import {
  chargeScheduleAutopayDue,
  defaultAutopayDeps,
  recoverScheduleAutopay,
  runScheduleTokenCharge,
  scheduleProcessedRef,
  type AutopayDeps,
} from "./arena-schedule-autopay-charge";
import {cardSurcharge} from "./card-anticipation-fee";
import {AsaasApiError} from "./asaas-client";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";
import {processArenaScheduleAsaasNotification} from "./asaas-arena-schedule-webhook";
import {dayKeyFromEventDate} from "./event-timezone";
import {ARENA, MANAGER, docsIn, makeDb, seedArena, today} from "./arena-schedule.test-helper";

type Data = Record<string, unknown>;
const CHARGES = "arenaScheduleCharges";
const GROUPS = "arenaScheduleAsaasPayments";
const SUBS = "arenaScheduleSubscriptions";
const CONSENT = "Autorizo o débito automático no cartão.";

function seed(fake: FakeFirestore, opts: {flag?: boolean; card?: boolean; arena?: Data; sub?: Data} = {}): void {
  seedArena(fake);
  fake.seedDoc(`arenas/${ARENA}`, {
    name: "Arena CFC", managerUserId: MANAGER, planTier: "pro", planStatus: "active",
    onlinePaymentEnabled: true, payoutPixKey: "pix@arena.com.br", ...opts.arena,
  });
  fake.seedDoc(`arenas/${ARENA}/scheduleSettings/rules`, {onlineBillingEnabled: true});
  if (opts.flag !== false) fake.seedDoc("appConfig/payments", {scheduleCardAutopay: true});
  if (opts.card !== false) {
    fake.seedDoc("users/u1/asaas/savedCard", {
      creditCardToken: "tok", brand: "VISA", last4: "4242", expiryMonth: 12, expiryYear: 2099,
      holderName: "Atleta u1", customerId: "cus_u1", env: "sandbox", remoteIp: "1.1.1.1",
    });
  }
  seedSub(fake, "s1", opts.sub);
}

function seedSub(fake: FakeFirestore, id: string, over: Data = {}): void {
  fake.seedDoc(`${SUBS}/${id}`, {
    arenaId: ARENA, arenaName: "Arena CFC", planName: "Fixo 1x", status: "active", paymentMethod: "pix_auto",
    holderAthleteId: "u1", holderName: "Atleta u1", memberAthleteIds: ["u1", "u2"], slots: [],
    planSnapshot: {overdueReleaseDays: 3, rules: DEFAULT_PLAN_RULES}, ...over,
  });
}

function seedCharge(fake: FakeFirestore, id: string, over: Data = {}): void {
  fake.seedDoc(`${CHARGES}/${id}`, {
    arenaId: ARENA, subscriptionId: "s1", planName: "Fixo 1x", holderName: "Atleta u1", period: "2026-12",
    kind: "monthly", payerIndex: 0, payerName: "Atleta u1", payerAthleteId: "u1", visibleTo: ["u1"],
    amountReais: 300, dueDate: addDaysToDateKey(today(), 10), status: "open", paymentMethod: null,
    billingMode: "asaas", remindersSent: [], ...over,
  });
}

const get = (fake: FakeFirestore, path: string) => fake.store.get(path)!;
const autopay = (fake: FakeFirestore, id: string) => (get(fake, `${CHARGES}/${id}`)["autopay"] ?? undefined) as Data | undefined;

async function rejectsWith(p: Promise<unknown>, code: string, message: string): Promise<void> {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof HttpsError, `esperava HttpsError, veio ${String(e)}`);
    assert.equal(e.code, code);
    assert.equal(e.message, message);
    return true;
  });
}

const enable = (db: Firestore, over: Data = {}) =>
  setScheduleAutopayCore(db, "u1", {subscriptionId: "s1", enabled: true, consentText: CONSENT, ...over}, "sandbox");

describe("setScheduleAutopayCore", () => {
  it("enable schedules open online charges of the payer", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    seedCharge(fake, "c1");
    seedCharge(fake, "c2", {payerAthleteId: "u2", visibleTo: ["u2"]});
    seedCharge(fake, "c3", {billingMode: "manual"});
    seedCharge(fake, "c4", {dueDate: addDaysToDateKey(today(), -1)});
    const out = await enable(db);
    assert.deepEqual(out, {enabled: true, brand: "VISA", last4: "4242"});
    const c1 = autopay(fake, "c1")!;
    assert.equal(c1["state"], "scheduled");
    assert.equal(c1["scheduledFor"], get(fake, `${CHARGES}/c1`)["dueDate"]);
    assert.equal(c1["attempts"], 0);
    for (const id of ["c2", "c3", "c4"]) assert.equal(autopay(fake, id), undefined, id);
    const sub = get(fake, `${SUBS}/s1`);
    const mine = (sub["autopay"] as Data)["u1"] as Data;
    assert.equal(mine["enabled"], true);
    assert.equal(mine["consentText"], CONSENT);
    assert.deepEqual(sub["autopayAthleteIds"], ["u1"]);
  });

  it("enable keeps an existing live link", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    seedCharge(fake, "c1", {asaas: {groupId: "g1", state: "open", invoiceUrl: "https://x", status: null}});
    fake.seedDoc(`${GROUPS}/g1`, {chargeId: "c1", state: "open"});
    await enable(db);
    assert.equal(autopay(fake, "c1")!["state"], "scheduled");
    assert.equal(get(fake, `${GROUPS}/g1`)["state"], "open");
  });

  it("does not schedule a charge whose due month is after the card expiry", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    fake.seedDoc("users/u1/asaas/savedCard", {
      creditCardToken: "tok", brand: "VISA", last4: "4242", expiryMonth: 1, expiryYear: 2020,
      holderName: "x", customerId: "c", env: "sandbox", remoteIp: "",
    });
    seedCharge(fake, "c1");
    await enable(db);
    assert.equal(autopay(fake, "c1"), undefined);
  });

  it("errors", async () => {
    {
      const {fake, db} = makeDb();
      seed(fake, {card: false});
      await rejectsWith(enable(db), "failed-precondition", AUTOPAY_NO_CARD_MESSAGE);
    }
    {
      const {fake, db} = makeDb();
      seed(fake, {flag: false});
      await rejectsWith(enable(db), "failed-precondition", AUTOPAY_UNAVAILABLE_MESSAGE);
    }
    {
      const {fake, db} = makeDb();
      seed(fake, {arena: {onlinePaymentEnabled: false}});
      await rejectsWith(enable(db), "failed-precondition", AUTOPAY_ARENA_OFFLINE_MESSAGE);
    }
    {
      const {fake, db} = makeDb();
      seed(fake);
      await rejectsWith(
        setScheduleAutopayCore(db, "u9", {subscriptionId: "s1", enabled: true, consentText: CONSENT}, "sandbox"),
        "permission-denied", AUTOPAY_NOT_MEMBER_MESSAGE);
    }
    {
      const {fake, db} = makeDb();
      seed(fake, {sub: {status: "canceled"}});
      await rejectsWith(enable(db), "failed-precondition", AUTOPAY_SUB_ENDED_MESSAGE);
    }
    {
      const {fake, db} = makeDb();
      seed(fake);
      await rejectsWith(enable(db, {consentText: "  "}), "invalid-argument", AUTOPAY_CONSENT_MESSAGE);
      await rejectsWith(enable(db, {consentText: "x".repeat(1001)}), "invalid-argument", AUTOPAY_CONSENT_MESSAGE);
    }
  });

  it("disable moves scheduled/retry to skipped and ensures the link", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    seedCharge(fake, "c1");
    await enable(db);
    seedCharge(fake, "c5", {autopay: {state: "retry"}});
    const out = await setScheduleAutopayCore(db, "u1", {subscriptionId: "s1", enabled: false}, "sandbox");
    assert.equal(out.enabled, false);
    assert.equal(autopay(fake, "c1")!["state"], "skipped");
    assert.equal(autopay(fake, "c5")!["state"], "skipped");
    const gid = ((get(fake, `${CHARGES}/c1`)["asaas"]) as Data)["groupId"] as string;
    assert.equal(get(fake, `${GROUPS}/${gid}`)["state"], "pending");
    assert.deepEqual(get(fake, `${SUBS}/s1`)["autopayAthleteIds"], []);
  });
});

describe("skip safety and disableAll", () => {
  it("disable leaves a charging charge and its autopay group alone", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    seedCharge(fake, "c1", {autopay: {state: "charging"}, asaas: {groupId: "g1", state: "autopay"}});
    fake.seedDoc(`${GROUPS}/g1`, {chargeId: "c1", state: "autopay"});
    await enable(db);
    await setScheduleAutopayCore(db, "u1", {subscriptionId: "s1", enabled: false}, "sandbox");
    assert.equal(autopay(fake, "c1")!["state"], "charging");
    assert.equal(get(fake, `${GROUPS}/g1`)["state"], "autopay");
  });

  it("disableAll skips scheduled charges, ensures the link and keeps other athletes", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    seedCharge(fake, "c1");
    await enable(db);
    fake.seedDoc(`${SUBS}/s1`, {autopayAthleteIds: ["u1", "u2"]});
    assert.equal(await disableAllScheduleAutopayCore(db, "u1"), 1);
    assert.equal(autopay(fake, "c1")!["state"], "skipped");
    const gid = ((get(fake, `${CHARGES}/c1`)["asaas"]) as Data)["groupId"] as string;
    assert.equal(get(fake, `${GROUPS}/${gid}`)["state"], "pending");
    assert.deepEqual(get(fake, `${SUBS}/s1`)["autopayAthleteIds"], ["u2"]);
  });
});

describe("ensureScheduleChargeLinkGroup", () => {
  it("turns an autopay group into pending in place", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    seedCharge(fake, "c1", {asaas: {groupId: "g1", state: "autopay", invoiceUrl: null, status: null}});
    fake.seedDoc(`${GROUPS}/g1`, {chargeId: "c1", state: "autopay"});
    assert.equal(await ensureScheduleChargeLinkGroup(db, "c1"), "g1");
    assert.equal(get(fake, `${GROUPS}/g1`)["state"], "pending");
    const m = get(fake, `${CHARGES}/c1`)["asaas"] as Data;
    assert.equal(m["groupId"], "g1");
    assert.equal(m["state"], "pending");
  });

  it("creates a new group when the mirror has none or a void one", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    seedCharge(fake, "c1", {asaas: {groupId: "g1", state: "void"}});
    fake.seedDoc(`${GROUPS}/g1`, {chargeId: "c1", state: "void"});
    const id = await ensureScheduleChargeLinkGroup(db, "c1");
    assert.ok(id && id !== "g1");
    assert.equal(get(fake, `${GROUPS}/${id}`)["state"], "pending");
    assert.equal(docsIn(fake, GROUPS).length, 2);
  });
});

describe("disableAllScheduleAutopayCore", () => {
  it("turns off every subscription of the athlete", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    seedSub(fake, "s2");
    await enable(db);
    await setScheduleAutopayCore(db, "u1", {subscriptionId: "s2", enabled: true, consentText: CONSENT}, "sandbox");
    assert.equal(await disableAllScheduleAutopayCore(db, "u1"), 2);
    assert.deepEqual(get(fake, `${SUBS}/s1`)["autopayAthleteIds"], []);
    assert.deepEqual(get(fake, `${SUBS}/s2`)["autopayAthleteIds"], []);
    assert.equal(await disableAllScheduleAutopayCore(db, "u1"), 0);
  });
});

describe("getScheduleAutopayPreviewCore", () => {
  const terms = {anticipationPercent: 1.5, processingPercent: 3.99, fixedReais: 0.49};

  it("previews the next open charge with the card fee", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    seedCharge(fake, "c1");
    seedCharge(fake, "c9", {dueDate: addDaysToDateKey(today(), 40)});
    const out = await getScheduleAutopayPreviewCore(db, "u1", {subscriptionId: "s1"}, "sandbox", terms);
    assert.equal(out.brand, "VISA");
    assert.equal(out.last4, "4242");
    assert.equal(out.cardFeePercent, 1.5);
    assert.equal(out.next!.chargeId, "c1");
    assert.equal(out.next!.amountReais, 300);
    assert.equal(out.next!.chargedReais, 300 + cardSurcharge(300, terms).totalCents / 100);
  });

  it("next is null without an open charge", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await getScheduleAutopayPreviewCore(db, "u1", {subscriptionId: "s1"}, "sandbox", terms);
    assert.equal(out.next, null);
  });
});

// ---------------------------------------------------------------------------
// Débito com token (parte 2)
// ---------------------------------------------------------------------------

describe("débito com token no vencimento", () => {
  const TERMS = {anticipationPercent: 0, processingPercent: 3.83, fixedReais: 0.49};
  const FEE_CENTS = cardSurcharge(300, TERMS).totalCents;
  const CHARGED = (30000 + FEE_CENTS) / 100;
  const TOKEN = "tok_SECRET_9f8e7d6c";
  const NOW = new Date();
  const TODAY = dayKeyFromEventDate(NOW);
  const TOMORROW = new Date(NOW.getTime() + 24 * 60 * 60_000);
  const MIN = 60_000;

  function seedAuto(fake: FakeFirestore, o: {flag?: boolean; arena?: Data; sub?: Data; charge?: Data; autopay?: Data} = {}) {
    seed(fake, {flag: o.flag, arena: o.arena, sub: {autopay: {u1: {enabled: true}}, ...o.sub}});
    fake.seedDoc("users/u1/asaas/savedCard", {
      ...get(fake, "users/u1/asaas/savedCard"), creditCardToken: TOKEN,
    });
    seedCharge(fake, "c1", {
      dueDate: TODAY,
      autopay: {
        state: "scheduled", scheduledFor: TODAY, attempts: 0, lastAttemptAt: null, lastError: null,
        brand: "VISA", last4: "4242", chargedReais: null, ...o.autopay,
      },
      ...o.charge,
    });
  }

  type Respond = (input: Parameters<AutopayDeps["createTokenCharge"]>[0], n: number) =>
    Promise<{paymentId: string; status: string}>;

  function autopayDeps(o: {respond?: Respond; over?: Partial<AutopayDeps>} = {}) {
    const clock = {now: NOW};
    const calls = {
      created: [] as Array<Parameters<AutopayDeps["createTokenCharge"]>[0]>,
      pushes: [] as Array<{userId: string; type: string; title: string; body: string; data: Record<string, string>}>,
      refunds: [] as string[],
    };
    const payments = new Map<string, AsaasPaymentDetails>();
    let seq = 0;
    const deps: AutopayDeps = {
      resolveCustomer: async (uid) => `cus_${uid}`,
      cardFeeTerms: async () => TERMS,
      createTokenCharge: async (input) => {
        calls.created.push(input);
        const n = calls.created.length;
        const out = o.respond ? await o.respond(input, n) : {paymentId: `pay_${n}`, status: "CONFIRMED"};
        payments.set(out.paymentId, {
          id: out.paymentId, status: out.status, billingType: "CREDIT_CARD", value: input.valueReais, netValue: 300,
          externalReference: `arenaSchedulePayment:${input.groupId}:t${input.attemptId}`,
        });
        return out;
      },
      getPayment: async (id) => payments.get(id) ?? {id, status: "PENDING"},
      settle: (d, id, p) => processArenaScheduleAsaasNotification(
        d, id, p, scheduleProcessedRef(d, id), {
          refund: async (pid: string) => {
            calls.refunds.push(pid);
          },
          now: () => new Date(),
          reactivate: async () => true,
        }),
      notify: async (i) => {
        calls.pushes.push({userId: i.userId, type: i.type, title: i.title, body: i.body, data: i.data});
      },
      now: () => clock.now,
      envTag: () => "sandbox",
      newAttemptId: () => `a${++seq}`,
      ...o.over,
    };
    return {deps, calls, clock, payments};
  }

  const charge = (fake: FakeFirestore) => get(fake, `${CHARGES}/c1`);
  const groupOf = (fake: FakeFirestore) => get(fake, `${GROUPS}/${(charge(fake)["asaas"] as Data)["groupId"]}`);
  const attempt = (fake: FakeFirestore, id: string) => (groupOf(fake)["tokenCharges"] as Data)[id] as Data;
  const refusal = () => Promise.reject(new AsaasApiError("Saldo insuficiente.", 400));

  /** Transações em série, como o Firestore (o fake não trava). */
  function serializeTransactions(fake: FakeFirestore): void {
    const original = fake.runTransaction.bind(fake);
    let chain: Promise<unknown> = Promise.resolve();
    fake.runTransaction = (<T>(fn: (tx: unknown) => Promise<T>) => {
      const run = chain.then(() => original(fn));
      chain = run.catch(() => undefined);
      return run;
    }) as typeof fake.runTransaction;
  }

  it("debits on the due date", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    const {deps, calls} = autopayDeps();
    const out = await chargeScheduleAutopayDue(db, NOW, deps);
    assert.equal(out.paid, 1);
    const c = charge(fake);
    assert.equal(c["status"], "paid");
    assert.equal(c["paidVia"], "asaas");
    assert.equal(c["asaasPaymentId"], "pay_1");
    const ap = c["autopay"] as Data;
    assert.equal(ap["state"], "paid");
    assert.equal(ap["attempts"], 1);
    assert.equal(ap["chargedReais"], CHARGED);
    assert.equal(attempt(fake, "a1")["paymentId"], "pay_1");
    assert.equal(attempt(fake, "a1")["status"], "paid");
    assert.equal(attempt(fake, "a1")["source"], "autopay");
    assert.equal(attempt(fake, "a1")["feeCents"], FEE_CENTS);
    assert.equal(calls.created.length, 1);
    const sent = calls.created[0]!;
    assert.equal(sent.valueReais, CHARGED);
    assert.equal(sent.creditCardToken, TOKEN);
    assert.equal(sent.remoteIp, "1.1.1.1");
    assert.equal(sent.customerId, "cus_u1");
    assert.equal(sent.attemptId, "a1");
    assert.match(sent.description, /Fixo 1x/);
    // A arena recebe o plano menos a taxa da NexaGO (6%): a taxa do cartão ficou por cima.
    assert.equal(get(fake, `arenaWallets/${ARENA}`)["awaitingSettlementReais"], 282);
    assert.equal(c["platformFeeReais"], 18);
    assert.deepEqual(calls.pushes.map((p) => [p.type, p.title, p.body]), [[
      "schedule_plan_autopay_paid", "Mensalidade paga",
      `Plano Fixo 1x · dez/2026: R$ ${CHARGED.toFixed(2).replace(".", ",")} no cartão final 4242.`,
    ]]);
    assert.deepEqual(calls.pushes[0]!.data, {chargeId: "c1", subscriptionId: "s1", arenaId: ARENA, url: "/meus-planos-horario"});
  });

  it("refused → retry → paid", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    const {deps, calls, clock} = autopayDeps({respond: (_i, n) => n === 1 ? refusal() : Promise.resolve({paymentId: `pay_${n}`, status: "CONFIRMED"})});
    const first = await chargeScheduleAutopayDue(db, NOW, deps);
    assert.equal(first.refused, 1);
    let ap = charge(fake)["autopay"] as Data;
    assert.equal(ap["state"], "retry");
    assert.equal(ap["scheduledFor"], addDaysToDateKey(TODAY, 1));
    assert.equal(ap["attempts"], 1);
    assert.equal(ap["lastError"], "Saldo insuficiente.");
    assert.equal(attempt(fake, "a1")["status"], "refused");
    assert.equal(attempt(fake, "a1")["error"], "Saldo insuficiente.");
    assert.equal(groupOf(fake)["state"], "autopay");
    assert.equal(docsIn(fake, `${GROUPS}/`).filter(([, g]) => g["state"] === "pending").length, 0);
    assert.equal(calls.pushes.length, 0);

    // Mesmo dia de novo: não é a vez da 2ª tentativa.
    assert.equal((await chargeScheduleAutopayDue(db, NOW, deps)).charged, 0);

    clock.now = TOMORROW;
    const second = await chargeScheduleAutopayDue(db, TOMORROW, deps);
    assert.equal(second.paid, 1);
    ap = charge(fake)["autopay"] as Data;
    assert.equal(ap["state"], "paid");
    assert.equal(ap["attempts"], 2);
    assert.equal(charge(fake)["status"], "paid");
    assert.equal(calls.created.length, 2);
  });

  it("refused twice → link", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    const {deps, calls, clock} = autopayDeps({respond: refusal});
    await chargeScheduleAutopayDue(db, NOW, deps);
    const groupId = (charge(fake)["asaas"] as Data)["groupId"];
    clock.now = TOMORROW;
    await chargeScheduleAutopayDue(db, TOMORROW, deps);
    assert.equal((charge(fake)["autopay"] as Data)["state"], "failed");
    assert.equal((charge(fake)["asaas"] as Data)["groupId"], groupId);
    assert.equal((charge(fake)["asaas"] as Data)["state"], "pending");
    assert.equal(groupOf(fake)["state"], "pending");
    assert.equal(docsIn(fake, `${GROUPS}/`).length, 1);
    assert.equal(charge(fake)["status"], "open");
    assert.equal(CHARGED, 312.46);
    assert.deepEqual(calls.pushes.map((p) => [p.type, p.title, p.body]), [[
      "schedule_plan_autopay_failed", "Não conseguimos debitar",
      "Não conseguimos debitar R$ 312,46 no cartão final 4242. Pague por Pix ou cartão.",
    ]]);
  });

  it("paid by link before → skipped", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake, {charge: {status: "paid", paidVia: "asaas"}});
    const {deps, calls} = autopayDeps();
    const out = await chargeScheduleAutopayDue(db, NOW, deps);
    assert.equal(out.skipped, 1);
    assert.equal(calls.created.length, 0);
    assert.equal((charge(fake)["autopay"] as Data)["state"], "skipped");
    assert.equal((charge(fake)["autopay"] as Data)["lastError"], "charge_resolved");
    assert.equal(docsIn(fake, `${GROUPS}/`).length, 0);
  });

  it("two workers at once → one charge", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    serializeTransactions(fake);
    const {deps, calls} = autopayDeps({respond: async (_i, n) => {
      await new Promise((resolve) => setImmediate(resolve));
      return {paymentId: `pay_${n}`, status: "CONFIRMED"};
    }});
    const outs = await Promise.all([
      runScheduleTokenCharge(db, "c1", "autopay", deps),
      runScheduleTokenCharge(db, "c1", "autopay", deps),
    ]);
    assert.equal(calls.created.length, 1);
    assert.deepEqual(outs.map((o) => o.outcome).sort(), ["busy", "paid"]);
    assert.equal(docsIn(fake, `${GROUPS}/`).length, 1);
  });

  it("manual payment during charging → busy", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake, {autopay: {state: "charging", attempts: 1}});
    const {deps, calls} = autopayDeps();
    assert.deepEqual(await runScheduleTokenCharge(db, "c1", "manual", deps, {uid: "u1"}), {outcome: "busy"});
    assert.equal(calls.created.length, 0);
  });

  it("resolved after claim → refund", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    const {deps, calls} = autopayDeps({respond: async (_i, n) => {
      // Baixa manual enquanto o POST estava no ar.
      fake.seedDoc(`${CHARGES}/c1`, {...charge(fake), status: "paid", paymentMethod: "cash"});
      return {paymentId: `pay_${n}`, status: "CONFIRMED"};
    }});
    const out = await runScheduleTokenCharge(db, "c1", "autopay", deps);
    assert.deepEqual(calls.refunds, ["pay_1"]);
    assert.equal(out.outcome, "skipped");
    assert.equal(charge(fake)["paymentMethod"], "cash");
    assert.equal(charge(fake)["paidVia"], undefined);
    assert.equal(attempt(fake, "a1")["status"], "refunded");
    assert.equal((charge(fake)["autopay"] as Data)["state"], "skipped");
    assert.equal(calls.pushes.length, 0);
  });

  it("network error keeps charging; recovery resumes with the same key", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    const {deps, calls} = autopayDeps({respond: (_i, n) => n === 1 ?
      Promise.reject(new Error("ECONNRESET")) : Promise.resolve({paymentId: `pay_${n}`, status: "CONFIRMED"})});
    const out = await chargeScheduleAutopayDue(db, NOW, deps);
    assert.equal(out.failed, 1);
    assert.equal((charge(fake)["autopay"] as Data)["state"], "charging");
    assert.equal(attempt(fake, "a1")["status"], "charging");
    assert.equal(attempt(fake, "a1")["paymentId"], null);

    // Ainda no prazo: ninguém mexe.
    assert.deepEqual(await recoverScheduleAutopay(db, new Date(NOW.getTime() + 5 * MIN), deps), {resumed: 0, linked: 0});
    assert.equal(calls.created.length, 1);

    const later = new Date(NOW.getTime() + 16 * MIN);
    assert.deepEqual(await recoverScheduleAutopay(db, later, deps), {resumed: 1, linked: 0});
    assert.equal(calls.created.length, 2);
    assert.equal(calls.created[1]!.attemptId, calls.created[0]!.attemptId);
    assert.equal(calls.created[1]!.valueReais, calls.created[0]!.valueReais);
    assert.equal(charge(fake)["status"], "paid");
    assert.equal((charge(fake)["autopay"] as Data)["attempts"], 1);
    assert.equal(Object.keys(groupOf(fake)["tokenCharges"] as Data).length, 1);
  });

  it("stuck with paymentId: recovery asks the Asaas and settles", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    const {deps, calls, payments} = autopayDeps({respond: async (_i, n) => ({paymentId: `pay_${n}`, status: "PENDING"})});
    assert.deepEqual(await runScheduleTokenCharge(db, "c1", "autopay", deps), {outcome: "busy"});
    assert.equal(attempt(fake, "a1")["paymentId"], "pay_1");
    payments.set("pay_1", {...payments.get("pay_1")!, status: "CONFIRMED"});
    assert.deepEqual(await recoverScheduleAutopay(db, new Date(NOW.getTime() + 16 * MIN), deps), {resumed: 1, linked: 0});
    assert.equal(calls.created.length, 1);
    assert.equal(charge(fake)["status"], "paid");
    assert.equal((charge(fake)["autopay"] as Data)["state"], "paid");
  });

  it("same chargeId after pause gets a new key", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    const {deps, calls, clock} = autopayDeps({
      respond: (_i, n) => n === 1 ? refusal() : Promise.resolve({paymentId: `pay_${n}`, status: "CONFIRMED"}),
      over: {newAttemptId: defaultAutopayDeps.newAttemptId},
    });
    await chargeScheduleAutopayDue(db, NOW, deps);
    clock.now = TOMORROW;
    await chargeScheduleAutopayDue(db, TOMORROW, deps);
    const [a, b] = calls.created.map((c) => c.attemptId);
    assert.match(a!, /^[0-9a-f]{20}$/);
    assert.match(b!, /^[0-9a-f]{20}$/);
    assert.notEqual(a, b);
  });

  it("flag off / arena offline / card removed / débito desligado on the day → skipped + link", async () => {
    const cases: Array<[string, (fake: FakeFirestore) => void]> = [
      ["flag_off", (fake) => seedAuto(fake, {flag: false})],
      ["arena_offline", (fake) => seedAuto(fake, {arena: {payoutPixKey: ""}})],
      ["no_card", (fake) => {
        seedAuto(fake);
        fake.store.delete("users/u1/asaas/savedCard");
      }],
      ["autopay_off", (fake) => seedAuto(fake, {sub: {autopay: {u1: {enabled: false}}}})],
    ];
    for (const [reason, setup] of cases) {
      const {fake, db} = makeDb();
      setup(fake);
      const {deps, calls} = autopayDeps();
      const out = await chargeScheduleAutopayDue(db, NOW, deps);
      assert.equal(out.skipped, 1, reason);
      assert.equal(calls.created.length, 0, reason);
      assert.equal((charge(fake)["autopay"] as Data)["state"], "skipped", reason);
      assert.equal((charge(fake)["autopay"] as Data)["lastError"], reason);
      assert.equal(groupOf(fake)["state"], "pending", reason);
      assert.equal((charge(fake)["asaas"] as Data)["state"], "pending", reason);
    }
  });

  it("missed run → link", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake, {autopay: {scheduledFor: addDaysToDateKey(TODAY, -2)}});
    seedCharge(fake, "c2", {
      dueDate: addDaysToDateKey(TODAY, -1),
      autopay: {state: "retry", scheduledFor: addDaysToDateKey(TODAY, -1), attempts: 1, last4: "4242"},
    });
    const {deps, calls} = autopayDeps();
    assert.deepEqual(await recoverScheduleAutopay(db, NOW, deps), {resumed: 0, linked: 1});
    assert.equal((charge(fake)["autopay"] as Data)["state"], "skipped");
    assert.equal((charge(fake)["autopay"] as Data)["lastError"], "missed_run");
    assert.equal(groupOf(fake)["state"], "pending");
    assert.equal((get(fake, `${CHARGES}/c2`)["autopay"] as Data)["state"], "retry");
    assert.equal(calls.created.length, 0);
  });

  it("upcoming push once", async () => {
    const {fake, db} = makeDb();
    const inThree = addDaysToDateKey(TODAY, 3);
    seedAuto(fake, {charge: {dueDate: inThree}, autopay: {scheduledFor: inThree}});
    const {deps, calls} = autopayDeps();
    const first = await chargeScheduleAutopayDue(db, NOW, deps);
    assert.equal(first.upcoming, 1);
    assert.equal(first.charged, 0);
    const [, mm, dd] = inThree.split("-");
    assert.deepEqual(calls.pushes.map((p) => [p.type, p.title, p.body]), [[
      "schedule_plan_autopay_upcoming", "Débito automático em 3 dias",
      `Dia ${dd}/${mm} vamos debitar R$ 312,46 no cartão final 4242 (plano Fixo 1x).`,
    ]]);
    assert.ok((charge(fake)["autopay"] as Data)["upcomingSentAt"] != null);
    const second = await chargeScheduleAutopayDue(db, NOW, deps);
    assert.equal(second.upcoming, 0);
    assert.equal(calls.pushes.length, 1);
    assert.equal(calls.created.length, 0);
  });

  it("the card token never leaves savedCard", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    const {deps, clock} = autopayDeps({respond: (_i, n) => n === 1 ? refusal() : Promise.resolve({paymentId: `pay_${n}`, status: "CONFIRMED"})});
    await chargeScheduleAutopayDue(db, NOW, deps);
    clock.now = TOMORROW;
    await chargeScheduleAutopayDue(db, TOMORROW, deps);
    assert.equal(charge(fake)["status"], "paid");
    const written = JSON.stringify([...docsIn(fake, `${CHARGES}/`), ...docsIn(fake, `${GROUPS}/`), ...docsIn(fake, "artifacts/")]);
    assert.equal(written.includes(TOKEN), false);
  });

  // ---- achados da revisão ----

  const autopayGroup = (fake: FakeFirestore, id: string, over: Data = {}) => fake.seedDoc(`${GROUPS}/${id}`, {
    chargeId: "c1", arenaId: ARENA, subscriptionId: "s1", state: "autopay", amountReais: 300,
    description: "Plano Fixo 1x · dez/2026", paymentId: null, ...over,
  });
  const mirrorTo = (id: string) => ({asaas: {groupId: id, state: "autopay", invoiceUrl: null, status: null}});

  it("review 1: stuck without outcome resumes with the same key, then becomes a refusal after 24 h", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    const {deps, calls} = autopayDeps({respond: () => Promise.reject(new AsaasApiError("Unauthorized", 401))});
    assert.equal((await chargeScheduleAutopayDue(db, NOW, deps)).failed, 1);
    const at0 = (attempt(fake, "a1")["at"] as Timestamp).toMillis();
    await recoverScheduleAutopay(db, new Date(NOW.getTime() + 16 * MIN), deps);
    assert.equal(calls.created.length, 2);
    assert.equal(calls.created[1]!.attemptId, "a1");
    assert.equal((charge(fake)["autopay"] as Data)["state"], "charging");
    assert.equal((attempt(fake, "a1")["at"] as Timestamp).toMillis(), at0, "a retomada não reescreve o `at`");

    const dayAfter = new Date(NOW.getTime() + 25 * 60 * MIN);
    assert.deepEqual(await recoverScheduleAutopay(db, dayAfter, deps), {resumed: 1, linked: 0});
    assert.equal(calls.created.length, 2);
    const ap = charge(fake)["autopay"] as Data;
    assert.equal(ap["state"], "retry");
    assert.equal(ap["scheduledFor"], addDaysToDateKey(dayKeyFromEventDate(dayAfter), 1));
    assert.equal(attempt(fake, "a1")["status"], "refused");
  });

  it("review 1: charging with no attempt in flight becomes a refusal (2nd → failed + link)", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake, {
      autopay: {state: "charging", attempts: 2, attemptId: "gone", chargedReais: CHARGED, lastAttemptAt: null},
      charge: mirrorTo("g1"),
    });
    autopayGroup(fake, "g1", {tokenCharges: {gone: {status: "refused", source: "autopay"}}});
    const {deps, calls} = autopayDeps();
    assert.deepEqual(await recoverScheduleAutopay(db, NOW, deps), {resumed: 1, linked: 0});
    assert.equal((charge(fake)["autopay"] as Data)["state"], "failed");
    assert.equal(get(fake, `${GROUPS}/g1`)["state"], "pending");
    assert.equal(calls.created.length, 0);
    assert.deepEqual(calls.pushes.map((p) => p.type), ["schedule_plan_autopay_failed"]);
  });

  it("review 2: safety net gives the link to an open charge left with an autopay group", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake, {autopay: {state: "failed", attempts: 2}, charge: mirrorTo("g1")});
    autopayGroup(fake, "g1");
    seedCharge(fake, "c2", {
      dueDate: TODAY, ...mirrorTo("g2"), autopay: {state: "scheduled", scheduledFor: addDaysToDateKey(TODAY, 1)},
    });
    autopayGroup(fake, "g2", {chargeId: "c2"});
    const {deps} = autopayDeps();
    assert.deepEqual(await recoverScheduleAutopay(db, NOW, deps), {resumed: 0, linked: 1});
    assert.equal(get(fake, `${GROUPS}/g1`)["state"], "pending");
    assert.equal((charge(fake)["asaas"] as Data)["state"], "pending");
    assert.equal(get(fake, `${GROUPS}/g2`)["state"], "autopay", "ainda na janela do débito: sem link");
  });

  it("review 3: settle that neither paid nor refunded keeps charging; recovery re-checks the token payment", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    const {deps} = autopayDeps();
    const realSettle = deps.settle;
    deps.settle = async () => undefined;
    assert.deepEqual(await runScheduleTokenCharge(db, "c1", "autopay", deps), {outcome: "busy"});
    assert.equal((charge(fake)["autopay"] as Data)["state"], "charging");
    assert.equal(attempt(fake, "a1")["status"], "charging");
    assert.equal(attempt(fake, "a1")["paymentId"], "pay_1");
    assert.equal(groupOf(fake)["paymentId"], null, "a cobrança com token fica em tokenCharges, não no paymentId do grupo");

    deps.settle = realSettle;
    assert.deepEqual(await recoverScheduleAutopay(db, new Date(NOW.getTime() + 16 * MIN), deps), {resumed: 1, linked: 0});
    assert.equal(charge(fake)["status"], "paid");
    assert.equal((charge(fake)["autopay"] as Data)["state"], "paid");
    assert.equal(attempt(fake, "a1")["status"], "paid");
  });

  it("review 4: a manual refusal gives the link to the autopay group it created outside the debit window", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    seedCharge(fake, "c1", {dueDate: TODAY, asaas: {groupId: "gv", state: "void", invoiceUrl: null, status: null}});
    fake.seedDoc(`${GROUPS}/gv`, {chargeId: "c1", state: "void"});
    const {deps} = autopayDeps({respond: refusal});
    assert.deepEqual(await runScheduleTokenCharge(db, "c1", "manual", deps, {uid: "u1"}),
      {outcome: "refused", message: "Saldo insuficiente."});
    const groupId = (charge(fake)["asaas"] as Data)["groupId"];
    assert.notEqual(groupId, "gv");
    assert.equal(groupOf(fake)["state"], "pending");
    assert.equal(attempt(fake, "a1")["status"], "refused");

    // Agendada para débito: a recusa na mão não tira da fila nem põe link.
    const other = makeDb();
    seedAuto(other.fake);
    const second = autopayDeps({respond: refusal});
    await runScheduleTokenCharge(other.db, "c1", "manual", second.deps, {uid: "u1"});
    assert.equal(groupOf(other.fake)["state"], "autopay");
    assert.equal((charge(other.fake)["autopay"] as Data)["state"], "scheduled");
  });

  it("review 5: an old attempt finishing after the pause rewrote the charge leaves the new autopay alone", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    const fresh = {state: "charging", attemptId: "other", attempts: 1, last4: "4242", chargedReais: CHARGED};
    const {deps} = autopayDeps({respond: async () => {
      // Pausa cancelou e a volta regravou a mensalidade no mesmo id, já com outra tentativa.
      const rewritten = {...charge(fake), autopay: fresh} as Data;
      delete rewritten["asaas"];
      fake.seedDoc(`${CHARGES}/c1`, rewritten);
      return refusal();
    }});
    assert.equal((await runScheduleTokenCharge(db, "c1", "autopay", deps)).outcome, "refused");
    assert.deepEqual(charge(fake)["autopay"], fresh);
    const oldGroup = docsIn(fake, `${GROUPS}/`)[0]![1];
    assert.equal(((oldGroup["tokenCharges"] as Data)["a1"] as Data)["status"], "refused");
  });

  it("review 6: manual attempt in flight + job → one charge", async () => {
    const {fake, db} = makeDb();
    seedAuto(fake);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let started!: () => void;
    const inFlight = new Promise<void>((r) => {
      started = r;
    });
    const {deps, calls} = autopayDeps({respond: async (_i, n) => {
      if (n === 1) {
        started();
        await gate;
      }
      return {paymentId: `pay_${n}`, status: "CONFIRMED"};
    }});
    const manual = runScheduleTokenCharge(db, "c1", "manual", deps, {uid: "u1"});
    await inFlight;
    const job = await chargeScheduleAutopayDue(db, NOW, deps);
    assert.equal(job.failed, 1, "o débito espera (busy)");
    release();
    assert.deepEqual(await manual, {outcome: "paid"});
    assert.equal(calls.created.length, 1);
    assert.equal(charge(fake)["status"], "paid");
    assert.equal((charge(fake)["autopay"] as Data)["state"], "paid");
  });

  describe("pagar com cartão salvo e remover cartão", () => {
    const pay = (db: Firestore, deps: AutopayDeps, uid = "u1") =>
      payScheduleChargeWithSavedCardCore(db, uid, {chargeId: "c1"}, deps);

    it("pay with saved card: manual source, no autopay created", async () => {
      const {fake, db} = makeDb();
      seed(fake);
      seedCharge(fake, "c1", {dueDate: TODAY});
      const {deps, calls} = autopayDeps();
      assert.deepEqual(await pay(db, deps), {status: "paid"});
      assert.equal(charge(fake)["status"], "paid");
      assert.equal(attempt(fake, "a1")["source"], "manual");
      assert.equal(charge(fake)["autopay"], undefined);
      assert.equal(calls.created.length, 1);
    });

    it("manual pay of a scheduled or skipped charge ends with autopay paid", async () => {
      for (const state of ["scheduled", "retry", "skipped"]) {
        const {fake, db} = makeDb();
        seedAuto(fake, {autopay: {state}});
        const {deps} = autopayDeps();
        assert.deepEqual(await pay(db, deps), {status: "paid"}, state);
        assert.equal((charge(fake)["autopay"] as Data)["state"], "paid", state);
      }
    });

    it("manual does not count as an attempt", async () => {
      const {fake, db} = makeDb();
      seedAuto(fake, {autopay: {state: "retry", attempts: 1, scheduledFor: addDaysToDateKey(TODAY, 1)}});
      const {deps} = autopayDeps({respond: refusal});
      await rejectsWith(pay(db, deps), "invalid-argument", "Saldo insuficiente.");
      const ap = charge(fake)["autopay"] as Data;
      assert.equal(ap["attempts"], 1);
      assert.equal(ap["state"], "retry");
    });

    it("an empty refusal message falls back to the generic one", async () => {
      const {fake, db} = makeDb();
      seed(fake);
      seedCharge(fake, "c1", {dueDate: TODAY});
      const {deps} = autopayDeps({respond: () => Promise.reject(new AsaasApiError("", 400))});
      await rejectsWith(pay(db, deps), "invalid-argument", CARD_REFUSED_MESSAGE);
    });

    it("manual on failed works even with a link", async () => {
      const {fake, db} = makeDb();
      seedAuto(fake, {
        autopay: {state: "failed", attempts: 2},
        charge: {asaas: {groupId: "g1", state: "open", invoiceUrl: "https://x", status: null}},
      });
      fake.seedDoc(`${GROUPS}/g1`, {chargeId: "c1", state: "open", amountReais: 300, description: "Mensalidade"});
      const {deps} = autopayDeps();
      assert.deepEqual(await pay(db, deps), {status: "paid"});
      assert.equal(charge(fake)["status"], "paid");
      assert.equal((charge(fake)["autopay"] as Data)["state"], "paid");
    });

    it("busy while the debit is charging", async () => {
      const {fake, db} = makeDb();
      seedAuto(fake, {autopay: {state: "charging", attemptId: "x", lastAttemptAt: Timestamp.fromDate(NOW)}});
      const {deps, calls} = autopayDeps();
      await rejectsWith(pay(db, deps), "failed-precondition", AUTOPAY_BUSY_MESSAGE);
      assert.equal(calls.created.length, 0);
    });

    it("not visible, no card, payment window closed", async () => {
      {
        const {fake, db} = makeDb();
        seed(fake);
        seedCharge(fake, "c1", {dueDate: TODAY});
        await rejectsWith(pay(db, autopayDeps().deps, "u2"), "permission-denied", "Esta mensalidade não é sua.");
      }
      {
        const {fake, db} = makeDb();
        seed(fake, {card: false});
        seedCharge(fake, "c1", {dueDate: TODAY});
        await rejectsWith(pay(db, autopayDeps().deps), "failed-precondition", AUTOPAY_NO_CARD_MESSAGE);
      }
      {
        const {fake, db} = makeDb();
        seed(fake, {sub: {status: "pending_payment", pendingPaymentUntil: Timestamp.fromMillis(Date.now() - MIN)}});
        seedCharge(fake, "c1", {dueDate: TODAY});
        await rejectsWith(pay(db, autopayDeps().deps), "failed-precondition", PAYMENT_WINDOW_CLOSED_MESSAGE);
      }
    });

    it("remove card turns off every plan, deletes the token and gives the link back", async () => {
      const {fake, db} = makeDb();
      seed(fake);
      seedSub(fake, "s2");
      seedCharge(fake, "c1", {dueDate: TODAY});
      seedCharge(fake, "c2", {subscriptionId: "s2", dueDate: TODAY});
      await enable(db);
      await setScheduleAutopayCore(db, "u1", {subscriptionId: "s2", enabled: true, consentText: CONSENT}, "sandbox");
      assert.equal(autopay(fake, "c1")!["state"], "scheduled");
      assert.deepEqual(await removeMyPaymentCardCore(db, "u1"), {removed: true, plans: 2});
      assert.equal(fake.store.has("users/u1/asaas/savedCard"), false);
      for (const id of ["c1", "c2"]) {
        assert.equal(autopay(fake, id)!["state"], "skipped", id);
        assert.ok((get(fake, `${CHARGES}/${id}`)["asaas"] as Data)["groupId"], id);
      }
      assert.deepEqual(await removeMyPaymentCardCore(db, "u1"), {removed: false, plans: 0});
    });
  });

  describe("ruling 9: link quietly", () => {
    it("recovery gives the link to skipped/failed open charges with no group", async () => {
      const {fake, db} = makeDb();
      seedAuto(fake, {autopay: {state: "skipped", needsLink: true}});
      seedCharge(fake, "c2", {autopay: {state: "failed", needsLink: true}, dueDate: TODAY});
      seedCharge(fake, "c3", {autopay: {state: "skipped", needsLink: false}, asaas: {groupId: "g9", state: "open"}});
      seedCharge(fake, "c4", {autopay: {state: "skipped"}, billingMode: "manual"});
      fake.seedDoc(`${GROUPS}/g9`, {chargeId: "c3", state: "open"});
      const {deps} = autopayDeps();
      assert.deepEqual(await recoverScheduleAutopay(db, NOW, deps), {resumed: 0, linked: 2});
      assert.equal(autopay(fake, "c1")!["needsLink"], false);
      for (const id of ["c1", "c2"]) {
        assert.ok(((get(fake, `${CHARGES}/${id}`)["asaas"] ?? {}) as Data)["groupId"], id);
      }
      assert.equal(((get(fake, `${CHARGES}/c4`)["asaas"] ?? {}) as Data)["groupId"], undefined);
    });

    it("250 open failed charges with links + 1 linkless: one run links it (queue drains)", async () => {
      const {fake, db} = makeDb();
      seed(fake);
      for (let i = 0; i < 250; i++) {
        seedCharge(fake, `L${i}`, {
          autopay: {state: "failed", needsLink: false}, asaas: {groupId: `gl${i}`, state: "open"},
        });
      }
      seedCharge(fake, "lonely", {autopay: {state: "failed", needsLink: true}});
      const {deps} = autopayDeps();
      assert.deepEqual(await recoverScheduleAutopay(db, NOW, deps), {resumed: 0, linked: 1});
      assert.ok(((get(fake, `${CHARGES}/lonely`)["asaas"] ?? {}) as Data)["groupId"]);
      assert.equal(autopay(fake, "lonely")!["needsLink"], false);
    });

    it("a failing ensure keeps needsLink and the next run retries", async () => {
      const {fake, db} = makeDb();
      seed(fake);
      seedCharge(fake, "c1", {autopay: {state: "skipped", needsLink: true}});
      const {deps} = autopayDeps();
      const original = fake.runTransaction.bind(fake);
      fake.runTransaction = (() => Promise.reject(new Error("boom"))) as typeof fake.runTransaction;
      assert.deepEqual(await recoverScheduleAutopay(db, NOW, deps), {resumed: 0, linked: 0});
      assert.equal(autopay(fake, "c1")!["needsLink"], true);
      fake.runTransaction = original;
      assert.deepEqual(await recoverScheduleAutopay(db, NOW, deps), {resumed: 0, linked: 1});
      assert.equal(autopay(fake, "c1")!["needsLink"], false);
    });

    it("every skip/failed write marks needsLink", async () => {
      const {fake, db} = makeDb();
      seed(fake);
      seedCharge(fake, "c1", {dueDate: TODAY});
      await enable(db);
      const collection = fake.collection.bind(fake);
      (fake as unknown as {collection: (n: string) => unknown}).collection = (name: string) => {
        if (name === GROUPS) throw new Error("boom");
        return collection(name);
      };
      await disableAllScheduleAutopayCore(db, "u1");
      assert.equal(autopay(fake, "c1")!["needsLink"], true);
    });

    it("disableAll survives a link failure and leaves the charge skipped", async () => {
      const {fake, db} = makeDb();
      seed(fake);
      seedCharge(fake, "c1", {dueDate: TODAY});
      await enable(db);
      const collection = fake.collection.bind(fake);
      (fake as unknown as {collection: (n: string) => unknown}).collection = (name: string) => {
        if (name === GROUPS) throw new Error("boom");
        return collection(name);
      };
      assert.equal(await disableAllScheduleAutopayCore(db, "u1"), 1);
      assert.equal(autopay(fake, "c1")!["state"], "skipped");
    });
  });
});

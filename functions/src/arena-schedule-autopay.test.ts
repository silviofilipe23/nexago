import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
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
  setScheduleAutopayCore,
} from "./arena-schedule-autopay";
import {cardSurcharge} from "./card-anticipation-fee";
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

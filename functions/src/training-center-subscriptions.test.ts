import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import type {CenterBillingDeps} from "./training-center-billing";
import {
  changeSubscriptionPlanCore,
  chargeSubscriptionNowCore,
  runTrainingCenterBillingCore,
  syncSubscriptionFromEnrollment,
} from "./training-center-subscriptions";
import {dunningNotice} from "./training-center-subscription-model";

const C = "trainingCenters/c1";
const SUB = `${C}/subscriptions/e1`;
const ENR = `${C}/enrollments/e1`;
const CLS = `${C}/classes/k1`;

/** 06:00 em São Paulo do dia pedido. */
const at = (day: string) => new Date(`${day}T09:00:00Z`);

function seed(opts: {center?: Record<string, unknown>; enrollment?: Record<string, unknown>; online?: boolean} = {}) {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {
    name: "CT Praia", status: "active", timezone: "America/Sao_Paulo", receivingConnected: opts.online !== false,
    billing: {billingDay: 5, firstMonth: "prorata", lateFees: true, blockAfterDays: 20, suspendAfterDays: 45, suspendAction: "suspend"},
    ...opts.center,
  });
  fake.seedDoc("trainingCenterReceiving/c1", {walletId: "wal_ct", asaasEnv: "sandbox"});
  fake.seedDoc(`${C}/centerMembers/owner`, {uid: "owner", role: "center_owner", status: "active", displayName: "Ana"});
  fake.seedDoc(`${C}/students/s1`, {name: "Lucas", uid: "uLucas", email: "l@x.com"});
  fake.seedDoc(CLS, {name: "BT Intermediário B", capacity: 8, seatsTaken: 3, rosterStudentIds: ["s0", "s1", "s2"]});
  fake.seedDoc(`${C}/plans/m2`, {name: "Mensal 2x/semana", type: "monthly", priceCents: 32000, status: "active", classesPerWeek: 2});
  fake.seedDoc(`${C}/plans/m3`, {name: "Mensal 3x/semana", type: "monthly", priceCents: 42000, status: "active", classesPerWeek: 3});
  fake.seedDoc(ENR, {
    studentId: "s1", studentName: "Lucas", classId: "k1", className: "BT Intermediário B", planId: "m2", status: "active",
    startDate: "2026-10-12", pausedUntil: null, creditsLeft: null,
    contract: {planName: "Mensal 2x/semana", planType: "monthly", priceCents: 32000, classesPerWeek: 2, contractedAt: "2026-10-12"},
    ...opts.enrollment,
  });
  return fake;
}

function deps(day: string, over: Partial<CenterBillingDeps> = {}) {
  const calls = {created: [] as Array<Record<string, unknown>>, pushed: [] as Array<{title: string; body: string; data: Record<string, string>}>};
  let n = 0;
  const d: CenterBillingDeps = {
    now: () => at(day),
    env: () => "sandbox",
    resolveCustomer: async () => "cus_1",
    createPayment: async (input) => {
      calls.created.push(input as unknown as Record<string, unknown>);
      n += 1;
      return {paymentId: `pay_${n}`, invoiceUrl: `https://asaas/i/pay_${n}`, status: "PENDING"};
    },
    deletePayment: async () => undefined,
    getPayment: async () => ({}),
    pixPayload: async () => "",
    refund: async () => undefined,
    notify: async (input) => {
      calls.pushed.push({title: input.title, body: input.body, data: input.data});
    },
    ...over,
  };
  return {deps: d, calls};
}

const db = (fake: FakeFirestore) => fake as unknown as Firestore;
const doc = (fake: FakeFirestore, path: string) => fake.store.get(path) as Record<string, unknown> | undefined;

async function withSub(fake: FakeFirestore, day = "2026-10-12") {
  assert.equal(await syncSubscriptionFromEnrollment(db(fake), "c1", "e1", at(day)), "created");
}

describe("assinatura nasce da matrícula mensal ativa", () => {
  it("primeiro vencimento no dia fixo depois da contratação; pacote não vira assinatura", async () => {
    const fake = seed();
    await withSub(fake);
    const sub = doc(fake, SUB)!;
    assert.equal(sub["nextChargeDate"], "2026-11-05");
    assert.equal(sub["priceCents"], 32000);
    assert.deepEqual(sub["lateFees"], {finePercent: 2, interestPercent: 1});

    const pack = seed({enrollment: {contract: {planType: "class_pack", planName: "10 aulas", priceCents: 50000}}});
    assert.equal(await syncSubscriptionFromEnrollment(db(pack), "c1", "e1", at("2026-10-12")), "none");
  });

  it("pausar, voltar e cancelar a matrícula espelham na assinatura", async () => {
    const fake = seed();
    await withSub(fake);
    fake.seedDoc(ENR, {...doc(fake, ENR), status: "paused", pausedUntil: "2026-11-20"});
    await syncSubscriptionFromEnrollment(db(fake), "c1", "e1", at("2026-10-20"));
    assert.equal(doc(fake, SUB)!["status"], "paused");
    fake.seedDoc(ENR, {...doc(fake, ENR), status: "cancelled"});
    await syncSubscriptionFromEnrollment(db(fake), "c1", "e1", at("2026-10-21"));
    assert.equal(doc(fake, SUB)!["status"], "cancelled");
  });
});

describe("rodada diária", () => {
  it("D−3 gera a cobrança do ciclo com id fixo, fatura no provedor com multa/juros e avisa; repetir não duplica", async () => {
    const fake = seed();
    await withSub(fake);
    const {deps: d, calls} = deps("2026-11-02");
    await runTrainingCenterBillingCore(db(fake), d);
    await runTrainingCenterBillingCore(db(fake), d);
    const inv = doc(fake, `${C}/invoices/sub_e1_2026-11`)!;
    assert.equal(inv["amountCents"], 32000);
    assert.equal(inv["dueDate"], "2026-11-05");
    assert.equal(inv["providerRef"], "pay_1");
    assert.equal(calls.created.length, 1);
    assert.deepEqual(calls.created[0]!["lateFees"], {finePercent: 2, interestPercent: 1});
    assert.equal(calls.pushed.length, 1);
    assert.match(calls.pushed[0]!.body, /vence em 3 dias/);
    assert.equal(calls.pushed[0]!.data["invoiceUrl"], "https://asaas/i/pay_1");
    assert.equal(doc(fake, SUB)!["nextChargeDate"], "2026-12-05");
    const run = doc(fake, `${C}/billingRuns/2026-11-02`)!;
    assert.equal((run["summary"] as Record<string, number>)["generated"], 1);
    assert.equal(run["runs"], 2);
  });

  it("antes da janela não gera; sem recebimento conectado gera sem link", async () => {
    const fake = seed({online: false});
    await withSub(fake);
    await runTrainingCenterBillingCore(db(fake), deps("2026-11-01").deps);
    assert.equal(doc(fake, `${C}/invoices/sub_e1_2026-11`), undefined);
    const {deps: d, calls} = deps("2026-11-02");
    await runTrainingCenterBillingCore(db(fake), d);
    assert.equal(doc(fake, `${C}/invoices/sub_e1_2026-11`)!["providerRef"], "");
    assert.equal(calls.created.length, 0);
    assert.match(calls.pushed[0]!.body, /Combine o pagamento com o centro/);
  });

  it("régua: avisa cada estágio uma vez, bloqueia o check-in e suspende liberando a vaga", async () => {
    const fake = seed();
    await withSub(fake);
    await runTrainingCenterBillingCore(db(fake), deps("2026-11-02").deps);

    const d1 = deps("2026-11-06");
    await runTrainingCenterBillingCore(db(fake), d1.deps);
    await runTrainingCenterBillingCore(db(fake), d1.deps);
    assert.equal(d1.calls.pushed.length, 1);
    assert.match(d1.calls.pushed[0]!.title, /em aberto/);
    assert.equal(doc(fake, SUB)!["status"], "past_due");

    await runTrainingCenterBillingCore(db(fake), deps("2026-11-25").deps);
    assert.equal(doc(fake, SUB)!["checkinBlocked"], true);
    assert.equal(doc(fake, `${C}/students/s1`)!["billingHold"], true);

    const late = deps("2026-12-20");
    await runTrainingCenterBillingCore(db(fake), late.deps);
    assert.equal(doc(fake, SUB)!["status"], "suspended");
    assert.equal(doc(fake, ENR)!["status"], "cancelled");
    assert.equal(doc(fake, ENR)!["cancelReason"], "nonpayment");
    assert.equal(doc(fake, CLS)!["seatsTaken"], 2);
    assert.deepEqual(doc(fake, CLS)!["rosterStudentIds"], ["s0", "s2"]);
    assert.equal(doc(fake, `${C}/students/s1`)!["billingHold"], false);
    assert.ok(late.calls.pushed.some((p) => p.title === "Matrícula suspensa"));
  });

  it("'avisar só' não suspende", async () => {
    const fake = seed({center: {billing: {billingDay: 5, suspendAfterDays: 45, suspendAction: "notify"}}});
    await withSub(fake);
    await runTrainingCenterBillingCore(db(fake), deps("2026-11-02").deps);
    await runTrainingCenterBillingCore(db(fake), deps("2026-12-21").deps);
    assert.equal(doc(fake, ENR)!["status"], "active");
  });

  it("pausada no vencimento pula o ciclo; pausa vencida volta sozinha", async () => {
    const fake = seed();
    await withSub(fake);
    fake.seedDoc(ENR, {...doc(fake, ENR), status: "paused", pausedUntil: "2026-11-20"});
    await syncSubscriptionFromEnrollment(db(fake), "c1", "e1", at("2026-10-20"));
    await runTrainingCenterBillingCore(db(fake), deps("2026-11-02").deps);
    assert.equal(doc(fake, `${C}/invoices/sub_e1_2026-11`), undefined);
    assert.deepEqual(doc(fake, SUB)!["skippedCycles"], ["2026-11"]);
    await runTrainingCenterBillingCore(db(fake), deps("2026-11-20").deps);
    assert.equal(doc(fake, ENR)!["status"], "active");
    assert.equal(doc(fake, SUB)!["status"], "active");
  });

  it("cancela no fim do ciclo: não gera o ciclo do cancelamento e encerra no vencimento", async () => {
    const fake = seed();
    await withSub(fake);
    fake.seedDoc(SUB, {...doc(fake, SUB), status: "canceling", cancelAt: "2026-11-05"});
    await runTrainingCenterBillingCore(db(fake), deps("2026-11-02").deps);
    assert.equal(doc(fake, `${C}/invoices/sub_e1_2026-11`), undefined);
    await runTrainingCenterBillingCore(db(fake), deps("2026-11-05").deps);
    assert.equal(doc(fake, ENR)!["status"], "cancelled");
    assert.equal(doc(fake, ENR)!["cancelReason"], "end_of_cycle");
    assert.equal(doc(fake, SUB)!["status"], "cancelled");
    assert.equal(doc(fake, CLS)!["seatsTaken"], 2);
  });

  it("pacote vencido é concluído e libera a vaga", async () => {
    const fake = seed({enrollment: {creditsLeft: 4, contract: {planType: "class_pack", planName: "10 aulas", validityDays: 30, contractedAt: "2026-09-01"}}});
    await runTrainingCenterBillingCore(db(fake), deps("2026-10-05").deps);
    assert.equal(doc(fake, ENR)!["status"], "completed");
    assert.equal(doc(fake, ENR)!["cancelReason"], "pack_expired");
    assert.equal(doc(fake, CLS)!["seatsTaken"], 2);
  });
});

describe("callables", () => {
  it("mudar de plano agora cobra o proporcional e troca o contrato", async () => {
    const fake = seed();
    await withSub(fake);
    const {deps: d, calls} = deps("2026-10-21");
    const r = await changeSubscriptionPlanCore(db(fake), "owner", {centerId: "c1", subscriptionId: "e1", planId: "m3", when: "now"}, d);
    assert.equal(r.chargedCents, Math.round((10000 * 15) / 31));
    assert.equal(doc(fake, `${C}/invoices/e1_plano_2026-10-21`)!["amountCents"], r.chargedCents);
    assert.equal(calls.created.length, 1);
    assert.equal(doc(fake, SUB)!["priceCents"], 42000);
    assert.equal((doc(fake, ENR)!["contract"] as Record<string, unknown>)["priceCents"], 42000);
    assert.equal(doc(fake, ENR)!["planId"], "m3");
  });

  it("mudar no próximo ciclo: a cobrança do ciclo já sai com o preço novo", async () => {
    const fake = seed();
    await withSub(fake);
    await changeSubscriptionPlanCore(db(fake), "owner", {centerId: "c1", subscriptionId: "e1", planId: "m3", when: "next_cycle"}, deps("2026-10-21").deps);
    assert.equal(doc(fake, SUB)!["priceCents"], 32000);
    await runTrainingCenterBillingCore(db(fake), deps("2026-11-02").deps);
    assert.equal(doc(fake, `${C}/invoices/sub_e1_2026-11`)!["amountCents"], 42000);
    assert.equal(doc(fake, SUB)!["pendingPlanChange"], null);
    assert.equal(doc(fake, ENR)!["planId"], "m3");
  });

  it("com mensalidade vencida, só no próximo ciclo; recepção não muda plano", async () => {
    const fake = seed();
    await withSub(fake);
    await runTrainingCenterBillingCore(db(fake), deps("2026-11-02").deps);
    await assert.rejects(
      changeSubscriptionPlanCore(db(fake), "owner", {centerId: "c1", subscriptionId: "e1", planId: "m3", when: "now"}, deps("2026-11-10").deps),
      /novembro está em aberto/,
    );
    await assert.rejects(
      changeSubscriptionPlanCore(db(fake), "recep", {centerId: "c1", subscriptionId: "e1", planId: "m3", when: "next_cycle"}, deps("2026-11-10").deps),
      /owner ou admin/,
    );
  });

  it("cobrar agora antecipa o ciclo quando não há nada em aberto", async () => {
    const fake = seed();
    await withSub(fake);
    const {deps: d, calls} = deps("2026-10-20");
    const r = await chargeSubscriptionNowCore(db(fake), "owner", {centerId: "c1", subscriptionId: "e1"}, d);
    assert.equal(r.invoiceId, "sub_e1_2026-11");
    assert.equal(r.generated, true);
    assert.equal(r.invoiceUrl, "https://asaas/i/pay_1");
    assert.equal(calls.pushed.length, 1);
    assert.equal(doc(fake, SUB)!["nextChargeDate"], "2026-12-05");
  });
});

describe("textos", () => {
  it("aviso de bloqueio cita a data", () => {
    const n = dunningNotice(3, {centerName: "CT", cycle: "2026-10", amount: "R$ 320,00", blockDay: "25/10"});
    assert.match(n.body, /bloqueia em 25\/10/);
    assert.equal(Timestamp.now() instanceof Timestamp, true);
  });
});

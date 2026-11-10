import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {updateArenaCrmCore} from "./arena-crm";
import {
  linkIsStale,
  parseCrmPaymentRef,
  processArenaCrmAsaasNotification,
  processedPaymentRef,
  reconcileCrmPaymentLinks,
  type CrmBillingDeps,
} from "./arena-crm-billing";
import {planContractReminders, DEFAULT_REMINDER_SETTINGS} from "./arena-crm-reminders-model";
import {contractFromDoc} from "./arena-crm";

const NOW = new Date("2026-11-10T15:00:00Z");

async function rejectsWith(promise: Promise<unknown>, code: string, msg?: RegExp): Promise<void> {
  await assert.rejects(promise, (err: {code?: string; message?: string}) => {
    assert.equal(err.code, code, `esperava ${code}, veio ${err.code} (${err.message})`);
    if (msg) assert.match(err.message ?? "", msg);
    return true;
  });
}

function fakeDeps(o: Partial<CrmBillingDeps> = {}) {
  const calls = {created: [] as Array<{linkId: string; valueReais: number}>, deleted: [] as string[], refunded: [] as string[], registered: [] as string[]};
  let seq = 0;
  const deps: CrmBillingDeps = {
    resolveCustomer: async () => "cus_1",
    registerCustomer: async (_uid, cpf) => {
      calls.registered.push(cpf);
      return "cus_2";
    },
    createPayment: async (input) => {
      calls.created.push({linkId: input.linkId, valueReais: input.valueReais});
      seq += 1;
      return {paymentId: `pay_${seq}`, invoiceUrl: `https://asaas/i/${seq}`, status: "PENDING"};
    },
    deletePayment: async (id) => {
      calls.deleted.push(id);
    },
    getPayment: async () => ({status: "PENDING"}),
    refund: async (id) => {
      calls.refunded.push(id);
    },
    now: () => NOW,
    ...o,
  };
  return {deps, calls};
}

function seed(arena: Record<string, unknown> = {}): FakeFirestore {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/arena1", {managerUserId: "owner", name: "Arena CFC", onlinePaymentEnabled: true, payoutPixKey: "pix@arena.com.br", ...arena});
  fake.seedDoc("users/owner", {fullName: "Bruna Lima"});
  fake.seedDoc("users/u1", {fullName: "Rafael Moura"});
  fake.seedDoc("arenaCrmContracts/c1", {
    arenaId: "arena1", customerKey: "a:u1", athleteId: "u1", customerName: "Rafael Moura", planName: "Noite 2x",
    period: "monthly", dueDay: 5, timesPerWeek: 2, monthlyPriceReais: 260, startDate: "2026-09-05", autoRenew: true,
    paidInstallments: 1, status: "active",
  });
  return fake;
}

const db = (f: FakeFirestore) => f as unknown as Firestore;
const link = (installments = 2, extra: Record<string, unknown> = {}) =>
  ({arenaId: "arena1", op: "createPaymentLink", contractId: "c1", installments, ...extra});

describe("gerar link de pagamento", () => {
  it("cria a cobrança das parcelas em aberto e espelha no contrato", async () => {
    const fake = seed();
    const {deps, calls} = fakeDeps();
    const r = await updateArenaCrmCore(db(fake), "owner", link(2), NOW, deps) as {linkId: string; invoiceUrl: string; amountReais: number};
    assert.equal(r.amountReais, 520);
    assert.equal(r.invoiceUrl, "https://asaas/i/1");
    assert.deepEqual(calls.created, [{linkId: r.linkId, valueReais: 520}]);
    const mirror = fake.store.get("arenaCrmContracts/c1")!["onlineLink"] as Record<string, unknown>;
    assert.equal(mirror["fromInstallment"], 1);
    assert.equal(mirror["installments"], 2);
    assert.equal(mirror["byName"], "Bruna Lima");
    assert.equal(fake.store.get(`arenaCrmPaymentLinks/${r.linkId}`)!["state"], "open");
  });

  it("pedir o mesmo link de novo devolve o aberto; outro número de parcelas troca (apaga o anterior)", async () => {
    const fake = seed();
    const {deps, calls} = fakeDeps();
    const a = await updateArenaCrmCore(db(fake), "owner", link(2), NOW, deps) as {linkId: string; reused: boolean};
    const again = await updateArenaCrmCore(db(fake), "owner", link(2), NOW, deps) as {linkId: string; reused: boolean};
    assert.equal(again.linkId, a.linkId);
    assert.equal(again.reused, true);
    const b = await updateArenaCrmCore(db(fake), "owner", link(1), NOW, deps) as {linkId: string};
    assert.notEqual(b.linkId, a.linkId);
    assert.deepEqual(calls.deleted, ["pay_1"]);
    assert.equal(fake.store.get(`arenaCrmPaymentLinks/${a.linkId}`)!["state"], "void");
  });

  it("sem CPF pede o CPF; com CPF registra o cliente", async () => {
    const fake = seed();
    const {deps, calls} = fakeDeps({resolveCustomer: async () => null});
    await rejectsWith(updateArenaCrmCore(db(fake), "owner", link(1), NOW, deps), "failed-precondition", /CPF/);
    await rejectsWith(updateArenaCrmCore(db(fake), "owner", link(1, {cpf: "123.456"}), NOW, deps), "invalid-argument");
    await updateArenaCrmCore(db(fake), "owner", link(1, {cpf: "529.982.247-25"}), NOW, deps);
    assert.deepEqual(calls.registered, ["52998224725"]);
  });

  it("arena sem pagamento online, cliente sem app e quem não é da equipe ficam de fora", async () => {
    const {deps} = fakeDeps();
    await rejectsWith(updateArenaCrmCore(db(seed({onlinePaymentEnabled: false})), "owner", link(1), NOW, deps), "failed-precondition", /pagamento online/);
    const noApp = seed();
    noApp.seedDoc("arenaCrmContracts/c1", {...noApp.store.get("arenaCrmContracts/c1")!, athleteId: null, customerKey: "n:joao"});
    await rejectsWith(updateArenaCrmCore(db(noApp), "owner", link(1), NOW, deps), "failed-precondition", /conta no app/);
    await rejectsWith(updateArenaCrmCore(db(seed()), "stranger", link(1), NOW, deps), "permission-denied");
  });

  it("baixa manual e cancelamento tiram o link do ar", async () => {
    const fake = seed();
    const {deps, calls} = fakeDeps();
    const a = await updateArenaCrmCore(db(fake), "owner", link(2), NOW, deps) as {linkId: string};
    await updateArenaCrmCore(db(fake), "owner", {arenaId: "arena1", op: "registerPayment", contractId: "c1", installments: 1, method: "cash"}, NOW, deps);
    assert.deepEqual(calls.deleted, ["pay_1"]);
    assert.equal(fake.store.get("arenaCrmContracts/c1")!["onlineLink"], null);
    assert.equal(fake.store.get(`arenaCrmPaymentLinks/${a.linkId}`)!["voidReason"], "paid_manually");

    await updateArenaCrmCore(db(fake), "owner", link(1), NOW, deps);
    await updateArenaCrmCore(db(fake), "owner", {arenaId: "arena1", op: "cancelPaymentLink", contractId: "c1"}, NOW, deps);
    assert.deepEqual(calls.deleted, ["pay_1", "pay_2"]);
  });
});

describe("webhook do link", () => {
  async function openLink(fake: FakeFirestore) {
    const {deps} = fakeDeps();
    return await updateArenaCrmCore(db(fake), "owner", link(2), NOW, deps) as {linkId: string};
  }

  it("Pix recebido: dá baixa nas 2 parcelas, registra o pagamento e credita o caixa (uma vez só)", async () => {
    const fake = seed();
    const {linkId} = await openLink(fake);
    const {deps} = fakeDeps();
    const payment = {status: "RECEIVED", billingType: "PIX", value: 520, netValue: 519.01, externalReference: `arenaCrmPayment:${linkId}`};
    await processArenaCrmAsaasNotification(db(fake), "pay_1", payment, processedPaymentRef(db(fake), "pay_1"), deps);
    await processArenaCrmAsaasNotification(db(fake), "pay_1", payment, processedPaymentRef(db(fake), "pay_1"), deps);
    const contract = fake.store.get("arenaCrmContracts/c1")!;
    assert.equal(contract["paidInstallments"], 3);
    assert.equal(contract["onlineLink"], null);
    const payments = [...fake.store.entries()].filter(([p]) => p.startsWith("arenaCrmContracts/c1/payments/"));
    assert.equal(payments.length, 1);
    assert.equal(payments[0]![1]["method"], "online");
    assert.equal(payments[0]![1]["createdByName"], "Pix online");
    const wallet = fake.store.get("arenaWallets/arena1")!;
    assert.ok(Number(wallet["availableReais"]) > 0 && Number(wallet["availableReais"]) < 520);
  });

  it("pago depois de baixa manual vira estorno", async () => {
    const fake = seed();
    const {linkId} = await openLink(fake);
    fake.seedDoc("arenaCrmContracts/c1", {...fake.store.get("arenaCrmContracts/c1")!, paidInstallments: 2});
    const {deps, calls} = fakeDeps();
    await processArenaCrmAsaasNotification(db(fake), "pay_1",
      {status: "RECEIVED", billingType: "PIX", value: 520, externalReference: `arenaCrmPayment:${linkId}`},
      processedPaymentRef(db(fake), "pay_1"), deps);
    assert.deepEqual(calls.refunded, ["pay_1"]);
    assert.equal(fake.store.get("arenaCrmContracts/c1")!["paidInstallments"], 2);
  });

  it("varredura acha o link pago sem webhook", async () => {
    const fake = seed();
    const {linkId} = await openLink(fake);
    const {deps} = fakeDeps({getPayment: async () => ({status: "RECEIVED", billingType: "PIX", value: 520, externalReference: `arenaCrmPayment:${linkId}`})});
    assert.equal(await reconcileCrmPaymentLinks(db(fake), "arena1", deps), 1);
    assert.equal(fake.store.get("arenaCrmContracts/c1")!["paidInstallments"], 3);
  });

  it("lembrete de cobrança leva o link quando ele cobre a parcela", async () => {
    const fake = seed();
    await openLink(fake);
    const c = contractFromDoc("c1", fake.store.get("arenaCrmContracts/c1")!);
    const r = planContractReminders(c, "2026-10-12", "Arena CFC", "2026-10-10", DEFAULT_REMINDER_SETTINGS)[0]!;
    assert.equal(r.kind, "overdue_7");
    assert.equal(r.invoiceUrl, "https://asaas/i/1");
    assert.match(r.body, /Toque para pagar por Pix ou cartão\.$/);
  });

  it("referência e link velho", () => {
    assert.equal(parseCrmPaymentRef("arenaCrmPayment:abc"), "abc");
    assert.equal(parseCrmPaymentRef("arenaSchedulePayment:abc"), null);
    const l = {linkId: "l", invoiceUrl: "u", fromInstallment: 1, installments: 2, amountReais: 520, createdAt: "", byName: null};
    assert.equal(linkIsStale(l, {status: "active", paidInstallments: 1}), false);
    assert.equal(linkIsStale(l, {status: "active", paidInstallments: 2}), true);
    assert.equal(linkIsStale(l, {status: "canceled", paidInstallments: 1}), true);
  });
});

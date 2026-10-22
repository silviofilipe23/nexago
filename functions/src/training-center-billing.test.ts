import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  applyCenterInvoicePayment,
  invoiceNeedsProviderVoid,
  issueCenterInvoicePaymentCore,
  queryCenterInvoiceProviderCore,
  releaseExpiredHold,
  resendCenterInvoicePixCore,
  sweepTrainingCenterBillingCore,
  voidCenterInvoicePayment,
  type CenterBillingDeps,
} from "./training-center-billing";
import {
  centerInvoiceRef,
  centerSplitPercent,
  holdExpired,
  methodFromBillingType,
  nextProviderCheck,
  parseCenterInvoiceRef,
  providerDueDate,
  providerOutcome,
} from "./training-center-billing-model";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";

const NOW = new Date("2026-10-22T15:00:00Z");
const C = "trainingCenters/c1";
const INV = `${C}/invoices/i1`;
const ENR = `${C}/enrollments/e1`;
const CLS = `${C}/classes/k1`;
const PROCESSED = (id: string) => `artifacts/volley-track-2dd3b/public/data/asaas_processed_payments/${id}`;

function makeDb() {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function seed(fake: FakeFirestore, opts: {invoice?: Record<string, unknown>; enrollment?: Record<string, unknown>; center?: Record<string, unknown>} = {}) {
  fake.seedDoc(C, {name: "CT Praia", status: "active", receivingConnected: true, ...opts.center});
  fake.seedDoc("trainingCenterReceiving/c1", {walletId: "wal_ct", asaasEnv: "sandbox"});
  fake.seedDoc(`${C}/centerMembers/owner`, {uid: "owner", role: "center_owner", status: "active", displayName: "Ana"});
  fake.seedDoc(`${C}/centerMembers/recep`, {uid: "recep", role: "receptionist", status: "active", displayName: "Rui"});
  fake.seedDoc(`${C}/students/s1`, {name: "Bia", uid: "athlete1", email: "bia@x.com"});
  fake.seedDoc(CLS, {name: "Iniciante A", capacity: 8, seatsTaken: 5, rosterStudentIds: ["s0", "s1"]});
  fake.seedDoc(ENR, {
    studentId: "s1", studentName: "Bia", classId: "k1", className: "Iniciante A", status: "pending",
    holdUntil: Timestamp.fromDate(new Date("2026-10-23T15:00:00Z")), ...opts.enrollment,
  });
  fake.seedDoc(INV, {
    studentId: "s1", enrollmentId: "e1", payerName: "Bia", reference: "Mensal 2x · out", amountCents: 32000,
    dueDate: "2026-10-25", status: "pending", method: null, providerRef: "", events: [{type: "created", title: "Cobrança criada"}],
    approvedAt: null, refundedCents: 0, ...opts.invoice,
  });
}

interface Calls {
  created: Array<Parameters<CenterBillingDeps["createPayment"]>[0]>;
  deleted: string[];
  refunded: string[];
  pushed: Array<{userId: string; data: Record<string, string>}>;
  customers: Array<Parameters<CenterBillingDeps["resolveCustomer"]>[0]>;
}

function deps(over: Partial<CenterBillingDeps> = {}, payment: AsaasPaymentDetails = {}): {deps: CenterBillingDeps; calls: Calls} {
  const calls: Calls = {created: [], deleted: [], refunded: [], pushed: [], customers: []};
  return {
    calls,
    deps: {
      now: () => NOW,
      env: () => "sandbox",
      resolveCustomer: async (input) => {
        calls.customers.push(input);
        return "cus_1";
      },
      createPayment: async (input) => {
        calls.created.push(input);
        return {paymentId: "pay_1", invoiceUrl: "https://asaas/i/pay_1", status: "PENDING"};
      },
      deletePayment: async (id) => {
        calls.deleted.push(id);
      },
      getPayment: async () => ({status: "PENDING", externalReference: centerInvoiceRef("c1", "i1"), ...payment}),
      pixPayload: async () => "00020126PIX",
      refund: async (id) => {
        calls.refunded.push(id);
      },
      notify: async (input) => {
        calls.pushed.push({userId: input.userId, data: input.data});
      },
      ...over,
    },
  };
}

function inv(fake: FakeFirestore) {
  return fake.store.get(INV) as Record<string, unknown> & {events: Array<{type: string; title: string; detail: string}>};
}

function audits(fake: FakeFirestore) {
  return [...fake.store.entries()].filter(([p]) => p.startsWith(`${C}/auditLogs/`)).map(([, d]) => d);
}

function paid(status = "RECEIVED", billingType = "PIX"): AsaasPaymentDetails {
  return {id: "pay_1", status, billingType, value: 320, externalReference: centerInvoiceRef("c1", "i1")};
}

const processed = (db: Firestore, id = "pay_1") => (db as unknown as FakeFirestore).doc(PROCESSED(id)) as unknown as DocumentReference;

describe("training-center-billing-model", () => {
  it("referência ida e volta, e recusa lixo", () => {
    assert.deepEqual(parseCenterInvoiceRef(centerInvoiceRef("c1", "i1")), {centerId: "c1", invoiceId: "i1"});
    assert.equal(parseCenterInvoiceRef("trainingCenterInvoice:c1"), null);
    assert.equal(parseCenterInvoiceRef("trainingCenterInvoice:c1:i1:x"), null);
    assert.equal(parseCenterInvoiceRef("trainingCenterInvoice:c/1:i1"), null);
    assert.equal(parseCenterInvoiceRef("arenaClassPayment:g1"), null);
  });

  it("status do Asaas → desfecho", () => {
    assert.equal(providerOutcome("RECEIVED", false), "paid");
    assert.equal(providerOutcome("confirmed", false), "paid");
    assert.equal(providerOutcome("RECEIVED_IN_CASH", false), "paid");
    assert.equal(providerOutcome("REFUNDED", false), "refunded");
    assert.equal(providerOutcome("CHARGEBACK_REQUESTED", false), "disputed");
    assert.equal(providerOutcome("OVERDUE", false), "overdue");
    assert.equal(providerOutcome("PENDING", false), "waiting");
    assert.equal(providerOutcome("RECEIVED", true), "deleted");
  });

  it("forma de pagamento, split, vencimento e próxima consulta", () => {
    assert.equal(methodFromBillingType("PIX"), "pix");
    assert.equal(methodFromBillingType("CREDIT_CARD"), "card");
    assert.equal(methodFromBillingType("BOLETO"), "other");
    assert.equal(centerSplitPercent(5), 95);
    assert.equal(centerSplitPercent(-3), 100);
    assert.equal(centerSplitPercent(Number.NaN), 95);
    assert.equal(providerDueDate("2026-10-25", "2026-10-22"), "2026-10-25");
    assert.equal(providerDueDate("2026-10-01", "2026-10-22"), "2026-10-22");
    assert.equal(providerDueDate("", "2026-10-22"), "2026-10-22");
    const t0 = NOW.getTime();
    assert.equal(nextProviderCheck(t0, t0 + 3_600_000) - (t0 + 3_600_000), 2 * 3_600_000);
    assert.equal(nextProviderCheck(t0, t0 + 30 * 3_600_000) - (t0 + 30 * 3_600_000), 12 * 3_600_000);
  });

  it("reserva vencida só para pendente com holdUntil no passado", () => {
    const now = NOW.getTime();
    assert.equal(holdExpired({status: "pending"}, now, now - 1), true);
    assert.equal(holdExpired({status: "pending"}, now, now + 1), false);
    assert.equal(holdExpired({status: "pending"}, now, null), false);
    assert.equal(holdExpired({status: "active"}, now, now - 1), false);
  });
});

describe("issueCenterInvoicePaymentCore", () => {
  it("gera a fatura com split, grava providerRef + evento provider, audita e avisa o aluno", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {deps: d, calls} = deps();
    const r = await issueCenterInvoicePaymentCore(db, "owner", {centerId: "c1", invoiceId: "i1"}, d);
    assert.deepEqual(r, {invoiceUrl: "https://asaas/i/pay_1", providerRef: "pay_1", existing: false});
    assert.equal(calls.created.length, 1);
    const c = calls.created[0]!;
    assert.equal(c.externalReference, "trainingCenterInvoice:c1:i1");
    assert.equal(c.idempotencyKey, "center-inv-sandbox-c1-i1-0");
    assert.equal(c.valueReais, 320);
    assert.equal(c.walletId, "wal_ct");
    assert.equal(c.splitPercent, 95);
    assert.equal(c.dueDate, "2026-10-25");
    assert.equal(calls.customers[0]!.uid, "athlete1");
    const i = inv(fake);
    assert.equal(i["providerRef"], "pay_1");
    assert.equal(i["providerUrl"], "https://asaas/i/pay_1");
    assert.equal(i["status"], "pending", "emitir não é receber");
    assert.equal((i["providerCheckAt"] as Timestamp).toMillis(), NOW.getTime() + 2 * 3_600_000);
    assert.equal(i.events.slice(-1)[0]!.type, "provider");
    assert.equal(audits(fake).length, 1);
    assert.equal(calls.pushed[0]!.userId, "athlete1");
    assert.equal(calls.pushed[0]!.data["webUrl"], "https://asaas/i/pay_1");
  });

  it("já gerada: devolve a existente sem criar outra", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_0", providerUrl: "https://asaas/i/pay_0"}});
    const {deps: d, calls} = deps();
    const r = await issueCenterInvoicePaymentCore(db, "owner", {centerId: "c1", invoiceId: "i1"}, d);
    assert.deepEqual(r, {invoiceUrl: "https://asaas/i/pay_0", providerRef: "pay_0", existing: true});
    assert.equal(calls.created.length, 0);
  });

  it("recusa recepção, centro sem recebimento, cobrança não pendente e valor abaixo do mínimo", async () => {
    const cases: Array<[Parameters<typeof seed>[1], string, RegExp]> = [
      [{}, "recep", /owner ou admin/],
      [{center: {receivingConnected: false}}, "owner", /recebimento/],
      [{center: {status: "pending"}}, "owner", /ativado/],
      [{invoice: {status: "approved"}}, "owner", /não está mais pendente/],
      [{invoice: {amountCents: 300}}, "owner", /R\$ 5,00/],
    ];
    for (const [opts, uid, msg] of cases) {
      const {fake, db} = makeDb();
      seed(fake, opts);
      const {deps: d, calls} = deps();
      await assert.rejects(issueCenterInvoicePaymentCore(db, uid, {centerId: "c1", invoiceId: "i1"}, d), msg);
      assert.equal(calls.created.length, 0);
    }
  });

  it("sem CPF do pagador: pede o CPF; com CPF inválido recusa antes do Asaas", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {deps: d} = deps({resolveCustomer: async () => null});
    await assert.rejects(issueCenterInvoicePaymentCore(db, "owner", {centerId: "c1", invoiceId: "i1"}, d), /CPF do pagador/);
    await assert.rejects(issueCenterInvoicePaymentCore(db, "owner", {centerId: "c1", invoiceId: "i1", cpfCnpj: "123"}, d), /inválido/);
  });

  it("vencida sai com vencimento hoje; tentativa nova muda a chave de idempotência", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {dueDate: "2026-10-01", providerAttempt: 2}});
    const {deps: d, calls} = deps();
    await issueCenterInvoicePaymentCore(db, "owner", {centerId: "c1", invoiceId: "i1"}, d);
    assert.equal(calls.created[0]!.dueDate, "2026-10-22");
    assert.equal(calls.created[0]!.idempotencyKey, "center-inv-sandbox-c1-i1-2");
  });

  it("cancelada enquanto a fatura nascia: apaga a fatura no Asaas", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {deps: d, calls} = deps({
      createPayment: async () => {
        fake.store.set(INV, {...inv(fake), status: "cancelled"});
        return {paymentId: "pay_1", invoiceUrl: "u", status: "PENDING"};
      },
    });
    await assert.rejects(issueCenterInvoicePaymentCore(db, "owner", {centerId: "c1", invoiceId: "i1"}, d), /mudou/);
    assert.deepEqual(calls.deleted, ["pay_1"]);
    assert.equal(inv(fake)["providerRef"], "");
  });
});

describe("applyCenterInvoicePayment (webhook)", () => {
  it("pago: aprova a cobrança e ativa a matrícula pendente na mesma transação", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_1"}});
    const {deps: d} = deps();
    const r = await applyCenterInvoicePayment(db, "pay_1", paid(), processed(db), "webhook", d);
    assert.equal(r.outcome, "approved");
    const i = inv(fake);
    assert.equal(i["status"], "approved");
    assert.equal(i["method"], "pix");
    assert.ok(i["approvedAt"] instanceof Timestamp);
    assert.ok(i["providerApprovedAt"] instanceof Timestamp);
    assert.equal(i["providerCheckAt"], null);
    assert.equal(i.events.slice(-1)[0]!.type, "webhook");
    const e = fake.store.get(ENR)!;
    assert.equal(e["status"], "active");
    assert.equal(e["holdUntil"], null);
    assert.equal(audits(fake).length, 1);
    assert.equal(fake.store.get(PROCESSED("pay_1"))!["outcome"], "approved");
  });

  it("idempotente: o mesmo webhook de novo não mexe; cartão CONFIRMED→RECEIVED vira um evento sem efeito", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_1"}});
    const {deps: d} = deps();
    await applyCenterInvoicePayment(db, "pay_1", paid("CONFIRMED", "CREDIT_CARD"), processed(db), "webhook", d);
    const afterFirst = inv(fake).events.length;
    const again = await applyCenterInvoicePayment(db, "pay_1", paid("CONFIRMED", "CREDIT_CARD"), processed(db), "webhook", d);
    assert.equal(again.outcome, "duplicate");
    assert.equal(inv(fake).events.length, afterFirst, "reenvio idêntico não polui o histórico");
    await applyCenterInvoicePayment(db, "pay_1", paid("RECEIVED", "CREDIT_CARD"), processed(db), "webhook", d);
    await applyCenterInvoicePayment(db, "pay_1", paid("RECEIVED", "CREDIT_CARD"), processed(db), "webhook", d);
    const evs = inv(fake).events;
    assert.equal(evs.length, afterFirst + 1);
    assert.equal(evs.slice(-1)[0]!.type, "duplicate");
    assert.equal(inv(fake)["method"], "card");
    assert.equal(audits(fake).length, 1);
  });

  it("matrícula já ativa/cancelada não muda; cobrança avulsa aprova sem matrícula", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_1", enrollmentId: null}});
    const {deps: d} = deps();
    await applyCenterInvoicePayment(db, "pay_1", paid(), processed(db), "webhook", d);
    assert.equal(inv(fake)["status"], "approved");
    assert.equal(fake.store.get(ENR)!["status"], "pending");
  });

  it("pago com a cobrança cancelada (ou aprovada à mão): estorna uma vez só", async () => {
    for (const status of ["cancelled", "approved"]) {
      const {fake, db} = makeDb();
      seed(fake, {invoice: {providerRef: "pay_1", status}});
      const {deps: d, calls} = deps();
      const r = await applyCenterInvoicePayment(db, "pay_1", paid(), processed(db), "webhook", d);
      assert.equal(r.outcome, "refund_stale");
      await applyCenterInvoicePayment(db, "pay_1", paid(), processed(db), "webhook", d);
      assert.deepEqual(calls.refunded, ["pay_1"]);
      assert.equal(inv(fake)["status"], status, "estorno não reabre nem aprova");
      assert.equal(fake.store.get(ENR)!["status"], "pending");
      assert.ok(fake.store.get(PROCESSED("pay_1"))!["refundedAt"]);
    }
  });

  it("pagamento de fatura antiga (providerRef trocado) também estorna", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_2"}});
    const {deps: d, calls} = deps();
    const r = await applyCenterInvoicePayment(db, "pay_1", paid(), processed(db), "webhook", d);
    assert.equal(r.outcome, "refund_stale");
    assert.equal(inv(fake)["status"], "pending");
    assert.deepEqual(calls.refunded, ["pay_1"]);
  });

  it("estorno/contestação no provedor só vale para cobrança aprovada por ele", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_1"}});
    const {deps: d} = deps();
    await applyCenterInvoicePayment(db, "pay_1", paid(), processed(db), "webhook", d);
    await applyCenterInvoicePayment(db, "pay_1", paid("CHARGEBACK_REQUESTED"), processed(db), "webhook", d);
    assert.equal(inv(fake)["status"], "disputed");
    await applyCenterInvoicePayment(db, "pay_1", paid("REFUNDED"), processed(db), "webhook", d);
    assert.equal(inv(fake)["status"], "refunded");
    assert.equal(inv(fake)["refundedCents"], 32000);

    const manual = makeDb();
    seed(manual.fake, {invoice: {providerRef: "pay_1", status: "approved"}});
    await applyCenterInvoicePayment(manual.db, "pay_1", paid("REFUNDED"), processed(manual.db), "webhook", d);
    assert.equal(inv(manual.fake)["status"], "approved", "estorno do nosso pagamento duplicado não estorna a baixa manual");
  });

  it("fatura removida no Asaas: limpa o providerRef e abre tentativa nova", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_1", providerUrl: "u", providerAttempt: 0}});
    const {deps: d} = deps();
    const r = await applyCenterInvoicePayment(db, "pay_1", {...paid("PENDING"), deleted: true}, processed(db), "webhook", d);
    assert.equal(r.outcome, "cleared");
    assert.equal(inv(fake)["providerRef"], "");
    assert.equal(inv(fake)["providerAttempt"], 1);
    assert.equal(inv(fake)["status"], "pending");
  });

  it("OVERDUE e PENDING só espelham o status; referência alheia é ignorada", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_1", providerStatus: "PENDING"}});
    const {deps: d} = deps();
    await applyCenterInvoicePayment(db, "pay_1", paid("OVERDUE"), processed(db), "webhook", d);
    assert.equal(inv(fake)["status"], "pending");
    assert.equal(inv(fake)["providerStatus"], "OVERDUE");
    const r = await applyCenterInvoicePayment(db, "pay_1", {...paid(), externalReference: "arenaClassPayment:g"}, processed(db), "webhook", d);
    assert.equal(r.outcome, "ignored");
  });

  it("cobrança inexistente: marca estorno manual", async () => {
    const {fake, db} = makeDb();
    const {deps: d, calls} = deps();
    const r = await applyCenterInvoicePayment(db, "pay_1", paid(), processed(db), "webhook", d);
    assert.equal(r.outcome, "orphan");
    assert.equal(fake.store.get(PROCESSED("pay_1"))!["refundRequired"], true);
    assert.equal(calls.refunded.length, 0);
  });
});

describe("consultar provedor e reenviar Pix", () => {
  it("consulta pago: aprova pelo GET com evento query", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_1"}});
    const {deps: d} = deps({}, {status: "RECEIVED", billingType: "PIX"});
    const r = await queryCenterInvoiceProviderCore(db, "owner", {centerId: "c1", invoiceId: "i1"}, d);
    assert.equal(r.outcome, "approved");
    assert.equal(inv(fake)["status"], "approved");
    assert.equal(inv(fake).events.slice(-1)[0]!.type, "query");
    assert.equal(fake.store.get(ENR)!["status"], "active");
  });

  it("consulta pendente: registra 'Provedor consultado' em nome de quem pediu", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_1"}});
    const {deps: d} = deps();
    const r = await queryCenterInvoiceProviderCore(db, "owner", {centerId: "c1", invoiceId: "i1"}, d);
    assert.equal(r.providerStatus, "PENDING");
    const ev = inv(fake).events.slice(-1)[0]! as unknown as Record<string, string>;
    assert.equal(ev["title"], "Provedor consultado");
    assert.equal(ev["byName"], "Ana");
    await assert.rejects(queryCenterInvoiceProviderCore(db, "recep", {centerId: "c1", invoiceId: "i1"}, d), /owner ou admin/);
  });

  it("reenviar Pix: copia-e-cola + push para o aluno com conta", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_1", providerUrl: "https://asaas/i/pay_1"}});
    const {deps: d, calls} = deps();
    const r = await resendCenterInvoicePixCore(db, "owner", {centerId: "c1", invoiceId: "i1"}, d);
    assert.deepEqual(r, {invoiceUrl: "https://asaas/i/pay_1", pixPayload: "00020126PIX", pushed: true});
    assert.equal(calls.pushed.length, 1);
    assert.equal(inv(fake).events.slice(-1)[0]!.title, "Pix reenviado");
  });

  it("reenviar Pix sem fatura gerada é recusado", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {deps: d} = deps();
    await assert.rejects(resendCenterInvoicePixCore(db, "owner", {centerId: "c1", invoiceId: "i1"}, d), /pendente gerada/);
  });
});

describe("gatilho: apagar a fatura quando a cobrança sai de pendente sem o provedor", () => {
  it("decide quando apagar", () => {
    const before = {status: "pending", providerRef: "pay_1"};
    assert.equal(invoiceNeedsProviderVoid(before, {status: "cancelled"}), "pay_1");
    assert.equal(invoiceNeedsProviderVoid(before, {status: "approved"}), "pay_1");
    assert.equal(invoiceNeedsProviderVoid(before, {status: "approved", providerApprovedAt: Timestamp.now()}), null);
    assert.equal(invoiceNeedsProviderVoid(before, {status: "pending"}), null);
    assert.equal(invoiceNeedsProviderVoid({status: "pending", providerRef: ""}, {status: "cancelled"}), null);
    assert.equal(invoiceNeedsProviderVoid({status: "cancelled", providerRef: "pay_1"}, {status: "cancelled"}), null);
  });

  it("apaga e registra; falha vira evento sem derrubar", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_1", status: "cancelled", providerCheckAt: Timestamp.fromDate(NOW)}});
    const {deps: d, calls} = deps();
    assert.equal(await voidCenterInvoicePayment(db, "c1", "i1", "pay_1", d), true);
    assert.deepEqual(calls.deleted, ["pay_1"]);
    assert.equal(inv(fake)["providerCheckAt"], null);
    const {deps: failing} = deps({deletePayment: async () => {
      throw new Error("já paga");
    }});
    assert.equal(await voidCenterInvoicePayment(db, "c1", "i1", "pay_1", failing), false);
    assert.equal(inv(fake).events.slice(-1)[0]!.title, "Fatura não removida do provedor");
  });
});

describe("varredura", () => {
  const expired = Timestamp.fromDate(new Date(NOW.getTime() - 60_000));

  it("reserva vencida sem pagamento: cancela matrícula, devolve a vaga e cancela a cobrança", async () => {
    const {fake, db} = makeDb();
    seed(fake, {enrollment: {holdUntil: expired}, invoice: {providerRef: "pay_1"}});
    const {deps: d} = deps();
    const r = await sweepTrainingCenterBillingCore(db, d);
    assert.equal(r.released, 1);
    const e = fake.store.get(ENR)!;
    assert.equal(e["status"], "cancelled");
    assert.equal(e["holdUntil"], null);
    assert.equal(fake.store.get(CLS)!["seatsTaken"], 4);
    // A lista da chamada perde o aluno junto com a vaga.
    assert.deepEqual(fake.store.get(CLS)!["rosterStudentIds"], ["s0"]);
    assert.equal(inv(fake)["status"], "cancelled");
    assert.equal(inv(fake).events.slice(-1)[0]!.type, "cancel");
    assert.ok(audits(fake).some((a) => a["action"] === "enrollment.hold_expired"));
  });

  it("reserva vencida mas já paga no Asaas: aprova e NÃO solta a vaga", async () => {
    const {fake, db} = makeDb();
    seed(fake, {enrollment: {holdUntil: expired}, invoice: {providerRef: "pay_1"}});
    const {deps: d} = deps({}, {status: "RECEIVED", billingType: "PIX"});
    const r = await sweepTrainingCenterBillingCore(db, d);
    assert.deepEqual({released: r.released, approved: r.approved}, {released: 0, approved: 1});
    assert.equal(fake.store.get(ENR)!["status"], "active");
    assert.equal(fake.store.get(CLS)!["seatsTaken"], 5);
    assert.equal(inv(fake)["status"], "approved");
  });

  it("reserva no prazo, matrícula ativa e doc fora de centro ficam intactos", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    fake.seedDoc("arenas/a1/enrollments/x", {status: "pending", holdUntil: expired});
    const {deps: d} = deps();
    const r = await sweepTrainingCenterBillingCore(db, d);
    assert.equal(r.released, 0);
    assert.equal(fake.store.get(ENR)!["status"], "pending");
    assert.equal(fake.store.get("arenas/a1/enrollments/x")!["status"], "pending");
  });

  it("releaseExpiredHold relê: matrícula ativada no meio não é cancelada", async () => {
    const {fake, db} = makeDb();
    seed(fake, {enrollment: {status: "active", holdUntil: expired}});
    const ref = (fake.doc(ENR) as unknown as DocumentReference);
    assert.equal(await releaseExpiredHold(db, ref, NOW), false);
    assert.equal(fake.store.get(CLS)!["seatsTaken"], 5);
  });

  it("pendente sem confirmação há >2h avisa owner/admin uma vez", async () => {
    const {fake, db} = makeDb();
    seed(fake, {enrollment: {status: "active", holdUntil: null}, invoice: {
      providerRef: "pay_1", providerIssuedAt: Timestamp.fromMillis(NOW.getTime() - 3 * 3600_000),
      providerCheckAt: Timestamp.fromMillis(NOW.getTime() - 60_000),
    }});
    const {deps: d, calls} = deps();
    await sweepTrainingCenterBillingCore(db, d);
    assert.deepEqual(calls.pushed.map((p) => p.userId), ["owner"]);
    assert.ok(inv(fake)["staffAlertedAt"]);
    fake.seedDoc(INV, {...inv(fake), providerCheckAt: Timestamp.fromMillis(NOW.getTime() - 60_000)});
    await sweepTrainingCenterBillingCore(db, d);
    assert.equal(calls.pushed.length, 1);
  });

  it("pendente gerada há >2h: consulta, aprova se pago; senão reagenda a consulta", async () => {
    const {fake, db} = makeDb();
    const issuedAt = Timestamp.fromDate(new Date(NOW.getTime() - 3 * 3_600_000));
    seed(fake, {invoice: {providerRef: "pay_1", providerIssuedAt: issuedAt, providerCheckAt: Timestamp.fromDate(new Date(NOW.getTime() - 1))}});
    const {deps: waiting} = deps();
    const r1 = await sweepTrainingCenterBillingCore(db, waiting);
    assert.equal(r1.checked, 1);
    assert.equal(inv(fake)["status"], "pending");
    assert.equal((inv(fake)["providerCheckAt"] as Timestamp).toMillis(), NOW.getTime() + 2 * 3_600_000);

    fake.store.set(INV, {...inv(fake), providerCheckAt: Timestamp.fromDate(new Date(NOW.getTime() - 1))});
    const {deps: paidDeps} = deps({}, {status: "RECEIVED", billingType: "PIX"});
    const r2 = await sweepTrainingCenterBillingCore(db, paidDeps);
    assert.equal(r2.approved, 1);
    assert.equal(inv(fake)["status"], "approved");
    assert.equal(fake.store.get(ENR)!["status"], "active");
  });

  it("consulta agendada de cobrança que já saiu de pendente só limpa o agendamento", async () => {
    const {fake, db} = makeDb();
    seed(fake, {invoice: {providerRef: "pay_1", status: "cancelled", providerCheckAt: Timestamp.fromDate(new Date(NOW.getTime() - 1))}});
    let gets = 0;
    const {deps: d} = deps({getPayment: async () => {
      gets += 1;
      return paid();
    }});
    await sweepTrainingCenterBillingCore(db, d);
    assert.equal(gets, 0);
    assert.equal(inv(fake)["providerCheckAt"], null);
  });
});

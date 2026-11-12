import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {planAthleteBookingCancel} from "./arena-booking-athlete-cancel";
import {normalizeAthleteCancelPolicy} from "./arena-athlete-cancel-policy";
import {arenaBookingStartAt} from "./arena-booking-start-at";

const START_MS = arenaBookingStartAt("2026-12-10", "19:00").getTime();
const HOUR = 60 * 60 * 1000;
const EARLY = START_MS - 24 * HOUR;

const pixPaid = {
  athleteId: "uA",
  arenaName: "Arena CFC",
  status: "confirmed",
  date: "2026-12-10",
  startTime: "19:00",
  paymentStatus: "paid",
  asaasPaymentId: "pay_main",
  asaasPaidAmount: 70,
  amountPaidOnlineReais: 70,
};

type Opts = {nowMs?: number; uid?: string; shares?: Array<Record<string, unknown> & {id: string}>; lateCancel?: boolean};

function plan(booking: Record<string, unknown>, opts: Opts = {}) {
  return planAthleteBookingCancel({
    bookingId: "b1",
    booking,
    shares: opts.shares ?? [],
    callerUid: opts.uid ?? "uA",
    nowMs: opts.nowMs ?? EARLY,
    lateCancel: opts.lateCancel,
  });
}

function refundsOf(booking: Record<string, unknown>, opts: Opts = {}) {
  const r = plan(booking, opts);
  assert.equal(r.kind, "cancel", JSON.stringify(r));
  return r.kind === "cancel" ? r.refunds : [];
}

const split = {
  ...pixPaid, hasSplitShares: true, paymentStatus: "split_pending",
};
const splitShares = [
  {id: "s1", status: "paid", asaasPaymentId: "pay_s1", asaasPaidAmount: 35, payerAthleteId: "uA"},
  {id: "s2", status: "paid", asaasPaymentId: "pay_s2", asaasPaidAmount: 35, payerAthleteId: "uB"},
  {id: "s3", status: "pending", asaasPaymentId: "pay_s3", payerAthleteId: "uC"},
];

describe("política de cancelamento da arena", () => {
  it("lê integral, parcial e crédito; o resto vira integral", () => {
    assert.deepEqual(normalizeAthleteCancelPolicy({mode: "credit"}), {mode: "credit", refundPercent: 0});
    assert.deepEqual(normalizeAthleteCancelPolicy({mode: "refund", refundPercent: 50}), {mode: "refund", refundPercent: 50});
    assert.deepEqual(normalizeAthleteCancelPolicy({mode: "refund", refundPercent: 33}), {mode: "refund", refundPercent: 100});
    assert.deepEqual(normalizeAthleteCancelPolicy(null), {mode: "refund", refundPercent: 100});
  });
});

describe("cancelamento da reserva pelo atleta", () => {
  it("sem política gravada na reserva: estorno integral do que saiu do bolso", () => {
    assert.deepEqual(refundsOf(pixPaid), [{paymentId: "pay_main", amountReais: 70, partial: false, kind: "booking"}]);
    const card = {...pixPaid, billingType: "CREDIT_CARD", asaasPaymentId: "pay_card"};
    assert.equal(refundsOf(card)[0].paymentId, "pay_card");
  });

  it("integral com cashback: o Asaas devolve o pago em dinheiro (o cashback volta pelo webhook)", () => {
    assert.equal(refundsOf({...pixPaid, asaasPaidAmount: 50, cashbackAppliedReais: 20})[0].amountReais, 50);
  });

  it("parcial: a fração sobre o valor todo, limitada ao que saiu do bolso", () => {
    const half = {...pixPaid, cancelPolicy: {mode: "refund", refundPercent: 50}};
    assert.deepEqual(refundsOf(half), [{paymentId: "pay_main", amountReais: 35, partial: true, kind: "booking"}]);
    // 70 de valor, 60 em dinheiro + 10 de cashback: 75% = 52,50.
    assert.equal(refundsOf({...half, cancelPolicy: {mode: "refund", refundPercent: 75}, asaasPaidAmount: 60})[0].amountReais, 52.5);
    // Quase tudo no cashback: limita ao dinheiro.
    assert.equal(refundsOf({...half, asaasPaidAmount: 10})[0].amountReais, 10);
  });

  it("sinal de 50% pago pelo app: integral devolve o sinal", () => {
    assert.equal(refundsOf({...pixPaid, paymentStatus: "partial", asaasPaidAmount: 35, amountPaidOnlineReais: 35})[0].amountReais, 35);
  });

  it("reserva dividida: estorna cada parte paga, não a cobrança substituída", () => {
    const refunds = refundsOf(split, {shares: splitShares});
    assert.deepEqual(refunds.map((r) => [r.paymentId, r.amountReais, r.shareId]), [["pay_s1", 35, "s1"], ["pay_s2", 35, "s2"]]);
  });

  it("crédito na arena: nada vai ao Asaas, cada pagador ganha o que pagou", () => {
    const credit = {...pixPaid, cancelPolicy: {mode: "credit"}, asaasPaidAmount: 50, cashbackAppliedReais: 20};
    assert.deepEqual(plan(credit), {
      kind: "cancel",
      policy: {mode: "credit", refundPercent: 0},
      refunds: [],
      credits: [{creditId: "wx_b1", athleteId: "uA", amountReais: 70}],
    });
    const r = plan({...split, cancelPolicy: {mode: "credit"}}, {shares: splitShares});
    assert.deepEqual(r.kind === "cancel" && r.credits, [
      {creditId: "wx_b1_s1", athleteId: "uA", amountReais: 35},
      {creditId: "wx_b1_s2", athleteId: "uB", amountReais: 35},
    ]);
  });

  it("pagar na arena: cancela sem estorno nem crédito", () => {
    const onsite = {...pixPaid, paymentStatus: "none", asaasPaymentId: null, amountPaidOnlineReais: 0};
    assert.deepEqual(refundsOf(onsite), []);
    const r = plan({...onsite, cancelPolicy: {mode: "credit"}});
    assert.deepEqual(r.kind === "cancel" && r.credits, []);
  });

  it("retry: estorno já feito ou já registrado pelo webhook não repete", () => {
    assert.deepEqual(refundsOf({...pixPaid, athleteCancelRefunds: {pay_main: {status: "done"}}}), []);
    assert.deepEqual(refundsOf({...pixPaid, appPaymentReversals: {pay_main: {amountReais: 70}}}), []);
    assert.equal(refundsOf({...pixPaid, athleteCancelRefunds: {pay_main: {status: "failed"}}}).length, 1);
  });

  it("aguardando pagamento: vai para o cancelamento do pendente", () => {
    assert.deepEqual(plan({...pixPaid, status: "pending_payment", paymentStatus: "pending"}), {kind: "pending_payment"});
  });

  it("depois do prazo de 6h: recusa e manda falar com a arena", () => {
    const r = plan(pixPaid, {nowMs: START_MS - 6 * HOUR});
    assert.equal(r.kind, "reject");
    assert.match(r.kind === "reject" ? r.message : "", /6h antes.*Arena CFC/);
    assert.equal(plan(pixPaid, {nowMs: START_MS - 6 * HOUR - 1000}).kind, "cancel");
  });

  it("modo professor (lateCancel): fora do prazo cancela sem devolver nada; depois do início, não", () => {
    const late = plan({...pixPaid, cancelPolicy: {mode: "credit"}}, {nowMs: START_MS - HOUR, lateCancel: true});
    assert.equal(late.kind === "cancel" && late.late, true);
    assert.deepEqual(late.kind === "cancel" && [late.refunds, late.credits], [[], []]);
    assert.equal(plan(pixPaid, {nowMs: START_MS, lateCancel: true}).kind, "reject");
    assert.equal(refundsOf(pixPaid, {lateCancel: true}).length, 1);
  });

  it("só o titular, só reserva avulsa e sem escolha de chuva pendente", () => {
    assert.equal(plan(pixPaid, {uid: "uB"}).kind, "reject");
    assert.equal(plan({...pixPaid, recurringBookingId: "r1"}).kind, "reject");
    assert.equal(plan({...pixPaid, isRecurring: true}).kind, "reject");
    assert.equal(plan({...pixPaid, weatherRelease: {status: "pending_choice"}}).kind, "reject");
    assert.equal(plan({...pixPaid, weatherRelease: {status: "kept"}}).kind, "cancel");
  });

  it("já cancelada, encerrada ou sem horário: recusa", () => {
    for (const status of ["canceled", "cancelled", "expired", "completed", "no_show"]) {
      assert.equal(plan({...pixPaid, status}).kind, "reject", status);
    }
    assert.equal(plan({...pixPaid, startTime: ""}).kind, "reject");
  });

  it("pago pelo Mercado Pago (legado): recusa em vez de cancelar sem devolver", () => {
    assert.equal(plan({...pixPaid, asaasPaymentId: null, mercadopagoPaymentId: "mp1"}).kind, "reject");
  });
});

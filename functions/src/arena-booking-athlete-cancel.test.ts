import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {planAthleteBookingCancel} from "./arena-booking-athlete-cancel";
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

function plan(booking: Record<string, unknown>, opts: {nowMs?: number; uid?: string; shares?: Array<Record<string, unknown> & {id: string}>} = {}) {
  return planAthleteBookingCancel({
    booking,
    shares: opts.shares ?? [],
    callerUid: opts.uid ?? "uA",
    nowMs: opts.nowMs ?? EARLY,
  });
}

describe("cancelamento da reserva pelo atleta", () => {
  it("Pix ou cartão pagos no prazo: estorna a cobrança da reserva pelo que saiu do bolso", () => {
    assert.deepEqual(plan(pixPaid), {
      kind: "cancel",
      refunds: [{paymentId: "pay_main", amountReais: 70, kind: "booking"}],
    });
    const card = {...pixPaid, billingType: "CREDIT_CARD", asaasPaymentId: "pay_card"};
    assert.deepEqual(plan(card), {kind: "cancel", refunds: [{paymentId: "pay_card", amountReais: 70, kind: "booking"}]});
  });

  it("cashback usado não entra no estorno do Asaas (volta como saldo pelo webhook)", () => {
    const r = plan({...pixPaid, asaasPaidAmount: 50, cashbackAppliedReais: 20});
    assert.equal(r.kind === "cancel" && r.refunds[0].amountReais, 50);
  });

  it("sinal de 50%: estorna a parte paga pelo app", () => {
    const r = plan({...pixPaid, paymentStatus: "partial", asaasPaidAmount: 35, amountPaidOnlineReais: 35});
    assert.equal(r.kind === "cancel" && r.refunds[0].amountReais, 35);
  });

  it("reserva dividida: estorna cada parte paga, não a cobrança substituída", () => {
    const r = plan({...pixPaid, hasSplitShares: true, paymentStatus: "split_pending"}, {
      shares: [
        {id: "s1", status: "paid", asaasPaymentId: "pay_s1", asaasPaidAmount: 35},
        {id: "s2", status: "pending", asaasPaymentId: "pay_s2"},
        {id: "s3", status: "covered_by_organizer", asaasPaymentId: "pay_s3"},
      ],
    });
    assert.deepEqual(r, {kind: "cancel", refunds: [{paymentId: "pay_s1", amountReais: 35, kind: "share", shareId: "s1"}]});
  });

  it("pagar na arena: cancela sem estorno", () => {
    assert.deepEqual(plan({...pixPaid, paymentStatus: "none", asaasPaymentId: null, amountPaidOnlineReais: 0}),
      {kind: "cancel", refunds: []});
  });

  it("retry: estorno já feito ou já registrado pelo webhook não repete", () => {
    assert.deepEqual(plan({...pixPaid, athleteCancelRefunds: {pay_main: {status: "done"}}}), {kind: "cancel", refunds: []});
    assert.deepEqual(plan({...pixPaid, appPaymentReversals: {pay_main: {amountReais: 70}}}), {kind: "cancel", refunds: []});
    const failed = plan({...pixPaid, athleteCancelRefunds: {pay_main: {status: "failed"}}});
    assert.equal(failed.kind === "cancel" && failed.refunds.length, 1);
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

  it("modo professor (lateCancel): fora do prazo cancela sem estorno; depois do início, não", () => {
    assert.deepEqual(planAthleteBookingCancel({booking: pixPaid, shares: [], callerUid: "uA", nowMs: START_MS - HOUR, lateCancel: true}),
      {kind: "cancel", refunds: [], late: true});
    assert.equal(planAthleteBookingCancel({booking: pixPaid, shares: [], callerUid: "uA", nowMs: START_MS, lateCancel: true}).kind, "reject");
    const early = planAthleteBookingCancel({booking: pixPaid, shares: [], callerUid: "uA", nowMs: EARLY, lateCancel: true});
    assert.equal(early.kind === "cancel" && early.refunds.length, 1);
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
    const mp = {...pixPaid, asaasPaymentId: null, mercadopagoPaymentId: "mp1", amountPaidOnlineReais: 70};
    assert.equal(plan(mp).kind, "reject");
  });
});

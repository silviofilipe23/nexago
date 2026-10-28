import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import type {ResolvedAttribution} from "./squad-attribution";
import {
  applySquadPaymentEvent,
  chargeDiscountCents,
  convertedLabelOf,
  createPendingCommission,
  followerDiscountFor,
  recordChargeDiscount,
  shortAthleteName,
  squadEventForStatus,
} from "./squad-commission-lifecycle";

const NOW = new Date("2026-10-17T15:00:00Z");
const LATER = new Date("2026-10-17T15:20:00Z");

const JOAO: ResolvedAttribution = {
  ambassador: {uid: "jv", displayName: "João Victor", tier: "amb", code: "JOAO10", commissionPct: 10, followerDiscountPct: 10, rulesVersion: 2},
  origin: "code",
};

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function input(over: Record<string, unknown> = {}) {
  return {
    registrationId: "reg1",
    tournamentId: "t1",
    tournamentName: "Copa NexaGO",
    categoryName: "Dupla Mista C",
    paymentId: "pay_1",
    payerUid: "atl",
    convertedUids: ["atl"],
    convertedLabel: "Lucas M.",
    grossCents: 150_00,
    attribution: JOAO,
    ...over,
  };
}

const ev = (over: Record<string, unknown> = {}) => ({
  registrationId: "reg1",
  payerUid: "atl",
  paymentId: "pay_1",
  event: "confirmed" as const,
  ...over,
});

describe("rótulo do atleta convertido", () => {
  it("nome e inicial, dupla paga inteira e equipe numa linha", () => {
    assert.equal(shortAthleteName("Lucas Martins Souza"), "Lucas S.");
    assert.equal(shortAthleteName("Lucas"), "Lucas");
    assert.equal(convertedLabelOf("Lucas Martins", 1, null), "Lucas M.");
    assert.equal(convertedLabelOf("Lucas Martins", 2, null), "Lucas M. + 1 atl.");
    assert.equal(convertedLabelOf("Lucas Martins", 4, "CFC"), "Equipe CFC (4 atl.)");
  });
});

describe("createPendingCommission", () => {
  it("cria pendente por inscrição × pagador, com o % e a versão do contrato", async () => {
    const {fake, db} = makeDb();
    assert.equal(await createPendingCommission(db, input(), NOW), "reg1_atl");
    const c = fake.store.get("squadCommissions/reg1_atl")!;
    assert.equal(c["status"], "pending");
    assert.equal(c["amountCents"], 15_00);
    assert.equal(c["rulesVersion"], 2);
    assert.equal(c["ambassadorId"], "jv");
    assert.equal(c["payoutId"], null);
  });

  it("os dois atletas da dupla, cada um com a sua cota, geram uma comissão cada", async () => {
    const {db} = makeDb();
    assert.equal(await createPendingCommission(db, input({grossCents: 75_00}), NOW), "reg1_atl");
    assert.equal(await createPendingCommission(db, input({payerUid: "par", paymentId: "pay_2", grossCents: 75_00}), NOW), "reg1_par");
  });

  it("uma conversão por atleta; cancelada não conta", async () => {
    const {db} = makeDb();
    await createPendingCommission(db, input(), NOW);
    assert.equal(await createPendingCommission(db, input({registrationId: "reg2"}), NOW), null);
    await applySquadPaymentEvent(db, ev({event: "failed"}), LATER);
    assert.equal(await createPendingCommission(db, input({registrationId: "reg2", paymentId: "pay_2"}), NOW), "reg2_atl");
  });

  it("checkout refeito acompanha a cobrança nova enquanto pendente", async () => {
    const {fake, db} = makeDb();
    await createPendingCommission(db, input(), NOW);
    await createPendingCommission(db, input({paymentId: "pay_9", grossCents: 160_00}), NOW);
    const c = fake.store.get("squadCommissions/reg1_atl")!;
    assert.equal(c["paymentId"], "pay_9");
    assert.equal(c["amountCents"], 16_00);
  });
});

describe("applySquadPaymentEvent", () => {
  it("confirmação libera com a receita líquida; reentrega é no-op", async () => {
    const {fake, db} = makeDb();
    await createPendingCommission(db, input(), NOW);
    const e = ev({valueCents: 150_00, netValueCents: 142_51});
    assert.equal(await applySquadPaymentEvent(db, e, LATER), true);
    const c = fake.store.get("squadCommissions/reg1_atl")!;
    assert.equal(c["status"], "released");
    assert.equal(c["feeCents"], 7_49);
    assert.equal(c["amountCents"], 14_25);
    assert.equal(await applySquadPaymentEvent(db, e, LATER), false);
    assert.equal((fake.store.get("squadCommissions/reg1_atl")!["timeline"] as unknown[]).length, 2);
  });

  it("vencimento de cobrança antiga não cancela a que acompanha a nova", async () => {
    const {fake, db} = makeDb();
    await createPendingCommission(db, input({paymentId: "pay_new"}), NOW);
    await applySquadPaymentEvent(db, ev({paymentId: "pay_old", event: "failed"}), LATER);
    assert.equal(fake.store.get("squadCommissions/reg1_atl")!["status"], "pending");
  });

  it("reembolso parcial recalcula proporcional (paga: ajuste pela diferença)", async () => {
    const {fake, db} = makeDb();
    await createPendingCommission(db, input({grossCents: 200_00}), NOW);
    await applySquadPaymentEvent(db, ev({valueCents: 200_00, netValueCents: 200_00}), LATER);
    await applySquadPaymentEvent(db, ev({event: "refunded", valueCents: 200_00, refundedCents: 50_00}), LATER);
    assert.equal(fake.store.get("squadCommissions/reg1_atl")!["status"], "released");
    assert.equal(fake.store.get("squadCommissions/reg1_atl")!["amountCents"], 15_00);

    fake.seedDoc("squadCommissions/reg3_atl", {
      registrationId: "reg3", ambassadorId: "jv", paymentId: "pay_3", status: "paid", pct: 10,
      grossCents: 200_00, netCents: 200_00, amountCents: 20_00, processedEvents: [], timeline: [],
    });
    await applySquadPaymentEvent(
      db, ev({registrationId: "reg3", paymentId: "pay_3", event: "refunded", valueCents: 200_00, refundedCents: 100_00}), LATER,
    );
    assert.equal(fake.store.get("squadCommissionAdjustments/reg3_atl_pay_3_partial")!["amountCents"], -10_00);
    assert.equal(fake.store.get("squadCommissions/reg3_atl")!["status"], "paid");
  });

  it("sem comissão para a cobrança: nada acontece", async () => {
    const {db} = makeDb();
    assert.equal(await applySquadPaymentEvent(db, ev({registrationId: "nada"}), LATER), false);
  });
});

describe("squadEventForStatus", () => {
  it("antes de confirmar tudo é falha; depois, só estorno e chargeback", () => {
    assert.equal(squadEventForStatus("OVERDUE", false), "failed");
    assert.equal(squadEventForStatus("REFUNDED", true), "refunded");
    assert.equal(squadEventForStatus("REFUND_REQUESTED", true), null);
    assert.equal(squadEventForStatus("CHARGEBACK_REQUESTED", true), "chargeback");
    assert.equal(squadEventForStatus("DUNNING_REQUESTED", true), null);
  });
});

describe("desconto do seguidor", () => {
  const base = {payerUid: "atl", registrationId: "reg1", priceCents: 150_00};

  it("usa o % congelado no contrato", async () => {
    const {db} = makeDb();
    assert.deepEqual(await followerDiscountFor(db, {...base, attribution: JOAO}), {cents: 15_00, pct: 10});
  });

  it("sem % no contrato, vem da versão das regras do contrato (não da vigente)", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadConfig/rules", {version: 3, rules: {tiers: {amb: {followerDiscountPct: 20}}}});
    fake.seedDoc("squadConfig/rules/versions/2", {rules: {tiers: {amb: {followerDiscountPct: 12}}}});
    const semPct = {...JOAO, ambassador: {...JOAO.ambassador, followerDiscountPct: null}};
    assert.deepEqual(await followerDiscountFor(db, {...base, attribution: semPct}), {cents: 18_00, pct: 12});
  });

  it("só na primeira inscrição: quem já converteu não ganha de novo", async () => {
    const {db} = makeDb();
    await createPendingCommission(db, input(), NOW);
    // A mesma cobrança refeita continua com desconto; outra inscrição, não.
    assert.equal((await followerDiscountFor(db, {...base, attribution: JOAO})).cents, 15_00);
    assert.deepEqual(await followerDiscountFor(db, {...base, registrationId: "reg2", attribution: JOAO}), {cents: 0, pct: 0});
  });

  it("com a regra desligada, vale em toda inscrição", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadConfig/rules", {version: 2, rules: {attribution: {followerDiscountFirstOnly: false}}});
    await createPendingCommission(db, input(), NOW);
    assert.equal((await followerDiscountFor(db, {...base, registrationId: "reg2", attribution: JOAO})).cents, 15_00);
  });

  it("desligado nas inscrições: sem desconto, mas a comissão continua", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadConfig/rules", {
      version: 2,
      rules: {attribution: {followerDiscountScope: {registration: false, booking: true, club: true}}},
    });
    assert.deepEqual(await followerDiscountFor(db, {...base, attribution: JOAO}), {cents: 0, pct: 0});
    assert.ok(await createPendingCommission(db, input(), NOW));
  });

  it("nunca deixa a cobrança abaixo do mínimo do Asaas", async () => {
    const {db} = makeDb();
    const alto = {...JOAO, ambassador: {...JOAO.ambassador, followerDiscountPct: 30}};
    assert.equal((await followerDiscountFor(db, {...base, priceCents: 6_00, attribution: alto})).cents, 1_00);
    assert.deepEqual(await followerDiscountFor(db, {...base, priceCents: 5_00, attribution: alto}), {cents: 0, pct: 0});
  });

  it("nunca passa da taxa da plataforma desta cobrança (a nexaGO não paga do bolso)", async () => {
    const {db} = makeDb();
    const alto = {...JOAO, ambassador: {...JOAO.ambassador, followerDiscountPct: 15}};
    // R$ 150 × 15% = R$ 22,50, mas a taxa (8%) é R$ 12,00: o desconto para em R$ 12,00.
    assert.deepEqual(
      await followerDiscountFor(db, {...base, attribution: alto, feeCapCents: 12_00}),
      {cents: 12_00, pct: 15},
    );
    // Taxa zero (organizador sem taxa): nada a bancar, nada de desconto.
    assert.deepEqual(await followerDiscountFor(db, {...base, attribution: alto, feeCapCents: 0}), {cents: 0, pct: 0});
    // Sem organizador (`null`): só o mínimo de cobrança limita.
    assert.equal((await followerDiscountFor(db, {...base, attribution: alto, feeCapCents: null})).cents, 22_50);
  });

  it("registro por paymentId", async () => {
    const {db} = makeDb();
    await recordChargeDiscount(db, {paymentId: "p1", registrationId: "reg1", payerUid: "atl", ambassadorId: "jv", cents: 15_00, pct: 10}, NOW);
    assert.equal(await chargeDiscountCents(db, "p1"), 15_00);
    assert.equal(await chargeDiscountCents(db, "outro"), 0);
  });
});


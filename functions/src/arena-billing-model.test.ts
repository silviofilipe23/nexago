import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  DEFAULT_ARENA_BILLING_MODEL,
  EMPTY_ACTIVITY,
  arenaBillingModelChanges,
  arenaBillingModelErrors,
  arenaBillingModelFromDoc,
  computeArenaMonthBilling,
  firstBilledMonth,
  monthBounds,
  summarizeArenaLedger,
  tierIndexFor,
  type ArenaBillingModel,
} from "./arena-billing-model";
import {loadArenaBillingOverview, saveArenaBillingModelCore} from "./backoffice-arena-billing";

const MODEL: ArenaBillingModel = {
  effectiveFrom: "2027-01",
  newArenaFreeMonths: 3,
  tiers: [
    {minBookings: 0, monthlyFeeCents: 19900, commissionPercent: 10},
    {minBookings: 40, monthlyFeeCents: 0, commissionPercent: 8},
    {minBookings: 120, monthlyFeeCents: 0, commissionPercent: 5.5},
  ],
};

function model(edit: (m: ArenaBillingModel) => void = () => undefined): ArenaBillingModel {
  const m = structuredClone(MODEL);
  edit(m);
  return m;
}

function activity(paidBookings: number, bookingVolumeCents: number, extra: Partial<typeof EMPTY_ACTIVITY> = {}) {
  return {...EMPTY_ACTIVITY, paidBookings, bookingVolumeCents, ...extra};
}

function fieldsOf(err: unknown): string[] {
  return ((err as {details?: {fields?: string[]}}).details?.fields) ?? [];
}

describe("faixa alcançada", () => {
  it("é a última cujo mínimo cabe nas reservas pagas", () => {
    assert.equal(tierIndexFor(MODEL, 0), 0);
    assert.equal(tierIndexFor(MODEL, 39), 0);
    assert.equal(tierIndexFor(MODEL, 40), 1);
    assert.equal(tierIndexFor(MODEL, 119), 1);
    assert.equal(tierIndexFor(MODEL, 120), 2);
    assert.equal(tierIndexFor(MODEL, 5000), 2);
  });
});

describe("computeArenaMonthBilling", () => {
  it("abaixo do mínimo: mensalidade + comissão da 1ª faixa", () => {
    const r = computeArenaMonthBilling(MODEL, "2027-03", activity(12, 120000));
    assert.equal(r.billable, true);
    assert.equal(r.tierIndex, 0);
    assert.equal(r.monthlyFeeCents, 19900);
    assert.equal(r.commissionCents, 12000);
    assert.equal(r.totalCents, 31900);
    assert.equal(r.dueCents, 31900);
    assert.deepEqual(r.next, {tierIndex: 1, bookingsMissing: 28, commissionPercent: 8, monthlyFeeCents: 0});
  });

  it("no mínimo: sem mensalidade, comissão menor; a faixa vale para o mês inteiro", () => {
    const r = computeArenaMonthBilling(MODEL, "2027-03", activity(40, 400000));
    assert.equal(r.tierIndex, 1);
    assert.equal(r.monthlyFeeCents, 0);
    assert.equal(r.commissionCents, 32000);
    assert.equal(r.totalCents, 32000);
  });

  it("última faixa: % com casa decimal e sem próxima faixa", () => {
    const r = computeArenaMonthBilling(MODEL, "2027-03", activity(150, 1234567));
    assert.equal(r.tierIndex, 2);
    assert.equal(r.commissionCents, Math.round(1234567 * 0.055));
    assert.equal(r.next, null);
  });

  it("plano de horário entra na base da comissão, não na contagem", () => {
    const r = computeArenaMonthBilling(MODEL, "2027-03", activity(39, 100000, {schedulePlanVolumeCents: 50000}));
    assert.equal(r.tierIndex, 0);
    assert.equal(r.commissionBaseCents, 150000);
    assert.equal(r.commissionCents, 15000);
  });

  it("antes da vigência é implantação: simula, mas não deve nada", () => {
    const r = computeArenaMonthBilling(MODEL, "2026-11", activity(12, 120000));
    assert.equal(r.billable, false);
    assert.equal(r.freeReason, "implantation");
    assert.equal(r.totalCents, 31900);
    assert.equal(r.dueCents, 0);
  });

  it("arena que entra depois da vigência ganha os meses grátis", () => {
    assert.equal(firstBilledMonth(MODEL, "2027-05"), "2027-08");
    const free = computeArenaMonthBilling(MODEL, "2027-07", activity(5, 1000), "2027-05");
    assert.equal(free.billable, false);
    assert.equal(free.freeReason, "new_arena");
    assert.equal(computeArenaMonthBilling(MODEL, "2027-08", activity(5, 1000), "2027-05").billable, true);
  });

  it("arena que já existia antes da vigência paga a partir da vigência", () => {
    assert.equal(firstBilledMonth(MODEL, "2026-04"), "2027-01");
    assert.equal(firstBilledMonth(MODEL, null), "2027-01");
    assert.equal(firstBilledMonth(model((m) => (m.newArenaFreeMonths = 0)), "2027-05"), "2027-05");
  });

  it("compara com a taxa cobrada hoje nas mesmas linhas", () => {
    const r = computeArenaMonthBilling(MODEL, "2027-03", activity(40, 400000, {currentFeeCents: 32000}));
    assert.equal(r.deltaVsCurrentCents, 0);
  });

  it("mês sem movimento: só a mensalidade da 1ª faixa", () => {
    const r = computeArenaMonthBilling(MODEL, "2027-03", EMPTY_ACTIVITY);
    assert.equal(r.totalCents, 19900);
    assert.equal(r.commissionCents, 0);
  });
});

describe("summarizeArenaLedger", () => {
  const at = (iso: string) => Timestamp.fromDate(new Date(iso));

  it("conta reservas avulsas distintas e soma o bruto e a taxa de hoje", () => {
    const lines = [
      {type: "credit", bookingId: "b1", grossReais: 60, platformFeeReais: 4.8, createdAt: at("2027-03-02T15:00:00Z")},
      // rateio: a mesma reserva paga em duas partes conta 1
      {type: "credit", bookingId: "b2", grossReais: 30, platformFeeReais: 2.4, createdAt: at("2027-03-05T15:00:00Z")},
      {type: "credit", bookingId: "b2", grossReais: 30, platformFeeReais: 2.4, createdAt: at("2027-03-05T16:00:00Z")},
      {type: "credit", source: "schedule_plan", grossReais: 400, platformFeeReais: 32, createdAt: at("2027-03-10T12:00:00Z")},
      // fora do escopo: aula, clubinho, repasse a professor
      {type: "credit", source: "class", grossReais: 200, platformFeeReais: 10, createdAt: at("2027-03-10T12:00:00Z")},
      {type: "credit", source: "club", bookingId: "s1", grossReais: 15, platformFeeReais: 0.75, createdAt: at("2027-03-10T12:00:00Z")},
      {type: "class_payout", grossReais: 100, netReais: -100, createdAt: at("2027-03-11T12:00:00Z")},
    ];
    assert.deepEqual(summarizeArenaLedger(lines, "2027-03"), {
      paidBookings: 2,
      bookingVolumeCents: 12000,
      schedulePlanVolumeCents: 40000,
      currentFeeCents: 4160,
    });
  });

  it("o mês é o civil de São Paulo", () => {
    const lines = [
      // 31/03 23:30 em SP = 01/04 02:30 UTC → ainda é março
      {type: "credit", bookingId: "b1", grossReais: 50, platformFeeReais: 4, createdAt: at("2027-04-01T02:30:00Z")},
      // 01/03 00:30 em SP
      {type: "credit", bookingId: "b2", grossReais: 50, platformFeeReais: 4, createdAt: at("2027-03-01T03:30:00Z")},
      {type: "credit", bookingId: "b3", grossReais: 50, platformFeeReais: 4, createdAt: at("2027-04-01T03:30:00Z")},
    ];
    assert.equal(summarizeArenaLedger(lines, "2027-03").paidBookings, 2);
    const {start, end} = monthBounds("2027-03");
    assert.equal(start.toISOString(), "2027-03-01T03:00:00.000Z");
    assert.equal(end.toISOString(), "2027-04-01T03:00:00.000Z");
  });

  it("estorno de quadra desconta o valor", () => {
    const lines = [
      {type: "credit", bookingId: "b1", grossReais: 80, platformFeeReais: 6.4, createdAt: at("2027-03-02T15:00:00Z")},
      {type: "refund", bookingId: "b1", grossReais: -80, platformFeeReais: 0, createdAt: at("2027-03-03T15:00:00Z")},
    ];
    const r = summarizeArenaLedger(lines, "2027-03");
    assert.equal(r.bookingVolumeCents, 0);
    assert.equal(r.paidBookings, 1);
  });
});

describe("validação do modelo", () => {
  it("o exemplo e o modelo de teste são válidos", () => {
    assert.deepEqual(arenaBillingModelErrors(DEFAULT_ARENA_BILLING_MODEL), []);
    assert.deepEqual(arenaBillingModelErrors(MODEL), []);
  });

  it("1ª faixa começa em 0 e os mínimos crescem", () => {
    assert.deepEqual(arenaBillingModelErrors(model((m) => (m.tiers[0].minBookings = 5))), ["tiers.0.minBookings"]);
    assert.deepEqual(arenaBillingModelErrors(model((m) => (m.tiers[2].minBookings = 40))), ["tiers.2.minBookings"]);
  });

  it("mais reservas nunca aumenta comissão nem mensalidade", () => {
    assert.deepEqual(arenaBillingModelErrors(model((m) => (m.tiers[2].commissionPercent = 9))), ["tiers.2.commissionPercent"]);
    assert.deepEqual(arenaBillingModelErrors(model((m) => (m.tiers[1].monthlyFeeCents = 25000))), ["tiers.1.monthlyFeeCents"]);
  });

  it("limites de cada campo", () => {
    assert.deepEqual(arenaBillingModelErrors(model((m) => (m.tiers[0].commissionPercent = 25))), ["tiers.0.commissionPercent"]);
    assert.deepEqual(arenaBillingModelErrors(model((m) => (m.tiers[2].commissionPercent = 5.555))), [
      "tiers.2.commissionPercent",
    ]);
    assert.deepEqual(arenaBillingModelErrors(model((m) => (m.tiers[0].monthlyFeeCents = 99.5))), ["tiers.0.monthlyFeeCents"]);
    assert.deepEqual(arenaBillingModelErrors(model((m) => (m.effectiveFrom = "2027-13"))), ["effectiveFrom"]);
    assert.deepEqual(arenaBillingModelErrors(model((m) => (m.newArenaFreeMonths = 30))), ["newArenaFreeMonths"]);
    assert.deepEqual(arenaBillingModelErrors(model((m) => (m.tiers = []))), ["tiers"]);
    assert.deepEqual(arenaBillingModelErrors(null), ["model"]);
  });

  it("doc corrompido cai no exemplo", () => {
    assert.deepEqual(arenaBillingModelFromDoc({model: {tiers: "x"}}), DEFAULT_ARENA_BILLING_MODEL);
    assert.deepEqual(arenaBillingModelFromDoc(undefined), DEFAULT_ARENA_BILLING_MODEL);
    assert.deepEqual(arenaBillingModelFromDoc({model: MODEL}), MODEL);
  });

  it("resumo das mudanças", () => {
    const next = model((m) => {
      m.effectiveFrom = "2027-03";
      m.tiers[1].commissionPercent = 7;
    });
    assert.deepEqual(arenaBillingModelChanges(MODEL, next), ["Vigência", "Faixa 2"]);
    assert.deepEqual(arenaBillingModelChanges(MODEL, model((m) => m.tiers.pop())), ["Quantidade de faixas"]);
  });
});

describe("saveArenaBillingModelCore", () => {
  const ACTOR = {uid: "admin1", name: "Lia Martins"};
  const NOW = new Date("2026-11-08T12:00:00Z");

  async function read(fake: FakeFirestore, path: string): Promise<Record<string, unknown>> {
    return (await fake.doc(path).get()).data() ?? {};
  }

  function makeDb() {
    const fake = new FakeFirestore();
    return {fake, db: fake as unknown as Firestore};
  }

  it("primeira gravação: o exemplo vira a v1 e o salvo a v2", async () => {
    const {fake, db} = makeDb();
    const out = await saveArenaBillingModelCore(db, {model: MODEL, version: 1, note: " Proposta inicial "}, ACTOR, NOW);
    assert.equal(out.version, 2);
    assert.deepEqual(out.changes, ["Primeira definição do modelo"]);
    const doc = await read(fake, "arenaBillingConfig/model");
    assert.equal(doc["version"], 2);
    assert.deepEqual(doc["model"], MODEL);
    assert.deepEqual((await read(fake, "arenaBillingConfig/model/versions/1"))["model"], DEFAULT_ARENA_BILLING_MODEL);
    const v2 = await read(fake, "arenaBillingConfig/model/versions/2");
    assert.equal(v2["note"], "Proposta inicial");
    assert.deepEqual(v2["createdBy"], ACTOR);
  });

  it("recusa versão desatualizada e gravação sem mudança", async () => {
    const {db} = makeDb();
    await saveArenaBillingModelCore(db, {model: MODEL, version: 1}, ACTOR, NOW);
    await assert.rejects(
      saveArenaBillingModelCore(db, {model: model((m) => (m.newArenaFreeMonths = 1)), version: 1}, ACTOR, NOW),
      (e: unknown) => (e as {code?: string}).code === "failed-precondition",
    );
    await assert.rejects(
      saveArenaBillingModelCore(db, {model: MODEL, version: 2}, ACTOR, NOW),
      (e: unknown) => (e as {code?: string}).code === "invalid-argument",
    );
  });

  it("recusa modelo inválido com os campos", async () => {
    const {db} = makeDb();
    await assert.rejects(
      saveArenaBillingModelCore(db, {model: model((m) => (m.tiers[1].commissionPercent = 12)), version: 1}, ACTOR, NOW),
      (e: unknown) => fieldsOf(e).includes("tiers.1.commissionPercent"),
    );
  });

  it("restaurar grava a versão antiga como a próxima", async () => {
    const {fake, db} = makeDb();
    await saveArenaBillingModelCore(db, {model: MODEL, version: 1}, ACTOR, NOW);
    const out = await saveArenaBillingModelCore(
      db, {model: DEFAULT_ARENA_BILLING_MODEL, version: 2, restoredFrom: 1}, ACTOR, NOW,
    );
    assert.equal(out.version, 3);
    assert.equal((await read(fake, "arenaBillingConfig/model/versions/3"))["restoredFrom"], 1);
  });
});

describe("loadArenaBillingOverview", () => {
  it("só arenas cadastradas, com o extrato do mês", async () => {
    const fake = new FakeFirestore();
    const at = (iso: string) => Timestamp.fromDate(new Date(iso));
    fake.seedDoc("arenas/a1", {name: "Arena Sol", city: "Goiânia", state: "GO", createdAt: at("2026-05-10T12:00:00Z"), planTier: "pro", planStatus: "active"});
    fake.seedDoc("arenas/a2", {name: "Arena Mar", createdAt: at("2026-08-10T12:00:00Z")});
    fake.seedDoc("arenas/pre", {name: "Pré-cadastro", unclaimed: true});
    fake.seedDoc("arenaWallets/a1/ledger/l1", {type: "credit", bookingId: "b1", grossReais: 100, platformFeeReais: 6, createdAt: at("2026-11-03T12:00:00Z")});
    fake.seedDoc("arenaWallets/a1/ledger/l2", {type: "credit", bookingId: "b2", grossReais: 100, platformFeeReais: 6, createdAt: at("2026-10-03T12:00:00Z")});

    const out = await loadArenaBillingOverview(fake as unknown as Firestore, "2026-11");
    assert.equal(out.saved, false);
    assert.equal(out.version, 1);
    assert.deepEqual(out.model, DEFAULT_ARENA_BILLING_MODEL);
    assert.deepEqual(out.arenas.map((a) => a.id), ["a1", "a2"]);
    const a1 = out.arenas[0];
    assert.equal(a1.city, "Goiânia · GO");
    assert.equal(a1.startMonth, "2026-05");
    assert.deepEqual(a1.activity, {paidBookings: 1, bookingVolumeCents: 10000, schedulePlanVolumeCents: 0, currentFeeCents: 600});
    assert.equal(out.arenas[1].activity.paidBookings, 0);
  });
});

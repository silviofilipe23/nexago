import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  approvePayoutCore,
  cancelCommissionCore,
  nextPayoutDate,
  openPayoutDate,
  payoutCutoff,
  planPayout,
  reassignCommissionCore,
  setHoldCore,
  spDateKey,
  type PlanCommission,
} from "./squad-commissions";

const ACTOR = {uid: "admin1", name: "Lia Martins"};
/** 20/10/2026 10:00 em SP: dia do repasse. */
const PAYDAY = new Date("2026-10-20T13:00:00Z");
const RELEASED = new Date("2026-10-15T15:00:00Z");

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function commission(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ambassadorId: "jv",
    ambassadorName: "João Victor",
    registrationId: `reg-${id}`,
    status: "released",
    netCents: 140_00,
    pct: 10,
    amountCents: 14_00,
    releasedAt: RELEASED,
    payoutId: null,
    hold: null,
    timeline: [],
    ...over,
  };
}

function planC(id: string, ambassadorId: string, amountCents: number, over: Partial<PlanCommission> = {}): PlanCommission {
  return {id, ambassadorId, ambassadorName: ambassadorId.toUpperCase(), amountCents, releasedAt: RELEASED, hold: null, ...over};
}

const noNotify = async () => undefined;

describe("calendário do repasse", () => {
  it("datas civis de São Paulo", () => {
    assert.equal(spDateKey(new Date("2026-10-20T02:59:00Z")), "2026-10-19");
    assert.equal(spDateKey(new Date("2026-10-20T03:00:00Z")), "2026-10-20");
  });

  it("próximo dia 06 ou 20, inclusive hoje", () => {
    assert.equal(nextPayoutDate("2026-10-17", [6, 20]), "2026-10-20");
    assert.equal(nextPayoutDate("2026-10-20", [6, 20]), "2026-10-20");
    assert.equal(nextPayoutDate("2026-10-21", [6, 20]), "2026-11-06");
  });

  it("repasse atrasado continua em aberto até ser aprovado", () => {
    assert.equal(openPayoutDate("2026-10-25", "2026-10-06", [6, 20]), "2026-10-20");
    assert.equal(openPayoutDate("2026-10-25", "2026-10-20", [6, 20]), "2026-11-06");
    assert.equal(openPayoutDate("2026-10-17", null, [6, 20]), "2026-10-20");
  });

  it("fecha às 23:59 do dia anterior (meia-noite de SP)", () => {
    assert.equal(payoutCutoff("2026-10-20").toISOString(), "2026-10-20T03:00:00.000Z");
  });
});

describe("planPayout", () => {
  const base = {payoutDate: "2026-10-20", cutoff: payoutCutoff("2026-10-20"), minNetCents: 20_00};

  it("agrupa por embaixador e separa quem não chega no mínimo", () => {
    const rows = planPayout({
      ...base,
      commissions: [planC("a", "jv", 14_00), planC("b", "jv", 12_00), planC("c", "ac", 6_00)],
      adjustments: [],
    });
    assert.deepEqual(rows.map((r) => [r.ambassadorId, r.netCents, r.status]), [
      ["ac", 6_00, "accumulating"],
      ["jv", 26_00, "included"],
    ]);
  });

  it("liberada depois do fechamento fica para o próximo", () => {
    const rows = planPayout({
      ...base,
      commissions: [planC("a", "jv", 30_00, {releasedAt: new Date("2026-10-20T03:00:00Z")})],
      adjustments: [],
    });
    assert.deepEqual(rows, []);
  });

  it("ajuste negativo desconta do líquido", () => {
    const [row] = planPayout({
      ...base,
      commissions: [planC("a", "mr", 60_00)],
      adjustments: [{id: "adj", ambassadorId: "mr", ambassadorName: "Marcos", amountCents: -10_00}],
    });
    assert.equal(row!.netCents, 50_00);
    assert.deepEqual(row!.adjustmentIds, ["adj"]);
  });

  it("retida para esta data sai da conta; tudo retido = Retido", () => {
    const rows = planPayout({
      ...base,
      commissions: [
        planC("a", "jv", 30_00, {hold: {payoutDate: "2026-10-20", reason: "Suspeita"}}),
        planC("b", "rb", 30_00, {hold: {payoutDate: "2026-10-20", reason: "Pausado"}}),
        planC("c", "rb", 25_00),
        planC("d", "pl", 30_00, {hold: {payoutDate: "2026-10-06", reason: "Antiga"}}),
      ],
      adjustments: [],
    });
    const by = Object.fromEntries(rows.map((r) => [r.ambassadorId, r]));
    assert.equal(by["jv"]!.status, "held");
    assert.equal(by["jv"]!.holdReason, "Suspeita");
    assert.equal(by["rb"]!.status, "included");
    assert.equal(by["rb"]!.netCents, 25_00);
    assert.deepEqual(by["rb"]!.heldCommissionIds, ["b"]);
    // Retenção de outro ciclo não vale neste.
    assert.equal(by["pl"]!.status, "included");
  });
});

describe("approvePayoutCore", () => {
  it("credita a carteira, marca pagas e grava o repasse", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadCommissions/c1", commission("c1", {amountCents: 14_00}));
    fake.seedDoc("squadCommissions/c2", commission("c2", {amountCents: 12_00}));
    fake.seedDoc("squadCommissions/c3", commission("c3", {ambassadorId: "ac", ambassadorName: "Ana Clara", amountCents: 6_00}));
    fake.seedDoc("squadCommissions/p1", commission("p1", {status: "pending", releasedAt: null}));
    fake.seedDoc("squadWallets/jv", {balanceCents: 5_00});
    const notified: Array<[string, number]> = [];

    const out = await approvePayoutCore(db, {payoutDate: "2026-10-20"}, ACTOR, PAYDAY, async (uid, cents) => {
      notified.push([uid, cents]);
    });

    assert.deepEqual(out, {payoutId: "2026-10-20", status: "done", creditedCount: 1, failedCount: 0, totalCents: 26_00});
    assert.equal(fake.store.get("squadWallets/jv")!["balanceCents"], 31_00);
    const entry = fake.store.get("squadWallets/jv/transactions/2026-10-20")!;
    assert.equal(entry["type"], "squad_commission");
    assert.deepEqual(entry["commissionIds"], ["c1", "c2"]);
    assert.equal(fake.store.get("squadCommissions/c1")!["status"], "paid");
    assert.equal(fake.store.get("squadCommissions/c1")!["payoutId"], "2026-10-20");
    // Abaixo do mínimo e pendente ficam como estavam.
    assert.equal(fake.store.get("squadCommissions/c3")!["status"], "released");
    assert.equal(fake.store.get("squadCommissions/p1")!["status"], "pending");
    assert.equal(fake.store.get("squadPayouts/2026-10-20")!["status"], "done");
    assert.deepEqual(notified, [["jv", 26_00]]);
  });

  it("aprovar de novo o mesmo repasse é recusado", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadCommissions/c1", commission("c1", {amountCents: 30_00}));
    await approvePayoutCore(db, {payoutDate: "2026-10-20"}, ACTOR, PAYDAY, noNotify);
    await assert.rejects(
      approvePayoutCore(db, {payoutDate: "2026-10-20"}, ACTOR, PAYDAY, noNotify),
      (err: {code?: string}) => err.code === "failed-precondition",
    );
    assert.equal(fake.store.get("squadWallets/jv")!["balanceCents"], 30_00);
  });

  it("só o repasse em aberto pode ser aprovado", async () => {
    const {db} = makeDb();
    await assert.rejects(
      approvePayoutCore(db, {payoutDate: "2026-11-06"}, ACTOR, PAYDAY, noNotify),
      (err: {message?: string}) => /em aberto é o de 20\/10/.test(err.message ?? ""),
    );
  });

  it("ajuste de reembolso de comissão paga é descontado e amarrado ao repasse", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadCommissions/c1", commission("c1", {ambassadorId: "mr", ambassadorName: "Marcos", amountCents: 60_00}));
    fake.seedDoc("squadCommissionAdjustments/a1", {ambassadorId: "mr", ambassadorName: "Marcos", amountCents: -10_00, payoutId: null});
    await approvePayoutCore(db, {payoutDate: "2026-10-20"}, ACTOR, PAYDAY, noNotify);
    assert.equal(fake.store.get("squadWallets/mr")!["balanceCents"], 50_00);
    assert.equal(fake.store.get("squadCommissionAdjustments/a1")!["payoutId"], "2026-10-20");
  });

  it("retido fica fora e aparece no repasse como retido", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadCommissions/c1", commission("c1", {
      amountCents: 30_00,
      hold: {payoutDate: "2026-10-20", reason: "Suspeita de fraude", by: ACTOR, at: RELEASED},
    }));
    const out = await approvePayoutCore(db, {payoutDate: "2026-10-20"}, ACTOR, PAYDAY, noNotify);
    assert.equal(out.creditedCount, 0);
    assert.equal(fake.store.get("squadWallets/jv"), undefined);
    const items = fake.store.get("squadPayouts/2026-10-20")!["items"] as Array<Record<string, unknown>>;
    assert.deepEqual(items.map((i) => [i["ambassadorId"], i["status"], i["holdReason"]]), [["jv", "held", "Suspeita de fraude"]]);
  });

  it("crédito que falha deixa o repasse parcial e a nova tentativa só faz o que faltou", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadCommissions/c1", commission("c1", {amountCents: 30_00}));
    fake.seedDoc("squadCommissions/c2", commission("c2", {ambassadorId: "rb", ambassadorName: "Rayssa", amountCents: 21_00}));
    const original = fake.runTransaction.bind(fake);
    let calls = 0;
    // 1ª transação abre o repasse; a 2ª é o primeiro crédito (João, pela ordem do nome) e falha.
    fake.runTransaction = (async (fn: (tx: unknown) => Promise<unknown>) => {
      calls++;
      if (calls === 2) throw new Error("ABORTED");
      return original(fn);
    }) as typeof fake.runTransaction;

    const first = await approvePayoutCore(db, {payoutDate: "2026-10-20"}, ACTOR, PAYDAY, noNotify);
    assert.equal(first.status, "partial");
    assert.equal(first.failedCount, 1);
    assert.equal(first.creditedCount, 1);
    assert.equal(fake.store.get("squadPayouts/2026-10-20")!["status"], "partial");

    fake.runTransaction = original;
    const retry = await approvePayoutCore(db, {payoutDate: "2026-10-20"}, ACTOR, PAYDAY, noNotify);
    assert.deepEqual([retry.status, retry.creditedCount, retry.failedCount, retry.totalCents], ["done", 2, 0, 51_00]);
    assert.equal(fake.store.get("squadWallets/jv")!["balanceCents"], 30_00);
    assert.equal(fake.store.get("squadWallets/rb")!["balanceCents"], 21_00);
  });
});

describe("reter, cancelar, reatribuir", () => {
  it("reter exige motivo e só vale para liberadas", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadCommissions/c1", commission("c1"));
    fake.seedDoc("squadCommissions/p1", commission("p1", {status: "pending"}));
    await assert.rejects(
      setHoldCore(db, {commissionIds: ["c1"], payoutDate: "2026-10-20", reason: " "}, ACTOR, PAYDAY),
      (err: {code?: string}) => err.code === "invalid-argument",
    );
    await assert.rejects(
      setHoldCore(db, {commissionIds: ["c1", "p1"], payoutDate: "2026-10-20", reason: "Contrato pausado"}, ACTOR, PAYDAY),
      (err: {code?: string}) => err.code === "failed-precondition",
    );
    await setHoldCore(db, {commissionIds: ["c1"], payoutDate: "2026-10-20", reason: "Contrato pausado"}, ACTOR, PAYDAY);
    const c1 = fake.store.get("squadCommissions/c1")!;
    assert.equal((c1["hold"] as {reason: string}).reason, "Contrato pausado");
    assert.equal((c1["timeline"] as unknown[]).length, 1);
    await setHoldCore(db, {commissionIds: ["c1"], payoutDate: "2026-10-20", reason: null}, ACTOR, PAYDAY);
    assert.equal(fake.store.get("squadCommissions/c1")!["hold"], null);
  });

  it("cancelar paga cria ajuste negativo; liberada só muda o status", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadCommissions/paid", commission("paid", {status: "paid", payoutId: "2026-10-06", amountCents: 60_00}));
    fake.seedDoc("squadCommissions/rel", commission("rel"));
    const paid = await cancelCommissionCore(db, {commissionId: "paid", reason: "Inscrição duplicada"}, ACTOR, PAYDAY);
    assert.equal(paid.adjustmentId, "paid_manual");
    assert.equal(fake.store.get("squadCommissionAdjustments/paid_manual")!["amountCents"], -60_00);
    assert.equal(fake.store.get("squadCommissions/paid")!["cancelReason"], "manual");

    const rel = await cancelCommissionCore(db, {commissionId: "rel", reason: "Autoindicação"}, ACTOR, PAYDAY);
    assert.equal(rel.adjustmentId, null);
    assert.equal(fake.store.get("squadCommissions/rel")!["status"], "canceled");
    await assert.rejects(
      cancelCommissionCore(db, {commissionId: "rel", reason: "De novo"}, ACTOR, PAYDAY),
      (err: {code?: string}) => err.code === "failed-precondition",
    );
  });

  it("reatribuir recalcula com o % do contrato do novo embaixador", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadCommissions/c1", commission("c1", {netCents: 140_00, pct: 10, amountCents: 14_00}));
    fake.seedDoc("squadAmbassadors/rb", {displayName: "Rayssa Brito", status: "active", tier: "pro", commissionPct: 15, rulesVersion: 2});
    fake.seedDoc("squadAmbassadors/off", {displayName: "Fora", status: "ended", commissionPct: 10});

    await assert.rejects(
      reassignCommissionCore(db, {commissionId: "c1", ambassadorId: "off", reason: "Código errado"}, ACTOR, PAYDAY),
      (err: {code?: string}) => err.code === "failed-precondition",
    );
    const out = await reassignCommissionCore(db, {commissionId: "c1", ambassadorId: "rb", reason: "Código errado"}, ACTOR, PAYDAY);
    assert.deepEqual(out, {amountCents: 21_00, pct: 15});
    const c1 = fake.store.get("squadCommissions/c1")!;
    assert.equal(c1["ambassadorId"], "rb");
    assert.equal(c1["ambassadorName"], "Rayssa Brito");
    assert.equal(c1["rulesVersion"], 2);
  });
});

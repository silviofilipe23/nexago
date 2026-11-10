import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {getArenaCrmCustomerCore, getArenaCrmOverviewCore, updateArenaCrmCore} from "./arena-crm";

const NOW = new Date("2026-11-10T15:00:00Z"); // 10/11, 12h em São Paulo

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava ${code}, veio ${err.code}`);
    return true;
  });
}

function seed(): FakeFirestore {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/arena1", {managerUserId: "owner", name: "Arena CFC"});
  fake.seedDoc("users/owner", {fullName: "Silvio"});
  fake.seedDoc("users/u1", {fullName: "Rafael Moura", phoneNumber: "(62) 98241-5530", profilePhotoUrl: "https://x/r.jpg"});
  for (const [i, date] of ["2026-11-03", "2026-10-27", "2026-10-20", "2026-10-13", "2026-10-06", "2026-09-29", "2026-09-22"].entries()) {
    fake.seedDoc(`arenaBookings/b${i}`, {arenaId: "arena1", athleteId: "u1", date, startTime: "19:00", endTime: "20:00", status: "active", attendanceStatus: "checked_in", amountReais: 50, source: "platform", courtName: "Quadra 1"});
  }
  fake.seedDoc("arenaBookings/other", {arenaId: "arena2", athleteId: "u1", date: "2026-11-03", startTime: "19:00", status: "active", source: "platform"});
  fake.seedDoc("arenas/arena1/schedulePlans/p1", {status: "active", name: "Noite 1x", monthlyPriceReais: 160, timesPerWeek: 1, windows: [{weekday: 2, startTime: "18:00", endTime: "22:00"}]});
  return fake;
}

function contractInput(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    arenaId: "arena1",
    op: "saveContract",
    athleteId: "u1",
    customerName: "",
    planId: "p1",
    planName: "Noite 1x",
    period: "quarterly",
    dueDay: 5,
    timesPerWeek: 1,
    monthlyPriceReais: 160,
    startDate: "2026-11-10",
    autoRenew: false,
    ...o,
  };
}

describe("getArenaCrmOverviewCore", () => {
  it("só a equipe da arena com acesso à agenda", async () => {
    await rejectsWith(getArenaCrmOverviewCore(db(seed()), "stranger", {arenaId: "arena1"}, NOW), "permission-denied");
    await rejectsWith(getArenaCrmOverviewCore(db(seed()), "owner", {}, NOW), "invalid-argument");
  });

  it("avulso frequente aparece como oportunidade com nome, telefone e plano sugerido", async () => {
    const overview = await getArenaCrmOverviewCore(db(seed()), "owner", {arenaId: "arena1"}, NOW);
    assert.equal(overview.today, "2026-11-10");
    assert.equal(overview.customers.length, 1);
    const c = overview.customers[0]!;
    assert.equal(c.name, "Rafael Moura");
    assert.equal(c.whatsapp, "5562982415530");
    assert.equal(c.photoUrl, "https://x/r.jpg");
    assert.equal(c.status, "walk_in");
    assert.equal(c.conversion?.suggestion?.planId, "p1");
    assert.deepEqual(overview.queues.convert.map((q) => q.key), ["a:u1"]);
  });
});

describe("updateArenaCrmCore", () => {
  it("valida vencimento 5/15/25 e período", async () => {
    const fake = seed();
    await rejectsWith(updateArenaCrmCore(db(fake), "owner", contractInput({dueDay: 10}), NOW), "invalid-argument");
    await rejectsWith(updateArenaCrmCore(db(fake), "owner", contractInput({period: "biweekly"}), NOW), "invalid-argument");
    await rejectsWith(updateArenaCrmCore(db(fake), "stranger", contractInput(), NOW), "permission-denied");
  });

  it("cria o contrato, recusa um segundo ativo e o cliente vira mensalista", async () => {
    const fake = seed();
    const {contractId} = await updateArenaCrmCore(db(fake), "owner", contractInput(), NOW) as {contractId: string};
    const saved = fake.store.get(`arenaCrmContracts/${contractId}`)!;
    assert.equal(saved["customerKey"], "a:u1");
    assert.equal(saved["customerName"], "Rafael Moura");
    assert.equal(saved["paidInstallments"], 0);
    await rejectsWith(updateArenaCrmCore(db(fake), "owner", contractInput(), NOW), "failed-precondition");

    // Paga a 1ª (vence hoje) para ficar em dia.
    await updateArenaCrmCore(db(fake), "owner", {arenaId: "arena1", op: "registerPayment", contractId, installments: 1, method: "pix"}, NOW);
    const overview = await getArenaCrmOverviewCore(db(fake), "owner", {arenaId: "arena1"}, NOW);
    const c = overview.customers[0]!;
    assert.equal(c.kind, "member");
    assert.equal(c.status, "active");
    assert.equal(c.contract?.nextDueDate, "2026-12-05");
    assert.equal(c.conversion, null);
    assert.equal(overview.kpis.mrrReais, 160);
    assert.equal(overview.kpis.newMembersThisMonth, 1);
  });

  it("pagamento avança as parcelas sem passar do total do período", async () => {
    const fake = seed();
    const {contractId} = await updateArenaCrmCore(db(fake), "owner", contractInput(), NOW) as {contractId: string};
    const r = await updateArenaCrmCore(db(fake), "owner", {arenaId: "arena1", op: "registerPayment", contractId, installments: 5, method: "cash"}, NOW) as {paidInstallments: number};
    assert.equal(r.paidInstallments, 3);
    const payments = [...fake.store.entries()].filter(([path]) => path.startsWith(`arenaCrmContracts/${contractId}/payments/`));
    assert.equal(payments.length, 1);
    assert.equal(payments[0]![1]["amountReais"], 480);
    await rejectsWith(updateArenaCrmCore(db(fake), "owner", {arenaId: "arena1", op: "registerPayment", contractId, installments: 1, method: "cash"}, NOW), "failed-precondition");
  });

  it("renovar cria o próximo contrato emendado e liga os dois", async () => {
    const fake = seed();
    const {contractId} = await updateArenaCrmCore(db(fake), "owner", contractInput({startDate: "2026-09-01"}), NOW) as {contractId: string};
    const {contractId: nextId} = await updateArenaCrmCore(db(fake), "owner", {arenaId: "arena1", op: "renewContract", contractId, period: "annual", monthlyPriceReais: 150}, NOW) as {contractId: string};
    assert.equal(fake.store.get(`arenaCrmContracts/${contractId}`)!["renewedToId"], nextId);
    const next = fake.store.get(`arenaCrmContracts/${nextId}`)!;
    assert.equal(next["startDate"], "2026-12-01");
    assert.equal(next["period"], "annual");
    assert.equal(next["renewedFromId"], contractId);
    await rejectsWith(updateArenaCrmCore(db(fake), "owner", {arenaId: "arena1", op: "renewContract", contractId}, NOW), "failed-precondition");

    const detail = await getArenaCrmCustomerCore(db(fake), "owner", {arenaId: "arena1", customerKey: "a:u1"}, NOW);
    assert.deepEqual(detail.contracts.map((c) => c.id), [nextId, contractId]);
    assert.equal(detail.recentBookings.length, 7);
  });

  it("cancelar tira da receita; contato fica registrado com o autor", async () => {
    const fake = seed();
    const {contractId} = await updateArenaCrmCore(db(fake), "owner", contractInput(), NOW) as {contractId: string};
    await updateArenaCrmCore(db(fake), "owner", {arenaId: "arena1", op: "cancelContract", contractId, reason: "Mudou de cidade"}, NOW);
    assert.equal(fake.store.get(`arenaCrmContracts/${contractId}`)!["status"], "canceled");
    assert.equal(fake.store.get(`arenaCrmContracts/${contractId}`)!["canceledOn"], "2026-11-10");

    const {contactId} = await updateArenaCrmCore(db(fake), "owner", {arenaId: "arena1", op: "logContact", customerKey: "a:u1", channel: "whatsapp", reason: "offer", outcome: "interested"}, NOW) as {contactId: string};
    const contact = fake.store.get(`arenaCrmContacts/${contactId}`)!;
    assert.equal(contact["createdByName"], "Silvio");
    assert.equal(contact["outcome"], "interested");

    fake.seedDoc(`arenaCrmContacts/${contactId}`, {...contact, at: Timestamp.fromDate(NOW)});
    const overview = await getArenaCrmOverviewCore(db(fake), "owner", {arenaId: "arena1"}, NOW);
    assert.equal(overview.kpis.mrrReais, 0);
    assert.equal(overview.customers[0]?.status, "canceled");
    assert.equal(overview.customers[0]?.lastContact?.outcome, "interested");
    assert.equal(overview.kpis.funnel.offered, 1);
  });

  it("meta do mês fica nas configurações do CRM", async () => {
    const fake = seed();
    await updateArenaCrmCore(db(fake), "owner", {arenaId: "arena1", op: "saveSettings", monthlyGoal: 8}, NOW);
    const overview = await getArenaCrmOverviewCore(db(fake), "owner", {arenaId: "arena1"}, NOW);
    assert.equal(overview.kpis.monthlyGoal, 8);
  });
});

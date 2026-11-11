import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {getMyArenaContractsCore, syncArenaCrmMember} from "./arena-crm-athlete";
import {athleteWeekHours, installmentSchedule} from "./arena-crm-athlete-model";
import {contractFromDoc} from "./arena-crm";
import {contractView} from "./arena-crm-model";

const NOW = new Date("2026-11-11T15:00:00Z"); // quarta
const db = (f: FakeFirestore) => f as unknown as Firestore;

function contractDoc(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    arenaId: "arena1", customerKey: "a:u1", athleteId: "u1", customerName: "Rafael Moura", planName: "Noite 2x",
    period: "quarterly", dueDay: 15, weeklyHours: 3, monthlyPriceReais: 300, startDate: "2026-09-15", autoRenew: false,
    paidInstallments: 2, status: "active", note: "paga sempre atrasado", cancelReason: null, ...o,
  };
}

function seed(): FakeFirestore {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/arena1", {name: "Arena CFC", whatsapp: "(62) 98241-5530", logoUrl: "https://img/cfc.png"});
  fake.seedDoc("arenaCrmContracts/c1", contractDoc());
  fake.seedDoc("arenaCrmContracts/c1/payments/p1", {amountReais: 300, method: "pix", paidOn: "2026-09-15", installments: 1, createdByName: "Bruna Lima"});
  fake.seedDoc("arenaCrmContracts/c1/payments/p2", {amountReais: 300, method: "online", paidOn: "2026-10-15", installments: 1, createdByName: "Pix online"});
  // Semana corrente (09–15/11): 1h30 já jogada + 1h reservada pra sexta; falta e cancelada não contam.
  fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", athleteId: "u1", date: "2026-11-09", startTime: "19:00", endTime: "20:30", status: "active", source: "platform"});
  fake.seedDoc("arenaBookings/b2", {arenaId: "arena1", athleteId: "u1", date: "2026-11-13", startTime: "20:00", endTime: "21:00", status: "active", source: "platform"});
  fake.seedDoc("arenaBookings/b3", {arenaId: "arena1", athleteId: "u1", date: "2026-11-10", startTime: "19:00", endTime: "20:00", status: "active", source: "platform", attendanceStatus: "no_show"});
  fake.seedDoc("arenaBookings/b4", {arenaId: "arena1", athleteId: "u1", date: "2026-11-12", startTime: "19:00", endTime: "20:00", status: "cancelled", source: "platform"});
  fake.seedDoc("arenaBookings/b5", {arenaId: "arena1", athleteId: "u2", date: "2026-11-12", startTime: "19:00", endTime: "20:00", status: "active", source: "platform"});
  return fake;
}

describe("Meu contrato (atleta)", () => {
  it("devolve só os contratos do atleta, sem a anotação interna da arena", async () => {
    const fake = seed();
    fake.seedDoc("arenaCrmContracts/c2", contractDoc({athleteId: "u2", customerKey: "a:u2"}));
    const r = await getMyArenaContractsCore(db(fake), "u1", NOW);
    assert.equal(r.contracts.length, 1);
    const c = r.contracts[0]!;
    assert.equal(c.arenaName, "Arena CFC");
    assert.equal(c.arenaWhatsapp, "5562982415530");
    assert.equal(c.status, "active"); // termina 14/12: mais de 30 dias
    assert.equal(c.nextDueDate, "2026-11-15");
    assert.equal(JSON.stringify(c).includes("paga sempre atrasado"), false);
    assert.deepEqual(c.payments.map((p) => p.method), ["Pix online", "Pix"]);
    assert.equal(c.weekHours.length, 8);
    assert.equal(c.weekHours[7], 2.5);
    assert.deepEqual(c.installments.map((i) => i.state), ["paid", "paid", "open"]);
  });

  it("atrasado mostra desde quando e o link aberto pela arena", async () => {
    const fake = seed();
    fake.seedDoc("arenaCrmContracts/c1", contractDoc({
      paidInstallments: 1,
      onlineLink: {linkId: "l1", invoiceUrl: "https://asaas/i/1", fromInstallment: 1, installments: 2, amountReais: 600, createdAt: "2026-11-01T12:00:00Z", byName: "Bruna"},
    }));
    const c = (await getMyArenaContractsCore(db(fake), "u1", NOW)).contracts[0]!;
    assert.equal(c.status, "overdue");
    assert.equal(c.overdueReais, 300);
    assert.equal(c.overdueSince, "2026-10-15");
    assert.deepEqual(c.payLink, {invoiceUrl: "https://asaas/i/1", amountReais: 600, installments: 2});
    assert.deepEqual(c.installments.map((i) => i.state), ["paid", "link", "link"]);
  });

  it("cancelado, renovado e não renovado sem dívida somem; dívida antiga continua", async () => {
    const fake = seed();
    fake.seedDoc("arenaCrmContracts/c1", contractDoc({status: "canceled"}));
    assert.equal((await getMyArenaContractsCore(db(fake), "u1", NOW)).contracts.length, 0);

    fake.seedDoc("arenaCrmContracts/c1", contractDoc({startDate: "2026-05-15", paidInstallments: 3, renewedToId: "c9"}));
    assert.equal((await getMyArenaContractsCore(db(fake), "u1", NOW)).contracts.length, 0);

    fake.seedDoc("arenaCrmContracts/c1", contractDoc({startDate: "2026-05-15", paidInstallments: 2, renewedToId: "c9"}));
    const debt = (await getMyArenaContractsCore(db(fake), "u1", NOW)).contracts;
    assert.equal(debt.length, 1);
    assert.equal(debt[0]!.status, "overdue");
  });

  it("parcelas: as duas últimas pagas, a em aberto e as próximas", () => {
    const record = contractFromDoc("c1", contractDoc({period: "monthly", autoRenew: true, startDate: "2026-05-15", paidInstallments: 6}));
    const list = installmentSchedule(record, contractView(record, "2026-11-11"), "2026-11-11");
    assert.deepEqual(list.map((i) => `${i.number}:${i.month}:${i.state}`), [
      "5:2026-09:paid", "6:2026-10:paid", "7:2026-11:open", "8:2026-12:future", "9:2027-01:future", "10:2027-02:future",
    ]);
  });

  it("horas da semana contam o que já está reservado até domingo", () => {
    const weeks = athleteWeekHours([
      {date: "2026-11-15", startTime: "08:00", endTime: "10:00", status: "active", source: "platform"},
      {date: "2026-11-16", startTime: "08:00", endTime: "10:00", status: "active", source: "platform"}, // semana que vem
      {date: "2026-11-14", startTime: "08:00", endTime: "09:00", status: "active", source: "class"}, // aula não conta
    ], "2026-11-11");
    assert.equal(weeks[7], 2);
  });

  it("espelho do atleta acompanha os contratos e some sem nenhum", async () => {
    const fake = seed();
    await syncArenaCrmMember(db(fake), "u1");
    assert.deepEqual(fake.store.get("arenaCrmMembers/u1")!["contractIds"], ["c1"]);
    fake.seedDoc("arenaCrmContracts/c1", contractDoc({status: "canceled"}));
    await syncArenaCrmMember(db(fake), "u1");
    assert.equal(fake.store.has("arenaCrmMembers/u1"), false);
  });
});

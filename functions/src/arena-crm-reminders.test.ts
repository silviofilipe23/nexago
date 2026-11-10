import {afterEach, describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import type {CrmContractRecord, CrmOverview} from "./arena-crm-model";
import {
  DEFAULT_REMINDER_SETTINGS,
  planContractReminders,
  reminderOutcome,
  reminderSettingsFrom,
  teamDigest,
} from "./arena-crm-reminders-model";
import {crmNotifier, runArenaCrmReminders, type CrmPushInput} from "./arena-crm-reminders";

const TODAY = "2026-11-10";
const ON = DEFAULT_REMINDER_SETTINGS;

function contract(o: Partial<CrmContractRecord> = {}): CrmContractRecord {
  return {
    id: "c1", arenaId: "arena1", customerKey: "a:u1", athleteId: "u1", customerName: "Rafael Moura", customerPhone: null,
    planId: null, planName: "Noite 2x", period: "monthly", dueDay: 15, timesPerWeek: 2, monthlyPriceReais: 260,
    startDate: "2026-09-15", autoRenew: true, paidInstallments: 2, status: "active", canceledOn: null, cancelReason: null,
    renewedFromId: null, renewedToId: null, note: null, createdAt: null, ...o,
  };
}

describe("planContractReminders", () => {
  it("vence em 3 dias e vence hoje", () => {
    const soon = planContractReminders(contract(), "2026-11-12", "Arena CFC", "2026-11-11", ON);
    assert.deepEqual(soon.map((r) => [r.kind, r.refDate, r.installment]), [["due_soon", "2026-11-15", 2]]);
    assert.match(soon[0]!.body, /^Rafael, a mensalidade do Noite 2x na Arena CFC \(R\$ 260\) vence em 15\/11/);
    const today = planContractReminders(contract(), "2026-11-15", "Arena CFC", "2026-11-14", ON);
    assert.equal(today[0]?.kind, "due_today");
    assert.equal(planContractReminders(contract(), "2026-11-13", "Arena CFC", "2026-11-12", ON).length, 0);
  });

  it("atraso no dia seguinte e uma semana depois", () => {
    const late = contract({paidInstallments: 1}); // 2ª parcela venceu em 15/10
    assert.equal(planContractReminders(late, "2026-10-16", "Arena CFC", "2026-10-15", ON)[0]?.kind, "overdue_1");
    const week = planContractReminders(late, "2026-10-22", "Arena CFC", "2026-10-20", ON)[0];
    assert.equal(week?.kind, "overdue_7");
    assert.equal(week?.refDate, "2026-10-15");
    assert.match(week!.body, /em aberto desde 15\/10/);
  });

  it("contrato fechado terminando em 15 e em 3 dias", () => {
    const c = contract({period: "quarterly", autoRenew: false, startDate: "2026-09-01", dueDay: 5, paidInstallments: 3});
    assert.equal(planContractReminders(c, "2026-11-15", "Arena CFC", "2026-11-14", ON)[0]?.kind, "renewal_15");
    assert.equal(planContractReminders(c, "2026-11-27", "Arena CFC", "2026-11-26", ON)[0]?.kind, "renewal_3");
    assert.equal(planContractReminders({...c, renewedToId: "c2"}, "2026-11-27", "Arena CFC", null, ON).length, 0);
  });

  it("sumido há 14 dias: um lembrete por sumiço (a data do último jogo entra no id)", () => {
    const r = planContractReminders(contract({paidInstallments: 3}), TODAY, "Arena CFC", "2026-10-25", ON);
    assert.deepEqual(r.map((x) => [x.kind, x.refDate]), [["absence", "2026-10-25"]]);
    assert.match(r[0]!.body, /Faz 16 dias/);
    assert.equal(planContractReminders(contract({paidInstallments: 3}), TODAY, "Arena CFC", "2026-11-01", ON).length, 0);
    // Contrato novo ainda não conta como sumiço.
    assert.equal(planContractReminders(contract({startDate: "2026-11-01", paidInstallments: 1}), TODAY, "Arena CFC", null, ON).length, 0);
  });

  it("um por dia: atraso ganha de sumiço", () => {
    const r = planContractReminders(contract({paidInstallments: 1, startDate: "2026-09-15"}), "2026-10-22", "Arena CFC", null, ON);
    assert.deepEqual(r.map((x) => x.kind), ["overdue_7"]);
  });

  it("respeita os interruptores e ignora cliente sem app ou cancelado", () => {
    const off = reminderSettingsFrom({due: false});
    assert.equal(planContractReminders(contract(), "2026-11-12", "Arena CFC", "2026-11-11", off).length, 0);
    assert.equal(planContractReminders(contract({athleteId: null}), "2026-11-12", "Arena CFC", null, ON).length, 0);
    assert.equal(planContractReminders(contract({status: "canceled"}), "2026-11-12", "Arena CFC", null, ON).length, 0);
    assert.deepEqual(reminderSettingsFrom(undefined), ON);
  });
});

describe("teamDigest", () => {
  function overview(queues: Partial<CrmOverview["queues"]>): CrmOverview {
    return {today: TODAY, customers: [], plans: [], kpis: {} as CrmOverview["kpis"],
      queues: {dueThisWeek: [], notRenewed: [], overdue: [], absent: [], convert: [], ...queues}};
  }

  it("junta só o que tem e fica em silêncio sem nada", () => {
    assert.equal(teamDigest(overview({}), "Arena CFC"), null);
    const d = teamDigest(overview({
      dueThisWeek: [{key: "a", date: TODAY, kind: "installment", amountReais: 260, contactedRecently: false}],
      overdue: [{key: "b", amountReais: 600, contactedRecently: false}, {key: "c", amountReais: 800, contactedRecently: false}],
      absent: [{key: "d", amountReais: 160, contactedRecently: false}],
      convert: [{key: "e", amountReais: 300, contactedRecently: false}],
    }), "Arena CFC")!;
    assert.equal(d.title, "CRM de hoje · Arena CFC");
    assert.equal(d.body, "1 mensalidade vence hoje, 2 em atraso (R$ 1.400) e 1 mensalista sumido. E 1 avulso pronto pra virar mensalista. Abra Clientes para agir.");
  });
});

describe("reminderOutcome", () => {
  it("pagou, renovou e voltou a jogar depois do lembrete", () => {
    const contracts = new Map([
      ["c1", contract({paidInstallments: 3})],
      ["c2", contract({id: "c2", customerKey: "a:u2", renewedToId: "c3"})],
    ]);
    const out = reminderOutcome([
      {contractId: "c1", customerKey: "a:u1", kind: "overdue_1", refDate: "2026-10-15", installment: 2, sentAt: "2026-11-08T12:00:00Z"},
      {contractId: "c1", customerKey: "a:u1", kind: "due_soon", refDate: "2026-12-15", installment: 3, sentAt: "2026-11-09T12:00:00Z"},
      {contractId: "c2", customerKey: "a:u2", kind: "renewal_3", refDate: "2026-11-12", installment: null, sentAt: "2026-11-09T12:00:00Z"},
      {contractId: "c1", customerKey: "a:u1", kind: "absence", refDate: "2026-10-20", installment: null, sentAt: "2026-11-05T12:00:00Z"},
      {contractId: "c1", customerKey: "a:u1", kind: "absence", refDate: "2026-09-01", installment: null, sentAt: "2026-10-01T12:00:00Z"},
    ], contracts, new Map([["a:u1", "2026-11-07"]]), TODAY);
    assert.equal(out.sent7d, 4);
    assert.deepEqual(out.paid, {done: 1, total: 2});
    assert.deepEqual(out.renewed, {done: 1, total: 1});
    assert.deepEqual(out.cameBack, {done: 1, total: 1});
  });
});

describe("runArenaCrmReminders", () => {
  const original = crmNotifier.send;
  afterEach(() => {
    crmNotifier.send = original;
  });

  it("manda o lembrete e o resumo uma vez só, mesmo rodando duas vezes", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1", {managerUserId: "owner", name: "Arena CFC"});
    fake.seedDoc("arenas/arena1/staff/g1", {status: "active", role: "gestor"});
    fake.seedDoc("arenas/arena1/staff/r1", {status: "active", role: "recepcao"});
    fake.seedDoc("users/u1", {fullName: "Rafael Moura"});
    fake.seedDoc("arenaCrmContracts/c1", {...contract({paidInstallments: 1}), startDate: "2026-09-15"});
    fake.seedDoc("arenaCrmContracts/c2", {...contract({id: "c2", customerKey: "n:joao", athleteId: null, customerName: "João"})});
    fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", athleteId: "u1", date: "2026-10-20", status: "active", source: "platform"});

    const sent: CrmPushInput[] = [];
    crmNotifier.send = async (input) => {
      sent.push(input);
      return {sent: 1, failed: 0};
    };
    const now = new Date("2026-10-22T12:00:00Z");
    const first = await runArenaCrmReminders(fake as unknown as Firestore, now);
    assert.equal(first.sent, 1);
    assert.equal(first.digests, 1);
    assert.deepEqual(sent.map((s) => [s.userId, s.type]), [
      ["u1", "arena_crm_overdue_7"],
      ["owner", "arena_crm_digest"],
      ["g1", "arena_crm_digest"],
    ]);
    assert.equal(sent[0]!.data["url"], "/arena/arena1");
    assert.ok(fake.store.has("arenaCrmReminders/c1_overdue_7_2026-10-15"));

    sent.length = 0;
    const again = await runArenaCrmReminders(fake as unknown as Firestore, now);
    assert.equal(again.sent, 0);
    assert.equal(again.skipped, 1);
    assert.equal(sent.length, 0);
  });

  it("interruptor desligado não manda nada", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1", {managerUserId: "owner", name: "Arena CFC"});
    fake.seedDoc("arenas/arena1/crmSettings/main", {reminders: {overdue: false, teamDigest: false}});
    fake.seedDoc("arenaCrmContracts/c1", {...contract({paidInstallments: 1}), startDate: "2026-09-15"});
    fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", athleteId: "u1", date: "2026-10-20", status: "active", source: "platform"});
    const sent: CrmPushInput[] = [];
    crmNotifier.send = async (input) => {
      sent.push(input);
      return {sent: 1, failed: 0};
    };
    await runArenaCrmReminders(fake as unknown as Firestore, new Date("2026-10-22T12:00:00Z"));
    assert.equal(sent.length, 0);
  });
});

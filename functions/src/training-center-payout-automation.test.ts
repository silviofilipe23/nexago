import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {runCenterPayoutAutomation} from "./training-center-payout-automation";
import {autoPayBlock, computePayout, monthToClose, readAutomation} from "./training-center-payout-model";
import type {PayoutTransferDeps, TransferInfo} from "./training-center-payout-transfer";

const C = "trainingCenters/c1";
/** 08:00 em São Paulo. */
const at = (day: string) => new Date(`${day}T11:00:00Z`);

function seed(settings: Record<string, unknown> = {autoClose: true, closeDay: 1, autoPay: true, reviewDays: 3}) {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {name: "CT Maré", status: "active", timezone: "America/Sao_Paulo", ownerUid: "owner"});
  fake.seedDoc(`${C}/settings/payouts`, settings);
  fake.seedDoc(`${C}/centerMembers/owner`, {uid: "owner", role: "center_owner", status: "active", displayName: "Renata"});
  fake.seedDoc(`${C}/centerMembers/marcos`, {uid: "marcos", role: "coach", status: "active", displayName: "Marcos"});
  fake.seedDoc(`${C}/centerMembers/lia`, {uid: "lia", role: "coach", status: "active", displayName: "Lia"});
  fake.seedDoc(`${C}/payRules/marcos`, {kind: "per_class", amountCents: 8000, percent: 0});
  fake.seedDoc(`${C}/payRules/lia`, {kind: "percent", amountCents: 0, percent: 40});
  fake.seedDoc(`${C}/classes/k1`, {name: "BT A", coachUid: "lia"});
  fake.seedDoc(`${C}/enrollments/e1`, {classId: "k1", studentName: "Bia"});
  fake.seedDoc(`${C}/invoices/i1`, {enrollmentId: "e1", status: "approved", amountCents: 32000, refundedCents: 0, payerName: "Bia", reference: "Mensal · out",
    approvedAt: Timestamp.fromDate(new Date("2026-10-06T15:00:00Z"))});
  for (const [id, date, status] of [["s1", "2026-10-05", "done"], ["s2", "2026-10-12", "done"], ["s3", "2026-10-19", "scheduled"], ["s4", "2026-11-02", "done"]]) {
    fake.seedDoc(`${C}/sessions/${id}`, {classId: "k2", className: "BT B", coachUid: "marcos", coachName: "Marcos", date, startTime: "18:00", status});
  }
  fake.seedDoc("trainingCenterReceiving/c1", {walletId: "wal_ct", source: "self", status: "approved", asaasEnv: "sandbox"});
  fake.seedDoc("trainingCenterAsaasSecrets/c1", {sealedApiKey: "sealed:$ct"});
  fake.seedDoc("professorPayoutAccounts/marcos", {walletId: "wal_marcos", status: "approved", asaasEnv: "sandbox"});
  fake.seedDoc("professorPayoutAccounts/lia", {walletId: "wal_lia", status: "approved", asaasEnv: "sandbox"});
  return fake;
}

function deps(day: string, status = "DONE") {
  const calls = {transfers: [] as string[], pushed: [] as Array<{userId: string; title: string; body: string}>};
  let n = 0;
  const d: PayoutTransferDeps = {
    now: () => at(day),
    env: () => "sandbox",
    openKey: (s) => s,
    createTransfer: async (_k, input): Promise<TransferInfo> => {
      calls.transfers.push(`${input.walletId}:${input.valueReais}`);
      n++;
      return {id: `tr_${n}`, status, authorized: true, failReason: ""};
    },
    getTransfer: async () => ({id: "tr_1", status, authorized: true, failReason: ""}),
    notify: async (x) => {
      calls.pushed.push({userId: x.userId, title: x.title, body: x.body});
    },
  };
  return {d, calls};
}

const db = (f: FakeFirestore) => f as unknown as Firestore;
const doc = (f: FakeFirestore, id: string) => f.store.get(`${C}/payouts/${id}`) as Record<string, unknown> | undefined;
const center = (f: FakeFirestore) => f.store.get(C) as Record<string, unknown>;

describe("automação · modelo", () => {
  it("política e quando fechar", () => {
    assert.deepEqual(readAutomation({autoClose: false, autoPay: true}).autoPay, false);
    assert.equal(monthToClose(readAutomation({autoClose: true, closeDay: 5}), "2026-11-04"), null);
    assert.equal(monthToClose(readAutomation({autoClose: true, closeDay: 5}), "2026-11-05"), "2026-10");
    assert.equal(monthToClose(readAutomation({autoClose: true, closeDay: 1}), "2026-01-01"), "2025-12");
    const a = readAutomation({autoClose: true, autoPay: true, maxAutoPayCents: 30000});
    const p = {status: "closed", autoPayAt: "2026-11-04", totalCents: 40000};
    assert.equal(autoPayBlock(p, a, "2026-11-03"), "em conferência");
    assert.equal(autoPayBlock(p, a, "2026-11-04"), "acima do teto");
    assert.equal(autoPayBlock({...p, totalCents: 20000, autoPayHold: true}, a, "2026-11-04"), "segurado");
    assert.equal(autoPayBlock({...p, totalCents: 20000}, a, "2026-11-04"), null);
  });

  it("cálculo igual ao do portal", () => {
    const r = computePayout({
      coachUid: "m", rule: {kind: "per_class", amountCents: 8000, percent: 0}, month: "2026-10", today: "2026-11-01",
      sessions: [{id: "a", data: {coachUid: "m", date: "2026-10-03", status: "done"}}, {id: "b", data: {coachUid: "m", date: "2026-10-20", status: "scheduled"}}],
      classes: [], enrollments: [], invoices: [], dayOf: (d) => d.toISOString().slice(0, 10),
    });
    assert.deepEqual([r.classesGiven, r.totalCents, r.pendingAttendance], [1, 8000, 1]);
  });
});

describe("automação · rodada", () => {
  it("dia 1: fecha outubro com conferência até dia 4 e avisa o owner; não fecha de novo", async () => {
    const fake = seed();
    const {d, calls} = deps("2026-11-01");
    const r = await runCenterPayoutAutomation(db(fake), "c1", center(fake), d);
    assert.equal(r.close?.closed, 2);
    assert.equal(doc(fake, "2026-10_marcos")!["totalCents"], 16000);
    assert.equal(doc(fake, "2026-10_lia")!["totalCents"], 12800);
    assert.equal(doc(fake, "2026-10_marcos")!["autoPayAt"], "2026-11-04");
    assert.equal(doc(fake, "2026-10_marcos")!["closedBy"], "auto");
    assert.equal(calls.transfers.length, 0);
    assert.equal(calls.pushed[0]!.userId, "owner");
    assert.match(calls.pushed[0]!.body, /2 repasses fechados \(R\$\s?288,00\).*paga sozinho em 04\/11/);
    assert.match(calls.pushed[0]!.body, /1 aula sem chamada finalizada ficou de fora/);
    const again = await runCenterPayoutAutomation(db(fake), "c1", center(fake), deps("2026-11-02").d);
    assert.equal(again.close, null);
  });

  it("dia 4: paga o que não foi segurado; repasse fechado à mão fica fora", async () => {
    const fake = seed();
    await runCenterPayoutAutomation(db(fake), "c1", center(fake), deps("2026-11-01").d);
    fake.seedDoc(`${C}/payouts/2026-10_lia`, {...doc(fake, "2026-10_lia"), autoPayHold: true});
    const pay = deps("2026-11-04");
    const r = await runCenterPayoutAutomation(db(fake), "c1", center(fake), pay.d);
    assert.equal(r.paid, 1);
    assert.deepEqual(pay.calls.transfers, ["wal_marcos:160"]);
    assert.equal(doc(fake, "2026-10_marcos")!["status"], "paid");
    assert.equal(doc(fake, "2026-10_lia")!["status"], "closed");
    assert.ok(pay.calls.pushed.some((p) => p.userId === "owner" && /1 transferência enviada/.test(p.body)));

    // Fechamento manual (sem autoPayAt) não sai sozinho.
    fake.seedDoc(`${C}/payouts/2026-10_lia`, {...doc(fake, "2026-10_lia"), autoPayHold: false, autoPayAt: null});
    const later = deps("2026-11-05");
    await runCenterPayoutAutomation(db(fake), "c1", center(fake), later.d);
    assert.equal(later.calls.transfers.length, 0);
  });

  it("sem conta do professor: não paga, grava o motivo e avisa; não repete", async () => {
    const fake = seed();
    fake.store.delete("professorPayoutAccounts/lia");
    await runCenterPayoutAutomation(db(fake), "c1", center(fake), deps("2026-11-01").d);
    const pay = deps("2026-11-04");
    const r = await runCenterPayoutAutomation(db(fake), "c1", center(fake), pay.d);
    assert.equal(r.blocked.length, 1);
    assert.match(String(doc(fake, "2026-10_lia")!["autoPayError"]), /ainda não tem conta/);
    assert.ok(pay.calls.pushed.some((p) => /Lia — Lia ainda não tem conta/.test(p.body)));
    const again = deps("2026-11-05");
    await runCenterPayoutAutomation(db(fake), "c1", center(fake), again.d);
    assert.equal(again.calls.transfers.length, 0);
  });

  it("só fechar (sem pagar) e automação desligada", async () => {
    const onlyClose = seed({autoClose: true, closeDay: 1, autoPay: false});
    await runCenterPayoutAutomation(db(onlyClose), "c1", center(onlyClose), deps("2026-11-01").d);
    assert.equal(doc(onlyClose, "2026-10_marcos")!["autoPayAt"], undefined);
    const off = seed({autoClose: false});
    const r = await runCenterPayoutAutomation(db(off), "c1", center(off), deps("2026-11-01").d);
    assert.equal(r.close, null);
    assert.equal(doc(off, "2026-10_marcos"), undefined);
  });
});

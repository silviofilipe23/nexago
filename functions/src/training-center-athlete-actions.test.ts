import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  answerCenterInviteCore,
  checkMyCenterInvoiceCore,
  myCenterInvoicePixCore,
  planSessionResponse,
  respondCenterSessionCore,
  sessionStartAt,
} from "./training-center-athlete-actions";
import {loadMyCenterInvites} from "./training-center-athlete";
import type {CenterBillingDeps} from "./training-center-billing";

const C = "trainingCenters/c1";
// Qui 22/10/2026 12:00 em São Paulo.
const NOW = new Date("2026-10-22T15:00:00Z");
const db = (f: FakeFirestore) => f as unknown as Firestore;
const doc = (f: FakeFirestore, path: string) => f.store.get(path) as Record<string, unknown>;

function seed() {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {name: "CT Areia Alta", status: "active", policies: {excusedNoticeHours: 4, excusedAbsenceMakeup: true}});
  fake.seedDoc(`${C}/students/s1`, {uid: "ana", name: "Ana", status: "active", email: "ana@x.com"});
  fake.seedDoc(`${C}/students/s2`, {uid: "bia", name: "Bia", status: "active"});
  fake.seedDoc(`${C}/students/inv`, {uid: null, name: "Caio", status: "invited", email: "caio@x.com"});
  fake.seedDoc(`${C}/classes/k1`, {name: "Performance", rosterStudentIds: ["s1", "s2"], weekdays: [5], startTime: "07:00"});
  fake.seedDoc(`${C}/enrollments/e9`, {studentId: "inv", classId: "k1", className: "Performance", status: "pending",
    contract: {planName: "Mensal", planType: "monthly", priceCents: 32000}});
  // Sexta 23/10 07:00 (19h à frente) e hoje 14:00 (2h à frente).
  fake.seedDoc(`${C}/sessions/k1_2026-10-23`, {classId: "k1", date: "2026-10-23", startTime: "07:00", status: "scheduled",
    attendance: {s2: "present"}});
  fake.seedDoc(`${C}/sessions/k1_2026-10-22`, {classId: "k1", date: "2026-10-22", startTime: "14:00", status: "scheduled"});
  fake.seedDoc(`${C}/sessions/k1_2026-10-21`, {classId: "k1", date: "2026-10-21", startTime: "07:00", status: "done",
    finalizedAt: NOW});
  fake.seedDoc(`${C}/invoices/i1`, {studentId: "s1", status: "pending", amountCents: 48000, dueDate: "2026-11-05",
    providerRef: "pay_1", providerUrl: "https://asaas/i/1"});
  fake.seedDoc(`${C}/invoices/i2`, {studentId: "s2", status: "pending", amountCents: 48000});
  return fake;
}

describe("Vou / Não vou na aula do centro", () => {
  it("não vou com antecedência = falta justificada marcada pelo aluno", async () => {
    const fake = seed();
    const r = await respondCenterSessionCore(db(fake), "ana", {centerId: "c1", sessionId: "k1_2026-10-23", response: "not_going"}, NOW);
    assert.deepEqual(r, {response: "not_going", excused: true});
    const s = doc(fake, `${C}/sessions/k1_2026-10-23`);
    assert.equal((s["attendance"] as Record<string, string>)["s1"], "excused");
    assert.equal((s["attendance"] as Record<string, string>)["s2"], "present", "não pisa no colega");
    assert.equal(((s["rsvps"] as Record<string, Record<string, unknown>>)["s1"])!["response"], "not_going");
  });

  it("em cima da hora só registra o aviso", async () => {
    const fake = seed();
    const r = await respondCenterSessionCore(db(fake), "ana", {centerId: "c1", sessionId: "k1_2026-10-22", response: "not_going"}, NOW);
    assert.equal(r.excused, false);
    assert.equal(doc(fake, `${C}/sessions/k1_2026-10-22`)["attendance"], undefined);
  });

  it("aula fechada, de outra turma ou de quem não é aluno é recusada", async () => {
    const fake = seed();
    await assert.rejects(respondCenterSessionCore(db(fake), "ana", {centerId: "c1", sessionId: "k1_2026-10-21", response: "going"}, NOW),
      /fechada/);
    await assert.rejects(respondCenterSessionCore(db(fake), "zeca", {centerId: "c1", sessionId: "k1_2026-10-23", response: "going"}, NOW),
      /não é aluno/);
    await assert.rejects(respondCenterSessionCore(db(fake), "ana", {centerId: "c1", sessionId: "k1_2026-10-23", response: "talvez"}, NOW),
      /inválida/);
  });

  it("vou desfaz só a falta que o aluno marcou", () => {
    const start = new Date("2026-10-23T10:00:00Z");
    const mine = planSessionResponse({
      session: {attendance: {s1: "excused", s2: "excused"}, attendanceByStudent: {s1: true}},
      studentId: "s1", response: "going", now: NOW, start, noticeHours: 4, makeupOnNotice: true,
    });
    assert.deepEqual(mine.update["attendance"], {s2: "excused"});
    const team = planSessionResponse({
      session: {attendance: {s1: "excused"}},
      studentId: "s1", response: "going", now: NOW, start, noticeHours: 4, makeupOnNotice: true,
    });
    assert.equal(team.update["attendance"], undefined, "falta lançada pela equipe fica");
    const noMakeup = planSessionResponse({
      session: {}, studentId: "s1", response: "not_going", now: NOW, start, noticeHours: 4, makeupOnNotice: false,
    });
    assert.equal(noMakeup.excused, false);
  });

  it("início da aula na parede de São Paulo", () => {
    assert.equal(sessionStartAt({date: "2026-10-23", startTime: "07:00"})!.toISOString(), "2026-10-23T10:00:00.000Z");
    assert.equal(sessionStartAt({date: "x", startTime: "07:00"}), null);
  });
});

describe("convite do centro pelo e-mail", () => {
  const caio = {uid: "caio", email: "caio@x.com", verified: true, name: "Caio"};

  it("lista o convite só com e-mail verificado", async () => {
    const fake = seed();
    const ok = await loadMyCenterInvites(db(fake), "caio@x.com", true);
    assert.equal(ok.invites.length, 1);
    assert.equal(ok.invites[0]!.centerName, "CT Areia Alta");
    assert.equal(ok.invites[0]!.enrollments[0]!.priceCents, 32000);
    assert.deepEqual(ok.invites[0]!.enrollments[0]!.weekdays, [5]);
    const hidden = await loadMyCenterInvites(db(fake), "caio@x.com", false);
    assert.deepEqual(hidden, {invites: [], unverifiedInvites: 1});
    assert.equal((await loadMyCenterInvites(db(fake), "ana@x.com", true)).invites.length, 0, "já vinculado não é convite");
  });

  it("aceitar vincula a conta e registra o consentimento", async () => {
    const fake = seed();
    await answerCenterInviteCore(db(fake), caio, {centerId: "c1", studentId: "inv", accept: true}, NOW);
    const s = doc(fake, `${C}/students/inv`);
    assert.equal(s["uid"], "caio");
    assert.equal(s["status"], "active");
    assert.ok(s["lgpdConsentAt"]);
    const audits = [...fake.store.keys()].filter((k) => k.startsWith(`${C}/auditLogs/`));
    assert.equal(audits.length, 1);
    await assert.rejects(answerCenterInviteCore(db(fake), caio, {centerId: "c1", studentId: "inv", accept: true}, NOW),
      /já é aluno|não está mais disponível/);
  });

  it("recusar, e-mail de outra pessoa e e-mail não verificado", async () => {
    const fake = seed();
    await assert.rejects(answerCenterInviteCore(db(fake), {...caio, email: "outro@x.com"},
      {centerId: "c1", studentId: "inv", accept: true}, NOW), /não está mais disponível/);
    await assert.rejects(answerCenterInviteCore(db(fake), {...caio, verified: false},
      {centerId: "c1", studentId: "inv", accept: true}, NOW), /Confirme seu e-mail/);
    await answerCenterInviteCore(db(fake), caio, {centerId: "c1", studentId: "inv", accept: false}, NOW);
    assert.equal(doc(fake, `${C}/students/inv`)["status"], "inactive");
    assert.equal(doc(fake, `${C}/students/inv`)["uid"], null);
  });
});

describe("fatura do centro no app", () => {
  const deps = (over: Partial<CenterBillingDeps> = {}) => ({
    now: () => NOW,
    env: () => "sandbox",
    pixPayload: async () => "00020126PIX",
    getPayment: async () => ({status: "RECEIVED", value: 480, netValue: 470}),
    ...over,
  }) as unknown as CenterBillingDeps;

  it("Pix copia-e-cola só da fatura do próprio aluno", async () => {
    const fake = seed();
    const r = await myCenterInvoicePixCore(db(fake), "ana", {centerId: "c1", invoiceId: "i1"}, deps());
    assert.deepEqual(r, {status: "pending", invoiceUrl: "https://asaas/i/1", pixPayload: "00020126PIX"});
    await assert.rejects(myCenterInvoicePixCore(db(fake), "ana", {centerId: "c1", invoiceId: "i2"}, deps()), /não encontrada/);
  });

  it("sem copia-e-cola segue com o link", async () => {
    const fake = seed();
    const r = await myCenterInvoicePixCore(db(fake), "ana", {centerId: "c1", invoiceId: "i1"},
      deps({pixPayload: async () => { throw new Error("off"); }}));
    assert.equal(r.pixPayload, "");
    assert.equal(r.invoiceUrl, "https://asaas/i/1");
  });

  it("fatura já paga não consulta o provedor", async () => {
    const fake = seed();
    fake.seedDoc(`${C}/invoices/i1`, {studentId: "s1", status: "approved", providerRef: "pay_1"});
    let called = false;
    const r = await checkMyCenterInvoiceCore(db(fake), "ana", {centerId: "c1", invoiceId: "i1"},
      deps({getPayment: async () => { called = true; return {} as never; }}));
    assert.deepEqual(r, {status: "approved"});
    assert.equal(called, false);
  });
});

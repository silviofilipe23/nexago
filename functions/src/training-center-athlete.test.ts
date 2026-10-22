import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {isoWeekdays, loadMyTrainingCentersCore, mapCenterInvoice} from "./training-center-athlete";

const C = "trainingCenters/c1";
const NOW = new Date("2026-10-22T15:00:00Z");
const db = (f: FakeFirestore) => f as unknown as Firestore;

function seed() {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {
    name: "CT Areia Alta", city: "Rio de Janeiro", state: "RJ", status: "active", timezone: "America/Sao_Paulo",
    policies: {excusedNoticeHours: 6, excusedAbsenceMakeup: true, makeupValidityDays: 30, allowPause: false},
  });
  fake.seedDoc(`${C}/students/s1`, {
    uid: "ana", name: "Ana", status: "active", makeupCredits: 1, phone: "21999999999", medicalNotes: "asma",
  });
  fake.seedDoc(`${C}/classes/k1`, {
    name: "Performance", level: "Avançado", coachName: "Paula Viana", weekdays: [1, 3, 5], startTime: "07:00",
    durationMin: 90, locationId: "sede", locationName: "Sede Barra", rosterStudentIds: ["s1", "s2"],
  });
  fake.seedDoc(`${C}/classes/k2`, {name: "Iniciante", locationId: "sede", locationName: "Sede Barra"});
  fake.seedDoc(`${C}/enrollments/e1`, {
    studentId: "s1", classId: "k1", className: "Performance", status: "active", startDate: "2026-08-01",
    contract: {planName: "Mensal 3×", planType: "monthly", priceCents: 48000, classesPerWeek: 3},
  });
  fake.seedDoc(`${C}/enrollments/e0`, {studentId: "s1", classId: "k2", status: "cancelled"});
  fake.seedDoc(`${C}/subscriptions/e1`, {status: "active", billingDay: 5, method: "pix_manual", nextChargeDate: "2026-11-05"});
  fake.seedDoc(`${C}/sessions/k1_2026-10-23`, {
    classId: "k1", className: "Performance", date: "2026-10-23", startTime: "07:00", durationMin: 90,
    coachName: "Paula", locationId: "sede", locationName: "Sede Barra", status: "scheduled", attendance: {},
  });
  fake.seedDoc(`${C}/sessions/k1_2026-10-26`, {
    classId: "k1", className: "Performance", date: "2026-10-26", startTime: "07:00",
    locationId: "leme", locationName: "Praia do Leme", locationAddress: "Av. Atlântica", status: "scheduled",
    changed: true, changeReason: "Físico na areia",
  });
  fake.seedDoc(`${C}/sessions/k1_2026-10-20`, {
    classId: "k1", date: "2026-10-20", startTime: "07:00", locationId: "sede", status: "done",
    attendance: {s1: "present", s2: "absent"},
  });
  fake.seedDoc(`${C}/sessions/k1_2027-01-10`, {classId: "k1", date: "2027-01-10", status: "scheduled"});
  fake.seedDoc(`${C}/sessions/k2_2026-10-24`, {
    classId: "k2", date: "2026-10-24", startTime: "09:00", locationId: "sede", status: "scheduled", makeupStudentIds: ["s1"],
  });
  fake.seedDoc(`${C}/invoices/i1`, {
    studentId: "s1", reference: "Novembro", amountCents: 48000, dueDate: "2026-11-05", status: "pending",
    providerUrl: "https://asaas.com/i/1", providerRef: "pay_1",
  });
  fake.seedDoc(`${C}/invoices/i0`, {studentId: "s1", amountCents: 48000, dueDate: "2026-10-05", status: "approved"});
  fake.seedDoc(`${C}/invoices/ix`, {studentId: "s1", dueDate: "2026-09-05", status: "cancelled"});
  fake.seedDoc(`${C}/invoices/other`, {studentId: "s2", dueDate: "2026-11-05", status: "pending"});
  fake.seedDoc(`${C}/locations/sede`, {name: "Sede Barra", type: "own", address: "Av. Lúcio Costa", status: "active"});
  fake.seedDoc(`${C}/locations/leme`, {name: "Praia do Leme", type: "adhoc", status: "active"});
  fake.seedDoc(`${C}/locations/norte`, {name: "Arena Norte", type: "partner", status: "active"});
  // Carteira do professor também é `students`, mas não é centro.
  fake.seedDoc("professors/p1/students/ana", {uid: "ana", athleteId: "ana", status: "active"});
  return fake;
}

describe("getMyTrainingCenters", () => {
  it("monta a visão do aluno: matrícula visível, aulas da janela, regras e faturas", async () => {
    const {centers} = await loadMyTrainingCentersCore(db(seed()), "ana", NOW);
    assert.equal(centers.length, 1);
    const c = centers[0]!;
    assert.equal(c.name, "CT Areia Alta");
    assert.equal(c.makeupCredits, 1);
    assert.equal(c.policies.excusedNoticeHours, 6);
    assert.equal(c.policies.allowPause, false);
    assert.deepEqual(c.enrollments.map((e) => e.enrollmentId), ["e1"]);
    const e = c.enrollments[0]!;
    assert.deepEqual(e.weekdays, [1, 3, 5]);
    assert.equal(e.priceCents, 48000);
    assert.equal(e.billing?.nextChargeDate, "2026-11-05");
    assert.deepEqual(c.sessions.map((s) => s.sessionId),
      ["k1_2026-10-20", "k1_2026-10-23", "k2_2026-10-24", "k1_2026-10-26"]);
    const leme = c.sessions.find((s) => s.sessionId === "k1_2026-10-26")!;
    assert.equal(leme.locationChanged, true);
    assert.equal(leme.defaultLocationName, "Sede Barra");
    assert.equal(c.sessions.find((s) => s.sessionId === "k1_2026-10-20")!.myMark, "present");
    assert.equal(c.sessions.find((s) => s.sessionId === "k2_2026-10-24")!.isMakeup, true);
    assert.deepEqual(c.invoices.map((i) => i.invoiceId), ["i1", "i0"]);
    assert.equal(c.invoices[0]!.payUrl, "https://asaas.com/i/1");
    assert.deepEqual(c.locations.map((l) => l.name).sort(), ["Praia do Leme", "Sede Barra"]);
  });

  it("não vaza dado de outro aluno nem do cadastro", async () => {
    const {centers} = await loadMyTrainingCentersCore(db(seed()), "ana", NOW);
    const json = JSON.stringify(centers);
    for (const leak of ["21999999999", "asma", "s2", "pay_1", "rosterStudentIds"]) {
      assert.ok(!json.includes(leak), `vazou ${leak}`);
    }
  });

  it("centro suspenso, aluno bloqueado e quem não é aluno ficam de fora", async () => {
    const fake = seed();
    assert.deepEqual((await loadMyTrainingCentersCore(db(fake), "bia", NOW)).centers, []);
    fake.seedDoc(`${C}/students/s1`, {uid: "ana", status: "blocked"});
    assert.deepEqual((await loadMyTrainingCentersCore(db(fake), "ana", NOW)).centers, []);
    const fake2 = seed();
    fake2.seedDoc(C, {name: "CT", status: "suspended"});
    assert.deepEqual((await loadMyTrainingCentersCore(db(fake2), "ana", NOW)).centers, []);
  });
});

describe("mapeamentos", () => {
  it("weekdays 0–6 (domingo = 0) viram ISO", () => {
    assert.deepEqual(isoWeekdays([0, 2, 2, 6]), [2, 6, 7]);
    assert.deepEqual(isoWeekdays(["mon", "fri"]), [1, 5]);
  });

  it("link de pagamento só na fatura em aberto e com URL válida", () => {
    assert.equal(mapCenterInvoice("a", {status: "approved", providerUrl: "https://x"}, "")!.payUrl, null);
    assert.equal(mapCenterInvoice("a", {status: "pending", providerUrl: "javascript:x"}, "")!.payUrl, null);
    assert.equal(mapCenterInvoice("a", {status: "cancelled"}, ""), null);
  });
});

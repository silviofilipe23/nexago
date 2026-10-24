import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  dueAction,
  pauseDaysUsed,
  planCancel,
  planPause,
  readCertificate,
  readExitPolicies,
  RequestRuleError,
} from "./training-center-enrollment-requests-model";
import {
  decideEnrollmentRequestCore,
  requestEnrollmentChangeCore,
  runCenterEnrollmentRequests,
  submitMedicalClearanceCore,
  withdrawEnrollmentRequestCore,
} from "./training-center-enrollment-requests";
import {loadMyTrainingCentersCore} from "./training-center-athlete";
import {generateNextCycle} from "./training-center-subscriptions";
import {offerOpenSeats, type SeatReturn} from "./training-center-waitlist";
import {Timestamp} from "firebase-admin/firestore";
import type {PushInput} from "./training-center-notify";

type Data = Record<string, unknown>;

const C = "trainingCenters/c1";
// 24/10/2026 14:00 em São Paulo.
const NOW = new Date("2026-10-24T17:00:00Z");
const db = (f: FakeFirestore) => f as unknown as Firestore;
const doc = (f: FakeFirestore, path: string) => f.store.get(path) as Data;
const under = (f: FakeFirestore, prefix: string) => [...f.store.keys()].filter((k) => k.startsWith(prefix));
const STUDENT = {uid: "u-carla", token: {name: "Carla Dias"}} as never;

function deps(now = NOW) {
  const pushes: PushInput[] = [];
  return {pushes, deps: {now: () => now, notify: async (p: PushInput) => {
    pushes.push(p);
  }}};
}

function seed(policies: Data = {}) {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {
    name: "CT Maré Alta", status: "active", timezone: "America/Sao_Paulo",
    policies: {monthlyCancellation: "end_of_cycle", allowPause: true, pauseMaxDaysPerYear: 60, pauseMinDays: 15, ...policies},
  });
  fake.seedDoc(`${C}/centerMembers/owner`, {uid: "owner", role: "center_owner", status: "active", displayName: "Renata"});
  fake.seedDoc(`${C}/students/carla`, {uid: "u-carla", name: "Carla Dias", status: "active"});
  fake.seedDoc(`${C}/classes/bt`, {name: "BT Feminino Manhã", programId: "bt", seatsTaken: 8, rosterStudentIds: ["carla", "ana"]});
  fake.seedDoc(`${C}/plans/m2`, {name: "Mensal 2x/semana", type: "monthly", status: "active", priceCents: 32000, classesPerWeek: 2, programIds: ["bt"]});
  fake.seedDoc(`${C}/plans/m1`, {name: "Mensal 1x/semana", type: "monthly", status: "active", priceCents: 18000, classesPerWeek: 1, programIds: ["bt"]});
  fake.seedDoc(`${C}/enrollments/e1`, {
    studentId: "carla", studentName: "Carla Dias", classId: "bt", className: "BT Feminino Manhã", planId: "m2", status: "active",
    startDate: "2026-03-05", contract: {planName: "Mensal 2x/semana", planType: "monthly", priceCents: 32000, classesPerWeek: 2},
  });
  fake.seedDoc(`${C}/subscriptions/e1`, {status: "active", nextChargeDate: "2026-11-05", planId: "m2", planName: "Mensal 2x/semana", priceCents: 32000});
  return fake;
}

const P = readExitPolicies({pauseMaxDaysPerYear: 60, pauseMinDays: 15});

describe("pedidos da matrícula · regras puras", () => {
  it("trancamento: datas, mínimo e limite do ano", () => {
    const p = planPause({type: "pause", today: "2026-10-24", startsOn: "2026-11-01", days: 30, policies: P, usedDays: 0});
    assert.deepEqual([p.startsOn, p.endsOn, p.pausedUntil], ["2026-11-01", "2026-11-30", "2026-12-01"]);
    assert.throws(() => planPause({type: "pause", today: "2026-10-24", startsOn: "2026-10-24", days: 10, policies: P, usedDays: 0}),
      /mínimo é de 15 dias/);
    assert.throws(() => planPause({type: "pause", today: "2026-10-24", startsOn: "2026-10-24", days: 20, policies: P, usedDays: 50}),
      /10 dias de trancamento livres/);
    assert.throws(() => planPause({type: "pause", today: "2026-10-24", startsOn: "2026-10-20", days: 20, policies: P, usedDays: 0}),
      RequestRuleError);
  });

  it("lesão não conta no limite e acima do teto fica para a gestão", () => {
    const p = planPause({type: "injury", today: "2026-10-24", startsOn: "2026-10-24", days: 120, policies: P, usedDays: 60});
    assert.equal(p.overInjuryLimit, true);
    const counted = readExitPolicies({pauseMaxDaysPerYear: 60, injuryCountsInLimit: true});
    assert.throws(() => planPause({type: "injury", today: "2026-10-24", startsOn: "2026-10-24", days: 30, policies: counted, usedDays: 40}));
  });

  it("dias usados somam só pausas aprovadas do ano", () => {
    const used = pauseDaysUsed([
      {type: "pause", status: "done", startsOn: "2026-02-01", days: 15},
      {type: "pause", status: "rejected", startsOn: "2026-05-01", days: 30},
      {type: "injury", status: "done", startsOn: "2026-06-01", days: 20},
      {type: "pause", status: "done", startsOn: "2025-12-20", days: 15},
    ], "2026", false);
    assert.equal(used, 15);
  });

  it("cancelamento: fim do ciclo, imediato e pacote", () => {
    assert.deepEqual(planCancel({planType: "monthly", policies: P, nextChargeDate: "2026-11-05", today: "2026-10-24"}),
      {lastDay: "2026-11-04", endsNow: false, cancelAt: "2026-11-05"});
    assert.equal(planCancel({planType: "class_pack", policies: P, nextChargeDate: null, today: "2026-10-24"}).endsNow, true);
    const immediate = readExitPolicies({monthlyCancellation: "immediate"});
    assert.equal(planCancel({planType: "monthly", policies: immediate, nextChargeDate: "2026-11-05", today: "2026-10-24"}).endsNow, true);
  });

  it("atestado só da pasta do aluno, PDF ou foto, emitido até hoje", () => {
    const ok = {path: "trainingCenterCertificates/c1/u1/a.pdf", contentType: "application/pdf", sizeBytes: 1000, issuedOn: "2026-10-23"};
    assert.equal(readCertificate(ok, "trainingCenterCertificates/c1/u1/", "2026-10-24")?.fileName, "atestado");
    assert.throws(() => readCertificate({...ok, path: "trainingCenterCertificates/c1/outro/a.pdf"}, "trainingCenterCertificates/c1/u1/", "2026-10-24"));
    assert.throws(() => readCertificate({...ok, contentType: "text/plain"}, null, "2026-10-24"));
    assert.throws(() => readCertificate({...ok, issuedOn: "2026-10-30"}, null, "2026-10-24"));
  });

  it("rodada: começa, fecha e encerra no dia certo", () => {
    assert.equal(dueAction({type: "pause", status: "scheduled", startsOn: "2026-11-01"}, "2026-11-01"), "start_pause");
    assert.equal(dueAction({type: "pause", status: "active", endsOn: "2026-11-30"}, "2026-11-30"), null);
    assert.equal(dueAction({type: "pause", status: "active", endsOn: "2026-11-30"}, "2026-12-01"), "finish_pause");
    assert.equal(dueAction({type: "cancel", status: "scheduled", lastDay: "2026-11-04"}, "2026-11-05"), "end_enrollment");
  });
});

describe("pedidos da matrícula · callables", () => {
  it("trancamento que começa hoje pausa a matrícula e avisa a gestão", async () => {
    const fake = seed();
    const {deps: d, pushes} = deps();
    const r = await requestEnrollmentChangeCore(db(fake), STUDENT, {centerId: "c1", enrollmentId: "e1", type: "pause", days: 20, reason: "Viagem"}, d);
    assert.equal(r.status, "active");
    const enr = doc(fake, `${C}/enrollments/e1`);
    assert.equal(enr["status"], "paused");
    assert.equal(enr["pausedUntil"], "2026-11-13");
    assert.equal(pushes[0]?.userId, "owner");
    assert.ok(under(fake, `${C}/auditLogs/`).length >= 2);
  });

  it("outra conta não pede pela matrícula", async () => {
    const fake = seed();
    await assert.rejects(requestEnrollmentChangeCore(db(fake), {uid: "intruso"} as never,
      {centerId: "c1", enrollmentId: "e1", type: "pause", days: 20}, deps().deps), /não é sua/);
  });

  it("lesão espera a gestão; pedir documento; reenviar; aprovar pausa", async () => {
    const fake = seed();
    const {deps: d, pushes} = deps();
    const cert = {path: "trainingCenterCertificates/c1/u-carla/a.pdf", contentType: "application/pdf", sizeBytes: 2000,
      issuedOn: "2026-10-23", daysOff: 30, description: "Entorse no joelho"};
    const r = await requestEnrollmentChangeCore(db(fake), STUDENT, {centerId: "c1", enrollmentId: "e1", type: "injury", certificate: cert}, d);
    assert.equal(r.status, "pending");
    assert.equal(doc(fake, `${C}/enrollments/e1`)["status"], "active");

    await assert.rejects(decideEnrollmentRequestCore(db(fake), "owner", {centerId: "c1", requestId: r.requestId, decision: "reject"}, d),
      /motivo/);
    await decideEnrollmentRequestCore(db(fake), "owner", {centerId: "c1", requestId: r.requestId, decision: "needs_document", note: "Atestado sem CRM"}, d);
    assert.equal(doc(fake, `${C}/enrollmentRequests/${r.requestId}`)["status"], "needs_document");
    assert.equal(pushes[pushes.length - 1]?.userId, "u-carla");

    const again = await requestEnrollmentChangeCore(db(fake), STUDENT,
      {centerId: "c1", enrollmentId: "e1", type: "injury", certificate: {...cert, path: "trainingCenterCertificates/c1/u-carla/b.pdf"}}, d);
    assert.equal(again.requestId, r.requestId);
    assert.equal(doc(fake, `${C}/enrollmentRequests/${r.requestId}`)["status"], "pending");

    const ok = await decideEnrollmentRequestCore(db(fake), "owner", {centerId: "c1", requestId: r.requestId, decision: "approve"}, d);
    assert.equal(ok.status, "active");
    const enr = doc(fake, `${C}/enrollments/e1`);
    assert.equal(enr["status"], "paused");
    assert.equal(enr["pausedUntil"], "2026-11-23");
    assert.equal(enr["pauseReason"], "Pausa por lesão");
  });

  it("só a gestão decide", async () => {
    const fake = seed();
    await assert.rejects(decideEnrollmentRequestCore(db(fake), "u-carla", {centerId: "c1", requestId: "x", decision: "approve"}, deps().deps),
      /owner ou admin/);
  });

  it("cancelamento entra em aviso até o fim do ciclo; aluno desiste", async () => {
    const fake = seed();
    const {deps: d} = deps();
    const r = await requestEnrollmentChangeCore(db(fake), STUDENT,
      {centerId: "c1", enrollmentId: "e1", type: "cancel", reason: "moving", retentionOffered: ["pause", "plan_change"]}, d);
    assert.deepEqual([r.status, r.lastDay], ["scheduled", "2026-11-04"]);
    const sub = doc(fake, `${C}/subscriptions/e1`);
    assert.deepEqual([sub["status"], sub["cancelAt"]], ["canceling", "2026-11-05"]);
    await assert.rejects(requestEnrollmentChangeCore(db(fake), STUDENT, {centerId: "c1", enrollmentId: "e1", type: "pause", days: 20}, d),
      /pedido em andamento/);

    await withdrawEnrollmentRequestCore(db(fake), STUDENT, {centerId: "c1", requestId: r.requestId}, d);
    assert.equal(doc(fake, `${C}/subscriptions/e1`)["status"], "active");
    assert.equal(doc(fake, `${C}/enrollmentRequests/${r.requestId}`)["status"], "withdrawn");
  });

  it("retenção: troca de plano no próximo ciclo em vez de cancelar", async () => {
    const fake = seed();
    const r = await requestEnrollmentChangeCore(db(fake), STUDENT,
      {centerId: "c1", enrollmentId: "e1", type: "cancel", reason: "price", retainPlanId: "m1"}, deps().deps);
    assert.equal(r.status, "retained");
    const sub = doc(fake, `${C}/subscriptions/e1`);
    assert.equal(sub["status"], "active");
    assert.equal((sub["pendingPlanChange"] as Data)["planName"], "Mensal 1x/semana");
  });

  it("rodada encerra a matrícula depois do último dia e devolve a vaga", async () => {
    const fake = seed();
    const r = await requestEnrollmentChangeCore(db(fake), STUDENT, {centerId: "c1", enrollmentId: "e1", type: "cancel", reason: "schedule"}, deps().deps);
    const before = await runCenterEnrollmentRequests(db(fake), "c1", new Date("2026-11-04T12:00:00Z"));
    assert.equal(before.ended, 0);
    const s = await runCenterEnrollmentRequests(db(fake), "c1", new Date("2026-11-05T12:00:00Z"));
    assert.equal(s.ended, 1);
    assert.equal(doc(fake, `${C}/enrollments/e1`)["status"], "cancelled");
    assert.equal(doc(fake, `${C}/classes/bt`)["seatsTaken"], 7);
    assert.deepEqual(doc(fake, `${C}/classes/bt`)["rosterStudentIds"], ["ana"]);
    assert.equal(doc(fake, `${C}/enrollmentRequests/${r.requestId}`)["status"], "done");
  });

  it("trancamento agendado começa na rodada do dia", async () => {
    const fake = seed();
    const r = await requestEnrollmentChangeCore(db(fake), STUDENT,
      {centerId: "c1", enrollmentId: "e1", type: "pause", startsOn: "2026-11-01", days: 30}, deps().deps);
    assert.equal(r.status, "scheduled");
    assert.equal(doc(fake, `${C}/enrollments/e1`)["status"], "active");
    const s = await runCenterEnrollmentRequests(db(fake), "c1", new Date("2026-11-01T12:00:00Z"));
    assert.equal(s.started, 1);
    assert.equal(doc(fake, `${C}/enrollments/e1`)["status"], "paused");
  });

  it("aluno vê pedidos, dias usados, prévia do último dia e plano para ficar", async () => {
    const fake = seed();
    fake.seedDoc(`${C}/enrollmentRequests/old`, {enrollmentId: "e1", studentId: "carla", type: "pause", status: "done",
      startsOn: "2026-02-01", endsOn: "2026-02-15", days: 15, className: "BT Feminino Manhã"});
    const res = await loadMyTrainingCentersCore(db(fake), "u-carla", NOW);
    const center = res.centers[0]!;
    const e = center.enrollments[0]!;
    assert.equal(e.pauseDaysUsed, 15);
    assert.equal(e.cancelLastDay, "2026-11-04");
    assert.deepEqual(e.retentionPlans.map((p) => p.name), ["Mensal 1x/semana"]);
    assert.equal(center.policies.pauseMinDays, 15);
  });

  it("desconto de retenção: próxima mensalidade sai com desconto, uma vez por ano", async () => {
    const fake = seed({cancelRetention: ["pause", "discount"], retentionDiscountPercent: 30});
    const r = await requestEnrollmentChangeCore(db(fake), STUDENT,
      {centerId: "c1", enrollmentId: "e1", type: "cancel", reason: "price", retainDiscount: true}, deps().deps);
    assert.equal(r.status, "retained");
    assert.equal((doc(fake, `${C}/subscriptions/e1`)["pendingDiscount"] as Data)["percent"], 30);
    await assert.rejects(requestEnrollmentChangeCore(db(fake), STUDENT,
      {centerId: "c1", enrollmentId: "e1", type: "cancel", reason: "price", retainDiscount: true}, deps().deps), /último ano/);

    const run = {id: "c1", ref: fake.doc(C) as never, name: "CT", today: "2026-11-02", billing: {} as never, online: false};
    const g = await generateNextCycle(db(fake), run, "e1", Timestamp.fromDate(NOW), "Sistema");
    assert.equal(g?.amountCents, 22400);
    assert.equal(doc(fake, `${C}/subscriptions/e1`)["pendingDiscount"], null);
    assert.equal(doc(fake, `${C}/subscriptions/e1`)["priceCents"], 32000);
  });

  it("desconto só se o centro oferece", async () => {
    const fake = seed();
    await assert.rejects(requestEnrollmentChangeCore(db(fake), STUDENT,
      {centerId: "c1", enrollmentId: "e1", type: "cancel", reason: "price", retainDiscount: true}, deps().deps), /não oferece/);
  });

  it("alta médica: pede antes do fim, segura sem alta, volta quando a gestão libera", async () => {
    const fake = seed({injuryPauseApproval: "auto", requireMedicalClearance: true});
    const {deps: d, pushes} = deps();
    const cert = {path: "trainingCenterCertificates/c1/u-carla/a.pdf", contentType: "application/pdf", sizeBytes: 2000,
      issuedOn: "2026-10-23", daysOff: 10};
    const r = await requestEnrollmentChangeCore(db(fake), STUDENT, {centerId: "c1", enrollmentId: "e1", type: "injury", certificate: cert}, d);
    assert.equal(r.status, "active");
    assert.equal(r.endsOn, "2026-11-02");

    await runCenterEnrollmentRequests(db(fake), "c1", new Date("2026-10-30T12:00:00Z"), d);
    assert.equal(doc(fake, `${C}/enrollmentRequests/${r.requestId}`)["clearanceStatus"], "requested");
    assert.equal(pushes[pushes.length - 1]?.title, "Envie sua alta médica");

    const held = await runCenterEnrollmentRequests(db(fake), "c1", new Date("2026-11-03T08:50:00Z"), d);
    assert.equal(held.held, 1);
    assert.equal(doc(fake, `${C}/enrollments/e1`)["pausedUntil"], "2026-11-04");
    assert.equal(doc(fake, `${C}/enrollmentRequests/${r.requestId}`)["awaitingClearance"], true);

    await submitMedicalClearanceCore(db(fake), STUDENT, {centerId: "c1", requestId: r.requestId,
      clearance: {...cert, path: "trainingCenterCertificates/c1/u-carla/alta.pdf", issuedOn: "2026-10-24"}}, d);
    assert.equal(doc(fake, `${C}/enrollmentRequests/${r.requestId}`)["clearanceStatus"], "submitted");

    const ok = await decideEnrollmentRequestCore(db(fake), "owner", {centerId: "c1", requestId: r.requestId, decision: "clear"}, d);
    assert.equal(ok.status, "done");
    assert.equal(doc(fake, `${C}/enrollments/e1`)["status"], "active");
  });

  it("sem alta exigida a pausa termina normal", async () => {
    const fake = seed({injuryPauseApproval: "auto"});
    const cert = {path: "trainingCenterCertificates/c1/u-carla/a.pdf", contentType: "application/pdf", sizeBytes: 2000,
      issuedOn: "2026-10-23", daysOff: 10};
    const r = await requestEnrollmentChangeCore(db(fake), STUDENT, {centerId: "c1", enrollmentId: "e1", type: "injury", certificate: cert}, deps().deps);
    const s = await runCenterEnrollmentRequests(db(fake), "c1", new Date("2026-11-03T08:50:00Z"), deps().deps);
    assert.equal(s.finished, 1);
    assert.equal(doc(fake, `${C}/enrollmentRequests/${r.requestId}`)["status"], "done");
  });

  it("trancamento com vaga liberada: devolve a vaga e volta se houver lugar", async () => {
    const fake = seed({pauseSeat: "release"});
    fake.seedDoc(`${C}/classes/bt`, {name: "BT Feminino Manhã", capacity: 8, seatsTaken: 8, status: "active", rosterStudentIds: ["carla", "ana"]});
    const r = await requestEnrollmentChangeCore(db(fake), STUDENT, {centerId: "c1", enrollmentId: "e1", type: "pause", days: 20}, deps().deps);
    assert.equal(doc(fake, `${C}/classes/bt`)["seatsTaken"], 7);
    assert.deepEqual(doc(fake, `${C}/classes/bt`)["rosterStudentIds"], ["ana"]);
    assert.equal(doc(fake, `${C}/enrollments/e1`)["seatReleased"], true);
    assert.equal(doc(fake, `${C}/enrollmentRequests/${r.requestId}`)["releaseSeat"], true);

    const s = await runCenterEnrollmentRequests(db(fake), "c1", new Date("2026-11-13T08:50:00Z"), deps().deps);
    assert.equal(s.finished, 1);
    assert.equal(doc(fake, `${C}/classes/bt`)["seatsTaken"], 8);
    const enr = doc(fake, `${C}/enrollments/e1`);
    assert.deepEqual([enr["seatReleased"], enr["pausedUntil"]], [false, "2026-11-13"]);
  });

  it("volta com a turma cheia: segue pausado e retoma antes da fila quando abre vaga", async () => {
    const fake = seed({pauseSeat: "release", waitlistEnabled: true});
    fake.seedDoc(`${C}/classes/bt`, {name: "BT Feminino Manhã", capacity: 8, seatsTaken: 8, status: "active", rosterStudentIds: ["carla"]});
    const {deps: d, pushes} = deps();
    await requestEnrollmentChangeCore(db(fake), STUDENT, {centerId: "c1", enrollmentId: "e1", type: "pause", days: 20}, d);
    fake.seedDoc(`${C}/classes/bt`, {...doc(fake, `${C}/classes/bt`), seatsTaken: 8});
    const s = await runCenterEnrollmentRequests(db(fake), "c1", new Date("2026-11-13T08:50:00Z"), d);
    assert.equal(s.held, 1);
    assert.equal(doc(fake, `${C}/enrollments/e1`)["awaitingSeat"], true);
    assert.equal(doc(fake, `${C}/enrollments/e1`)["pausedUntil"], "2026-11-14");
    assert.equal(pushes[pushes.length - 1]?.title, "Sua turma está cheia");

    // Fila: alguém esperando desde antes. A volta tem prioridade.
    fake.seedDoc(`${C}/enrollments/w1`, {studentId: "nina", classId: "bt", status: "waitlisted", planId: "m2",
      waitlistedAt: Timestamp.fromDate(new Date("2026-10-01T12:00:00Z"))});
    fake.seedDoc(`${C}/students/nina`, {name: "Nina", uid: "u-nina", status: "active"});
    fake.seedDoc(`${C}/classes/bt`, {...doc(fake, `${C}/classes/bt`), seatsTaken: 7});
    const returns: SeatReturn[] = [];
    const offers = await offerOpenSeats(db(fake), "c1", "bt", new Date("2026-11-15T12:00:00Z"), returns);
    assert.equal(returns.length, 1);
    assert.equal(offers.length, 0);
    assert.equal(doc(fake, `${C}/enrollments/e1`)["status"], "active");
    assert.equal(doc(fake, `${C}/enrollments/w1`)["status"], "waitlisted");
    assert.equal(doc(fake, `${C}/classes/bt`)["seatsTaken"], 8);
  });

  it("cancelar matrícula com vaga já liberada não desconta de novo", async () => {
    const fake = seed({pauseSeat: "release"});
    fake.seedDoc(`${C}/classes/bt`, {name: "BT Feminino Manhã", capacity: 8, seatsTaken: 8, status: "active", rosterStudentIds: ["carla"]});
    await requestEnrollmentChangeCore(db(fake), STUDENT, {centerId: "c1", enrollmentId: "e1", type: "pause", days: 20}, deps().deps);
    assert.equal(doc(fake, `${C}/classes/bt`)["seatsTaken"], 7);
    // O gatilho da matrícula pausa a assinatura (no fake, à mão).
    fake.seedDoc(`${C}/subscriptions/e1`, {...doc(fake, `${C}/subscriptions/e1`), status: "paused"});
    const r = await requestEnrollmentChangeCore(db(fake), STUDENT, {centerId: "c1", enrollmentId: "e1", type: "cancel", reason: "moving"}, deps().deps);
    // Pausada com assinatura pausada: não há ciclo à frente → encerra já.
    assert.equal(r.status, "done");
    assert.equal(doc(fake, `${C}/classes/bt`)["seatsTaken"], 7);
  });
});

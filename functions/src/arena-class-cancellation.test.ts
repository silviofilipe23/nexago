import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {cancellationQuote, monthsBetweenCeil, parseCancellationPolicy, validateCancellationPolicy} from "./arena-class-cancellation-model";
import {cancelMyEnrollmentCore, previewCancellationCore, undoCancellationCore, waivePenaltyCore} from "./arena-class-cancellation";
import {enrollMeCore, previewSelfEnrollmentCore} from "./arena-agreements";
import {markPenaltyPaid} from "./arena-class-signup-payment";
import {runMonthlyBilling} from "./arena-class-billing";
import {isEnrollmentFeeCharge} from "./arena-class-payout";
import {DEFAULT_CLASS_RULES} from "./arena-class-constants";

type Data = Record<string, unknown>;
const NOW = new Date("2026-10-19T15:00:00Z");
const TODAY = "2026-10-19";
const EV = {ip: "1.2.3.4", userAgent: "x", platform: "ios", appVersion: "1"};
const ME = {uid: "u1", email: "m@x.com"};
const doc = (f: FakeFirestore, p: string) => f.store.get(p) as Data;

function makeDb() {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function seed(fake: FakeFirestore, online = false) {
  fake.seedDoc("arenas/arena1", {name: "Arena", managerUserId: "uOwner", planTier: "pro", planStatus: "active"});
  fake.seedDoc("users/u1", {fullName: "Marina", cpf: "52998224725"});
  fake.seedDoc("arenas/arena1/classSettings/rules", {...DEFAULT_CLASS_RULES, onlineBillingEnabled: online});
  fake.seedDoc("arenas/arena1/classTeachers/t1", {arenaId: "arena1", userId: "uT", name: "Thiago", status: "active"});
  fake.seedDoc("arenas/arena1/classPlans/m2", {
    name: "Vôlei 2x", kind: "monthly", priceReais: 260, classesPerWeek: 2, status: "active", availableInApp: true,
    teacherIds: ["t1"],
    cycles: {monthly: {enabled: true}, quarterly: {enabled: true, discountPercent: 10}, annual: {enabled: true, discountPercent: 15}},
    cancellation: {noticeDays: 30, penalty: {kind: "percent", percent: 50}},
  });
  fake.seedDoc("arenaClasses/cT", {
    arenaId: "arena1", name: "Turma", type: "turma", teacherId: "t1", teacherName: "Thiago",
    weekdays: [2, 4], startTime: "18:00", endTime: "19:00", capacity: 4, studentCount: 0, startDate: "2026-10-01", status: "active",
  });
}

async function enroll(db: Firestore, cycle: string, paymentForm = "onsite") {
  const input = {arenaId: "arena1", planId: "m2", slots: [{classId: "cT", weekday: 2}, {classId: "cT", weekday: 4}], cycle, paymentForm};
  const p = await previewSelfEnrollmentCore(db, ME, input, TODAY);
  return enrollMeCore(db, ME, {...input, agreed: true, sha256: p.agreement.sha256}, EV, NOW);
}

describe("cancelamento — conta", () => {
  const policy = parseCancellationPolicy({noticeDays: 30, penalty: {kind: "percent", percent: 50}});
  const base = {policy, planKind: "monthly", prepaidMonths: 1, billedThrough: "2026-11", expiresOn: null, monthlyPriceReais: 234, todayKey: "2026-11-20"};

  it("mensal: só o aviso, sem multa", () => {
    const q = cancellationQuote({...base, commitmentEndsOn: null});
    assert.equal(q.kind, "monthly");
    assert.equal(q.endsOn, "2026-12-20");
    assert.equal(q.penalty.amountReais, 0);
  });

  it("trimestral antes da fidelidade: % das mensalidades que faltam depois do aviso", () => {
    const q = cancellationQuote({...base, commitmentEndsOn: "2027-02-19"});
    assert.equal(q.remainingMonths, 2);
    assert.equal(q.penalty.amountReais, 234);
    assert.equal(q.penaltyDueDate, "2026-11-23");
    const fixed = cancellationQuote({...base, commitmentEndsOn: "2027-02-19", policy: parseCancellationPolicy({noticeDays: 0, penalty: {kind: "fixed", amountReais: 150}})});
    assert.equal(fixed.penalty.amountReais, 150);
    assert.equal(fixed.endsOn, "2026-11-20");
  });

  it("fidelidade acaba dentro do aviso: sem multa; anual à vista: fim do pago, sem multa", () => {
    assert.equal(cancellationQuote({...base, commitmentEndsOn: "2026-12-10"}).penalty.amountReais, 0);
    const annual = cancellationQuote({...base, prepaidMonths: 12, billedThrough: "2027-10", commitmentEndsOn: "2027-10-19"});
    assert.equal(annual.kind, "prepaid");
    assert.equal(annual.endsOn, "2027-10-31");
    assert.equal(annual.penalty.amountReais, 0);
  });

  it("validação e meses", () => {
    assert.deepEqual(validateCancellationPolicy({}), {});
    assert.throws(() => validateCancellationPolicy({cancellation: {noticeDays: 200}}), /Aviso prévio/);
    assert.throws(() => validateCancellationPolicy({cancellation: {noticeDays: 30, penalty: {kind: "percent", percent: 0}}}), /Multa/);
    assert.equal(monthsBetweenCeil("2026-12-20", "2027-02-19"), 2);
    assert.equal(monthsBetweenCeil("2026-12-20", "2026-12-20"), 0);
    assert.equal(isEnrollmentFeeCharge({id: "e1_penalty", enrollmentId: "e1"}), true);
  });
});

describe("cancelamento — pelo app e pela arena", () => {
  it("trimestral: agenda o fim, cria a multa, avisa e não deixa cancelar de novo", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {enrollmentId, agreementId} = await enroll(db, "quarterly");
    // Fidelidade até 19/01/2027; aviso termina 20/12 → falta 1 mensalidade de R$ 234 × 50%.
    const prev = await previewCancellationCore(db, "u1", {enrollmentId}, "2026-11-20");
    assert.equal(prev.remainingMonths, 1);
    assert.equal(prev.penalty.amountReais, 117);
    const out = await cancelMyEnrollmentCore(db, "u1", {enrollmentId, reason: "price"}, new Date("2026-11-20T15:00:00Z"));
    assert.equal(out.endsOn, "2026-12-20");
    const e = doc(fake, `arenaClassEnrollments/${enrollmentId}`);
    assert.equal(e["endsOn"], "2026-12-20");
    assert.equal((e["cancelRequest"] as Data)["penaltyStatus"], "open");
    const penalty = doc(fake, `arenaClassCharges/${enrollmentId}_penalty`);
    assert.equal(penalty["amountReais"], 117);
    assert.equal(penalty["status"], "open");
    assert.equal(doc(fake, `arenaAgreements/${agreementId}`)["endsOn"], "2026-12-20");
    await assert.rejects(cancelMyEnrollmentCore(db, "u1", {enrollmentId, reason: "price"}, new Date("2026-11-21T15:00:00Z")), /já está agendado/);
    await assert.rejects(cancelMyEnrollmentCore(db, "uX", {enrollmentId}, NOW), /não encontrada/);
    await markPenaltyPaid(db, enrollmentId);
    assert.equal((doc(fake, `arenaClassEnrollments/${enrollmentId}`)["cancelRequest"] as Data)["penaltyStatus"], "paid");
  });

  it("online: a multa sai pelo Asaas; arena isenta (com motivo) e desfaz", async () => {
    const {fake, db} = makeDb();
    seed(fake, true);
    const {enrollmentId} = await enroll(db, "quarterly", "pix");
    fake.seedDoc(`arenaClassEnrollments/${enrollmentId}`, {...doc(fake, `arenaClassEnrollments/${enrollmentId}`), status: "active", pendingPaymentUntil: null});
    await cancelMyEnrollmentCore(db, "u1", {enrollmentId, reason: "moved"}, new Date("2026-11-20T15:00:00Z"));
    assert.equal(doc(fake, `arenaClassAsaasPayments/${enrollmentId}_penalty`)["amountReais"], 117);
    await assert.rejects(waivePenaltyCore(db, "u1", {enrollmentId, reason: "ok ok"}, NOW), /permiss|Arena|acesso/i);
    await assert.rejects(waivePenaltyCore(db, "uOwner", {enrollmentId, reason: ""}, NOW), /motivo/);
    await waivePenaltyCore(db, "uOwner", {enrollmentId, reason: "Mudou de cidade, liberado"}, NOW);
    assert.equal(doc(fake, `arenaClassCharges/${enrollmentId}_penalty`)["status"], "canceled");
    assert.equal(doc(fake, `arenaClassAsaasPayments/${enrollmentId}_penalty`)["state"], "voiding");
    assert.equal((doc(fake, `arenaClassEnrollments/${enrollmentId}`)["cancelRequest"] as Data)["penaltyStatus"], "waived");
    const undo = await undoCancellationCore(db, "uOwner", {enrollmentId}, NOW);
    assert.equal(undo.penaltyPaid, false);
    assert.equal(doc(fake, `arenaClassEnrollments/${enrollmentId}`)["endsOn"], null);
  });

  it("fim do aviso: o agendador tira da turma e não cobra mês depois da última aula", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {enrollmentId} = await enroll(db, "monthly");
    await cancelMyEnrollmentCore(db, "u1", {enrollmentId, reason: "routine"}, new Date("2026-10-25T15:00:00Z"));
    assert.equal(doc(fake, `arenaClassEnrollments/${enrollmentId}`)["endsOn"], "2026-11-24");
    await runMonthlyBilling(db, "2026-11-28");
    const e = doc(fake, `arenaClassEnrollments/${enrollmentId}`);
    assert.equal(e["status"], "ended");
    assert.equal(doc(fake, "arenaClasses/cT/classStudents/u1")["status"], "removed");
    assert.equal(fake.store.get(`arenaClassCharges/${enrollmentId}_2026-12`), undefined);
  });
});

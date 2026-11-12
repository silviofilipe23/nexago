import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {enrollMeCore, previewSelfEnrollmentCore, signupOptionsCore} from "./arena-agreements";
import {
  activatePaidEnrollmentCore,
  enrollmentPaymentCore,
  expirePendingEnrollmentsCore,
} from "./arena-class-signup-payment";
import {firstGroupId} from "./arena-class-asaas-model";
import {DEFAULT_CLASS_RULES} from "./arena-class-constants";

type Data = Record<string, unknown>;
const NOW = new Date("2026-10-19T15:00:00Z");
const TODAY = "2026-10-19";
const EV = {ip: "189.40.12.21", userAgent: "NexaGO", platform: "ios", appVersion: "1.0.24"};
const ME = {uid: "u1", email: "m@example.com"};
const doc = (f: FakeFirestore, path: string) => f.store.get(path) as Data;

function makeDb() {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function seed(fake: FakeFirestore, onlineBillingEnabled = true) {
  fake.seedDoc("arenas/arena1", {name: "Arena Verano", managerUserId: "uOwner", planTier: "pro", planStatus: "active"});
  fake.seedDoc("users/u1", {fullName: "Marina Lopes", cpf: "52998224725"});
  fake.seedDoc("arenas/arena1/classSettings/rules", {...DEFAULT_CLASS_RULES, onlineBillingEnabled});
  fake.seedDoc("arenas/arena1/classTeachers/t1", {arenaId: "arena1", userId: "uT", name: "Thiago", status: "active"});
  fake.seedDoc("arenas/arena1/classPlans/m2", {
    name: "Vôlei 2x", kind: "monthly", priceReais: 260, classesPerWeek: 2, status: "active", availableInApp: true, teacherIds: ["t1"],
  });
  fake.seedDoc("arenas/arena1/classPlans/m1", {
    name: "Vôlei 1x", kind: "monthly", priceReais: 160, classesPerWeek: 1, status: "active", availableInApp: true, teacherIds: ["t1"],
  });
  fake.seedDoc("arenaClasses/cT", {
    arenaId: "arena1", name: "Turma T", type: "turma", teacherId: "t1", teacherName: "Thiago",
    weekdays: [2, 4, 6], startTime: "18:00", endTime: "19:00", capacity: 2, studentCount: 0, startDate: "2026-10-01", status: "active",
  });
}

async function sign(db: Firestore, input: Data, now = NOW) {
  const p = await previewSelfEnrollmentCore(db, ME, input, TODAY);
  return enrollMeCore(db, ME, {...input, agreed: true, sha256: p.agreement.sha256}, EV, now);
}

const twoX = {arenaId: "arena1", planId: "m2", slots: [{classId: "cT", weekday: 2}, {classId: "cT", weekday: 4}], paymentForm: "pix"};

describe("aulas — pagar ao assinar", () => {
  it("Pix: matrícula espera pagamento com a vaga segurada 30 min", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await sign(db, twoX);
    assert.ok(out.pendingPayment);
    assert.equal(out.pendingPayment!.until, "2026-10-19T15:30:00.000Z");
    const e = doc(fake, `arenaClassEnrollments/${out.enrollmentId}`);
    assert.equal(e["status"], "pending_payment");
    assert.equal(doc(fake, "arenaClasses/cT/classStudents/u1")["status"], "active"); // vaga segurada
    // Um plano sem pagar por vez.
    await assert.rejects(sign(db, {...twoX, planId: "m1", slots: [{classId: "cT", weekday: 6}]}), /Pague o plano Vôlei 2x primeiro/);
    const opts = await signupOptionsCore(db, "u1", "arena1", NOW.getTime());
    assert.equal(opts.pendingEnrollment?.enrollmentId, out.enrollmentId);
  });

  it("tela de pagamento: preparando → Pix pronto → pago ativa", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await sign(db, twoX);
    const deps = {now: () => NOW, fetchPixQrCode: async () => ({qrCode: "000201...", qrCodeBase64: "iVBOR"})};
    assert.equal((await enrollmentPaymentCore(db, "u1", {enrollmentId: out.enrollmentId}, deps)).state, "preparing");
    const groupPath = `arenaClassAsaasPayments/${firstGroupId(out.enrollmentId)}`;
    fake.seedDoc(groupPath, {...doc(fake, groupPath), state: "created", paymentId: "pay_1", invoiceUrl: "https://asaas/i/1"});
    const pix = await enrollmentPaymentCore(db, "u1", {enrollmentId: out.enrollmentId, method: "pix"}, deps);
    assert.equal(pix.state, "ready");
    assert.equal((pix as {pix?: {qrCode: string}}).pix?.qrCode, "000201...");
    const card = await enrollmentPaymentCore(db, "u1", {enrollmentId: out.enrollmentId, method: "card"}, deps);
    assert.equal((card as {invoiceUrl?: string}).invoiceUrl, "https://asaas/i/1");
    await assert.rejects(enrollmentPaymentCore(db, "uOutro", {enrollmentId: out.enrollmentId}, deps), /não encontrada/);
    assert.equal(await activatePaidEnrollmentCore(db, out.enrollmentId), true);
    assert.equal(doc(fake, `arenaClassEnrollments/${out.enrollmentId}`)["status"], "active");
    assert.equal((await enrollmentPaymentCore(db, "u1", {enrollmentId: out.enrollmentId}, deps)).state, "paid");
    assert.equal(await activatePaidEnrollmentCore(db, out.enrollmentId), false);
  });

  it("sem pagamento no prazo: cancela matrícula, cobranças, fatura e contrato; vaga volta", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await sign(db, twoX);
    // Ainda na folga do webhook: nada muda.
    assert.deepEqual(await expirePendingEnrollmentsCore(db, new Date("2026-10-19T15:33:00Z")), {expired: 0, activated: 0});
    assert.deepEqual(await expirePendingEnrollmentsCore(db, new Date("2026-10-19T15:36:00Z")), {expired: 1, activated: 0});
    const e = doc(fake, `arenaClassEnrollments/${out.enrollmentId}`);
    assert.equal(e["status"], "canceled");
    assert.equal(e["canceledReason"], "payment_expired");
    assert.equal(doc(fake, "arenaClasses/cT/classStudents/u1")["status"], "removed");
    const charges = [...fake.store.entries()].filter(([k, v]) => k.startsWith("arenaClassCharges/") && (v as Data)["enrollmentId"] === out.enrollmentId);
    assert.ok(charges.length > 0 && charges.every(([, v]) => (v as Data)["status"] === "canceled"));
    assert.equal(doc(fake, `arenaClassAsaasPayments/${firstGroupId(out.enrollmentId)}`)["state"], "voiding");
    assert.equal(doc(fake, `arenaAgreements/${out.agreementId}`)["status"], "canceled");
    // Pode contratar de novo.
    const again = await sign(db, twoX, new Date("2026-10-19T15:40:00Z"));
    assert.ok(again.enrollmentId);
  });

  it("pago sem o gatilho ter rodado: o agendador ativa em vez de cancelar", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await sign(db, twoX);
    const groupPath = `arenaClassAsaasPayments/${firstGroupId(out.enrollmentId)}`;
    fake.seedDoc(groupPath, {...doc(fake, groupPath), state: "paid"});
    assert.deepEqual(await expirePendingEnrollmentsCore(db, new Date("2026-10-19T16:00:00Z")), {expired: 0, activated: 1});
    assert.equal(doc(fake, `arenaClassEnrollments/${out.enrollmentId}`)["status"], "active");
  });

  it("na arena: matrícula ativa na hora, sem prazo", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await sign(db, {...twoX, paymentForm: "onsite"});
    assert.equal(out.pendingPayment, null);
    assert.equal(doc(fake, `arenaClassEnrollments/${out.enrollmentId}`)["status"], "active");
    assert.equal(doc(fake, `arenaClassEnrollments/${out.enrollmentId}`)["pendingPaymentUntil"], undefined);
    void Timestamp;
  });
});

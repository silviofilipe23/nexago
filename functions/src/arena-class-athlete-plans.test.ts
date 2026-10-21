import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {loadMyTrainingPlansCore, paymentMethodLabel} from "./arena-class-athlete-plans";

const ME = "uMarcelo";
const TODAY = "2026-10-21";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/arena1", {name: "Arena CFC"});
  fake.seedDoc("arenaClasses/c1", {name: "Intermediário B", startTime: "19:00", teacherName: "Thiago Mendes", arenaId: "arena1"});
  return {fake, db: fake as unknown as Firestore};
}

function seedEnrollment(fake: FakeFirestore, id: string, over: Record<string, unknown> = {}): void {
  fake.seedDoc(`arenaClassEnrollments/${id}`, {
    arenaId: "arena1",
    athleteId: ME,
    studentId: ME,
    name: "Marcelo",
    phone: "+5562999990000",
    cpfMasked: "***.***.***-00",
    status: "active",
    plan: {planId: "p1", name: "Trimestral", kind: "monthly", priceReais: 373.33, classesPerWeek: 2, credits: null, validityDays: null},
    slots: [
      {classId: "c1", weekday: 4, className: "Intermediário B", startTime: "19:00", teacherId: "uThiago"},
      {classId: "c1", weekday: 2, className: "Intermediário B", startTime: "19:00", teacherId: "uThiago"},
    ],
    dueDay: 15,
    paymentMethod: "pix",
    billingMode: "asaas",
    startDate: "2026-10-15",
    billedThrough: "2026-11-14",
    creditsLeft: null,
    expiresOn: null,
    ...over,
  });
}

describe("getMyTrainingPlans", () => {
  it("matrícula ativa da arena sem dado sensível, com créditos de reposição", async () => {
    const {fake, db} = makeDb();
    seedEnrollment(fake, "e1");
    seedEnrollment(fake, "e2", {status: "canceled"});
    seedEnrollment(fake, "e3", {athleteId: "outro"});
    fake.seedDoc("arenaClassCredits/k1", {athleteId: ME, arenaId: "arena1", classId: "c1", status: "available", expiresOn: "2026-11-20"});
    fake.seedDoc("arenaClassCredits/k2", {athleteId: ME, arenaId: "arena1", classId: "c1", status: "available", expiresOn: "2026-10-01"});

    const out = await loadMyTrainingPlansCore(db, ME, TODAY);
    assert.equal(out.arenaPlans.length, 1);
    const p = out.arenaPlans[0];
    assert.equal(p.enrollmentId, "e1");
    assert.equal(p.arenaName, "Arena CFC");
    assert.equal(p.planName, "Trimestral");
    assert.equal(p.priceReais, 373.33);
    assert.deepEqual(p.slots.map((s) => s.weekday), [2, 4]);
    assert.equal(p.slots[0].teacherName, "Thiago Mendes");
    assert.equal(p.makeupCredits, 1, "crédito vencido não conta");
    const json = JSON.stringify(out);
    assert.ok(!json.includes("+5562"), "sem telefone");
    assert.ok(!json.includes("***"), "sem CPF");
  });

  it("pacote traz aulas restantes e validade", async () => {
    const {fake, db} = makeDb();
    seedEnrollment(fake, "e1", {
      plan: {name: "Pacote 8", kind: "package", priceReais: 400, credits: 8, validityDays: 45},
      creditsLeft: 3,
      expiresOn: "2026-11-30",
    });
    const [p] = (await loadMyTrainingPlansCore(db, ME, TODAY)).arenaPlans;
    assert.equal(p.kind, "package");
    assert.equal(p.creditsLeft, 3);
    assert.equal(p.credits, 8);
    assert.equal(p.expiresOn, "2026-11-30");
  });

  it("carteira do professor: só vínculo ativo, com plano e recorrência", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(`professors/uThiago/students/${ME}`, {
      athleteId: ME, status: "active", professorName: "Thiago Mendes", planId: "pl8",
      recurring: {planId: "pl8", amountReais: 880, description: "Particular · 8 aulas", dueDay: 21, lastPeriod: "2026-10"},
    });
    fake.seedDoc("professors/uThiago/plans/pl8", {name: "Pacote 8 aulas/mês", kind: "monthly", classes: 8, priceReais: 880});
    fake.seedDoc(`professors/uPaula/students/${ME}`, {athleteId: ME, status: "invited", professorName: "Paula"});

    const {professorPlans} = await loadMyTrainingPlansCore(db, ME, TODAY);
    assert.equal(professorPlans.length, 1);
    const p = professorPlans[0];
    assert.equal(p.professorUid, "uThiago");
    assert.equal(p.planName, "Pacote 8 aulas/mês");
    assert.equal(p.classes, 8);
    assert.equal(p.recurringReais, 880);
    assert.equal(p.recurringDueDay, 21);
  });

  it("pagamentos das duas fontes, mais recente primeiro", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaClassCharges/m1", {
      athleteId: ME, arenaId: "arena1", status: "paid", description: "Turma · outubro", amountReais: 373.33,
      paidOn: "2026-10-15", paymentMethod: "pix", paidVia: "manual",
    });
    fake.seedDoc("arenaClassCharges/m2", {athleteId: ME, arenaId: "arena1", status: "open", description: "Aberta", amountReais: 1});
    fake.seedDoc("professorCharges/pc1", {
      athleteId: ME, professorName: "Thiago Mendes", status: "paid", description: "Particular · novembro",
      amountReais: 880, paidAt: Timestamp.fromDate(new Date("2026-10-21T15:00:00Z")), billingType: "PIX",
    });

    const {payments} = await loadMyTrainingPlansCore(db, ME, TODAY);
    assert.deepEqual(payments.map((p) => p.chargeId), ["pc1", "m1"]);
    assert.equal(payments[0].payee, "Prof. Thiago Mendes");
    assert.equal(payments[0].paidOn, "2026-10-21");
    assert.equal(payments[0].method, "Pix");
    assert.equal(payments[1].payee, "Arena CFC");
    assert.equal(payments[1].method, "Pix");
  });

  it("sem nada, listas vazias", async () => {
    const {db} = makeDb();
    assert.deepEqual(await loadMyTrainingPlansCore(db, ME, TODAY), {arenaPlans: [], professorPlans: [], payments: []});
  });

  it("rótulos do meio de pagamento", () => {
    assert.equal(paymentMethodLabel("CREDIT_CARD"), "Cartão");
    assert.equal(paymentMethodLabel("card_machine"), "Maquininha");
    assert.equal(paymentMethodLabel("online"), "Online");
  });
});

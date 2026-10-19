import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  createEnrollmentCore,
  firstCharges,
  monthsToBill,
  parseEnrollmentRequest,
  proratedAmount,
  runMonthlyBilling,
  setEnrollmentStatusCore,
  validatePlanInput,
  type EnrollmentRequest,
} from "./arena-class-billing";
import {addExtraCore, removeExtraCore} from "./arena-class-makeup";
import {cancelClassSessionCore, materializeClassSession, parseArenaClass, saveClassAttendanceCore} from "./arena-class";
import {DEFAULT_CLASS_RULES, classSessionId, makeupCreditId} from "./arena-class-constants";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const TODAY = "2026-10-19"; // segunda

/** Arena com plano mensal 2x (R$ 320), pacote 8 aulas e turma Ter/Qui 19h de 2 vagas. */
function seedArena(fake: FakeFirestore, rules: Record<string, unknown> = {}) {
  fake.seedDoc("arenas/arena1/classPlans/m2", {
    name: "Mensal 2x/semana", kind: "monthly", priceReais: 320, classesPerWeek: 2, makeupsPerMonth: 1, status: "active",
  });
  fake.seedDoc("arenas/arena1/classPlans/m1", {
    name: "Mensal 1x/semana", kind: "monthly", priceReais: 180, classesPerWeek: 1, makeupsPerMonth: 1, status: "active",
  });
  fake.seedDoc("arenas/arena1/classPlans/p8", {
    name: "Pacote 8 aulas", kind: "package", priceReais: 360, credits: 8, validityDays: 60, status: "active",
  });
  fake.seedDoc("arenas/arena1/classSettings/rules", {...DEFAULT_CLASS_RULES, enrollmentFeeReais: 50, ...rules});
  fake.seedDoc("arenaClasses/cB", {
    arenaId: "arena1", name: "Intermediário B", type: "turma", sport: "beachTennis", level: "intermediario",
    teacherId: "t1", teacherUserId: "uT", teacherName: "Thiago", teacherColor: "#FF6A1A",
    weekdays: [2, 4], startTime: "19:00", endTime: "20:00", courtId: "q2", courtName: "Quadra 2",
    capacity: 2, studentCount: 1, startDate: "2026-10-01", endDate: null, status: "active",
  });
  // Já matriculado só na terça.
  fake.seedDoc("arenaClasses/cB/classStudents/u0", {
    arenaId: "arena1", classId: "cB", athleteId: "u0", name: "Rui", status: "active", weekdays: [2],
  });
}

function request(overrides: Partial<EnrollmentRequest> = {}): EnrollmentRequest {
  return {
    arenaId: "arena1", planId: "m2", slots: [{classId: "cB", weekday: 2}, {classId: "cB", weekday: 4}],
    dueDay: 5, paymentMethod: "pix", waiveFee: false, waitlistClassId: null, waitlistEntryId: null,
    ...overrides,
  };
}

const athlete = (id: string, name: string) => ({athleteId: id, name, phone: null, photoUrl: null});

describe("billing — cálculos puros", () => {
  it("proporcional do mês pelas aulas que faltam nos dias escolhidos", () => {
    // Out/2026, ter+qui: 9 aulas no mês; a partir de 19/10 sobram 20, 22, 27 e 29.
    assert.deepEqual(proratedAmount(320, [2, 4], TODAY), {amountReais: 142.22, remaining: 4, total: 9});
  });

  it("primeira cobrança: proporcional + taxa (dispensável); pacote é valor cheio", () => {
    const plan = validatePlanInput({name: "Mensal 2x", kind: "monthly", priceReais: 320, classesPerWeek: 2});
    const rules = {...DEFAULT_CLASS_RULES, enrollmentFeeReais: 50};
    const out = firstCharges("e1", plan, [2, 4], TODAY, rules, false);
    assert.deepEqual(out.charges.map((c) => [c.id, c.amountReais]), [["e1_2026-10", 142.22], ["e1_fee", 50]]);
    assert.equal(out.billedThrough, "2026-10");
    assert.equal(firstCharges("e1", plan, [2, 4], TODAY, rules, true).charges.length, 1);
    const pkg = validatePlanInput({name: "Pacote", kind: "package", priceReais: 360, credits: 8, validityDays: 60});
    assert.deepEqual(firstCharges("e2", pkg, [2], TODAY, DEFAULT_CLASS_RULES, false).charges.map((c) => c.amountReais), [360]);
  });

  it("mensal seguinte nasce 10 dias antes do vencimento", () => {
    assert.deepEqual(monthsToBill("2026-10", TODAY, 5, "2026-10-19"), []);
    assert.deepEqual(monthsToBill("2026-10", TODAY, 5, "2026-10-26"), ["2026-11"]);
    // Agendador parado por um tempo: recupera os meses que faltaram.
    assert.deepEqual(monthsToBill("2026-10", TODAY, 5, "2026-12-01"), ["2026-11", "2026-12"]);
  });

  it("valida planos e pedido de matrícula", () => {
    assert.throws(() => validatePlanInput({name: "X", kind: "monthly", priceReais: 0, classesPerWeek: 2}), HttpsError);
    assert.throws(() => validatePlanInput({name: "X", kind: "package", priceReais: 100, credits: 0, validityDays: 30}), HttpsError);
    assert.equal(validatePlanInput({name: "Experimental", kind: "single", priceReais: 0}).priceReais, 0);
    assert.throws(() => parseEnrollmentRequest({arenaId: "a", planId: "p", slots: [{classId: "c", weekday: 2}, {classId: "c", weekday: 2}], dueDay: 5}), HttpsError);
    assert.throws(() => parseEnrollmentRequest({arenaId: "a", planId: "p", slots: [{classId: "c", weekday: 2}], dueDay: 30}), HttpsError);
  });
});

describe("billing — matrícula", () => {
  it("matricula nos dias escolhidos, conta a vaga e gera as primeiras cobranças", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const out = await createEnrollmentCore(db, request(), athlete("u1", "Marina"), "gestor", TODAY);

    const enrollment = fake.store.get(`arenaClassEnrollments/${out.enrollmentId}`)!;
    assert.equal(enrollment["status"], "active");
    assert.equal(enrollment["billedThrough"], "2026-10");
    const student = fake.store.get("arenaClasses/cB/classStudents/u1")!;
    assert.deepEqual(student["weekdays"], [2, 4]);
    assert.equal(student["enrollmentId"], out.enrollmentId);
    assert.equal(fake.store.get("arenaClasses/cB")!["studentCount"], 2);
    assert.deepEqual(out.chargeIds, [`${out.enrollmentId}_2026-10`, `${out.enrollmentId}_fee`]);
    assert.equal(fake.store.get(`arenaClassCharges/${out.enrollmentId}_fee`)!["status"], "open");
  });

  it("vaga é por dia: terça lotou, quinta ainda cabe", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    await createEnrollmentCore(db, request(), athlete("u1", "Marina"), "gestor", TODAY);
    await assert.rejects(
      createEnrollmentCore(db, request({planId: "m1", slots: [{classId: "cB", weekday: 2}]}), athlete("u2", "Ana"), "gestor", TODAY),
      /lotada/,
    );
    await createEnrollmentCore(db, request({planId: "m1", slots: [{classId: "cB", weekday: 4}]}), athlete("u3", "Bia"), "gestor", TODAY);
  });

  it("plano mensal exige o número de horários do plano; não matricula duas vezes na mesma turma", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    await assert.rejects(
      createEnrollmentCore(db, request({slots: [{classId: "cB", weekday: 2}]}), athlete("u1", "Marina"), "gestor", TODAY),
      /2 horário/,
    );
    await createEnrollmentCore(db, request({planId: "m1", slots: [{classId: "cB", weekday: 4}]}), athlete("u1", "Marina"), "gestor", TODAY);
    await assert.rejects(
      createEnrollmentCore(db, request({planId: "m1", slots: [{classId: "cB", weekday: 4}]}), athlete("u1", "Marina"), "gestor", TODAY),
      /já tem matrícula/,
    );
  });

  it("pausar tira da chamada; cancelar tira da turma e perdoa só o que ainda ia vencer", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {enrollmentId} = await createEnrollmentCore(db, request({waiveFee: true}), athlete("u1", "Marina"), "gestor", TODAY);
    fake.seedDoc(`arenaClassCharges/${enrollmentId}_2026-11`, {
      arenaId: "arena1", enrollmentId, status: "open", dueDate: "2026-11-05", amountReais: 320,
    });

    await setEnrollmentStatusCore(db, enrollmentId, "paused", TODAY);
    assert.equal(fake.store.get("arenaClasses/cB/classStudents/u1")!["status"], "paused");
    assert.equal(fake.store.get("arenaClasses/cB")!["studentCount"], 1);

    await setEnrollmentStatusCore(db, enrollmentId, "active", TODAY);
    assert.equal(fake.store.get("arenaClasses/cB/classStudents/u1")!["status"], "active");

    const out = await setEnrollmentStatusCore(db, enrollmentId, "canceled", TODAY);
    assert.equal(out.canceledCharges, 1);
    assert.equal(fake.store.get(`arenaClassCharges/${enrollmentId}_2026-11`)!["status"], "canceled");
    assert.equal(fake.store.get(`arenaClassCharges/${enrollmentId}_2026-10`)!["status"], "open");
    assert.equal(fake.store.get("arenaClasses/cB/classStudents/u1")!["status"], "removed");
    assert.equal(fake.store.get("arenaClasses/cB")!["studentCount"], 1);
  });
});

describe("billing — agendador", () => {
  it("gera a mensal do próximo mês uma vez; pacote esgotado sai da turma; crédito vencido expira", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {enrollmentId} = await createEnrollmentCore(db, request({waiveFee: true}), athlete("u1", "Marina"), "gestor", TODAY);
    const pkg = await createEnrollmentCore(db, request({planId: "p8", slots: [{classId: "cB", weekday: 4}], waiveFee: true}), athlete("u4", "Caio"), "gestor", TODAY);
    fake.seedDoc(`arenaClassEnrollments/${pkg.enrollmentId}`, {...fake.store.get(`arenaClassEnrollments/${pkg.enrollmentId}`)!, creditsLeft: 0});
    fake.seedDoc("arenaClassCredits/old", {arenaId: "arena1", status: "available", expiresOn: "2026-10-01"});

    const first = await runMonthlyBilling(db, "2026-10-26");
    assert.deepEqual(first, {charges: 1, ended: 1, expiredCredits: 1});
    const charge = fake.store.get(`arenaClassCharges/${enrollmentId}_2026-11`)!;
    assert.equal(charge["amountReais"], 320);
    assert.equal(charge["dueDate"], "2026-11-05");
    assert.equal(fake.store.get(`arenaClassEnrollments/${pkg.enrollmentId}`)!["status"], "ended");
    assert.equal(fake.store.get("arenaClasses/cB/classStudents/u4")!["status"], "removed");
    assert.equal(fake.store.get("arenaClassCredits/old")!["status"], "expired");

    const again = await runMonthlyBilling(db, "2026-10-26");
    assert.equal(again.charges, 0);
  });
});

describe("billing — pausa e volta", () => {
  const chargeIds = (fake: FakeFirestore, enrollmentId: string) =>
    [...fake.store.keys()].filter((k) => k.startsWith(`arenaClassCharges/${enrollmentId}_`))
      .map((k) => k.slice(`arenaClassCharges/${enrollmentId}_`.length)).sort();

  async function pausedInOctober(fake: FakeFirestore, db: Firestore) {
    seedArena(fake);
    const {enrollmentId} = await createEnrollmentCore(db, request({waiveFee: true}), athlete("u1", "Marina"), "gestor", TODAY);
    await setEnrollmentStatusCore(db, enrollmentId, "paused", "2026-10-20");
    await runMonthlyBilling(db, "2026-10-26"); // pausada: a de novembro não nasce
    return enrollmentId;
  }

  it("pausa em out e volta em dez: out/nov não são cobrados; dez sai proporcional a partir da volta", async () => {
    const {fake, db} = makeDb();
    const enrollmentId = await pausedInOctober(fake, db);
    await setEnrollmentStatusCore(db, enrollmentId, "active", "2026-12-10");

    // Dez/2026, ter+qui: 10 aulas; de 10/12 (qui) sobram 10, 15, 17, 22, 24, 29 e 31.
    const dec = fake.store.get(`arenaClassCharges/${enrollmentId}_2026-12`)!;
    assert.equal(dec["amountReais"], 224);
    assert.equal(dec["dueDate"], "2026-12-10");
    assert.equal(dec["period"], "2026-12");
    assert.equal(dec["status"], "open");
    assert.equal(dec["description"], "Mensal 2x/semana · dez/2026 (7 de 10 aulas)");
    assert.equal(fake.store.get(`arenaClassEnrollments/${enrollmentId}`)!["billedThrough"], "2026-12");
    // A de outubro (antes da pausa) fica como estava.
    assert.equal(fake.store.get(`arenaClassCharges/${enrollmentId}_2026-10`)!["status"], "open");
    assert.deepEqual(chargeIds(fake, enrollmentId), ["2026-10", "2026-12"]);
  });

  it("pausa e volta no mesmo mês: nada novo, nada duplicado", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {enrollmentId} = await createEnrollmentCore(db, request({waiveFee: true}), athlete("u1", "Marina"), "gestor", TODAY);
    await setEnrollmentStatusCore(db, enrollmentId, "paused", "2026-10-20");
    await setEnrollmentStatusCore(db, enrollmentId, "active", "2026-10-23");

    assert.deepEqual(chargeIds(fake, enrollmentId), ["2026-10"]);
    assert.equal(fake.store.get(`arenaClassCharges/${enrollmentId}_2026-10`)!["amountReais"], 142.22);
    assert.equal(fake.store.get(`arenaClassEnrollments/${enrollmentId}`)!["billedThrough"], "2026-10");
  });

  it("volta num mês que já tem mensalidade não cria outra nem mexe na que existe", async () => {
    const {fake, db} = makeDb();
    const enrollmentId = await pausedInOctober(fake, db);
    // Aluno pagou dezembro adiantado, cheio, antes de voltar.
    fake.seedDoc(`arenaClassCharges/${enrollmentId}_2026-12`, {
      arenaId: "arena1", enrollmentId, period: "2026-12", status: "paid", dueDate: "2026-12-05", amountReais: 320,
    });
    await setEnrollmentStatusCore(db, enrollmentId, "active", "2026-12-10");

    const dec = fake.store.get(`arenaClassCharges/${enrollmentId}_2026-12`)!;
    assert.equal(dec["status"], "paid");
    assert.equal(dec["amountReais"], 320);
    assert.equal(fake.store.get(`arenaClassEnrollments/${enrollmentId}`)!["billedThrough"], "2026-12");
    assert.deepEqual(chargeIds(fake, enrollmentId), ["2026-10", "2026-12"]);
  });

  it("depois da volta o agendador só gera o mês seguinte, no prazo normal", async () => {
    const {fake, db} = makeDb();
    const enrollmentId = await pausedInOctober(fake, db);
    await setEnrollmentStatusCore(db, enrollmentId, "active", "2026-12-10");

    assert.equal((await runMonthlyBilling(db, "2026-12-10")).charges, 0);
    assert.equal((await runMonthlyBilling(db, "2026-12-25")).charges, 0);
    assert.equal((await runMonthlyBilling(db, "2026-12-26")).charges, 1); // 10 dias antes de 05/01
    const jan = fake.store.get(`arenaClassCharges/${enrollmentId}_2027-01`)!;
    assert.equal(jan["amountReais"], 320);
    assert.equal(jan["dueDate"], "2027-01-05");
    assert.equal(fake.store.get(`arenaClassCharges/${enrollmentId}_2026-12`)!["amountReais"], 224);
    assert.deepEqual(chargeIds(fake, enrollmentId), ["2026-10", "2026-12", "2027-01"]);
  });

  it("pacote: pausar e reativar não mexe em cobrança", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    const {enrollmentId} = await createEnrollmentCore(db, request({planId: "p8", slots: [{classId: "cB", weekday: 4}], waiveFee: true}), athlete("u4", "Caio"), "gestor", TODAY);
    await setEnrollmentStatusCore(db, enrollmentId, "paused", "2026-10-20");
    await setEnrollmentStatusCore(db, enrollmentId, "active", "2026-12-10");

    assert.deepEqual(chargeIds(fake, enrollmentId), ["package"]);
    assert.equal(fake.store.get(`arenaClassEnrollments/${enrollmentId}`)!["billedThrough"], null);
  });
});

describe("reposição e pacote na chamada", () => {
  async function setup(fake: FakeFirestore, db: Firestore, date = "2026-10-20") {
    seedArena(fake);
    const mensal = await createEnrollmentCore(db, request({waiveFee: true}), athlete("u1", "Marina"), "gestor", TODAY);
    const pacote = await createEnrollmentCore(db, request({planId: "p8", slots: [{classId: "cB", weekday: 4}], waiveFee: true}), athlete("u4", "Caio"), "gestor", TODAY);
    const cls = parseArenaClass(fake.store.get("arenaClasses/cB")!);
    await materializeClassSession(db, "cB", cls, date, "series");
    return {mensal, pacote, sessionId: classSessionId("cB", date)};
  }

  it("falta justificada gera crédito até o limite do plano no mês", async () => {
    const {fake, db} = makeDb();
    const {mensal, sessionId} = await setup(fake, db);
    const out = await saveClassAttendanceCore(db, sessionId, {marks: {u1: "excused"}, teacherNote: undefined, close: true, uid: "g"}, "2026-10-20");
    assert.equal(out.credited, 1);
    const credit = fake.store.get(`arenaClassCredits/${makeupCreditId(sessionId, "u1")}`)!;
    assert.equal(credit["status"], "available");
    assert.equal(credit["expiresOn"], "2026-11-19");
    assert.equal(credit["enrollmentId"], mensal.enrollmentId);

    // Mensal 2x tem 1 reposição/mês: a segunda falta justificada de outubro não gera.
    const cls = parseArenaClass(fake.store.get("arenaClasses/cB")!);
    await materializeClassSession(db, "cB", cls, "2026-10-22", "series");
    const second = await saveClassAttendanceCore(db, classSessionId("cB", "2026-10-22"),
      {marks: {u1: "excused"}, teacherNote: undefined, close: true, uid: "g"}, "2026-10-22");
    assert.equal(second.credited, 0);
  });

  it("pacote debita presença uma vez por aula, mesmo corrigindo a chamada", async () => {
    const {fake, db} = makeDb();
    const {pacote} = await setup(fake, db);
    const cls = parseArenaClass(fake.store.get("arenaClasses/cB")!);
    await materializeClassSession(db, "cB", cls, "2026-10-22", "series");
    const id = classSessionId("cB", "2026-10-22");
    await saveClassAttendanceCore(db, id, {marks: {u4: "present"}, teacherNote: undefined, close: true, uid: "g"}, "2026-10-22");
    await saveClassAttendanceCore(db, id, {marks: {u4: "absent"}, teacherNote: undefined, close: true, uid: "g"}, "2026-10-22");
    assert.equal(fake.store.get(`arenaClassEnrollments/${pacote.enrollmentId}`)!["creditsLeft"], 7);
  });

  it("encaixe usa o crédito e ocupa a vaga; tirar devolve o crédito", async () => {
    const {fake, db} = makeDb();
    const {sessionId} = await setup(fake, db, "2026-10-22");
    fake.seedDoc("arenaClassCredits/cr1", {
      arenaId: "arena1", studentId: "u9", athleteId: "u9", name: "Lia", status: "available", expiresOn: "2026-11-30",
    });
    // Quinta: Marina (2x) + Caio (pacote) já ocupam as 2 vagas.
    await assert.rejects(
      addExtraCore(db, sessionId, {kind: "makeup", creditId: "cr1", student: {athleteId: null, name: ""}}, TODAY),
      /sem vaga/,
    );
    fake.seedDoc("arenaClassSessions/" + sessionId, {...fake.store.get("arenaClassSessions/" + sessionId)!, capacity: 3});
    const {studentId} = await addExtraCore(db, sessionId, {kind: "makeup", creditId: "cr1", student: {athleteId: null, name: ""}}, TODAY);
    assert.equal(studentId, "u9");
    assert.equal(fake.store.get("arenaClassCredits/cr1")!["status"], "used");
    await removeExtraCore(db, sessionId, "u9");
    assert.equal(fake.store.get("arenaClassCredits/cr1")!["status"], "available");
  });

  it("aula cancelada pela arena dá crédito a quem faria aquele dia e devolve o da reposição", async () => {
    const {fake, db} = makeDb();
    const {sessionId} = await setup(fake, db); // terça: Rui (só ter) e Marina (ter/qui); Caio é só quinta
    fake.seedDoc("arenaClassCredits/cr2", {arenaId: "arena1", studentId: "u9", name: "Lia", status: "used", expiresOn: "2026-11-30"});
    fake.seedDoc("arenaClassSessions/" + sessionId, {
      ...fake.store.get("arenaClassSessions/" + sessionId)!,
      extras: {u9: {name: "Lia", kind: "makeup", creditId: "cr2", athleteId: null}},
    });
    const out = await cancelClassSessionCore(db, sessionId, "rain", null, {notify: async () => {}});
    assert.equal(out.credited, 2);
    assert.ok(fake.store.has(`arenaClassCredits/${makeupCreditId(sessionId, "u0")}`));
    assert.ok(fake.store.has(`arenaClassCredits/${makeupCreditId(sessionId, "u1")}`));
    assert.equal(fake.store.has(`arenaClassCredits/${makeupCreditId(sessionId, "u4")}`), false);
    assert.equal(fake.store.get("arenaClassCredits/cr2")!["status"], "available");
  });
});

import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  closeTeacherPayoutCore,
  computeTeacherPayouts,
  isEnrollmentFeeCharge,
  loadPayoutInputs,
  setTeacherPayoutStatusCore,
  type PayoutClassInfo,
  type PayoutInputs,
  type PayoutSessionInfo,
  type PayoutTeacherInfo,
} from "./arena-class-payout";
import {
  parseTeacherPayoutModel,
  requireClassPayoutManager,
  requireClassPayoutReader,
  validateTeacherPayoutModel,
  type TeacherPayoutModel,
} from "./arena-class-payout-model";
import {upsertClassTeacherCore} from "./arena-class";
import {classPayoutId} from "./arena-class-constants";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const MONTH = "2026-10";
const TODAY = "2026-11-03";

const share = (percent: number): TeacherPayoutModel => ({model: "revenue_share", percent, amountReais: null});
const perClass = (amountReais: number): TeacherPayoutModel => ({model: "per_class", percent: null, amountReais});
const perStudent = (amountReais: number): TeacherPayoutModel => ({model: "per_student", percent: null, amountReais});

function teacher(id: string, name: string, payout: TeacherPayoutModel | null, status = "active"): PayoutTeacherInfo {
  return {id, name, color: "#FF6A1A", userId: `u_${id}`, status, payout};
}

function cls(teacherId: string, name: string, weekdays: number[], type: PayoutClassInfo["type"] = "turma"): PayoutClassInfo {
  return {name, type, weekdays, teacherId, teacherName: teacherId, teacherColor: "#FF6A1A"};
}

function session(
  classId: string,
  teacherId: string,
  date: string,
  status: string,
  presentIds: string[] = [],
  type: PayoutSessionInfo["type"] = "turma",
): PayoutSessionInfo {
  return {classId, type, teacherId, teacherName: teacherId, teacherColor: "#FF6A1A", date, status, presentIds};
}

function inputs(overrides: Partial<PayoutInputs> = {}): PayoutInputs {
  return {
    month: MONTH,
    todayKey: TODAY,
    teachers: [],
    classes: new Map(),
    sessions: [],
    charges: [],
    enrollments: new Map(),
    ...overrides,
  };
}

describe("repasse — modelo no cadastro do professor", () => {
  it("valida % da receita, valor por aula e por aluno", () => {
    assert.deepEqual(validateTeacherPayoutModel({model: "revenue_share", percent: 37.555}), share(37.56));
    assert.deepEqual(validateTeacherPayoutModel({model: "per_class", amountReais: 45}), perClass(45));
    assert.deepEqual(validateTeacherPayoutModel({model: "per_student", amountReais: "12.5"}), perStudent(12.5));
    assert.throws(() => validateTeacherPayoutModel({model: "revenue_share", percent: 0}), /Percentual/);
    assert.throws(() => validateTeacherPayoutModel({model: "revenue_share", percent: 120}), /Percentual/);
    assert.throws(() => validateTeacherPayoutModel({model: "per_class", amountReais: -1}), /Valor do repasse/);
    assert.throws(() => validateTeacherPayoutModel({model: "salario"}), /inválido/);
    assert.throws(() => validateTeacherPayoutModel("50%"), /inválido/);
  });

  it("modelo gravado inválido ou ausente vira 'sem modelo'", () => {
    assert.equal(parseTeacherPayoutModel(undefined), null);
    assert.equal(parseTeacherPayoutModel({model: "revenue_share"}), null);
    assert.equal(parseTeacherPayoutModel({model: "per_class", amountReais: 0}), null);
    assert.deepEqual(parseTeacherPayoutModel({model: "per_student", amountReais: 15, percent: 9}), perStudent(15));
  });

  it("cadastro grava o modelo; edição sem modelo mantém o gravado", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("users/uThiago", {fullName: "Thiago Mendes"});
    const base = {specialty: null, phone: null, color: "#FF6A1A", status: "active" as const};
    const {teacherId} = await upsertClassTeacherCore(db, "arena1", {...base, teacherId: null, userId: "uThiago", payout: share(50)}, "gestor");
    const path = `arenas/arena1/classTeachers/${teacherId}`;
    assert.deepEqual(fake.store.get(path)!["payout"], share(50));
    await upsertClassTeacherCore(db, "arena1", {...base, teacherId, userId: null, phone: "11999"}, "recepcao");
    assert.deepEqual(fake.store.get(path)!["payout"], share(50));
    await upsertClassTeacherCore(db, "arena1", {...base, teacherId, userId: null, payout: perClass(45)}, "gestor");
    assert.deepEqual(fake.store.get(path)!["payout"], perClass(45));
  });
});

describe("repasse — gate de dinheiro", () => {
  function seedArena(fake: FakeFirestore) {
    fake.seedDoc("arenas/arena1", {managerUserId: "owner", planTier: "pro", planStatus: "active"});
    for (const role of ["gestor", "recepcao", "financeiro", "manutencao"]) {
      fake.seedDoc(`arenas/arena1/staff/${role}`, {role, status: "active"});
    }
  }

  it("só dono e gestor fecham e pagam; dono, gestor e financeiro veem", async () => {
    const {fake, db} = makeDb();
    seedArena(fake);
    for (const uid of ["owner", "gestor"]) await requireClassPayoutManager(db, "arena1", uid);
    for (const uid of ["recepcao", "financeiro", "manutencao", "estranho"]) {
      await assert.rejects(requireClassPayoutManager(db, "arena1", uid), /acesso/);
    }
    for (const uid of ["owner", "gestor", "financeiro"]) await requireClassPayoutReader(db, "arena1", uid);
    for (const uid of ["recepcao", "manutencao", "estranho"]) {
      await assert.rejects(requireClassPayoutReader(db, "arena1", uid), /acesso/);
    }
  });
});

describe("repasse — cálculo do mês", () => {
  it("% da receita: mensalidade rateada pelos horários entre professores diferentes", () => {
    const out = computeTeacherPayouts(inputs({
      teachers: [teacher("t1", "Thiago", share(50)), teacher("t2", "Juliana", share(40))],
      classes: new Map([["cA", cls("t1", "Iniciante A", [2])], ["cB", cls("t2", "Intermediário B", [4])]]),
      // Ter na turma do Thiago, Qui na da Juliana.
      enrollments: new Map([["e1", {slots: [{classId: "cA", teacherId: "t1"}, {classId: "cB", teacherId: "t2"}]}]]),
      charges: [{id: "e1_2026-10", enrollmentId: "e1", studentId: "s1", amountReais: 320}],
    }));
    const [ju, th] = out.teachers;
    assert.equal(th!.teacherName, "Thiago");
    assert.equal(th!.revenueReais, 160);
    assert.equal(th!.amountReais, 80);
    assert.equal(ju!.revenueReais, 160);
    assert.equal(ju!.amountReais, 64);
    assert.deepEqual(th!.lines.map((l) => [l.label, l.detail, l.payingStudents, l.revenueReais, l.amountReais]), [
      ["Iniciante A", "Turma · ter", 1, 160, 80],
    ]);
    assert.equal(out.revenueReais, 320);
  });

  it("taxa de matrícula fica com a arena; matrícula sem horário não entra em repasse", () => {
    assert.equal(isEnrollmentFeeCharge({id: "e1_fee", enrollmentId: "e1"}), true);
    assert.equal(isEnrollmentFeeCharge({id: "e1_2026-10", enrollmentId: "e1"}), false);
    const out = computeTeacherPayouts(inputs({
      teachers: [teacher("t1", "Thiago", share(50))],
      classes: new Map([["cA", cls("t1", "Iniciante A", [2, 4])]]),
      enrollments: new Map([
        ["e1", {slots: [{classId: "cA", teacherId: "t1"}, {classId: "cA", teacherId: "t1"}]}],
        ["e2", {slots: []}],
      ]),
      charges: [
        {id: "e1_2026-10", enrollmentId: "e1", studentId: "s1", amountReais: 142.22},
        {id: "e1_fee", enrollmentId: "e1", studentId: "s1", amountReais: 50},
        {id: "e2_package", enrollmentId: "e2", studentId: "s2", amountReais: 360},
      ],
    }));
    assert.equal(out.feesReais, 50);
    assert.equal(out.unassignedReais, 360);
    assert.equal(out.revenueReais, 502.22);
    assert.equal(out.teachers[0]!.revenueReais, 142.22);
    assert.equal(out.teachers[0]!.amountReais, 71.11);
  });

  it("rateio em centavos não perde nem cria dinheiro (R$ 100 em 3 horários)", () => {
    const out = computeTeacherPayouts(inputs({
      teachers: [teacher("t1", "Ana", share(100)), teacher("t2", "Bia", share(100))],
      classes: new Map([["cA", cls("t1", "A", [1])], ["cB", cls("t2", "B", [3])], ["cC", cls("t2", "C", [5])]]),
      enrollments: new Map([["e1", {slots: [
        {classId: "cA", teacherId: "t1"}, {classId: "cB", teacherId: "t2"}, {classId: "cC", teacherId: "t2"},
      ]}]]),
      charges: [{id: "e1_2026-10", enrollmentId: "e1", studentId: "s1", amountReais: 100}],
    }));
    assert.equal(out.teachers[0]!.revenueReais, 33.34);
    assert.equal(out.teachers[1]!.revenueReais, 66.66);
  });

  it("receita vai para o professor atual da turma, não o do retrato na matrícula", () => {
    const out = computeTeacherPayouts(inputs({
      teachers: [teacher("t1", "Thiago", share(50)), teacher("t2", "Juliana", share(50))],
      classes: new Map([["cA", cls("t2", "Iniciante A", [2])]]),
      enrollments: new Map([["e1", {slots: [{classId: "cA", teacherId: "t1"}]}]]),
      charges: [{id: "e1_2026-10", enrollmentId: "e1", studentId: "s1", amountReais: 200}],
    }));
    const byName = Object.fromEntries(out.teachers.map((t) => [t.teacherName, t.amountReais]));
    assert.deepEqual(byName, {Juliana: 100, Thiago: 0});
  });

  it("por aula: só chamada fechada conta; aberta até hoje vira pendência; cancelada não paga", () => {
    const out = computeTeacherPayouts(inputs({
      todayKey: "2026-10-20",
      teachers: [teacher("t3", "Marcos", perClass(45))],
      classes: new Map([["cV", cls("t3", "Vôlei", [1, 3])]]),
      sessions: [
        session("cV", "t3", "2026-10-05", "completed", ["a", "b"]),
        session("cV", "t3", "2026-10-07", "completed", ["a"]),
        session("cV", "t3", "2026-10-12", "canceled"),
        session("cV", "t3", "2026-10-19", "scheduled"),
        session("cV", "t3", "2026-10-21", "scheduled"),
        session("cV", "t3", "2026-09-30", "completed", ["a"]),
      ],
    }));
    const t = out.teachers[0]!;
    assert.equal(t.classesGiven, 2);
    assert.equal(t.presences, 3);
    assert.equal(t.students, 2);
    assert.equal(t.pendingSessions, 1);
    assert.equal(t.canceledSessions, 1);
    assert.equal(t.amountReais, 90);
  });

  it("por aluno presente: encaixe conta; avulsas do mesmo tipo viram uma linha só", () => {
    const out = computeTeacherPayouts(inputs({
      teachers: [teacher("t4", "Paula", perStudent(15))],
      classes: new Map([
        ["cF", cls("t4", "Futevôlei", [6])],
        ["p1", cls("t4", "Particular Ana", [], "particular")],
        ["p2", cls("t4", "Particular Rui", [], "particular")],
      ]),
      sessions: [
        session("cF", "t4", "2026-10-03", "completed", ["a", "b", "extra1"]),
        session("p1", "t4", "2026-10-08", "completed", ["ana"], "particular"),
        session("p2", "t4", "2026-10-09", "completed", ["rui"], "particular"),
      ],
    }));
    const t = out.teachers[0]!;
    assert.deepEqual(t.lines.map((l) => [l.label, l.detail, l.classes, l.presences, l.amountReais]), [
      ["Futevôlei", "Turma · sáb", 1, 3, 45],
      ["Particulares", "Aulas avulsas", 2, 2, 30],
    ]);
    assert.equal(t.amountReais, 75);
  });

  it("sem modelo: aparece com valor zero; arquivado só entra se teve atividade", () => {
    const out = computeTeacherPayouts(inputs({
      teachers: [teacher("t1", "Thiago", null), teacher("t9", "Antigo", share(50), "archived"), teacher("t8", "Saiu", share(50), "archived")],
      classes: new Map([["cA", cls("t1", "A", [1])], ["cZ", cls("t8", "Z", [2])]]),
      sessions: [session("cA", "t1", "2026-10-05", "completed", ["a"]), session("cZ", "t8", "2026-10-06", "completed", ["b"])],
    }));
    assert.deepEqual(out.teachers.map((t) => [t.teacherName, t.model, t.amountReais]), [
      ["Saiu", share(50), 0],
      ["Thiago", null, 0],
    ]);
  });
});

/** Arena real no fake: Thiago (50%) dá Iniciante A (Ter); Juliana (sem modelo) dá Intermediário B (Qui). */
function seedMonth(fake: FakeFirestore) {
  fake.seedDoc("arenas/arena1/classTeachers/t1", {arenaId: "arena1", name: "Thiago", color: "#FF6A1A", status: "active", userId: "uT", payout: share(50)});
  fake.seedDoc("arenas/arena1/classTeachers/t2", {arenaId: "arena1", name: "Juliana", color: "#5B9BFF", status: "active", userId: "uJ"});
  fake.seedDoc("arenaClasses/cA", {arenaId: "arena1", name: "Iniciante A", type: "turma", teacherId: "t1", teacherName: "Thiago", weekdays: [2], status: "active"});
  fake.seedDoc("arenaClasses/cB", {arenaId: "arena1", name: "Intermediário B", type: "turma", teacherId: "t2", teacherName: "Juliana", weekdays: [4], status: "active"});
  fake.seedDoc("arenaClasses/outra", {arenaId: "arena2", name: "Outra", type: "turma", teacherId: "x", weekdays: [1], status: "active"});
  fake.seedDoc("arenaClassEnrollments/e1", {arenaId: "arena1", studentId: "s1", slots: [
    {classId: "cA", weekday: 2, teacherId: "t1"}, {classId: "cB", weekday: 4, teacherId: "t2"},
  ]});
  fake.seedDoc("arenaClassCharges/e1_2026-10", {arenaId: "arena1", enrollmentId: "e1", studentId: "s1", amountReais: 320, status: "paid", paidOn: "2026-10-06"});
  fake.seedDoc("arenaClassCharges/e1_fee", {arenaId: "arena1", enrollmentId: "e1", studentId: "s1", amountReais: 50, status: "paid", paidOn: "2026-10-06"});
  // Fora do mês, aberta ou de outra arena: não entram.
  fake.seedDoc("arenaClassCharges/e1_2026-09", {arenaId: "arena1", enrollmentId: "e1", studentId: "s1", amountReais: 320, status: "paid", paidOn: "2026-09-30"});
  fake.seedDoc("arenaClassCharges/e1_2026-11", {arenaId: "arena1", enrollmentId: "e1", studentId: "s1", amountReais: 320, status: "open", paidOn: null});
  fake.seedDoc("arenaClassCharges/x_2026-10", {arenaId: "arena2", enrollmentId: "e1", studentId: "s1", amountReais: 999, status: "paid", paidOn: "2026-10-10"});
  fake.seedDoc("arenaClassSessions/class_cA_2026-10-06", {
    arenaId: "arena1", classId: "cA", className: "Iniciante A", type: "turma", teacherId: "t1", teacherName: "Thiago",
    date: "2026-10-06", status: "completed", attendance: {s1: {mark: "present", name: "Sofia"}, s2: {mark: "absent", name: "Rui"}},
  });
  fake.seedDoc("arenaClassSessions/class_cA_2026-11-03", {
    arenaId: "arena1", classId: "cA", type: "turma", teacherId: "t1", date: "2026-11-03", status: "completed", attendance: {},
  });
}

describe("repasse — leitura, fechamento e pagamento", () => {
  it("lê do Firestore só o mês e a arena (pagas no mês, sem a taxa no repasse)", async () => {
    const {fake, db} = makeDb();
    seedMonth(fake);
    const out = computeTeacherPayouts(await loadPayoutInputs(db, "arena1", MONTH, TODAY));
    assert.equal(out.revenueReais, 320);
    assert.equal(out.feesReais, 50);
    const th = out.teachers.find((t) => t.teacherId === "t1")!;
    assert.deepEqual([th.classesGiven, th.presences, th.revenueReais, th.amountReais], [1, 1, 160, 80]);
    const ju = out.teachers.find((t) => t.teacherId === "t2")!;
    assert.deepEqual([ju.model, ju.revenueReais, ju.amountReais], [null, 160, 0]);
  });

  it("fecha o mês terminado com ajuste explicado; recalcula enquanto não paga", async () => {
    const {fake, db} = makeDb();
    seedMonth(fake);
    const id = classPayoutId("arena1", "t1", MONTH);
    const base = {arenaId: "arena1", teacherId: "t1", month: MONTH, adjustmentReais: 0, adjustmentNote: null};

    await assert.rejects(closeTeacherPayoutCore(db, {...base, month: "2026-11"}, "gestor", TODAY), /ainda não terminou/);
    await assert.rejects(closeTeacherPayoutCore(db, {...base, teacherId: "t2"}, "gestor", TODAY), /Defina o modelo/);
    await assert.rejects(closeTeacherPayoutCore(db, {...base, teacherId: "nada"}, "gestor", TODAY), /não encontrado/);
    await assert.rejects(closeTeacherPayoutCore(db, {...base, adjustmentReais: -20}, "gestor", TODAY), /Explique o ajuste/);
    await assert.rejects(closeTeacherPayoutCore(db, {...base, adjustmentReais: -100, adjustmentNote: "x"}, "gestor", TODAY), /negativo/);

    const res = await closeTeacherPayoutCore(db, {...base, adjustmentReais: -20, adjustmentNote: "Aula de 08/10 sem substituto"}, "gestor", TODAY);
    assert.deepEqual(res, {payoutId: id, amountReais: 60});
    const doc = fake.store.get(`arenaClassPayouts/${id}`)!;
    assert.equal(doc["status"], "closed");
    assert.equal(doc["computedReais"], 80);
    assert.equal(doc["teacherUserId"], "uT");
    assert.deepEqual(doc["model"], share(50));
    assert.equal((doc["lines"] as unknown[]).length, 1);

    // Pagou mais uma mensalidade no mês: recalcular atualiza o retrato.
    fake.seedDoc("arenaClassCharges/e1_extra", {arenaId: "arena1", enrollmentId: "e1", studentId: "s1", amountReais: 100, status: "paid", paidOn: "2026-10-30"});
    const again = await closeTeacherPayoutCore(db, base, "gestor", TODAY);
    assert.equal(again.amountReais, 105);
    assert.equal(fake.store.get(`arenaClassPayouts/${id}`)!["adjustmentNote"], null);
  });

  it("registra o pagamento por fora, desfaz, e pago não recalcula", async () => {
    const {fake, db} = makeDb();
    seedMonth(fake);
    const id = classPayoutId("arena1", "t1", MONTH);
    await closeTeacherPayoutCore(db, {arenaId: "arena1", teacherId: "t1", month: MONTH, adjustmentReais: 0, adjustmentNote: null}, "gestor", TODAY);

    const pay = {status: "paid" as const, paymentMethod: "pix", paidOn: "2026-11-02"};
    await assert.rejects(setTeacherPayoutStatusCore(db, id, {...pay, paymentMethod: "card_machine"}, "gestor", TODAY), /Forma/);
    await assert.rejects(setTeacherPayoutStatusCore(db, id, {...pay, paidOn: "2026-11-04"}, "gestor", TODAY), /Data/);
    await assert.rejects(setTeacherPayoutStatusCore(db, "nao-existe", pay, "gestor", TODAY), /não encontrado/);

    assert.deepEqual(await setTeacherPayoutStatusCore(db, id, pay, "gestor", TODAY), {payoutId: id, status: "paid"});
    const paid = fake.store.get(`arenaClassPayouts/${id}`)!;
    assert.deepEqual([paid["status"], paid["paidOn"], paid["paymentMethod"], paid["paidByUid"]], ["paid", "2026-11-02", "pix", "gestor"]);
    await assert.rejects(
      closeTeacherPayoutCore(db, {arenaId: "arena1", teacherId: "t1", month: MONTH, adjustmentReais: 0, adjustmentNote: null}, "gestor", TODAY),
      /já foi pago/,
    );

    assert.deepEqual(await setTeacherPayoutStatusCore(db, id, {status: "closed", paymentMethod: null, paidOn: null}, "gestor", TODAY), {payoutId: id, status: "closed"});
    const undone = fake.store.get(`arenaClassPayouts/${id}`)!;
    assert.deepEqual([undone["status"], undone["paidOn"], undone["paymentMethod"]], ["closed", null, null]);
    // Desfazer de novo não muda nada.
    assert.deepEqual(await setTeacherPayoutStatusCore(db, id, {status: "closed", paymentMethod: null, paidOn: null}, "gestor", TODAY), {payoutId: id, status: "closed"});
  });
});

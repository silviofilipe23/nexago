import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  ARENA_STAFF_ONLY_PERMISSION_KEYS,
  defaultArenaProfessorPermissions,
  effectiveArenaProfessorPermissions,
  parseArenaProfessorPermissions,
} from "./arena-professor-links";
import {professorPermissionDenial} from "./arena-professor-permissions";
import {authorizeClassAction} from "./arena-class";
import {authorizeEnrollment, parseEnrollmentRequest} from "./arena-class-billing";
import {
  assertTeacherCanUseCredit,
  buildProfessorActionsContext,
  courtFitsLesson,
  findPackageWithCredit,
  moveClassStudentCore,
  pickTargetWeekdays,
} from "./arena-class-professor-actions";

const TODAY = "2026-10-20";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/a1", {name: "Arena CFC", managerUserId: "uOwner", planTier: "pro", planStatus: "active"});
  fake.seedDoc("arenas/a1/staff/uRecepcao", {role: "recepcao", status: "active"});
  fake.seedDoc("arenas/a1/classSettings/rules", {defaultDueDay: 10});
  return {fake, db: fake as unknown as Firestore};
}

function seedLink(fake: FakeFirestore, opts: {type?: string; status?: string; perms?: Record<string, boolean>} = {}): void {
  const type = opts.type ?? "ARENA_STAFF";
  fake.seedDoc("arenaProfessors/a1_uProf", {
    arenaId: "a1", professorUserId: "uProf", relationshipType: type, status: opts.status ?? "ACTIVE",
    permissions: {...defaultArenaProfessorPermissions(type as "ARENA_STAFF"), ...(opts.perms ?? {})},
    arenaName: "Arena CFC",
  });
}

function seedClass(fake: FakeFirestore, id: string, extra: Record<string, unknown> = {}): void {
  fake.seedDoc(`arenaClasses/${id}`, {
    arenaId: "a1", arenaName: "Arena CFC", name: id === "c1" ? "Iniciante A" : "Iniciante Sábado", type: "turma",
    level: "iniciante", sport: "beachTennis", teacherId: "t1", teacherUserId: "uProf", weekdays: [1, 3],
    startTime: "07:00", endTime: "08:00", courtId: "q1", courtName: "Quadra 1", capacity: 2, status: "active",
    studentCount: 0, startDate: "2026-01-01", ...extra,
  });
}

async function rejectsWith(promise: Promise<unknown>, code: string, pattern?: RegExp): Promise<void> {
  await assert.rejects(promise, (e: unknown) => {
    assert.ok(e instanceof HttpsError, String(e));
    assert.equal(e.code, code);
    if (pattern) assert.match(e.message, pattern);
    return true;
  });
}

describe("chaves da fase 2 no vínculo", () => {
  it("nascem desligadas nos dois tipos e vínculo antigo (sem a chave) segue desligado", () => {
    for (const type of ["ARENA_STAFF", "INDEPENDENT"] as const) {
      const d = defaultArenaProfessorPermissions(type);
      assert.equal(d.canEnrollStudents, false);
      assert.equal(d.canScheduleLessons, false);
      assert.equal(d.canCancelLessons, false);
    }
    const legacy = effectiveArenaProfessorPermissions({
      status: "ACTIVE", relationshipType: "ARENA_STAFF",
      permissions: {canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: true},
    });
    assert.equal(legacy.canEnrollStudents, false);
    assert.equal(legacy.canManageOwnLessons, true);
  });

  it("independente não recebe as chaves da equipe: gravar `true` é recusado", () => {
    assert.throws(() => parseArenaProfessorPermissions({canEnrollStudents: true}, "INDEPENDENT"), HttpsError);
    assert.equal(parseArenaProfessorPermissions({canEnrollStudents: false}, "INDEPENDENT").canEnrollStudents, false);
    assert.equal(parseArenaProfessorPermissions({canCancelLessons: true}, "ARENA_STAFF").canCancelLessons, true);
  });

  it("efetivas só em equipe ACTIVE; independente com a chave gravada por fora fica `not_staff`", () => {
    const perms = {canEnrollStudents: true, canScheduleLessons: true, canCancelLessons: true};
    assert.equal(effectiveArenaProfessorPermissions({status: "SUSPENDED", relationshipType: "ARENA_STAFF", permissions: perms}).canEnrollStudents, false);
    assert.equal(effectiveArenaProfessorPermissions({status: "ACTIVE", relationshipType: "INDEPENDENT", permissions: perms}).canEnrollStudents, false);
    assert.equal(effectiveArenaProfessorPermissions({status: "ACTIVE", relationshipType: "ARENA_STAFF", permissions: perms}).canEnrollStudents, true);
    for (const key of ARENA_STAFF_ONLY_PERMISSION_KEYS) {
      assert.equal(professorPermissionDenial({status: "ACTIVE", relationshipType: "INDEPENDENT", permissions: {...defaultArenaProfessorPermissions("INDEPENDENT"), [key]: true}}, key), "not_staff");
    }
    // A chamada do independente continua valendo.
    assert.equal(professorPermissionDenial({status: "ACTIVE", relationshipType: "INDEPENDENT", permissions: defaultArenaProfessorPermissions("INDEPENDENT")}, "canManageOwnLessons"), null);
  });
});

describe("authorizeClassAction", () => {
  it("equipe da arena passa sem vínculo; professor da turma com a chave passa", async () => {
    const {fake, db} = makeDb();
    assert.equal((await authorizeClassAction(db, "a1", ["uProf"], "uRecepcao", "canEnrollStudents")).role, "staff");
    seedLink(fake, {perms: {canEnrollStudents: true}});
    assert.equal((await authorizeClassAction(db, "a1", ["uProf"], "uProf", "canEnrollStudents")).role, "teacher");
  });

  it("chave desligada, turma de outro professor ou vínculo independente: recusa", async () => {
    const {fake, db} = makeDb();
    seedLink(fake);
    await rejectsWith(authorizeClassAction(db, "a1", ["uProf"], "uProf", "canEnrollStudents"), "permission-denied", /não liberou matricular/);
    seedLink(fake, {perms: {canEnrollStudents: true}});
    await rejectsWith(authorizeClassAction(db, "a1", ["uProf", "uOutro"], "uProf", "canEnrollStudents"), "permission-denied");
    await rejectsWith(authorizeClassAction(db, "a1", [], "uProf", "canEnrollStudents"), "permission-denied");
    fake.seedDoc("arenaProfessors/a1_uProf", {
      arenaId: "a1", professorUserId: "uProf", relationshipType: "INDEPENDENT", status: "ACTIVE",
      permissions: {canEnrollStudents: true}, arenaName: "Arena CFC",
    });
    await rejectsWith(authorizeClassAction(db, "a1", ["uProf"], "uProf", "canEnrollStudents"), "permission-denied", /Só professor da equipe/);
  });
});

describe("authorizeEnrollment — matrícula pelo professor", () => {
  const input = {
    arenaId: "a1", planId: "p1", slots: [{classId: "c1", weekday: 1}], dueDay: 25, paymentMethod: "cash",
    waiveFee: true, cpfCnpj: "52998224725", billingMode: "manual",
  };

  it("professor: sem dispensa de taxa, sem CPF, vencimento das Regras, PIX; equipe: como pediu", async () => {
    const {fake, db} = makeDb();
    seedClass(fake, "c1");
    seedLink(fake, {perms: {canEnrollStudents: true}});
    const teacher = await authorizeEnrollment(db, parseEnrollmentRequest(input), "uProf");
    assert.equal(teacher.role, "teacher");
    assert.deepEqual(
      [teacher.req.waiveFee, teacher.req.cpfCnpj, teacher.req.dueDay, teacher.req.paymentMethod],
      [false, null, 10, "pix"],
    );
    const staff = await authorizeEnrollment(db, parseEnrollmentRequest(input), "uRecepcao");
    assert.deepEqual([staff.req.waiveFee, staff.req.dueDay, staff.req.paymentMethod], [true, 25, "cash"]);
  });

  it("turma de outro professor no pedido (ou espera de outra turma): recusa", async () => {
    const {fake, db} = makeDb();
    seedClass(fake, "c1");
    seedClass(fake, "c9", {teacherUserId: "uOutro"});
    seedLink(fake, {perms: {canEnrollStudents: true}});
    await rejectsWith(authorizeEnrollment(db, parseEnrollmentRequest({...input, slots: [{classId: "c1", weekday: 1}, {classId: "c9", weekday: 3}]}), "uProf"), "permission-denied");
    await rejectsWith(authorizeEnrollment(db, parseEnrollmentRequest({...input, waitlistClassId: "c9", waitlistEntryId: "w1"}), "uProf"), "permission-denied");
  });
});

describe("pickTargetWeekdays", () => {
  it("mantém os mesmos dias quando a destino tem, completa pela ordem", () => {
    assert.deepEqual(pickTargetWeekdays([1, 3, 5], [3, 4], 2, null, "X"), [1, 3]);
    assert.deepEqual(pickTargetWeekdays([2, 4], [1, 3], 1, null, "X"), [2]);
    assert.deepEqual(pickTargetWeekdays([1, 3, 5], [1], 1, [5], "X"), [5]);
  });

  it("recusa destino com menos dias, dia que a turma não tem ou quantidade errada", () => {
    assert.throws(() => pickTargetWeekdays([6], [1, 3], 2, null, "Sábado"), /1 dia\(s\) por semana/);
    assert.throws(() => pickTargetWeekdays([1, 3], [1], 1, [2], "X"), HttpsError);
    assert.throws(() => pickTargetWeekdays([1, 3], [1], 1, [1, 3], "X"), /Escolha 1 dia/);
  });
});

describe("moveClassStudentCore", () => {
  function seedEnrolled(fake: FakeFirestore): void {
    seedClass(fake, "c1", {studentCount: 1});
    seedClass(fake, "c2", {weekdays: [2, 3], startTime: "19:00", studentCount: 0});
    fake.seedDoc("arenaClasses/c1/classStudents/u1", {
      arenaId: "a1", classId: "c1", athleteId: "u1", name: "Carla Dias", status: "active", enrollmentId: "e1",
      weekdays: [1, 3], planName: "Mensal 2x",
    });
    fake.seedDoc("arenaClassEnrollments/e1", {
      arenaId: "a1", studentId: "u1", status: "active", plan: {kind: "monthly", name: "Mensal 2x", priceReais: 320},
      slots: [{classId: "c1", weekday: 1}, {classId: "c1", weekday: 3}, {classId: "cX", weekday: 5}],
    });
  }

  it("troca os horários na matrícula, mantém o plano e ajusta os contadores", async () => {
    const {fake, db} = makeDb();
    seedEnrolled(fake);
    const result = await moveClassStudentCore(db, {fromClassId: "c1", toClassId: "c2", studentId: "u1", weekdays: null, actorUid: "uProf"});
    assert.deepEqual(result.weekdays, [2, 3]);
    assert.equal((await db.doc("arenaClasses/c1/classStudents/u1").get()).data()?.["status"], "removed");
    const moved = (await db.doc("arenaClasses/c2/classStudents/u1").get()).data();
    assert.deepEqual([moved?.["status"], moved?.["enrollmentId"], moved?.["weekdays"], moved?.["planName"]], ["active", "e1", [2, 3], "Mensal 2x"]);
    const enrollment = (await db.doc("arenaClassEnrollments/e1").get()).data();
    assert.deepEqual((enrollment?.["slots"] as Array<{classId: string; weekday: number}>).map((s) => `${s.classId}:${s.weekday}`), ["cX:5", "c2:2", "c2:3"]);
    assert.deepEqual((enrollment?.["plan"] as {priceReais: number}).priceReais, 320);
    assert.equal((await db.doc("arenaClasses/c1").get()).data()?.["studentCount"], 0);
    assert.equal((await db.doc("arenaClasses/c2").get()).data()?.["studentCount"], 1);
  });

  it("destino lotada no dia: recusa e não mexe em nada", async () => {
    const {fake, db} = makeDb();
    seedEnrolled(fake);
    fake.seedDoc("arenaClasses/c2/classStudents/x1", {status: "active", name: "A", weekdays: [2]});
    fake.seedDoc("arenaClasses/c2/classStudents/x2", {status: "active", name: "B"});
    await rejectsWith(moveClassStudentCore(db, {fromClassId: "c1", toClassId: "c2", studentId: "u1", weekdays: null, actorUid: "uProf"}), "failed-precondition", /lotada/);
    assert.equal((await db.doc("arenaClasses/c1/classStudents/u1").get()).data()?.["status"], "active");
  });

  it("aluno sem matrícula (avulso antigo) só troca de turma", async () => {
    const {fake, db} = makeDb();
    seedClass(fake, "c1", {studentCount: 1});
    seedClass(fake, "c2", {weekdays: [6]});
    fake.seedDoc("arenaClasses/c1/classStudents/s9", {arenaId: "a1", classId: "c1", athleteId: null, name: "Zé", status: "active"});
    const result = await moveClassStudentCore(db, {fromClassId: "c1", toClassId: "c2", studentId: "s9", weekdays: null, actorUid: "uRecepcao"});
    assert.equal(result.enrollmentId, null);
    assert.equal((await db.doc("arenaClasses/c2/classStudents/s9").get()).data()?.["status"], "active");
  });
});

describe("crédito e pacote do aluno do professor", () => {
  it("professor só usa crédito de aluno dele", async () => {
    const {fake, db} = makeDb();
    seedClass(fake, "c1");
    fake.seedDoc("arenaClasses/c1/classStudents/u1", {status: "active", name: "Carla"});
    fake.seedDoc("arenaClassCredits/k1", {arenaId: "a1", studentId: "u1", status: "available"});
    fake.seedDoc("arenaClassCredits/k2", {arenaId: "a1", studentId: "u2", status: "available"});
    await assertTeacherCanUseCredit(db, "uProf", "k1");
    await rejectsWith(assertTeacherCanUseCredit(db, "uProf", "k2"), "permission-denied", /não está em nenhuma turma sua/);
  });

  it("pacote com aula sobrando desconta as avulsas ainda por dar", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaClassEnrollments/e1", {
      arenaId: "a1", studentId: "u1", status: "active", creditsLeft: 1, expiresOn: "2026-12-01",
      plan: {kind: "package", name: "Pacote 4"},
    });
    assert.deepEqual(await findPackageWithCredit(db, "a1", "u1", TODAY), {enrollmentId: "e1", planName: "Pacote 4", creditsLeft: 1});
    seedClass(fake, "l1", {weekdays: [], startDate: "2026-10-22", packageEnrollmentIds: ["e1"]});
    assert.equal(await findPackageWithCredit(db, "a1", "u1", TODAY), null);
    // A avulsa já dada (chamada fechada) não segura aula do pacote — a chamada já debitou.
    fake.seedDoc("arenaClassSessions/class_l1_2026-10-22", {status: "completed"});
    assert.ok(await findPackageWithCredit(db, "a1", "u1", TODAY));
  });

  it("mensal ou pacote vencido não contam", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaClassEnrollments/e1", {arenaId: "a1", studentId: "u1", status: "active", plan: {kind: "monthly"}});
    fake.seedDoc("arenaClassEnrollments/e2", {
      arenaId: "a1", studentId: "u1", status: "active", creditsLeft: 3, expiresOn: "2026-10-01", plan: {kind: "package"},
    });
    assert.equal(await findPackageWithCredit(db, "a1", "u1", TODAY), null);
  });
});

describe("courtFitsLesson", () => {
  it("fora de manutenção e com a modalidade (sem modalidade cadastrada = atende)", () => {
    assert.equal(courtFitsLesson({name: "Q1"}, "beachTennis"), true);
    assert.equal(courtFitsLesson({types: ["beachTennis"]}, "beachtennis"), true);
    assert.equal(courtFitsLesson({types: ["futevolei"]}, "beachTennis"), false);
    assert.equal(courtFitsLesson({maintenance: true}, ""), false);
    assert.equal(courtFitsLesson({status: "maintenance"}, ""), false);
  });
});

describe("buildProfessorActionsContext", () => {
  it("projeta turmas com ocupação por dia, aulas com vaga, espera em ordem e créditos só dos alunos dele", () => {
    const ctx = buildProfessorActionsContext({
      arenaId: "a1",
      todayKey: TODAY,
      link: {status: "ACTIVE", relationshipType: "ARENA_STAFF", permissions: {canEnrollStudents: true}},
      rules: {onlineBillingEnabled: true, makeupValidityDays: 45},
      plans: [
        {id: "p1", data: {name: "Mensal 2x", kind: "monthly", priceReais: 320, classesPerWeek: 2, status: "active"}},
        {id: "p2", data: {name: "Avulsa", kind: "single", priceReais: 90, status: "active"}},
        {id: "p3", data: {name: "Velho", kind: "monthly", priceReais: 100, classesPerWeek: 1, status: "archived"}},
      ],
      classes: [{id: "c1", data: {arenaId: "a1", name: "Iniciante A", type: "turma", weekdays: [1, 3], capacity: 2, status: "active", startTime: "07:00"}}],
      rosters: new Map([["c1", [
        {id: "u1", data: {status: "active", weekdays: [1]}},
        {id: "u2", data: {status: "active"}},
        {id: "u3", data: {status: "removed"}},
      ]]]),
      sessions: [
        {id: "s1", data: {classId: "c1", arenaId: "a1", className: "Iniciante A", date: "2026-10-21", startTime: "07:00", endTime: "08:00", status: "scheduled", capacity: 2, extras: {t1: {name: "João", kind: "trial"}}}},
        {id: "s0", data: {
          classId: "c1", arenaId: "a1", className: "Iniciante A", date: "2026-10-19", startTime: "07:00", status: "completed",
          extras: {uT: {name: "João", kind: "trial", athleteId: "uT"}, u2: {name: "Bruno", kind: "trial", athleteId: "u2"}},
          attendance: {uT: {mark: "present", name: "João"}},
        }},
      ],
      waitlist: [],
      credits: [
        {id: "k1", data: {studentId: "u1", name: "Carla", status: "available", expiresOn: "2026-11-01"}},
        {id: "k2", data: {studentId: "uX", name: "Outro", status: "available", expiresOn: "2026-11-01"}},
        {id: "k3", data: {studentId: "u2", name: "Vencido", status: "available", expiresOn: "2026-10-01"}},
      ],
    });
    assert.deepEqual(ctx.permissions, {canEnrollStudents: true, canScheduleLessons: false, canCancelLessons: false});
    assert.deepEqual(ctx.rules.onlineBillingEnabled, true);
    assert.deepEqual(ctx.plans.map((p) => p.planId), ["p1"]);
    assert.deepEqual(ctx.classes[0].takenByWeekday, {"1": 2, "3": 1});
    // 2026-10-21 é quarta (3): só u2 faz quarta + 1 encaixe.
    assert.deepEqual(ctx.sessions.map((s) => [s.sessionId, s.taken, s.studentCount]), [["s1", 2, 1]]);
    assert.deepEqual(ctx.credits.map((c) => c.creditId), ["k1"]);
    // Experimental de ontem vira candidato a conversão; quem já é aluno (u2) não.
    assert.deepEqual(ctx.trials.map((t) => [t.athleteId, t.mark]), [["uT", "present"]]);
  });
});

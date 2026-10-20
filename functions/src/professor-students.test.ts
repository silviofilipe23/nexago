import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  arenaProfessorLinkId,
  defaultArenaProfessorPermissions,
  type ArenaProfessorPermissions,
  type ArenaProfessorStatus,
  type ArenaProfessorType,
} from "./arena-professor-links";
import {
  buildProfessorStudents,
  loadProfessorStudentsCore,
  professorBillingStanding,
  PROFESSOR_RECENT_MARKS,
} from "./professor-students";

/** Segunda 26/10/2026. */
const TODAY = "2026-10-26";
const TEACHER = "uThiago";

function seedLink(
  fake: FakeFirestore,
  arenaId: string,
  arenaName: string,
  type: ArenaProfessorType,
  status: ArenaProfessorStatus = "ACTIVE",
  permissions: Partial<ArenaProfessorPermissions> = {},
): void {
  fake.seedDoc(`arenaProfessors/${arenaProfessorLinkId(arenaId, TEACHER)}`, {
    arenaId,
    professorUserId: TEACHER,
    relationshipType: type,
    status,
    initiatedBy: "ARENA",
    permissions: {...defaultArenaProfessorPermissions(type), ...permissions},
    arenaName,
    professorName: "Thiago Mendes",
  });
}

function seedClass(fake: FakeFirestore, id: string, data: Record<string, unknown>): void {
  fake.seedDoc(`arenaClasses/${id}`, {
    arenaId: "arena1",
    arenaName: "Arena CFC",
    type: "turma",
    level: "iniciante",
    teacherId: "t1",
    teacherUserId: TEACHER,
    teacherName: "Thiago Mendes",
    weekdays: [1, 3],
    startTime: "07:00",
    endTime: "08:00",
    courtName: "Quadra 1",
    capacity: 6,
    status: "active",
    ...data,
  });
}

function seedSession(
  fake: FakeFirestore,
  classId: string,
  date: string,
  data: Record<string, unknown>,
): void {
  fake.seedDoc(`arenaClassSessions/class_${classId}_${date}`, {
    classId,
    arenaId: "arena1",
    className: "Iniciante A",
    date,
    startTime: "07:00",
    endTime: "08:00",
    status: "completed",
    teacherUserId: TEACHER,
    attendance: {},
    extras: {},
    ...data,
  });
}

function makeWorld(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  seedLink(fake, "arena1", "Arena CFC", "ARENA_STAFF");
  seedLink(fake, "arena2", "Arena Norte", "INDEPENDENT");
  seedLink(fake, "arena3", "Arena Sul", "ARENA_STAFF", "ACTIVE", {canManageOwnLessons: false});

  seedClass(fake, "c1", {name: "Iniciante A"});
  seedClass(fake, "c2", {name: "Particular Carla", type: "particular", weekdays: [2], startTime: "09:00", endTime: "10:00"});
  seedClass(fake, "c3", {arenaId: "arena2", arenaName: "Arena Norte", name: "Manhã", weekdays: [2, 4]});
  seedClass(fake, "c4", {arenaId: "arena3", arenaName: "Arena Sul", name: "Sul"});
  seedClass(fake, "c5", {name: "De outro professor", teacherUserId: "uOutro"});
  seedClass(fake, "c6", {name: "Arquivada", status: "archived"});

  fake.seedDoc("arenaClasses/c1/classStudents/u1", {
    name: "Carla Dias", status: "active", athleteId: "u1", enrollmentId: "e1", weekdays: [1, 3],
    enrolledAt: Timestamp.fromDate(new Date("2025-03-10T15:00:00Z")),
  });
  fake.seedDoc("arenaClasses/c1/classStudents/g1", {name: "Bruno Alves", status: "active", athleteId: null, enrollmentId: "e2"});
  fake.seedDoc("arenaClasses/c1/classStudents/x9", {name: "Saiu", status: "removed"});
  fake.seedDoc("arenaClasses/c2/classStudents/u1", {
    name: "Carla Dias", status: "active", athleteId: "u1", enrollmentId: "e3", photoUrl: "https://foto/carla.jpg",
  });
  fake.seedDoc("arenaClasses/c3/classStudents/p1", {name: "Paulo Viana", status: "paused", athleteId: "p1", enrollmentId: "e9"});
  fake.seedDoc("arenaClasses/c4/classStudents/z1", {name: "Zeca", status: "active"});
  fake.seedDoc("arenaClasses/c5/classStudents/o1", {name: "Aluno de outro", status: "active"});

  fake.seedDoc("arenaClasses/c1/classWaitlist/w1", {status: "waiting"});
  fake.seedDoc("arenaClasses/c1/classWaitlist/w2", {status: "waiting"});
  fake.seedDoc("arenaClasses/c1/classWaitlist/w3", {status: "removed"});

  seedSession(fake, "c1", "2026-10-12", {
    attendance: {g1: {mark: "present", name: "Bruno Alves"}},
    extras: {g1: {name: "Bruno Alves", kind: "makeup", creditId: "k0", athleteId: null}},
  });
  seedSession(fake, "c1", "2026-10-19", {
    attendance: {u1: {mark: "present", name: "Carla"}, g1: {mark: "absent", name: "Bruno"}},
  });
  seedSession(fake, "c1", "2026-10-21", {
    attendance: {u1: {mark: "excused", name: "Carla"}, g1: {mark: "present", name: "Bruno"}},
  });
  seedSession(fake, "c1", "2026-10-26", {status: "canceled", attendance: {u1: {mark: "present", name: "Carla"}}});
  seedSession(fake, "c1", "2026-10-28", {status: "scheduled"});
  seedSession(fake, "c4", "2026-10-21", {arenaId: "arena3", attendance: {z1: {mark: "present", name: "Zeca"}}});
  // Aula da turma de outro professor nunca entra (query por teacherUserId).
  seedSession(fake, "c5", "2026-10-21", {teacherUserId: "uOutro", attendance: {u1: {mark: "absent", name: "Carla"}}});

  fake.seedDoc("arenaClassEnrollments/e1", {
    arenaId: "arena1", studentId: "u1", status: "active",
    plan: {name: "Mensal 2x", kind: "monthly", priceReais: 320, classesPerWeek: 2},
  });
  fake.seedDoc("arenaClassEnrollments/e2", {
    arenaId: "arena1", studentId: "g1", status: "active",
    plan: {name: "Mensal 2x", kind: "monthly", priceReais: 320},
  });
  fake.seedDoc("arenaClassEnrollments/e3", {
    arenaId: "arena1", studentId: "u1", status: "active", creditsLeft: 2, expiresOn: "2026-11-15",
    plan: {name: "Pacote 4 particulares", kind: "package", priceReais: 440, credits: 4},
  });
  fake.seedDoc("arenaClassEnrollments/e9", {
    arenaId: "arena2", studentId: "p1", status: "active", plan: {name: "Segredo", kind: "monthly", priceReais: 999},
  });

  fake.seedDoc("arenaClassCharges/e2_2026-10", {arenaId: "arena1", enrollmentId: "e2", status: "open", dueDate: "2026-10-20", amountReais: 320});
  fake.seedDoc("arenaClassCharges/e1_2026-11", {arenaId: "arena1", enrollmentId: "e1", status: "open", dueDate: "2026-11-05", amountReais: 320});
  fake.seedDoc("arenaClassCharges/e3_package", {arenaId: "arena1", enrollmentId: "e3", status: "open", dueDate: TODAY, amountReais: 440});
  fake.seedDoc("arenaClassCharges/e1_2026-10", {arenaId: "arena1", enrollmentId: "e1", status: "paid", dueDate: "2026-10-05"});
  fake.seedDoc("arenaClassCharges/e9_2026-10", {arenaId: "arena2", enrollmentId: "e9", status: "open", dueDate: "2026-10-01"});

  fake.seedDoc("arenaClassCredits/s1_g1", {arenaId: "arena1", studentId: "g1", status: "available", expiresOn: "2026-11-20"});
  fake.seedDoc("arenaClassCredits/s2_g1", {arenaId: "arena1", studentId: "g1", status: "available", expiresOn: "2026-10-01"});
  fake.seedDoc("arenaClassCredits/s3_g1", {arenaId: "arena1", studentId: "g1", status: "used", expiresOn: "2026-11-20"});
  fake.seedDoc("arenaClassCredits/s4_p1", {arenaId: "arena2", studentId: "p1", status: "available", expiresOn: "2026-11-20"});
  return {fake, db: fake as unknown as Firestore};
}

describe("getMyProfessorStudents — alunos das turmas do professor", () => {
  it("só turmas do professor, não arquivadas, nas arenas em que a chamada está liberada", async () => {
    const {db} = makeWorld();
    const result = await loadProfessorStudentsCore(db, TEACHER, TODAY);

    assert.deepEqual(result.arenas.map((a) => [a.arenaName, a.relationshipType, a.canSeeStudents, a.studentCount, a.classCount]), [
      ["Arena CFC", "ARENA_STAFF", true, 2, 2],
      ["Arena Norte", "INDEPENDENT", true, 1, 1],
      ["Arena Sul", "ARENA_STAFF", false, 0, 1],
    ]);
    assert.deepEqual(result.students.map((s) => s.name), ["Bruno Alves", "Carla Dias", "Paulo Viana"]);
    assert.deepEqual(result.classes.map((c) => c.classId).sort(), ["c1", "c2", "c3"]);
  });

  it("junta as turmas do aluno na arena e conta as marcas só das aulas do professor", async () => {
    const {db} = makeWorld();
    const {students} = await loadProfessorStudentsCore(db, TEACHER, TODAY);
    const carla = students.find((s) => s.studentId === "u1")!;
    assert.deepEqual(carla.classes.map((c) => [c.name, c.weekdays]), [["Iniciante A", [1, 3]], ["Particular Carla", [2]]]);
    assert.equal(carla.since, "2025-03-10");
    assert.equal(carla.photoUrl, "https://foto/carla.jpg");
    // 19/10 presente, 21/10 justificada; a cancelada de hoje e a da turma de outro não contam.
    assert.deepEqual(carla.marks.map((m) => m.mark), ["present", "excused"]);
    assert.equal(carla.presenceRate, 50);
    assert.equal(carla.lastDate, "2026-10-21");

    const bruno = students.find((s) => s.studentId === "g1")!;
    assert.deepEqual(bruno.marks.map((m) => [m.date, m.mark, m.makeup]), [
      ["2026-10-12", "present", true],
      ["2026-10-19", "absent", false],
      ["2026-10-21", "present", false],
    ]);
    assert.equal(bruno.presenceRate, 67);
    assert.equal(bruno.credits, 1, "só o crédito disponível e não vencido");
  });

  it("plano e pagamento só para equipe da arena, sem valor de fatura", async () => {
    const {db} = makeWorld();
    const {students} = await loadProfessorStudentsCore(db, TEACHER, TODAY);
    const carla = students.find((s) => s.studentId === "u1")!;
    assert.deepEqual(carla.plans.map((p) => [p.name, p.kind, p.priceReais, p.credits, p.creditsLeft, p.expiresOn]), [
      ["Mensal 2x", "monthly", 320, null, null, null],
      ["Pacote 4 particulares", "package", 440, 4, 2, "2026-11-15"],
    ]);
    assert.deepEqual(carla.billing, {standing: "due_today", nextDueDate: TODAY});

    const bruno = students.find((s) => s.studentId === "g1")!;
    assert.deepEqual(bruno.billing, {standing: "overdue", nextDueDate: "2026-10-20"});

    const paulo = students.find((s) => s.studentId === "p1")!;
    assert.equal(paulo.status, "paused");
    assert.deepEqual(paulo.plans, [], "independente não vê o plano da arena");
    assert.equal(paulo.billing, null);
    assert.ok(!JSON.stringify(students).includes("amountReais"));
    assert.ok(!JSON.stringify(students).includes("phone"));
  });

  it("turmas: ativos, espera, presença das marcas e próxima aula", async () => {
    const {db} = makeWorld();
    const {classes} = await loadProfessorStudentsCore(db, TEACHER, TODAY);
    const c1 = classes.find((c) => c.classId === "c1")!;
    assert.equal(c1.activeCount, 2);
    assert.equal(c1.waitlistCount, 2);
    // 12/10 (1/1), 19/10 (1/2), 21/10 (1/2) → 3 de 5.
    assert.equal(c1.presenceRate, 60);
    assert.equal(c1.nextDate, "2026-10-28");
    const c2 = classes.find((c) => c.classId === "c2")!;
    assert.equal(c2.presenceRate, null);
    assert.equal(c2.nextDate, null);
  });

  it("vínculo suspenso fecha os nomes daquela arena", async () => {
    const {fake, db} = makeWorld();
    seedLink(fake, "arena1", "Arena CFC", "ARENA_STAFF", "SUSPENDED");
    const result = await loadProfessorStudentsCore(db, TEACHER, TODAY);
    const cfc = result.arenas.find((a) => a.arenaId === "arena1")!;
    assert.equal(cfc.canSeeStudents, false);
    assert.equal(cfc.studentCount, 0);
    assert.deepEqual(result.students.map((s) => s.name), ["Paulo Viana"]);
  });

  it("sem turma nenhuma, resposta vazia", async () => {
    const fake = new FakeFirestore();
    const result = await loadProfessorStudentsCore(fake as unknown as Firestore, TEACHER, TODAY);
    assert.deepEqual(result, {todayKey: TODAY, arenas: [], classes: [], students: []});
  });
});

describe("marcas recentes", () => {
  it(`guarda as ${PROFESSOR_RECENT_MARKS} últimas, da mais antiga para a mais recente`, () => {
    const sessions = Array.from({length: 15}, (_, i) => {
      const date = `2026-09-${String(i + 1).padStart(2, "0")}`;
      return {
        id: `class_c1_${date}`,
        data: {
          classId: "c1", arenaId: "arena1", date, startTime: "07:00", status: "completed", teacherUserId: TEACHER,
          attendance: {u1: {mark: i % 3 === 0 ? "absent" : "present", name: "Carla"}},
        },
      };
    });
    const result = buildProfessorStudents({
      uid: TEACHER,
      todayKey: TODAY,
      classes: [{id: "c1", data: {arenaId: "arena1", arenaName: "Arena CFC", name: "A", teacherUserId: TEACHER, status: "active"}}],
      links: new Map([["arena1", {
        arenaId: "arena1", professorUserId: TEACHER, relationshipType: "INDEPENDENT", status: "ACTIVE",
        permissions: {canManageOwnLessons: true, canBookCourts: true, canAppearInArenaProfile: false},
        arenaName: "Arena CFC",
      } as never]]),
      students: new Map([["c1", [{id: "u1", data: {name: "Carla", status: "active"}}]]]),
      waitlistCounts: new Map(),
      sessions,
      enrollments: new Map(),
      openCharges: [],
      credits: [],
    });
    const carla = result.students[0];
    assert.equal(carla.marks.length, PROFESSOR_RECENT_MARKS);
    assert.equal(carla.marks[0].date, "2026-09-04");
    assert.equal(carla.marks[PROFESSOR_RECENT_MARKS - 1].date, "2026-09-15");
    assert.equal(carla.lastDate, "2026-09-15");
  });
});

describe("professorBillingStanding", () => {
  const active = {status: "active"};
  const paused = {status: "paused"};
  it("dívida vem antes de tudo, inclusive pausado", () => {
    assert.deepEqual(professorBillingStanding([paused], [{dueDate: "2026-10-01"}], TODAY), {standing: "overdue", nextDueDate: "2026-10-01"});
  });
  it("sem matrícula vigente é sem plano", () => {
    assert.equal(professorBillingStanding([{status: "canceled"}], [], TODAY).standing, "no_plan");
    assert.equal(professorBillingStanding([], [], TODAY).standing, "no_plan");
  });
  it("pausado só quando todas as vigentes estão pausadas", () => {
    assert.equal(professorBillingStanding([paused], [], TODAY).standing, "paused");
    assert.equal(professorBillingStanding([paused, active], [], TODAY).standing, "up_to_date");
  });
  it("vence hoje e em dia com o próximo vencimento", () => {
    assert.deepEqual(professorBillingStanding([active], [{dueDate: TODAY}], TODAY), {standing: "due_today", nextDueDate: TODAY});
    assert.deepEqual(professorBillingStanding([active], [{dueDate: "2026-11-05"}], TODAY), {standing: "up_to_date", nextDueDate: "2026-11-05"});
  });
});

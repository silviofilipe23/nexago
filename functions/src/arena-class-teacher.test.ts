import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  type ArenaClassData,
  authorizeClassAttendance,
  materializeClassSession,
  requireTeacherForClass,
  saveClassAttendanceCore,
} from "./arena-class";
import {classSessionId} from "./arena-class-constants";
import {loadTeacherClassSessionRosterCore} from "./arena-class-teacher";
import {loadClassAgenda} from "./arena-class-athlete-agenda";
import {
  arenaProfessorLinkId,
  defaultArenaProfessorPermissions,
  type ArenaProfessorPermissions,
  type ArenaProfessorStatus,
} from "./arena-professor-links";

/** Segunda 26/10/2026. */
const MONDAY = "2026-10-26";
const TEACHER = "uThiago";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/arena1", {name: "Arena CFC", managerUserId: "uOwner", planTier: "pro", planStatus: "active"});
  fake.seedDoc("arenas/arena2", {name: "Arena Norte", managerUserId: "uOther"});
  fake.seedDoc("arenas/arena1/staff/uRecepcao", {role: "recepcao", status: "active"});
  return {fake, db: fake as unknown as Firestore};
}

function baseClass(overrides: Partial<ArenaClassData> = {}): ArenaClassData {
  return {
    arenaId: "arena1",
    arenaName: "Arena CFC",
    name: "Iniciante A",
    type: "turma",
    sport: "beachTennis",
    level: "iniciante",
    teacherId: "t1",
    teacherUserId: TEACHER,
    teacherName: "Thiago Mendes",
    teacherColor: "#FF6A1A",
    weekdays: [1, 3],
    startTime: "18:00",
    endTime: "19:30",
    courtId: "q2",
    courtName: "Quadra 2",
    capacity: 6,
    startDate: "2026-10-19",
    endDate: null,
    status: "active",
    notes: null,
    ...overrides,
  };
}

function seedLink(
  fake: FakeFirestore,
  status: ArenaProfessorStatus,
  permissions: Partial<ArenaProfessorPermissions> = {},
  arenaId = "arena1",
  uid = TEACHER,
): void {
  fake.seedDoc(`arenaProfessors/${arenaProfessorLinkId(arenaId, uid)}`, {
    arenaId,
    professorUserId: uid,
    relationshipType: "ARENA_STAFF",
    status,
    initiatedBy: "ARENA",
    permissions: {...defaultArenaProfessorPermissions("ARENA_STAFF"), ...permissions},
    arenaName: "Arena CFC",
    professorName: "Thiago Mendes",
  });
}

async function seedSession(fake: FakeFirestore, db: Firestore, date = "2026-10-19"): Promise<string> {
  fake.seedDoc("arenaClasses/c1", {...baseClass(), studentCount: 2});
  fake.seedDoc("arenaClasses/c1/classStudents/u1", {name: "Carla", status: "active", athleteId: "u1"});
  fake.seedDoc("arenaClasses/c1/classStudents/g1", {name: "Bruno", status: "active", athleteId: null});
  await materializeClassSession(db, "c1", baseClass({startDate: date}), date, "series");
  return classSessionId("c1", date);
}

function sessionData(fake: FakeFirestore, id: string): Record<string, unknown> {
  const data = fake.store.get(`arenaClassSessions/${id}`);
  assert.ok(data, `aula ${id} deveria existir`);
  return data;
}

async function rejectsWith(promise: Promise<unknown>, code: string, pattern?: RegExp): Promise<HttpsError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof HttpsError, `esperava HttpsError, veio ${String(error)}`);
    assert.equal(error.code, code, error.message);
    if (pattern) assert.match(error.message, pattern);
    return error;
  }
  assert.fail(`esperava ${code}`);
}

describe("chamada pelo professor da aula (canManageOwnLessons)", () => {
  it("a equipe da arena segue fazendo a chamada", async () => {
    const {fake, db} = makeDb();
    const id = await seedSession(fake, db);
    assert.equal(await authorizeClassAttendance(db, sessionData(fake, id), "uOwner"), "staff");
    assert.equal(await authorizeClassAttendance(db, sessionData(fake, id), "uRecepcao"), "staff");
  });

  it("professor com vínculo ativo e a permissão grava e fecha; o fechamento diz quem fechou", async () => {
    const {fake, db} = makeDb();
    const id = await seedSession(fake, db);
    seedLink(fake, "ACTIVE");
    const actorRole = await authorizeClassAttendance(db, sessionData(fake, id), TEACHER);
    assert.equal(actorRole, "teacher");
    const result = await saveClassAttendanceCore(db, id, {
      marks: {u1: "present", g1: "absent"}, teacherNote: "Saque", close: true, uid: TEACHER, actorRole,
    }, "2026-10-19");
    assert.equal(result.status, "completed");
    const session = sessionData(fake, id);
    assert.equal(session["closedByUid"], TEACHER);
    assert.equal(session["closedByRole"], "teacher");
    assert.deepEqual((session["attendance"] as Record<string, unknown>)["g1"], {mark: "absent", name: "Bruno"});
  });

  it("fechamento pela equipe fica marcado como equipe", async () => {
    const {fake, db} = makeDb();
    const id = await seedSession(fake, db);
    await saveClassAttendanceCore(db, id, {marks: {u1: "present"}, teacherNote: undefined, close: true, uid: "uRecepcao"}, "2026-10-19");
    assert.equal(sessionData(fake, id)["closedByRole"], "staff");
  });

  it("professor sem vínculo (o das Aulas de hoje), suspenso ou com a chave desligada não faz chamada", async () => {
    const cases: Array<[string, (fake: FakeFirestore) => void, string]> = [
      ["sem vínculo", () => undefined, "no_link"],
      ["suspenso", (fake) => seedLink(fake, "SUSPENDED"), "not_active"],
      ["encerrado", (fake) => seedLink(fake, "ENDED"), "not_active"],
      ["chave desligada", (fake) => seedLink(fake, "ACTIVE", {canManageOwnLessons: false}), "permission_off"],
    ];
    for (const [label, seed, reason] of cases) {
      const {fake, db} = makeDb();
      const id = await seedSession(fake, db);
      seed(fake);
      const error = await rejectsWith(authorizeClassAttendance(db, sessionData(fake, id), TEACHER), "permission-denied");
      assert.equal((error.details as {reason?: string}).reason, reason, label);
    }
  });

  it("vínculo com permissão não abre aula de outro professor", async () => {
    const {fake, db} = makeDb();
    const id = await seedSession(fake, db);
    seedLink(fake, "ACTIVE", {}, "arena1", "uOutroProf");
    await rejectsWith(
      authorizeClassAttendance(db, sessionData(fake, id), "uOutroProf"),
      "permission-denied",
      /acesso a esta área/,
    );
  });

  it("professor trocado entre autorizar e gravar: a gravação recusa", async () => {
    const {fake, db} = makeDb();
    const id = await seedSession(fake, db);
    await rejectsWith(
      saveClassAttendanceCore(db, id, {
        marks: {u1: "present"}, teacherNote: undefined, close: false, uid: "uOutroProf", actorRole: "teacher",
      }, "2026-10-19"),
      "permission-denied",
      /não é mais sua/,
    );
  });
});

describe("turma nova com professor de vínculo suspenso/encerrado", () => {
  const teacher = {name: "Thiago Mendes", userId: TEACHER};

  it("turma nova ou troca de professor: suspenso e encerrado recusam", async () => {
    for (const status of ["SUSPENDED", "ENDED"] as const) {
      const {fake, db} = makeDb();
      seedLink(fake, status);
      await rejectsWith(requireTeacherForClass(db, "arena1", teacher, true), "failed-precondition", /Profissionais/);
    }
  });

  it("turma existente com o mesmo professor segue; sem vínculo segue; sem conta continua exigindo conta", async () => {
    const {fake, db} = makeDb();
    await requireTeacherForClass(db, "arena1", teacher, true);
    seedLink(fake, "SUSPENDED");
    await requireTeacherForClass(db, "arena1", teacher, false);
    await rejectsWith(requireTeacherForClass(db, "arena1", {name: "Ju", userId: null}, true), "failed-precondition", /Vincule a conta/);
  });
});

describe("lista da chamada do professor (getMyClassSessionRoster)", () => {
  function seedRosterSession(fake: FakeFirestore, over: Record<string, unknown> = {}): string {
    const id = classSessionId("c1", MONDAY);
    fake.seedDoc(`arenaClassSessions/${id}`, {
      classId: "c1", arenaId: "arena1", arenaName: "Arena CFC", className: "Iniciante A", teacherUserId: TEACHER,
      courtName: "Quadra 2", date: MONDAY, startTime: "18:00", endTime: "19:30", status: "scheduled",
      attendance: {d1: {mark: "present", name: "Dora"}, a1: {mark: "absent", name: "Ana"}},
      extras: {
        mk_1: {name: "Eva", kind: "makeup", creditId: "cr1", athleteId: "uEva"},
        tr_1: {name: "Bia Experimental", kind: "trial", creditId: null, athleteId: null},
      },
      ...over,
    });
    const students: Array<[string, Record<string, unknown>]> = [
      ["a1", {name: "Ana", status: "active", weekdays: [1], phone: "+5562999990000", photoUrl: "https://x/a.jpg"}],
      ["c1s", {name: "Caio", status: "active"}], // sem dias = todos
      ["q1", {name: "Quarta Só", status: "active", weekdays: [3]}],
      ["p1", {name: "Pausado", status: "paused"}],
      ["d1", {name: "Dora", status: "removed"}], // saiu, mas tem marca nesta aula
    ];
    for (const [sid, data] of students) fake.seedDoc(`arenaClasses/c1/classStudents/${sid}`, {classId: "c1", arenaId: "arena1", ...data});
    return id;
  }

  it("mesma composição da chamada da arena, sem telefone", async () => {
    const {fake, db} = makeDb();
    seedLink(fake, "ACTIVE");
    const id = seedRosterSession(fake);
    const {session, students} = await loadTeacherClassSessionRosterCore(db, id, TEACHER, MONDAY);
    assert.deepEqual(students.map((s) => [s.studentId, s.kind, s.mark]), [
      ["a1", "regular", "absent"],
      ["c1s", "regular", null],
      ["d1", "regular", "present"],
      ["tr_1", "trial", null],
      ["mk_1", "makeup", null],
    ]);
    assert.equal(students[0]!.photoUrl, "https://x/a.jpg");
    assert.ok(students.every((s) => !("phone" in s)));
    assert.equal(session.attendanceOpen, true);
    assert.equal(session.className, "Iniciante A");
  });

  it("chamada fechada antes do dia e em aula cancelada", async () => {
    const {fake, db} = makeDb();
    seedLink(fake, "ACTIVE");
    const id = seedRosterSession(fake);
    assert.equal((await loadTeacherClassSessionRosterCore(db, id, TEACHER, "2026-10-25")).session.attendanceOpen, false);
    seedRosterSession(fake, {status: "canceled"});
    const canceled = await loadTeacherClassSessionRosterCore(db, id, TEACHER, MONDAY);
    assert.equal(canceled.session.status, "canceled");
    assert.equal(canceled.session.attendanceOpen, false);
  });

  it("só o professor da aula, com a permissão valendo", async () => {
    const {fake, db} = makeDb();
    const id = seedRosterSession(fake);
    await rejectsWith(loadTeacherClassSessionRosterCore(db, id, TEACHER, MONDAY), "permission-denied", /não tem vínculo/);
    seedLink(fake, "ACTIVE", {canManageOwnLessons: false});
    await rejectsWith(loadTeacherClassSessionRosterCore(db, id, TEACHER, MONDAY), "permission-denied", /não liberou/);
    seedLink(fake, "ACTIVE", {}, "arena1", "uOutroProf");
    await rejectsWith(loadTeacherClassSessionRosterCore(db, id, "uOutroProf", MONDAY), "permission-denied", /não é sua/);
    await rejectsWith(loadTeacherClassSessionRosterCore(db, "nada", TEACHER, MONDAY), "not-found");
  });
});

describe("agenda do professor mostra quando pode fazer a chamada", () => {
  it("canManageLessons por arena; item de aluno fica null", async () => {
    const {fake, db} = makeDb();
    seedLink(fake, "ACTIVE");
    seedLink(fake, "SUSPENDED", {}, "arena2");
    const seed = (id: string, arenaId: string, date: string, teacherUserId = TEACHER) =>
      fake.seedDoc(`arenaClassSessions/${id}`, {
        classId: `c_${arenaId}`, arenaId, arenaName: arenaId, className: "Turma", teacherName: "Thiago",
        teacherUserId, courtName: "Q1", date, startTime: "18:00", endTime: "19:00",
        startAt: Timestamp.fromDate(new Date(`${date}T21:00:00Z`)), status: "scheduled", attendance: {}, extras: {},
      });
    seed("s1", "arena1", "2026-10-20");
    seed("s2", "arena2", "2026-10-21");
    seed("s3", "arena1", "2026-10-22", "uOutroProf");
    fake.seedDoc(`arenaClasses/c_arena1/classStudents/${TEACHER}`, {
      arenaId: "arena1", classId: "c_arena1", athleteId: TEACHER, status: "active", name: "Thiago",
    });

    const items = await loadClassAgenda(db, TEACHER, "2026-10-01", "2026-10-31", "2026-10-19");
    assert.deepEqual(items.map((i) => [i.sessionId, i.role, i.canManageLessons]), [
      ["s1", "teacher", true],
      ["s2", "teacher", false],
      ["s3", "student", null],
    ]);
  });
});

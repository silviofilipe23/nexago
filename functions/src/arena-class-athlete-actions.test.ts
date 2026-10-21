import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FieldValue, Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {classSessionId, makeupCreditId} from "./arena-class-constants";
import {
  bookMakeupCore,
  checkInClassSessionCore,
  distanceMeters,
  isMakeupEligibleClass,
  joinMakeupWaitlistCore,
  loadMakeupOptionsCore,
  loadMyClassCredits,
  parseCheckInInput,
  parseRespondInput,
  respondClassSessionCore,
} from "./arena-class-athlete-actions";
import {saveClassAttendanceCore} from "./arena-class";
import {loadTeacherClassSessionRosterCore} from "./arena-class-teacher";
import {loadClassAgenda} from "./arena-class-athlete-agenda";
import {arenaProfessorLinkId, defaultArenaProfessorPermissions} from "./arena-professor-links";

/** Quinta 22/10/2026, 19:00 em São Paulo = 22:00Z. */
const THURSDAY = "2026-10-22";
const START = new Date("2026-10-22T22:00:00Z");
const hoursBefore = (h: number) => new Date(START.getTime() - h * 3_600_000);
const ME = "uMarcelo";
const TEACHER = "uThiago";
const ARENA_POINT = {latitude: -16.6869, longitude: -49.2648};

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/arena1", {name: "Arena CFC", ...ARENA_POINT});
  fake.seedDoc("users/uMarcelo", {fullName: "Marcelo Alves", phone: "+5562999990000"});
  return {fake, db: fake as unknown as Firestore};
}

function seedClass(fake: FakeFirestore, classId: string, over: Record<string, unknown> = {}): void {
  fake.seedDoc(`arenaClasses/${classId}`, {
    arenaId: "arena1", arenaName: "Arena CFC", name: "Intermediário B", type: "turma", sport: "beachTennis",
    level: "intermediario", teacherId: "t1", teacherUserId: TEACHER, teacherName: "Thiago Mendes",
    weekdays: [4], startTime: "19:00", endTime: "20:00", courtName: "Quadra 2", capacity: 6, status: "active",
    ...over,
  });
}

function seedSession(fake: FakeFirestore, classId: string, date: string, over: Record<string, unknown> = {}): string {
  const id = classSessionId(classId, date);
  const startTime = String(over["startTime"] ?? "19:00");
  fake.seedDoc(`arenaClassSessions/${id}`, {
    classId, arenaId: "arena1", arenaName: "Arena CFC", className: "Intermediário B", teacherUserId: TEACHER,
    teacherName: "Thiago Mendes", courtName: "Quadra 2", date, startTime, endTime: "20:00", capacity: 6,
    startAt: Timestamp.fromDate(new Date(`${date}T${startTime}:00-03:00`)),
    status: "scheduled", attendance: {}, extras: {},
    ...over,
  });
  return id;
}

/** Turma c1 (quinta) com o Marcelo (doc gerado) e mais 2 alunos; aula de quinta. */
function seedMyClass(fake: FakeFirestore): string {
  seedClass(fake, "c1");
  fake.seedDoc("arenaClasses/c1/classStudents/s_me", {
    classId: "c1", arenaId: "arena1", athleteId: ME, name: "Marcelo Alves", status: "active", enrollmentId: null,
  });
  fake.seedDoc("arenaClasses/c1/classStudents/s_ana", {classId: "c1", arenaId: "arena1", athleteId: "uAna", name: "Ana", status: "active"});
  fake.seedDoc("arenaClasses/c1/classStudents/s_bia", {classId: "c1", arenaId: "arena1", athleteId: null, name: "Bia", status: "active"});
  return seedSession(fake, "c1", THURSDAY);
}

function session(fake: FakeFirestore, id: string): Record<string, unknown> {
  const data = fake.store.get(`arenaClassSessions/${id}`);
  assert.ok(data, `aula ${id}`);
  return data;
}

function field(data: Record<string, unknown>, map: string, key: string): unknown {
  const v = (data[map] as Record<string, unknown> | undefined)?.[key];
  return v instanceof FieldValue ? undefined : v;
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

const notGoing = (sessionId: string, now: Date, uid = ME) => ({
  sessionId, uid, response: "not_going" as const, reason: "work" as const, message: "Reunião", now,
});
const going = (sessionId: string, now: Date, uid = ME) => ({
  sessionId, uid, response: "going" as const, reason: null, message: null, now,
});

describe("Vou / Não vou (respondArenaClassSession)", () => {
  it("valida a entrada: motivo obrigatório no não vou; o vou descarta motivo e mensagem", () => {
    assert.throws(() => parseRespondInput({sessionId: "s", response: "talvez"}), /Resposta inválida/);
    assert.throws(() => parseRespondInput({sessionId: "s", response: "not_going"}), /motivo/);
    assert.deepEqual(parseRespondInput({sessionId: "s", response: "going", reason: "work", message: "x"}), {
      sessionId: "s", response: "going", reason: null, message: null,
    });
    assert.equal(parseRespondInput({sessionId: "s", response: "not_going", reason: "health", message: "a".repeat(400)}).message?.length, 280);
  });

  it("vou grava a confirmação para o professor", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    const result = await respondClassSessionCore(db, going(id, hoursBefore(20)));
    assert.equal(result.credit, null);
    const rsvp = field(session(fake, id), "rsvps", "s_me") as Record<string, unknown>;
    assert.equal(rsvp["response"], "going");
    assert.equal(rsvp["athleteId"], ME);
  });

  it("não vou com antecedência: falta avisada na chamada + 1 crédito de 30 dias", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    const result = await respondClassSessionCore(db, notGoing(id, hoursBefore(5)));
    assert.equal(result.credit, "granted");
    assert.equal(result.creditId, makeupCreditId(id, "s_me"));
    assert.equal(result.expiresOn, "2026-11-21");
    const s = session(fake, id);
    assert.deepEqual(field(s, "attendance", "s_me"), {mark: "excused", name: "Marcelo Alves"});
    const rsvp = field(s, "rsvps", "s_me") as Record<string, unknown>;
    assert.equal(rsvp["reason"], "work");
    assert.equal(rsvp["message"], "Reunião");
    const credit = fake.store.get(`arenaClassCredits/${result.creditId}`);
    assert.equal(credit?.["status"], "available");
    assert.equal(credit?.["athleteId"], ME);
    assert.equal(credit?.["reason"], "notice");
  });

  it("não vou em cima da hora: avisa o professor, sem crédito nem falta avisada", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    const result = await respondClassSessionCore(db, notGoing(id, hoursBefore(3)));
    assert.equal(result.credit, "late");
    assert.equal(result.noticeHours, 4);
    assert.equal(field(session(fake, id), "attendance", "s_me"), undefined);
    assert.equal(fake.store.has(`arenaClassCredits/${makeupCreditId(id, "s_me")}`), false);
    assert.equal((field(session(fake, id), "rsvps", "s_me") as Record<string, unknown>)["response"], "not_going");
  });

  it("antecedência configurável pela arena", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    fake.seedDoc("arenas/arena1/classSettings/rules", {makeupNoticeHours: 24});
    assert.equal((await respondClassSessionCore(db, notGoing(id, hoursBefore(10)))).credit, "late");
    fake.seedDoc("arenas/arena1/classSettings/rules", {makeupNoticeHours: 0});
    assert.equal((await respondClassSessionCore(db, notGoing(id, hoursBefore(0.5)))).credit, "granted");
  });

  it("plano mensal sem reposição sobrando no mês: falta avisada sem crédito", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    fake.seedDoc("arenaClasses/c1/classStudents/s_me", {
      classId: "c1", arenaId: "arena1", athleteId: ME, name: "Marcelo Alves", status: "active", enrollmentId: "e1",
    });
    fake.seedDoc("arenaClassEnrollments/e1", {plan: {kind: "monthly", makeupsPerMonth: 1}});
    fake.seedDoc("arenaClassCredits/old", {enrollmentId: "e1", month: "2026-10", status: "used"});
    const result = await respondClassSessionCore(db, notGoing(id, hoursBefore(10)));
    assert.equal(result.credit, "limit");
    assert.equal((field(session(fake, id), "attendance", "s_me") as Record<string, unknown>)["mark"], "excused");
  });

  it("voltar para vou desfaz a falta avisada e o crédito; crédito já usado bloqueia", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    const {creditId} = await respondClassSessionCore(db, notGoing(id, hoursBefore(10)));
    await respondClassSessionCore(db, going(id, hoursBefore(9)));
    assert.equal(fake.store.has(`arenaClassCredits/${creditId}`), false);
    assert.equal(field(session(fake, id), "attendance", "s_me"), undefined);

    const again = await respondClassSessionCore(db, notGoing(id, hoursBefore(8)));
    fake.seedDoc(`arenaClassCredits/${again.creditId}`, {
      ...fake.store.get(`arenaClassCredits/${again.creditId}`), status: "used",
    });
    await rejectsWith(respondClassSessionCore(db, going(id, hoursBefore(7))), "failed-precondition", /já usou o crédito/);
  });

  it("repetir o não vou não cria outro crédito e mantém o crédito mesmo já em cima da hora", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    const first = await respondClassSessionCore(db, notGoing(id, hoursBefore(10)));
    const second = await respondClassSessionCore(db, {...notGoing(id, hoursBefore(1)), reason: "health"});
    assert.equal(second.credit, "granted");
    assert.equal(second.creditId, first.creditId);
    assert.equal([...fake.store.keys()].filter((k) => k.startsWith("arenaClassCredits/")).length, 1);
  });

  it("fora da aula, aula começada, cancelada ou fechada: recusa", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    await rejectsWith(respondClassSessionCore(db, going(id, hoursBefore(5), "uIntruso")), "permission-denied");
    await rejectsWith(respondClassSessionCore(db, going(id, hoursBefore(0))), "failed-precondition", /já começou/);
    seedSession(fake, "c1", THURSDAY, {status: "canceled"});
    await rejectsWith(respondClassSessionCore(db, going(id, hoursBefore(5))), "failed-precondition", /cancelada/);
    seedSession(fake, "c1", THURSDAY, {status: "completed"});
    await rejectsWith(respondClassSessionCore(db, going(id, hoursBefore(5))), "failed-precondition", /fechada/);
  });

  it("aluno pausado ou de outro dia da semana não está na aula", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    fake.seedDoc("arenaClasses/c1/classStudents/s_me", {classId: "c1", athleteId: ME, name: "M", status: "paused"});
    await rejectsWith(respondClassSessionCore(db, going(id, hoursBefore(5))), "permission-denied");
    fake.seedDoc("arenaClasses/c1/classStudents/s_me", {classId: "c1", athleteId: ME, name: "M", status: "active", weekdays: [2]});
    await rejectsWith(respondClassSessionCore(db, going(id, hoursBefore(5))), "permission-denied");
  });

  it("encaixe de reposição que diz não vou sai da aula e o crédito volta", async () => {
    const {fake, db} = makeDb();
    seedClass(fake, "c1");
    const id = seedSession(fake, "c1", THURSDAY, {
      extras: {s_me: {name: "Marcelo", kind: "makeup", creditId: "cr1", athleteId: ME}}, extraAthleteIds: [ME],
    });
    fake.seedDoc("arenaClassCredits/cr1", {arenaId: "arena1", status: "used", usedSessionId: id});
    const result = await respondClassSessionCore(db, notGoing(id, hoursBefore(2)));
    assert.equal(result.credit, "returned");
    assert.equal(fake.store.get("arenaClassCredits/cr1")?.["status"], "available");
    assert.deepEqual(session(fake, id)["extraAthleteIds"], []);
  });

  it("o professor vê confirmação, motivo, mensagem e check-in na chamada", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    fake.seedDoc(`arenaProfessors/${arenaProfessorLinkId("arena1", TEACHER)}`, {
      arenaId: "arena1", professorUserId: TEACHER, relationshipType: "ARENA_STAFF", status: "ACTIVE",
      initiatedBy: "ARENA", permissions: defaultArenaProfessorPermissions("ARENA_STAFF"),
    });
    await respondClassSessionCore(db, notGoing(id, hoursBefore(10)));
    await respondClassSessionCore(db, going(id, hoursBefore(10), "uAna"));
    const {students} = await loadTeacherClassSessionRosterCore(db, id, TEACHER, THURSDAY);
    const me = students.find((s) => s.studentId === "s_me")!;
    assert.deepEqual([me.rsvp, me.rsvpReason, me.rsvpMessage, me.mark], ["not_going", "work", "Reunião", "excused"]);
    const ana = students.find((s) => s.studentId === "s_ana")!;
    assert.deepEqual([ana.rsvp, ana.checkedIn], ["going", false]);
    const bia = students.find((s) => s.studentId === "s_bia")!;
    assert.deepEqual([bia.rsvp, bia.rsvpReason, bia.checkedIn, bia.checkedInAt], [null, null, false, null]);
  });

  it("a agenda do aluno traz a resposta, o check-in e a antecedência da arena", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    fake.seedDoc("arenas/arena1/classSettings/rules", {makeupNoticeHours: 6});
    await respondClassSessionCore(db, going(id, hoursBefore(10)));
    const items = await loadClassAgenda(db, ME, "2026-10-19", "2026-10-31", "2026-10-21");
    assert.deepEqual(items.map((i) => [i.sessionId, i.myRsvp, i.checkedIn, i.makeupNoticeHours]), [[id, "going", false, 6]]);
  });
});

describe("check-in na arena (checkInArenaClassSession)", () => {
  const near = {lat: ARENA_POINT.latitude + 0.0003, lng: ARENA_POINT.longitude}; // ~33 m
  const far = {lat: ARENA_POINT.latitude + 0.003, lng: ARENA_POINT.longitude}; // ~330 m
  const checkIn = (sessionId: string, now: Date, at = near, accuracy: number | null = 10) =>
    ({sessionId, uid: ME, ...at, accuracy, now});

  it("distância pelo haversine", () => {
    const d = distanceMeters({lat: ARENA_POINT.latitude, lng: ARENA_POINT.longitude}, near);
    assert.ok(d > 30 && d < 36, String(d));
  });

  it("dentro do raio e da janela: presença na chamada, check-in e vou", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    const result = await checkInClassSessionCore(db, checkIn(id, hoursBefore(0.2)));
    assert.deepEqual([result.mark, result.alreadyMarked], ["present", false]);
    assert.ok((result.distanceMeters ?? Infinity) < 40);
    const s = session(fake, id);
    assert.deepEqual(field(s, "attendance", "s_me"), {mark: "present", name: "Marcelo Alves"});
    assert.equal((field(s, "checkIns", "s_me") as Record<string, unknown>)["method"], "location");
    assert.equal((field(s, "rsvps", "s_me") as Record<string, unknown>)["response"], "going");
  });

  it("longe da arena: recusa com a distância; a imprecisão do GPS ajuda até 50 m", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    const error = await rejectsWith(checkInClassSessionCore(db, checkIn(id, hoursBefore(0.2), far)), "failed-precondition", /da arena/);
    assert.equal((error.details as {reason?: string}).reason, "too_far");
    const edge = {lat: ARENA_POINT.latitude + 0.0012, lng: ARENA_POINT.longitude}; // ~133 m
    await rejectsWith(checkInClassSessionCore(db, checkIn(id, hoursBefore(0.2), edge, 0)), "failed-precondition");
    assert.equal((await checkInClassSessionCore(db, checkIn(id, hoursBefore(0.2), edge, 200))).mark, "present");
  });

  it("janela: abre 60 min antes e fecha no fim da aula", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    await rejectsWith(checkInClassSessionCore(db, checkIn(id, hoursBefore(1.5))), "failed-precondition", /abre 60 min/);
    await rejectsWith(checkInClassSessionCore(db, checkIn(id, new Date(START.getTime() + 61 * 60_000))), "failed-precondition", /terminou/);
    assert.equal((await checkInClassSessionCore(db, checkIn(id, new Date(START.getTime() + 30 * 60_000)))).mark, "present");
  });

  it("arena sem localização cadastrada: pede a chamada do professor", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    fake.seedDoc("arenas/arena1", {name: "Arena CFC"});
    await rejectsWith(checkInClassSessionCore(db, checkIn(id, hoursBefore(0.2))), "failed-precondition", /localização/);
    fake.seedDoc("arenas/arena1", {name: "Arena CFC", location: {latitude: ARENA_POINT.latitude, longitude: ARENA_POINT.longitude}});
    assert.equal((await checkInClassSessionCore(db, checkIn(id, hoursBefore(0.2)))).mark, "present");
  });

  it("marca do professor não é sobrescrita; falta avisada pelo próprio aluno vira presença e o crédito sai", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    const {creditId} = await respondClassSessionCore(db, notGoing(id, hoursBefore(10)));
    const result = await checkInClassSessionCore(db, checkIn(id, hoursBefore(0.2)));
    assert.equal(result.mark, "present");
    assert.equal(fake.store.has(`arenaClassCredits/${creditId}`), false);

    seedSession(fake, "c1", THURSDAY, {attendance: {s_me: {mark: "absent", name: "Marcelo"}}});
    const kept = await checkInClassSessionCore(db, checkIn(id, hoursBefore(0.2)));
    assert.deepEqual([kept.mark, kept.alreadyMarked], ["absent", true]);
    assert.deepEqual(field(session(fake, id), "attendance", "s_me"), {mark: "absent", name: "Marcelo"});
  });

  it("quem não está na aula não faz check-in", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    await rejectsWith(checkInClassSessionCore(db, {...checkIn(id, hoursBefore(0.2)), uid: "uIntruso"}), "permission-denied");
  });
});

describe("check-in pelo QR da quadra", () => {
  const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
  const qr = (sessionId: string, now: Date, token = TOKEN) => ({sessionId, uid: ME, qrToken: token, now});
  const seedCode = (fake: FakeFirestore, arenaId = "arena1") =>
    fake.seedDoc(`arenaCourtCheckinCodes/${arenaId}_q2`, {arenaId, courtId: "q2", courtName: "Quadra 2", token: TOKEN});

  it("QR válido da arena da aula: presença sem pedir localização", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    seedCode(fake);
    fake.seedDoc("arenas/arena1", {name: "Arena CFC"}); // sem ponto: o QR não depende do GPS
    const result = await checkInClassSessionCore(db, qr(id, hoursBefore(0.2)));
    assert.deepEqual([result.mark, result.method, result.distanceMeters], ["present", "qr", null]);
    const s = session(fake, id);
    assert.deepEqual(field(s, "attendance", "s_me"), {mark: "present", name: "Marcelo Alves"});
    const record = field(s, "checkIns", "s_me") as Record<string, unknown>;
    assert.deepEqual([record["method"], record["courtId"], record["courtName"]], ["qr", "q2", "Quadra 2"]);
  });

  it("token desconhecido ou trocado é recusado", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    const error = await rejectsWith(checkInClassSessionCore(db, qr(id, hoursBefore(0.2))), "failed-precondition", /não vale mais/);
    assert.equal((error.details as {reason?: string}).reason, "qr_invalid");
  });

  it("QR de quadra de outra arena não vale", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    seedCode(fake, "arena2");
    await rejectsWith(checkInClassSessionCore(db, qr(id, hoursBefore(0.2))), "failed-precondition", /outra arena/);
  });

  it("mesma janela e mesmo vínculo do GPS", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    seedCode(fake);
    await rejectsWith(checkInClassSessionCore(db, qr(id, hoursBefore(1.5))), "failed-precondition", /abre 60 min/);
    await rejectsWith(checkInClassSessionCore(db, {...qr(id, hoursBefore(0.2)), uid: "uIntruso"}), "permission-denied");
  });

  it("entrada da callable: qr exige o payload v1; sem método segue a localização", () => {
    assert.deepEqual(parseCheckInInput({sessionId: "s1", method: "qr", qr: `nexago-checkin:v1:${TOKEN}`}),
      {sessionId: "s1", qrToken: TOKEN});
    assert.throws(() => parseCheckInInput({sessionId: "s1", method: "qr", qr: "arena1_q2"}),
      (e: unknown) => e instanceof HttpsError && e.code === "invalid-argument");
    assert.deepEqual(parseCheckInInput({sessionId: "s1", lat: -16.6, lng: -49.2}),
      {sessionId: "s1", lat: -16.6, lng: -49.2, accuracy: null});
    assert.throws(() => parseCheckInInput({sessionId: "s1"}), (e: unknown) => e instanceof HttpsError);
  });
});

describe("reposição com o crédito", () => {
  const TODAY = "2026-10-21";
  const NOW = new Date("2026-10-21T15:00:00Z");

  /** Crédito do Marcelo vindo da turma c1 (intermediário, Thiago), e turmas candidatas. */
  function seedMakeup(fake: FakeFirestore): void {
    seedMyClass(fake);
    fake.seedDoc("arenaClassCredits/cr1", {
      arenaId: "arena1", studentId: "s_me", athleteId: ME, name: "Marcelo Alves", classId: "c1",
      status: "available", expiresOn: "2026-11-21", sourceDate: "2026-10-22", reason: "notice",
    });
    seedClass(fake, "c2", {name: "Intermediário A", teacherUserId: "uJu", teacherName: "Juliana", weekdays: [2], capacity: 2});
    seedClass(fake, "c3", {name: "Avançado", level: "avancado"});
    seedClass(fake, "c4", {name: "Livre sábado", level: "livre"});
    seedClass(fake, "c5", {name: "Particular", type: "particular"});
    seedClass(fake, "c6", {name: "Outra arena", arenaId: "arena2"});
    seedClass(fake, "c7", {name: "Pausada", status: "paused"});
    // c2: terça 27 com 1 vaga (1 aluno fixo), terça 03/11 lotada (2 fixos... + encaixe).
    fake.seedDoc("arenaClasses/c2/classStudents/x1", {classId: "c2", athleteId: "uX", name: "X", status: "active"});
    seedSession(fake, "c2", "2026-10-27", {className: "Intermediário A", teacherUserId: "uJu", teacherName: "Juliana", capacity: 2});
    seedSession(fake, "c2", "2026-11-03", {
      className: "Intermediário A", teacherUserId: "uJu", capacity: 2,
      extras: {tr: {name: "Exp", kind: "trial", athleteId: null}},
    });
    seedSession(fake, "c3", "2026-10-24");
    seedSession(fake, "c4", "2026-10-24", {className: "Livre sábado", startTime: "08:00"});
    seedSession(fake, "c5", "2026-10-24");
    seedSession(fake, "c7", "2026-10-24");
    // Própria turma: quinta 29 o Marcelo já é aluno — não é opção.
    seedSession(fake, "c1", "2026-10-29");
    // Já passou hoje: fora.
    seedSession(fake, "c4", TODAY, {className: "Livre", startTime: "08:00"});
  }

  it("elegibilidade da turma", () => {
    const src = {arenaId: "a", level: "intermediario", sport: "beachTennis"};
    assert.equal(isMakeupEligibleClass(src, {arenaId: "a", level: "intermediario", status: "active", type: "turma"}), true);
    assert.equal(isMakeupEligibleClass(src, {arenaId: "a", level: "livre", status: "active"}), true);
    assert.equal(isMakeupEligibleClass(src, {arenaId: "a", level: "avancado", status: "active"}), false);
    assert.equal(isMakeupEligibleClass(src, {arenaId: "a", level: "intermediario", status: "active", sport: "volei"}), false);
    assert.equal(isMakeupEligibleClass(src, {arenaId: "b", level: "intermediario", status: "active"}), false);
  });

  it("lista créditos disponíveis e dentro da validade", async () => {
    const {fake, db} = makeDb();
    seedMakeup(fake);
    fake.seedDoc("arenaClassCredits/vencido", {arenaId: "arena1", athleteId: ME, classId: "c1", status: "available", expiresOn: "2026-10-01"});
    fake.seedDoc("arenaClassCredits/usado", {arenaId: "arena1", athleteId: ME, classId: "c1", status: "used", expiresOn: "2026-12-01"});
    fake.seedDoc("arenaClassCredits/outro", {arenaId: "arena1", athleteId: "uAna", classId: "c1", status: "available", expiresOn: "2026-12-01"});
    const credits = await loadMyClassCredits(db, ME, TODAY);
    assert.deepEqual(credits.map((c) => [c.creditId, c.arenaName, c.className, c.level]), [
      ["cr1", "Arena CFC", "Intermediário B", "intermediario"],
    ]);
  });

  it("opções: mesmo nível ou livre, mesma arena, futuras, com vagas ou lotadas", async () => {
    const {fake, db} = makeDb();
    seedMakeup(fake);
    const {credit, options} = await loadMakeupOptionsCore(db, ME, "cr1", TODAY, NOW);
    assert.equal(credit.expiresOn, "2026-11-21");
    assert.deepEqual(options.map((o) => [o.className, o.date, o.spotsLeft, o.full, o.sameTeacher]), [
      ["Livre sábado", "2026-10-24", 6, false, true],
      ["Intermediário A", "2026-10-27", 1, false, false],
      ["Intermediário A", "2026-11-03", 0, true, false],
    ]);
  });

  it("crédito de outra pessoa, usado ou vencido não abre opções", async () => {
    const {fake, db} = makeDb();
    seedMakeup(fake);
    await rejectsWith(loadMakeupOptionsCore(db, "uAna", "cr1", TODAY, NOW), "not-found");
    await rejectsWith(loadMakeupOptionsCore(db, ME, "cr1", "2026-11-22", NOW), "failed-precondition", /venceu/);
    fake.seedDoc("arenaClassCredits/cr1", {...fake.store.get("arenaClassCredits/cr1"), status: "used"});
    await rejectsWith(loadMakeupOptionsCore(db, ME, "cr1", TODAY, NOW), "failed-precondition", /usado/);
  });

  it("encaixa com o crédito (mesma lógica da equipe) e aparece na agenda como reposição", async () => {
    const {fake, db} = makeDb();
    seedMakeup(fake);
    const id = classSessionId("c2", "2026-10-27");
    const result = await bookMakeupCore(db, ME, "cr1", id, TODAY, NOW);
    assert.equal(result.studentId, "s_me");
    const s = session(fake, id);
    assert.deepEqual(field(s, "extras", "s_me"), {name: "Marcelo Alves", kind: "makeup", creditId: "cr1", athleteId: ME});
    assert.equal(fake.store.get("arenaClassCredits/cr1")?.["status"], "used");
    const agenda = await loadClassAgenda(db, ME, "2026-10-19", "2026-10-31", TODAY);
    assert.equal(agenda.find((i) => i.sessionId === id)?.kind, "makeup");
    // O mesmo crédito não serve duas vezes.
    await rejectsWith(bookMakeupCore(db, ME, "cr1", classSessionId("c4", "2026-10-24"), TODAY, NOW), "failed-precondition");
  });

  it("recusa turma de outro nível, lotada ou aula em que já está", async () => {
    const {fake, db} = makeDb();
    seedMakeup(fake);
    await rejectsWith(bookMakeupCore(db, ME, "cr1", classSessionId("c3", "2026-10-24"), TODAY, NOW), "failed-precondition", /não aceita/);
    await rejectsWith(bookMakeupCore(db, ME, "cr1", classSessionId("c2", "2026-11-03"), TODAY, NOW), "failed-precondition", /sem vaga/);
    await rejectsWith(bookMakeupCore(db, ME, "cr1", classSessionId("c1", "2026-10-29"), TODAY, NOW), "already-exists");
    await rejectsWith(bookMakeupCore(db, "uAna", "cr1", classSessionId("c2", "2026-10-27"), TODAY, NOW), "not-found");
  });

  it("lotada: entra na fila da turma uma vez só, marcado como reposição", async () => {
    const {fake, db} = makeDb();
    seedMakeup(fake);
    const first = await joinMakeupWaitlistCore(db, ME, "cr1", "c2", TODAY);
    const second = await joinMakeupWaitlistCore(db, ME, "cr1", "c2", TODAY);
    assert.equal(second.alreadyWaiting, true);
    assert.equal(second.entryId, first.entryId);
    const entry = fake.store.get(`arenaClasses/c2/classWaitlist/${first.entryId}`);
    assert.equal(entry?.["purpose"], "makeup");
    assert.equal(entry?.["name"], "Marcelo Alves");
    assert.equal(entry?.["note"], "Reposição · crédito até 21/11");
    await rejectsWith(joinMakeupWaitlistCore(db, ME, "cr1", "c3", TODAY), "failed-precondition", /não aceita/);
  });
});

describe("chamada do professor depois do aviso", () => {
  it("presente depois do não vou com crédito: o crédito ainda livre sai; falta avisada mantém", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    const {creditId} = await respondClassSessionCore(db, notGoing(id, hoursBefore(10)));
    await saveClassAttendanceCore(db, id, {marks: {s_me: "excused"}, teacherNote: undefined, close: false, uid: "uOwner"}, THURSDAY);
    assert.equal(fake.store.has(`arenaClassCredits/${creditId}`), true);
    await saveClassAttendanceCore(db, id, {marks: {s_me: "present"}, teacherNote: undefined, close: true, uid: "uOwner"}, THURSDAY);
    assert.equal(fake.store.has(`arenaClassCredits/${creditId}`), false);
  });

  it("crédito já usado na reposição não é revogado", async () => {
    const {fake, db} = makeDb();
    const id = seedMyClass(fake);
    const {creditId} = await respondClassSessionCore(db, notGoing(id, hoursBefore(10)));
    fake.seedDoc(`arenaClassCredits/${creditId}`, {...fake.store.get(`arenaClassCredits/${creditId}`), status: "used"});
    await saveClassAttendanceCore(db, id, {marks: {s_me: "absent"}, teacherNote: undefined, close: false, uid: "uOwner"}, THURSDAY);
    assert.equal(fake.store.get(`arenaClassCredits/${creditId}`)?.["status"], "used");
  });
});

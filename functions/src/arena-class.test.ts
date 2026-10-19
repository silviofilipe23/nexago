import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  type ArenaClassData,
  addClassStudentCore,
  cancelClassSessionCore,
  classBlockLabel,
  classHorizonKey,
  classOccurrenceDates,
  classScheduleLabel,
  findClassConflicts,
  isClassScheduleChange,
  materializeClassRange,
  materializeClassSession,
  mergeConflictDates,
  releaseClassSessionBlock,
  releaseFutureClassSessions,
  removeClassStudentCore,
  saveClassAttendanceCore,
  validateClassInput,
} from "./arena-class";
import {classSessionId} from "./arena-class-constants";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
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

/** Segunda 26/10/2026 — data futura fixa para os testes de materialização. */
const MONDAY = "2026-10-26";

describe("arena-class.classOccurrenceDates", () => {
  it("turma: só os dias da semana escolhidos, dentro do intervalo", () => {
    const dates = classOccurrenceDates(baseClass(), "2026-10-18", "2026-11-01");
    assert.deepEqual(dates, ["2026-10-19", "2026-10-21", "2026-10-26", "2026-10-28"]);
  });

  it("respeita início e fim da turma", () => {
    const dates = classOccurrenceDates(
      baseClass({startDate: "2026-10-21", endDate: "2026-10-26"}),
      "2026-10-01",
      "2026-11-30",
    );
    assert.deepEqual(dates, ["2026-10-21", "2026-10-26"]);
  });

  it("aula avulsa: só a própria data, se cair na janela", () => {
    const single = baseClass({weekdays: [], startDate: "2026-10-22", endDate: "2026-10-22"});
    assert.deepEqual(classOccurrenceDates(single, "2026-10-18", "2026-11-01"), ["2026-10-22"]);
    assert.deepEqual(classOccurrenceDates(single, "2026-10-22", "2026-11-01"), []);
  });
});

describe("arena-class.validateClassInput", () => {
  const today = "2026-10-19";
  const valid = {
    name: " Intermediário Noite ", sport: "beachTennis", level: "intermediario", teacherId: "t1",
    weekdays: [4, 2, 2], startTime: "20:00", endTime: "21:00", courtId: "q1", capacity: 6,
  };

  it("normaliza nome, dias (ordenados, sem repetição) e datas", () => {
    const v = validateClassInput(valid, today);
    assert.equal(v.name, "Intermediário Noite");
    assert.deepEqual(v.weekdays, [2, 4]);
    assert.equal(v.startDate, today);
    assert.equal(v.endDate, null);
    assert.equal(v.type, "turma");
  });

  it("turma sem dia da semana é recusada", () => {
    assert.throws(() => validateClassInput({...valid, weekdays: []}, today), HttpsError);
  });

  it("aula avulsa termina no próprio dia e não aceita data passada", () => {
    const v = validateClassInput({...valid, type: "particular", weekdays: [], startDate: "2026-10-22"}, today);
    assert.equal(v.endDate, "2026-10-22");
    assert.throws(
      () => validateClassInput({...valid, type: "particular", weekdays: [], startDate: "2026-10-18"}, today),
      HttpsError,
    );
  });

  it("recusa fim antes do início, aula de mais de 4h e vagas fora da faixa", () => {
    assert.throws(() => validateClassInput({...valid, endTime: "19:00"}, today), HttpsError);
    assert.throws(() => validateClassInput({...valid, startTime: "08:00", endTime: "12:30"}, today), HttpsError);
    assert.throws(() => validateClassInput({...valid, capacity: 0}, today), HttpsError);
    assert.throws(() => validateClassInput({...valid, capacity: 41}, today), HttpsError);
  });
});

describe("arena-class rótulos e helpers", () => {
  it("rótulo da agenda e do horário", () => {
    assert.equal(classBlockLabel(baseClass()), "Aula · Iniciante A");
    assert.equal(classBlockLabel(baseClass({type: "particular", name: "Carla Dias"})), "Aula particular · Carla Dias");
    assert.equal(classScheduleLabel(baseClass()), "seg e qua · 18:00–19:30");
    assert.equal(classScheduleLabel(baseClass({weekdays: [], startDate: "2026-10-22"})), "22/10 · 18:00–19:30");
  });

  it("mudança de agenda × mudança cosmética", () => {
    assert.equal(isClassScheduleChange(baseClass(), baseClass({name: "Outro"})), false);
    assert.equal(isClassScheduleChange(baseClass(), baseClass({courtId: "q3"})), true);
    assert.equal(isClassScheduleChange(baseClass(), baseClass({weekdays: [1, 5]})), true);
    assert.equal(isClassScheduleChange(baseClass(), baseClass({endDate: "2026-12-20"})), true);
  });

  it("horizonte: 35 dias, ou a data da avulsa quando for mais longe", () => {
    assert.equal(classHorizonKey(baseClass(), "2026-10-19"), "2026-11-23");
    assert.equal(classHorizonKey(baseClass({weekdays: [], startDate: "2027-01-10"}), "2026-10-19"), "2027-01-10");
  });

  it("conflitos passados ficam, futuros são recalculados", () => {
    assert.deepEqual(
      mergeConflictDates(["2026-10-12", "2026-10-26"], ["2026-11-02"], "2026-10-19"),
      ["2026-10-12", "2026-11-02"],
    );
  });
});

describe("arena-class.materializeClassSession", () => {
  it("cria aula + booking/slot/locks por hora com o mesmo id", async () => {
    const {fake, db} = makeDb();
    const outcome = await materializeClassSession(db, "c1", baseClass(), MONDAY, "series");
    assert.equal(outcome, "created");

    const id = classSessionId("c1", MONDAY);
    const session = fake.store.get(`arenaClassSessions/${id}`)!;
    assert.equal(session["status"], "scheduled");
    assert.equal(session["teacherName"], "Thiago Mendes");
    assert.equal(session["blockBookingId"], id);

    const booking = fake.store.get(`arenaBookings/${id}`)!;
    assert.equal(booking["status"], "active");
    assert.equal(booking["source"], "class");
    assert.equal(booking["isClassSession"], true);
    assert.equal(booking["athleteId"], null);
    assert.equal(booking["customerName"], "Aula · Iniciante A");

    assert.equal(fake.store.get(`arenaSlots/${id}`)!["status"], "booked");
    // 18:00–19:30 ocupa as horas 18 e 19 — as mesmas que createArenaBooking trava.
    assert.ok(fake.store.has(`arenaSlotLocks/arena1_q2_${MONDAY}_h18`));
    assert.ok(fake.store.has(`arenaSlotLocks/arena1_q2_${MONDAY}_h19`));
    assert.equal(fake.store.get(`arenaSlotLocks/arena1_q2_${MONDAY}_h19`)!["bookingId"], id);
  });

  it("é idempotente: segunda chamada não duplica", async () => {
    const {db} = makeDb();
    await materializeClassSession(db, "c1", baseClass(), MONDAY, "series");
    assert.equal(await materializeClassSession(db, "c1", baseClass(), MONDAY, "series"), "exists");
  });

  it("hora já reservada por atleta é conflito — e nada da aula é gravado", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(`arenaSlotLocks/arena1_q2_${MONDAY}_h19`, {bookingId: "b-atleta"});
    assert.equal(await materializeClassSession(db, "c1", baseClass(), MONDAY, "series"), "conflict");
    const id = classSessionId("c1", MONDAY);
    assert.equal(fake.store.has(`arenaClassSessions/${id}`), false);
    assert.equal(fake.store.has(`arenaBookings/${id}`), false);
    assert.equal(fake.store.has(`arenaSlotLocks/arena1_q2_${MONDAY}_h18`), false);
  });

  it("lock que sobrou da própria aula não é conflito", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(`arenaSlotLocks/arena1_q2_${MONDAY}_h18`, {bookingId: classSessionId("c1", MONDAY)});
    assert.equal(await materializeClassSession(db, "c1", baseClass(), MONDAY, "series"), "created");
  });

  it("bloqueio manual do gestor no horário é conflito", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaSlots/manual1", {
      arenaId: "arena1", courtId: "q2", date: MONDAY, startTime: "19:00", endTime: "20:00", status: "blocked",
    });
    assert.equal(await materializeClassSession(db, "c1", baseClass(), MONDAY, "series"), "conflict");
  });

  it("intervalo separa criadas e conflitos", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaSlotLocks/arena1_q2_2026-10-28_h18", {bookingId: "b-atleta"});
    const result = await materializeClassRange(db, "c1", baseClass(), "2026-10-25", "2026-11-01");
    assert.deepEqual(result.createdDates, [MONDAY]);
    assert.deepEqual(result.conflictDates, ["2026-10-28"]);
  });
});

describe("arena-class liberação da quadra", () => {
  it("cancelar deixa o booking cancelado e não apaga lock de outra reserva", async () => {
    const {fake, db} = makeDb();
    await materializeClassSession(db, "c1", baseClass(), MONDAY, "series");
    const id = classSessionId("c1", MONDAY);
    // Corrida: um atleta já pegou a hora 19 no intervalo entre o trigger e esta liberação.
    fake.seedDoc(`arenaSlotLocks/arena1_q2_${MONDAY}_h19`, {bookingId: "b-atleta"});

    await releaseClassSessionBlock(db, {
      arenaId: "arena1", courtId: "q2", date: MONDAY, startTime: "18:00", endTime: "19:30", blockBookingId: id,
    }, "cancel", "class_session_canceled");

    assert.equal(fake.store.get(`arenaBookings/${id}`)!["status"], "cancelled");
    assert.equal(fake.store.has(`arenaSlotLocks/arena1_q2_${MONDAY}_h18`), false);
    assert.equal(fake.store.get(`arenaSlotLocks/arena1_q2_${MONDAY}_h19`)!["bookingId"], "b-atleta");
    assert.equal(fake.store.has(`arenaSlots/${id}`), false);
  });

  it("remarcar apaga só aulas futuras sem chamada e não canceladas", async () => {
    const {fake, db} = makeDb();
    await materializeClassRange(db, "c1", baseClass(), "2026-10-25", "2026-11-04");
    const withAttendance = classSessionId("c1", "2026-10-28");
    fake.seedDoc(`arenaClassSessions/${withAttendance}`, {
      ...fake.store.get(`arenaClassSessions/${withAttendance}`)!,
      attendance: {s1: {mark: "present", name: "Carla"}},
    });
    const canceled = classSessionId("c1", "2026-11-02");
    fake.seedDoc(`arenaClassSessions/${canceled}`, {
      ...fake.store.get(`arenaClassSessions/${canceled}`)!,
      status: "canceled",
    });

    const now = new Date("2026-10-20T12:00:00-03:00").getTime();
    const released = await releaseFutureClassSessions(db, "c1", now);

    assert.deepEqual(released, [MONDAY, "2026-11-04"]);
    assert.equal(fake.store.has(`arenaClassSessions/${classSessionId("c1", MONDAY)}`), false);
    assert.equal(fake.store.has(`arenaBookings/${classSessionId("c1", MONDAY)}`), false);
    assert.equal(fake.store.has(`arenaSlotLocks/arena1_q2_${MONDAY}_h18`), false);
    assert.ok(fake.store.has(`arenaClassSessions/${withAttendance}`));
    assert.ok(fake.store.has(`arenaClassSessions/${canceled}`));

    // A série recriada não ressuscita a aula cancelada pelo gestor.
    const again = await materializeClassRange(db, "c1", baseClass(), "2026-10-25", "2026-11-04");
    assert.deepEqual(again.createdDates, [MONDAY, "2026-11-04"]);
  });
});

describe("arena-class.findClassConflicts", () => {
  it("descreve o que ocupa a quadra e ignora o bloqueio da própria turma", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaBookings/rec1", {customerName: "Rui Tavares", isRecurring: true});
    fake.seedDoc("arenaSlotLocks/arena1_q2_2026-10-28_h19", {bookingId: "rec1"});
    fake.seedDoc(`arenaSlotLocks/arena1_q2_${MONDAY}_h18`, {bookingId: classSessionId("c1", MONDAY)});

    const result = await findClassConflicts(db, "c1", baseClass(), "2026-10-25", "2026-11-01");
    assert.deepEqual(result.dates, [MONDAY, "2026-10-28"]);
    assert.deepEqual(result.conflicts, [{date: "2026-10-28", label: "Horário fixo · Rui Tavares"}]);
  });
});

describe("arena-class alunos", () => {
  it("matricula até lotar e recusa repetido", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaClasses/c1", {...baseClass({capacity: 2}), studentCount: 0});
    const base = {phone: null, photoUrl: null, addedByUid: "gestor"};

    await addClassStudentCore(db, "c1", {...base, athleteId: "u1", name: "Carla"});
    await assert.rejects(addClassStudentCore(db, "c1", {...base, athleteId: "u1", name: "Carla"}), /já está/);
    const second = await addClassStudentCore(db, "c1", {...base, athleteId: null, name: "Bruno"});
    assert.equal(second.studentCount, 2);
    await assert.rejects(addClassStudentCore(db, "c1", {...base, athleteId: null, name: "Ana"}), /lotada/);

    const student = fake.store.get("arenaClasses/c1/classStudents/u1")!;
    assert.equal(student["arenaId"], "arena1");
    assert.equal(student["status"], "active");

    const after = await removeClassStudentCore(db, "c1", "u1");
    assert.equal(after.studentCount, 1);
    assert.equal(fake.store.get("arenaClasses/c1/classStudents/u1")!["status"], "removed");
    // Vaga liberada: o mesmo atleta pode voltar.
    await addClassStudentCore(db, "c1", {...base, athleteId: "u1", name: "Carla"});
  });
});

describe("arena-class chamada", () => {
  async function seedSession(fake: FakeFirestore, db: Firestore, date = "2026-10-19") {
    fake.seedDoc("arenaClasses/c1", {...baseClass(), studentCount: 2});
    fake.seedDoc("arenaClasses/c1/classStudents/u1", {name: "Carla", status: "active", athleteId: "u1"});
    fake.seedDoc("arenaClasses/c1/classStudents/g1", {name: "Bruno", status: "active", athleteId: null});
    await materializeClassSession(db, "c1", baseClass({startDate: date}), date, "series");
    return classSessionId("c1", date);
  }

  it("grava presença com o nome do aluno e fecha a chamada", async () => {
    const {fake, db} = makeDb();
    const id = await seedSession(fake, db);
    const result = await saveClassAttendanceCore(db, id, {
      marks: {u1: "present", g1: "excused"}, teacherNote: "Saque viagem", close: true, uid: "gestor",
    }, "2026-10-19");
    assert.equal(result.status, "completed");
    const session = fake.store.get(`arenaClassSessions/${id}`)!;
    assert.deepEqual((session["attendance"] as Record<string, unknown>)["u1"], {mark: "present", name: "Carla"});
    assert.equal(session["teacherNote"], "Saque viagem");
    assert.equal(session["status"], "completed");
  });

  it("não abre chamada de aula futura nem aceita aluno de fora", async () => {
    const {fake, db} = makeDb();
    const id = await seedSession(fake, db, MONDAY);
    await assert.rejects(
      saveClassAttendanceCore(db, id, {marks: {u1: "present"}, teacherNote: undefined, close: false, uid: "g"}, "2026-10-19"),
      /dia da aula/,
    );
    await assert.rejects(
      saveClassAttendanceCore(db, id, {marks: {zz: "present"}, teacherNote: undefined, close: false, uid: "g"}, MONDAY),
      /fora da turma/,
    );
  });

  it("cancelar a aula libera a quadra e avisa só quem tem conta", async () => {
    const {fake, db} = makeDb();
    const id = await seedSession(fake, db, MONDAY);
    const notified: string[] = [];
    const result = await cancelClassSessionCore(db, id, "rain", null, {
      notify: async (input) => {
        notified.push(input.userId);
      },
    });
    assert.equal(result.notified, 1);
    assert.deepEqual(notified, ["u1"]);
    assert.equal(fake.store.get(`arenaClassSessions/${id}`)!["status"], "canceled");
    assert.equal(fake.store.get(`arenaBookings/${id}`)!["status"], "cancelled");
    assert.equal(fake.store.has(`arenaSlotLocks/arena1_q2_${MONDAY}_h18`), false);
  });
});

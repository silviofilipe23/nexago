import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {type ArenaClassData, cancelClassSessionCore, materializeClassSession} from "./arena-class";
import {classSessionId} from "./arena-class-constants";
import {classRulesRef} from "./arena-class-ledger";
import {
  notifyProfessorLessonCanceledCore,
  PROFESSOR_LESSON_CANCELED_TYPE,
  professorLessonCanceledBody,
} from "./professor-lesson-cancel";

const MONDAY = "2026-10-26";

function cls(): ArenaClassData {
  return {
    arenaId: "arena1", arenaName: "Arena CFC", name: "Intermediário B", type: "turma", sport: "beachTennis",
    level: "intermediario", teacherId: "t1", teacherUserId: "uThiago", teacherName: "Thiago Mendes",
    teacherColor: "#FF6A1A", weekdays: [1, 3], startTime: "19:00", endTime: "20:00", courtId: "q2",
    courtName: "Quadra 2", capacity: 6, startDate: "2026-10-19", endDate: null, status: "active", notes: null,
  };
}

type Sent = {userId: string; title: string; body: string; type: string};

async function seedClass(): Promise<{fake: FakeFirestore; db: Firestore; id: string}> {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  fake.seedDoc("arenas/arena1", {name: "Arena CFC", managerUserId: "uGestor"});
  fake.seedDoc("arenaClasses/c1", cls() as unknown as Record<string, unknown>);
  fake.seedDoc("arenaClasses/c1/classStudents/s1", {name: "Marina", status: "active", athleteId: "uMarina"});
  fake.seedDoc("arenaClasses/c1/classStudents/s2", {name: "Elisa", status: "active", athleteId: "uElisa"});
  fake.seedDoc("arenaClasses/c1/classStudents/s3", {name: "Sem conta", status: "active", athleteId: null});
  await materializeClassSession(db, "c1", cls(), MONDAY, "series");
  return {fake, db, id: classSessionId("c1", MONDAY)};
}

describe("cancelar aula de turma pelo professor (E5a)", () => {
  it("aviso diz 'pelo professor' com o motivo; gestão avisada; números da confirmação", async () => {
    const {fake, db, id} = await seedClass();
    await classRulesRef(db, "arena1").set({makeupValidityDays: 45});
    const sent: Sent[] = [];
    const out = await cancelClassSessionCore(db, id, "health", null, {
      notify: async (i) => {
        sent.push(i);
      },
    }, true, null, "teacher");

    const students = sent.filter((s) => s.type === "arena_class_canceled");
    assert.deepEqual(students.map((s) => s.userId).sort(), ["uElisa", "uMarina"]);
    assert.match(students[0]!.body, /cancelada pelo professor \(saúde\)\./);
    const manager = sent.find((s) => s.type === "arena_class_canceled_by_teacher");
    assert.equal(manager?.userId, "uGestor");
    assert.match(manager!.body, /Intermediário B de 26\/10 às 19:00 \(saúde\)\. A quadra foi liberada\./);
    assert.deepEqual(
      {notified: out.notified, recipients: out.recipients, credited: out.credited,
        days: out.creditValidityDays, manager: out.managerNotified},
      {notified: 2, recipients: 2, credited: 3, days: 45, manager: true},
    );
    assert.equal(fake.store.get(`arenaClassSessions/${id}`)!["cancelReason"], "health");
  });

  it("cancelada pela arena: texto de sempre e sem aviso à gestão", async () => {
    const {db, id} = await seedClass();
    const sent: Sent[] = [];
    const out = await cancelClassSessionCore(db, id, "personal", null, {notify: async (i) => {
      sent.push(i);
    }});
    assert.ok(sent.every((s) => s.type === "arena_class_canceled"));
    assert.match(sent[0]!.body, /cancelada pela arena \(imprevisto pessoal\)\./);
    assert.equal(out.managerNotified, false);
    assert.equal(out.creditValidityDays, 30);
  });

  it("cancelar de novo não reavisa ninguém", async () => {
    const {db, id} = await seedClass();
    const noop = {notify: async () => {}};
    await cancelClassSessionCore(db, id, "rain", null, noop, true, null, "teacher");
    const sent: Sent[] = [];
    const again = await cancelClassSessionCore(db, id, "rain", null, {notify: async (i) => {
      sent.push(i);
    }}, true, null, "teacher");
    assert.equal(sent.length, 0);
    assert.equal(again.notified, 0);
    assert.equal(again.managerNotified, false);
  });
});

describe("avisar o aluno da particular cancelada (E5b/E5c)", () => {
  function seedLesson(bookingStatus: string) {
    const fake = new FakeFirestore();
    fake.seedDoc("professorLessons/bk1", {
      professorUid: "uThiago", professorName: "Thiago Mendes", athleteId: "uPaulo", studentName: "Paulo Viana",
      date: "2026-10-22", startTime: "06:00", arenaName: "Arena Norte",
    });
    fake.seedDoc("arenaBookings/bk1", {status: bookingStatus});
    return {fake, db: fake as unknown as Firestore};
  }

  async function rejectsWith(p: Promise<unknown>, code: string) {
    await assert.rejects(p, (e) => e instanceof HttpsError && e.code === code);
  }

  it("avisa o aluno uma vez, com o motivo", async () => {
    const {fake, db} = seedLesson("canceled");
    const sent: Sent[] = [];
    const deps = {notify: async (i: Sent) => {
      sent.push(i);
    }};
    assert.deepEqual(await notifyProfessorLessonCanceledCore(db, "uThiago", "bk1", "rain", deps), {notified: 1});
    assert.equal(sent[0]!.userId, "uPaulo");
    assert.equal(sent[0]!.type, PROFESSOR_LESSON_CANCELED_TYPE);
    assert.equal(sent[0]!.body, "Thiago cancelou a aula de 22/10 às 06:00 na Arena Norte (chuva).");
    assert.equal(fake.store.get("professorLessons/bk1")!["cancelReason"], "rain");
    assert.deepEqual(await notifyProfessorLessonCanceledCore(db, "uThiago", "bk1", "rain", deps), {notified: 0});
    assert.equal(sent.length, 1);
  });

  it("recusa aula de outro professor, reserva ainda ativa e motivo inventado", async () => {
    await rejectsWith(notifyProfessorLessonCanceledCore(seedLesson("canceled").db, "uOutro", "bk1", "rain"),
      "permission-denied");
    await rejectsWith(notifyProfessorLessonCanceledCore(seedLesson("confirmed").db, "uThiago", "bk1", "rain"),
      "failed-precondition");
    await rejectsWith(notifyProfessorLessonCanceledCore(seedLesson("canceled").db, "uThiago", "bk1", "xx"),
      "invalid-argument");
    await rejectsWith(notifyProfessorLessonCanceledCore(seedLesson("canceled").db, "uThiago", "nada", "rain"),
      "not-found");
  });

  it("texto sem motivo nem arena", () => {
    assert.equal(
      professorLessonCanceledBody({professorName: "", date: "2026-10-22", startTime: "06:00", arenaName: "", reason: "other"}),
      "Seu professor cancelou a aula de 22/10 às 06:00.",
    );
  });
});

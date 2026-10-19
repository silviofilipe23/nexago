import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {CLASS_REMINDER_TYPE, classReminderMessage, sendClassRemindersCore} from "./arena-class-reminders";

// Terça 20/10/2026, aula às 19:00 (-03:00) = 22:00Z. "Agora" 2h antes = 17:00 (20:00Z).
const DATE = "2026-10-20";
const START = new Date("2026-10-20T22:00:00Z");
const NOW = new Date(START.getTime() - 120 * 60_000);
const SESSION = `class_c1_${DATE}`;

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function seedSession(fake: FakeFirestore, overrides: Record<string, unknown> = {}, id = SESSION): void {
  fake.seedDoc(`arenaClassSessions/${id}`, {
    classId: "c1",
    arenaId: "arena1",
    arenaName: "Arena CFC",
    className: "Intermediário B",
    courtName: "Quadra 2",
    date: DATE,
    startTime: "19:00",
    startAt: Timestamp.fromDate(START),
    status: "scheduled",
    teacherUserId: "uProf",
    extras: {},
    ...overrides,
  });
}

function seedStudent(fake: FakeFirestore, id: string, data: Record<string, unknown>): void {
  fake.seedDoc(`arenaClasses/c1/classStudents/${id}`, {arenaId: "arena1", classId: "c1", status: "active", name: id, ...data});
}

function recorder() {
  const sent: Array<{userId: string; title: string; body: string; type: string; data: Record<string, string>}> = [];
  return {sent, deps: {notify: async (i: (typeof sent)[number]) => {
    sent.push(i);
  }}};
}

describe("lembrete de aula 2h antes", () => {
  it("avisa quem vem no dia (turma + encaixe com conta) e o professor, uma vez só", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {extras: {trial_x: {name: "Lia", kind: "trial", creditId: null, athleteId: "uLia"}, trial_y: {name: "Sem conta", kind: "trial", creditId: null, athleteId: null}}});
    seedStudent(fake, "uMarina", {athleteId: "uMarina", weekdays: [2, 4]});
    seedStudent(fake, "uJoao", {athleteId: "uJoao", weekdays: [4]}); // só quinta
    seedStudent(fake, "guest1", {athleteId: null}); // sem conta, todos os dias
    seedStudent(fake, "uPausado", {athleteId: "uPausado", status: "paused"});
    const {sent, deps} = recorder();

    const out = await sendClassRemindersCore(db, NOW, deps);

    assert.deepEqual(out, {sessions: 1, notified: 3});
    assert.deepEqual(sent.map((s) => s.userId).sort(), ["uLia", "uMarina", "uProf"]);
    assert.ok(sent.every((s) => s.type === CLASS_REMINDER_TYPE && s.data["classSessionId"] === SESSION));
    const teacher = sent.find((s) => s.userId === "uProf")!;
    // Marina + convidado sem conta + 2 encaixes = 4 na lista.
    assert.match(teacher.body, /4 alunos na lista/);
    assert.equal(teacher.data["role"], "teacher");
    assert.ok(fake.store.get(`arenaClassSessions/${SESSION}`)!["reminder2hSentAt"] != null);

    const again = await sendClassRemindersCore(db, new Date(NOW.getTime() + 5 * 60_000), deps);
    assert.deepEqual(again, {sessions: 0, notified: 0});
    assert.equal(sent.length, 3);
  });

  it("fora da janela de 115–125 min, cancelada ou fechada não avisa", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {startAt: Timestamp.fromDate(new Date(NOW.getTime() + 140 * 60_000))}, "longe");
    seedSession(fake, {status: "canceled"}, "cancelada");
    seedSession(fake, {status: "completed"}, "fechada");
    seedStudent(fake, "uMarina", {athleteId: "uMarina"});
    const {sent, deps} = recorder();

    const out = await sendClassRemindersCore(db, NOW, deps);

    assert.deepEqual(out, {sessions: 0, notified: 0});
    assert.equal(sent.length, 0);
  });

  it("regra da arena desligada não avisa nem marca a aula", async () => {
    const {fake, db} = makeDb();
    seedSession(fake);
    seedStudent(fake, "uMarina", {athleteId: "uMarina"});
    fake.seedDoc("arenas/arena1/classSettings/rules", {classReminderEnabled: false});
    const {sent, deps} = recorder();

    await sendClassRemindersCore(db, NOW, deps);

    assert.equal(sent.length, 0);
    assert.equal(fake.store.get(`arenaClassSessions/${SESSION}`)!["reminder2hSentAt"], undefined);
  });

  it("falha de um envio não impede os outros nem reenvia depois", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {teacherUserId: null});
    seedStudent(fake, "uA", {athleteId: "uA"});
    seedStudent(fake, "uB", {athleteId: "uB"});
    const delivered: string[] = [];
    const deps = {notify: async (i: {userId: string}) => {
      if (i.userId === "uA") throw new Error("sem token");
      delivered.push(i.userId);
    }};

    const out = await sendClassRemindersCore(db, NOW, deps);

    assert.deepEqual(out, {sessions: 1, notified: 1});
    assert.deepEqual(delivered, ["uB"]);
    assert.deepEqual(await sendClassRemindersCore(db, NOW, deps), {sessions: 0, notified: 0});
  });

  it("texto: aluno sabe onde é; professor sabe quantos esperar", () => {
    const s = {className: "Iniciante A", courtName: "Quadra 1", arenaName: "Arena CFC", startTime: "07:00"};
    assert.deepEqual(classReminderMessage(s, "student", 3), {
      title: "Aula às 07:00",
      body: "Iniciante A · Quadra 1 · Arena CFC. Começa em 2 horas — não vai conseguir ir? Avise a arena.",
    });
    assert.equal(classReminderMessage(s, "teacher", 1).body, "Iniciante A · Quadra 1 · 1 aluno na lista. Começa em 2 horas.");
  });
});

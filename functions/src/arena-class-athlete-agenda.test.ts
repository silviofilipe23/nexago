import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {loadClassAgenda, parseAgendaRange} from "./arena-class-athlete-agenda";
import {addExtraCore, extraAthleteIdsOf, removeExtraCore} from "./arena-class-makeup";

// 19/10/2026 é segunda. Turma Ter/Qui 19h.
const TODAY = "2026-10-19";
const UID = "uMarina";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function session(fake: FakeFirestore, date: string, over: Record<string, unknown> = {}, classId = "c1"): string {
  const id = `class_${classId}_${date}`;
  fake.seedDoc(`arenaClassSessions/${id}`, {
    classId, arenaId: "arena1", arenaName: "Arena CFC", className: "Intermediário B", teacherName: "Carla",
    teacherUserId: "uCarla", courtName: "Quadra 2", date, startTime: "19:00", endTime: "20:00",
    startAt: Timestamp.fromDate(new Date(`${date}T22:00:00Z`)), status: "scheduled", attendance: {}, extras: {},
    capacity: 4, ...over,
  });
  return id;
}

function student(fake: FakeFirestore, id: string, data: Record<string, unknown>, classId = "c1"): void {
  fake.seedDoc(`arenaClasses/${classId}/classStudents/${id}`, {arenaId: "arena1", classId, status: "active", name: id, ...data});
}

describe("aulas na agenda do atleta", () => {
  it("aluno: só os dias que faz; passado só com marca na chamada", async () => {
    const {fake, db} = makeDb();
    student(fake, UID, {athleteId: UID, weekdays: [2]});
    session(fake, "2026-10-13", {attendance: {[UID]: {mark: "present", name: "Marina"}}}); // ter passada, presente
    session(fake, "2026-10-15"); // qui passada — não faz quinta
    session(fake, "2026-10-20"); // ter futura
    session(fake, "2026-10-22"); // qui futura
    session(fake, "2026-10-27", {status: "canceled"}); // ter cancelada

    const items = await loadClassAgenda(db, UID, "2026-10-01", "2026-10-31", TODAY);

    assert.deepEqual(items.map((i) => [i.date, i.status, i.myMark]), [
      ["2026-10-13", "scheduled", "present"],
      ["2026-10-20", "scheduled", null],
      ["2026-10-27", "canceled", null],
    ]);
    assert.ok(items.every((i) => i.role === "student" && i.kind === "regular" && i.studentCount === null));
    assert.equal(items[1]!.startAt, "2026-10-20T22:00:00.000Z");
    // Nada de outro aluno sai daqui.
    assert.ok(items.every((i) => !("attendance" in i) && !("extras" in i)));
  });

  it("pausado não vê as próximas, mas mantém o histórico", async () => {
    const {fake, db} = makeDb();
    student(fake, UID, {athleteId: UID, status: "paused"});
    session(fake, "2026-10-13", {attendance: {[UID]: {mark: "excused", name: "Marina"}}});
    session(fake, "2026-10-20");
    const items = await loadClassAgenda(db, UID, "2026-10-01", "2026-10-31", TODAY);
    assert.deepEqual(items.map((i) => [i.date, i.myMark]), [["2026-10-13", "excused"]]);
  });

  it("encaixe (reposição/experimental) aparece pela conta, mesmo sem ser da turma", async () => {
    const {fake, db} = makeDb();
    session(fake, "2026-10-22", {
      extras: {trial_1: {name: "Marina", kind: "trial", creditId: null, athleteId: UID}},
      extraAthleteIds: [UID],
    });
    const items = await loadClassAgenda(db, UID, "2026-10-01", "2026-10-31", TODAY);
    assert.deepEqual(items.map((i) => [i.date, i.kind, i.role]), [["2026-10-22", "trial", "student"]]);
  });

  it("professor vê as aulas que dá com a contagem do dia, sem nomes", async () => {
    const {fake, db} = makeDb();
    student(fake, "a1", {athleteId: "a1", weekdays: [2, 4]});
    student(fake, "a2", {athleteId: null, weekdays: [4]});
    student(fake, "a3", {athleteId: "a3", status: "paused"});
    session(fake, "2026-10-20", {extras: {t: {name: "X", kind: "trial", athleteId: null, creditId: null}}});
    session(fake, "2026-10-22");
    session(fake, "2026-10-13", {attendance: {a1: {mark: "present", name: "A1"}, a2: {mark: "absent", name: "A2"}}});

    const items = await loadClassAgenda(db, "uCarla", "2026-10-01", "2026-10-31", TODAY);

    assert.deepEqual(items.map((i) => [i.date, i.role, i.studentCount]), [
      ["2026-10-13", "teacher", 2], // passada: quem estava na chamada
      ["2026-10-20", "teacher", 2], // terça: a1 + encaixe
      ["2026-10-22", "teacher", 2], // quinta: a1 + a2
    ]);
  });

  it("intervalo: padrão 30 dias para trás e 35 para a frente; mais de 100 dias é recusado", () => {
    assert.deepEqual(parseAgendaRange({}, TODAY), {fromKey: "2026-09-19", toKey: "2026-11-23"});
    assert.throws(() => parseAgendaRange({fromKey: "2026-01-01", toKey: "2026-12-31"}, TODAY), HttpsError);
    assert.throws(() => parseAgendaRange({fromKey: "2026-10-20", toKey: "2026-10-01"}, TODAY), HttpsError);
  });

  it("encaixe mantém extraAthleteIds na sessão (entra e sai)", async () => {
    const {fake, db} = makeDb();
    const id = session(fake, "2026-10-22");
    await addExtraCore(db, id, {kind: "trial", creditId: null, student: {athleteId: UID, name: "Marina"}}, TODAY);
    assert.deepEqual(fake.store.get(`arenaClassSessions/${id}`)!["extraAthleteIds"], [UID]);
    await removeExtraCore(db, id, UID);
    assert.deepEqual(fake.store.get(`arenaClassSessions/${id}`)!["extraAthleteIds"], []);
    assert.deepEqual(extraAthleteIdsOf({a: {athleteId: "z"}, b: {athleteId: null}, c: {athleteId: "z"}, d: {athleteId: "m"}}), ["m", "z"]);
  });
});

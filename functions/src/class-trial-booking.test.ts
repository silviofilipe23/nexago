import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {classSessionId} from "./arena-class-constants";
import {
  CENTER_TRIAL_DECIDED_TYPE,
  CENTER_TRIAL_REQUEST_TYPE,
  bookArenaTrialCore,
  bookCenterTrialCore,
  cancelCenterTrialCore,
  decideCenterTrialCore,
  loadArenaTrialOptionsCore,
  loadCenterTrialBookingsCore,
  loadCenterTrialOptionsCore,
} from "./class-trial-booking";
import type {NotifyDeps, PushInput} from "./training-center-notify";
import {loadClassAgenda} from "./arena-class-athlete-agenda";

/** Quarta 21/10/2026, 12:00 em São Paulo. */
const TODAY = "2026-10-21";
const NOW = new Date("2026-10-21T15:00:00Z");
const ME = "uNovo";

function makeDb(trial = true): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/arena1", {name: "Arena CFC"});
  fake.seedDoc("arenas/arena1/classSettings/showcase", {trial: {enabled: trial, priceReais: 0, note: ""}});
  fake.seedDoc(`users/${ME}`, {fullName: "Novo Atleta"});
  fake.seedDoc("arenaClasses/c1", {
    arenaId: "arena1", name: "Iniciante", type: "turma", level: "iniciante", teacherName: "Thiago",
    weekdays: [4], startTime: "19:00", endTime: "20:00", courtName: "Quadra 2", capacity: 2, status: "active",
  });
  fake.seedDoc("arenaClasses/c2", {
    arenaId: "arena1", name: "Particular", type: "particular", weekdays: [4], startTime: "07:00", capacity: 1, status: "active",
  });
  fake.seedDoc("arenaClasses/c1/classStudents/s1", {classId: "c1", athleteId: "uFixo", name: "Fixo", status: "active", weekdays: [4]});
  return {fake, db: fake as unknown as Firestore};
}

function seedSession(fake: FakeFirestore, classId: string, date: string, over: Record<string, unknown> = {}): string {
  const id = classSessionId(classId, date);
  const startTime = String(over["startTime"] ?? "19:00");
  fake.seedDoc(`arenaClassSessions/${id}`, {
    classId, arenaId: "arena1", className: "Iniciante", teacherName: "Thiago", courtName: "Quadra 2",
    date, startTime, endTime: "20:00", capacity: 2,
    startAt: Timestamp.fromDate(new Date(`${date}T${startTime}:00-03:00`)),
    status: "scheduled", attendance: {}, extras: {},
    ...over,
  });
  return id;
}

async function rejectsWith(p: Promise<unknown>, code: string, msg?: RegExp): Promise<void> {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof HttpsError);
    assert.equal(e.code, code);
    if (msg) assert.match(e.message, msg);
    return true;
  });
}

describe("experimental · calendário da arena", () => {
  it("só turmas com vaga, futuras e na janela", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, "c1", "2026-10-22");
    seedSession(fake, "c1", "2026-10-29", {extras: {x: {name: "X", kind: "trial", athleteId: null}}}); // lotada
    seedSession(fake, "c1", "2026-11-05", {status: "canceled"});
    seedSession(fake, "c1", "2026-12-31"); // fora da janela
    seedSession(fake, "c2", "2026-10-22", {startTime: "07:00"}); // particular
    const r = await loadArenaTrialOptionsCore(db, ME, "arena1", TODAY, NOW);
    assert.equal(r.booking, "app");
    assert.deepEqual(r.options.map((o) => [o.date, o.className, o.spotsLeft, o.level]), [
      ["2026-10-22", "Iniciante", 1, "iniciante"],
    ]);
    assert.equal(r.booked, null);
  });

  it("arena sem experimental ligada recusa", async () => {
    const {db} = makeDb(false);
    await rejectsWith(loadArenaTrialOptionsCore(db, ME, "arena1", TODAY, NOW), "failed-precondition");
  });

  it("agenda como encaixe experimental, aparece na agenda e devolve o marcado", async () => {
    const {fake, db} = makeDb();
    const id = seedSession(fake, "c1", "2026-10-22");
    seedSession(fake, "c1", "2026-10-29");
    const res = await bookArenaTrialCore(db, ME, id, TODAY, NOW);
    assert.equal(res.studentId, ME);
    const extras = fake.store.get(`arenaClassSessions/${id}`)?.["extras"] as Record<string, unknown>;
    assert.deepEqual(extras[ME], {name: "Novo Atleta", kind: "trial", creditId: null, athleteId: ME});
    const agenda = await loadClassAgenda(db, ME, "2026-10-19", "2026-10-31", TODAY);
    assert.equal(agenda.find((i) => i.sessionId === id)?.kind, "trial");

    const after = await loadArenaTrialOptionsCore(db, ME, "arena1", TODAY, NOW);
    assert.equal(after.booked?.sessionId, id);
    assert.deepEqual(after.options.map((o) => o.date), ["2026-10-29"]);
    // Uma experimental por vez na arena.
    await rejectsWith(bookArenaTrialCore(db, ME, classSessionId("c1", "2026-10-29"), TODAY, NOW), "already-exists", /experimental/);
  });

  it("recusa aula lotada, particular, começada e quem já é aluno", async () => {
    const {fake, db} = makeDb();
    const full = seedSession(fake, "c1", "2026-10-29", {extras: {x: {name: "X", kind: "trial", athleteId: null}}});
    const priv = seedSession(fake, "c2", "2026-10-22", {startTime: "07:00"});
    const past = seedSession(fake, "c1", TODAY, {startTime: "08:00"});
    const mine = seedSession(fake, "c1", "2026-10-22");
    await rejectsWith(bookArenaTrialCore(db, ME, full, TODAY, NOW), "failed-precondition", /sem vaga/);
    await rejectsWith(bookArenaTrialCore(db, ME, priv, TODAY, NOW), "failed-precondition", /não recebe/);
    await rejectsWith(bookArenaTrialCore(db, ME, past, TODAY, NOW), "failed-precondition", /começou/);
    fake.seedDoc("users/uFixo", {fullName: "Fixo"});
    await rejectsWith(bookArenaTrialCore(db, "uFixo", mine, TODAY, NOW), "already-exists");
  });
});

function seedCenter(fake: FakeFirestore): Firestore {
  fake.seedDoc("trainingCenters/ct1", {status: "active", name: "CT Elevate", showcase: {trial: {enabled: true, priceReais: 0}}});
  fake.seedDoc("trainingCenters/ct1/classes/k1", {
    status: "active", name: "Kids", level: "Kids", weekdays: [4], startTime: "18:00", durationMin: 90,
    capacity: 2, rosterStudentIds: ["a"], coachName: "Ju", locationName: "Sede",
  });
  fake.seedDoc("trainingCenters/ct1/sessions/k1_2026-10-22", {classId: "k1", date: "2026-10-22", startTime: "18:00", status: "scheduled"});
  fake.seedDoc("trainingCenters/ct1/sessions/k1_2026-10-29", {classId: "k1", date: "2026-10-29", startTime: "18:00", status: "scheduled", makeupStudentIds: ["b"]});
  fake.seedDoc("trainingCenters/ct1/sessions/k1_2026-11-05", {classId: "k1", date: "2026-11-05", startTime: "18:00", status: "scheduled"});
  fake.seedDoc("trainingCenters/ct1/centerMembers/uDono", {uid: "uDono", status: "active", role: "center_owner", displayName: "Dona"});
  fake.seedDoc("trainingCenters/ct1/centerMembers/uRecep", {uid: "uRecep", status: "active", role: "receptionist", displayName: "Recepção"});
  fake.seedDoc("trainingCenters/ct1/centerMembers/uCoach", {uid: "uCoach", status: "active", role: "coach"});
  fake.seedDoc(`users/${ME}`, {fullName: "Novo Atleta", phone: "+5562999990000"});
  fake.seedDoc("users/uOutro", {fullName: "Outra Pessoa"});
  return fake as unknown as Firestore;
}

function pushes(): {deps: NotifyDeps; sent: PushInput[]} {
  const sent: PushInput[] = [];
  return {sent, deps: {now: () => NOW, notify: async (p) => {
    sent.push(p);
  }}};
}

describe("experimental · CT agenda e a equipe confirma", () => {
  it("calendário com as vagas do centro", async () => {
    const fake = new FakeFirestore();
    const db = seedCenter(fake);
    const r = await loadCenterTrialOptionsCore(db, ME, "ct1", TODAY, NOW);
    assert.equal(r.booking, "app");
    assert.deepEqual(r.options.map((o) => [o.date, o.endTime, o.teacherName, o.place, o.spotsLeft]), [
      ["2026-10-22", "19:30", "Ju", "Sede", 1],
      ["2026-11-05", "19:30", "Ju", "Sede", 1],
    ]);
    assert.equal(r.booked, null);
  });

  it("pedido fica pendente, segura a vaga e avisa a gestão", async () => {
    const fake = new FakeFirestore();
    const db = seedCenter(fake);
    const {deps, sent} = pushes();
    const res = await bookCenterTrialCore(db, deps, ME, "ct1", "k1_2026-10-22", TODAY);
    assert.deepEqual(res, {bookingId: `k1_2026-10-22_${ME}`, status: "pending"});
    const doc = fake.store.get(`trainingCenters/ct1/trialBookings/${res.bookingId}`);
    assert.equal(doc?.["status"], "pending");
    assert.equal(doc?.["name"], "Novo Atleta");
    assert.equal(doc?.["className"], "Kids");
    assert.deepEqual(sent.map((p) => [p.userId, p.type]), [["uDono", CENTER_TRIAL_REQUEST_TYPE]]);

    const mine = await loadCenterTrialOptionsCore(db, ME, "ct1", TODAY, NOW);
    assert.equal(mine.bookedStatus, "pending");
    assert.equal(mine.bookingId, res.bookingId);
    // A vaga do dia 22 foi ocupada pelo pedido.
    const other = await loadCenterTrialOptionsCore(db, "uOutro", "ct1", TODAY, NOW);
    assert.deepEqual(other.options.map((o) => o.date), ["2026-11-05"]);
    await rejectsWith(bookCenterTrialCore(db, deps, "uOutro", "ct1", "k1_2026-10-22", TODAY), "failed-precondition", /sem vaga/);
    // Um pedido por vez no centro.
    await rejectsWith(bookCenterTrialCore(db, deps, ME, "ct1", "k1_2026-11-05", TODAY), "already-exists");
  });

  it("aluno da turma, aula lotada ou começada não pedem", async () => {
    const fake = new FakeFirestore();
    const db = seedCenter(fake);
    const {deps} = pushes();
    fake.seedDoc("trainingCenters/ct1/students/a", {athleteId: ME, name: "Novo"});
    await rejectsWith(bookCenterTrialCore(db, deps, ME, "ct1", "k1_2026-11-05", TODAY), "already-exists");
    await rejectsWith(bookCenterTrialCore(db, deps, "uOutro", "ct1", "k1_2026-10-29", TODAY), "failed-precondition", /sem vaga/);
    fake.seedDoc("trainingCenters/ct1/sessions/k1_2026-10-21", {classId: "k1", date: TODAY, startTime: "08:00", status: "scheduled"});
    await rejectsWith(bookCenterTrialCore(db, deps, "uOutro", "ct1", "k1_2026-10-21", TODAY), "failed-precondition", /começou/);
  });

  it("recepção confirma, atleta recebe o push; professor não pode", async () => {
    const fake = new FakeFirestore();
    const db = seedCenter(fake);
    const {deps, sent} = pushes();
    const {bookingId} = await bookCenterTrialCore(db, deps, ME, "ct1", "k1_2026-10-22", TODAY);
    await rejectsWith(loadCenterTrialBookingsCore(db, "uCoach", "ct1", TODAY), "permission-denied");
    const list = await loadCenterTrialBookingsCore(db, "uRecep", "ct1", TODAY);
    assert.deepEqual(list.bookings.map((b) => [b.id, b.status, b.name]), [[bookingId, "pending", "Novo Atleta"]]);

    await rejectsWith(decideCenterTrialCore(db, deps, "uCoach", {centerId: "ct1", bookingId, decision: "confirm"}), "permission-denied");
    const r = await decideCenterTrialCore(db, deps, "uRecep", {centerId: "ct1", bookingId, decision: "confirm"});
    assert.equal(r.status, "confirmed");
    const doc = fake.store.get(`trainingCenters/ct1/trialBookings/${bookingId}`);
    assert.equal(doc?.["decidedByName"], "Recepção");
    const last = sent[sent.length - 1]!;
    assert.equal(last.userId, ME);
    assert.equal(last.type, CENTER_TRIAL_DECIDED_TYPE);
    assert.match(last.body, /confirmou/);
    await rejectsWith(decideCenterTrialCore(db, deps, "uDono", {centerId: "ct1", bookingId, decision: "decline"}), "failed-precondition");
    assert.equal((await loadCenterTrialOptionsCore(db, ME, "ct1", TODAY, NOW)).bookedStatus, "confirmed");
  });

  it("recusa libera a vaga; atleta desmarca o próprio pedido", async () => {
    const fake = new FakeFirestore();
    const db = seedCenter(fake);
    const {deps, sent} = pushes();
    const a = await bookCenterTrialCore(db, deps, ME, "ct1", "k1_2026-10-22", TODAY);
    await decideCenterTrialCore(db, deps, "uDono", {centerId: "ct1", bookingId: a.bookingId, decision: "decline", note: "Turma só para alunos"});
    assert.match(sent[sent.length - 1]!.body, /Turma só para alunos/);
    const after = await loadCenterTrialOptionsCore(db, ME, "ct1", TODAY, NOW);
    assert.equal(after.booked, null);
    assert.deepEqual(after.options.map((o) => o.date), ["2026-10-22", "2026-11-05"]);

    const b = await bookCenterTrialCore(db, deps, ME, "ct1", "k1_2026-11-05", TODAY);
    await rejectsWith(cancelCenterTrialCore(db, "uOutro", "ct1", b.bookingId, NOW), "not-found");
    await cancelCenterTrialCore(db, ME, "ct1", b.bookingId, NOW);
    assert.equal(fake.store.get(`trainingCenters/ct1/trialBookings/${b.bookingId}`)?.["status"], "canceled");
    await rejectsWith(cancelCenterTrialCore(db, ME, "ct1", b.bookingId, NOW), "failed-precondition");
  });
});

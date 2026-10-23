import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  justClosed,
  onArenaSessionClosedCore,
  onCenterSessionClosedCore,
  presentStudentIds,
  withinReviewWindow,
  type ReviewRequest,
} from "./class-review-notify";

// Quarta 21/10/2026 12:00 SP.
const NOW = new Date(Date.UTC(2026, 9, 21, 15, 0, 0));

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const arenaSession = (status: string) => ({
  classId: "t1", className: "Intermediário B", date: "2026-10-20", status,
  attendance: {
    carla: {mark: "present"},
    semConta: {mark: "present"},
    joao: {mark: "absent"},
    extra1: {mark: "present"},
  },
  extras: {extra1: {athleteId: "bia", kind: "makeup"}},
});

describe("class-review-notify · regras puras", () => {
  it("só na transição para fechada", () => {
    assert.equal(justClosed({status: "scheduled"}, {status: "completed"}, "completed"), true);
    assert.equal(justClosed({status: "completed"}, {status: "completed"}, "completed"), false);
    assert.equal(justClosed({status: "scheduled"}, undefined, "completed"), false);
  });

  it("presentes nos dois formatos de chamada", () => {
    assert.deepEqual(presentStudentIds({a: {mark: "present"}, b: {mark: "absent"}, c: "present", d: "excused"}), ["a", "c"]);
    assert.deepEqual(presentStudentIds(null), []);
  });

  it("janela pela data da aula", () => {
    assert.equal(withinReviewWindow("2026-10-20", NOW), true);
    assert.equal(withinReviewWindow("2026-10-10", NOW), false);
    assert.equal(withinReviewWindow("", NOW), false);
  });
});

describe("class-review-notify · arena", () => {
  it("avisa os presentes com conta (aluno da turma e encaixe), uma vez", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaClasses/t1/classStudents/carla", {athleteId: "carla"});
    fake.seedDoc("arenaClasses/t1/classStudents/semConta", {athleteId: null, name: "Sem conta"});
    const sent: ReviewRequest[] = [];
    const n = await onArenaSessionClosedCore(db(fake), "class_t1_2026-10-20",
      arenaSession("scheduled"), arenaSession("completed"), NOW, async (r) => { sent.push(r); });
    assert.equal(n, 2);
    assert.deepEqual(sent.map((r) => r.uid).sort(), ["bia", "carla"]);
    assert.equal(sent[0].key, "a_class_t1_2026-10-20");
  });

  it("quem já avaliou não recebe; reabrir/editar a chamada não repete", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaClasses/t1/classStudents/carla", {athleteId: "carla"});
    fake.seedDoc("classReviews/a_class_t1_2026-10-20_carla", {uid: "carla"});
    const sent: ReviewRequest[] = [];
    await onArenaSessionClosedCore(db(fake), "class_t1_2026-10-20",
      arenaSession("scheduled"), arenaSession("completed"), NOW, async (r) => { sent.push(r); });
    assert.deepEqual(sent.map((r) => r.uid), ["bia"]);
    const again = await onArenaSessionClosedCore(db(fake), "class_t1_2026-10-20",
      arenaSession("completed"), arenaSession("completed"), NOW, async (r) => { sent.push(r); });
    assert.equal(again, 0);
  });

  it("chamada fechada fora da janela não avisa", async () => {
    const fake = new FakeFirestore();
    const old = {...arenaSession("completed"), date: "2026-10-01"};
    const n = await onArenaSessionClosedCore(db(fake), "x",
      {...old, status: "scheduled"}, old, NOW, async () => undefined);
    assert.equal(n, 0);
  });

  it("falha num push não derruba os outros", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaClasses/t1/classStudents/carla", {athleteId: "carla"});
    const n = await onArenaSessionClosedCore(db(fake), "s",
      arenaSession("scheduled"), arenaSession("completed"), NOW,
      async (r) => { if (r.uid === "bia") throw new Error("sem token"); });
    assert.equal(n, 1);
  });
});

describe("class-review-notify · centro", () => {
  it("avisa pelo cadastro do aluno (students.uid) quando a aula vira done", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("trainingCenters/elv/students/s1", {uid: "carla"});
    fake.seedDoc("trainingCenters/elv/students/s2", {uid: null});
    const before = {className: "Performance", date: "2026-10-20", status: "scheduled", attendance: {s1: "present", s2: "present", s3: "absent"}};
    const sent: ReviewRequest[] = [];
    const n = await onCenterSessionClosedCore(db(fake), "elv", "c1_2026-10-20",
      before, {...before, status: "done"}, NOW, async (r) => { sent.push(r); });
    assert.equal(n, 1);
    assert.deepEqual(sent[0], {uid: "carla", key: "ct_elv_c1_2026-10-20", title: "Performance"});
  });
});

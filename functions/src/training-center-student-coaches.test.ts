import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  listMakeupCandidatesCore,
  refreshAllStudentCoachesCore,
  refreshStudentCoaches,
  studentsTouchedByClass,
  studentsTouchedBySession,
} from "./training-center-student-coaches";

const C = "trainingCenters/c1";
const NOW = new Date("2026-10-22T15:00:00Z");

function seed() {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {timezone: "America/Sao_Paulo"});
  fake.seedDoc(`${C}/centerMembers/ana`, {uid: "ana", role: "coach", status: "active", extraPerms: []});
  fake.seedDoc(`${C}/centerMembers/rui`, {uid: "rui", role: "coach", status: "active", extraPerms: []});
  fake.seedDoc(`${C}/centerMembers/recep`, {uid: "recep", role: "receptionist", status: "active", extraPerms: []});
  fake.seedDoc(`${C}/classes/k1`, {coachUid: "ana", status: "active", rosterStudentIds: ["bia", "caio"]});
  fake.seedDoc(`${C}/classes/k2`, {coachUid: "rui", status: "active", rosterStudentIds: ["duda"]});
  fake.seedDoc(`${C}/classes/old`, {coachUid: "lia", status: "closed", rosterStudentIds: ["bia"]});
  for (const id of ["bia", "caio", "duda"]) fake.seedDoc(`${C}/students/${id}`, {name: id.toUpperCase(), status: "active", makeupCredits: id === "duda" ? 1 : 0});
  return fake;
}
const db = (f: FakeFirestore) => f as unknown as Firestore;
const coaches = (f: FakeFirestore, id: string) => (f.store.get(`${C}/students/${id}`) as Record<string, unknown>)["coachUids"];

describe("quem vê o aluno", () => {
  it("titular da turma; turma encerrada não conta", async () => {
    const fake = seed();
    await refreshAllStudentCoachesCore(db(fake), NOW);
    assert.deepEqual(coaches(fake, "bia"), ["ana"]);
    assert.deepEqual(coaches(fake, "duda"), ["rui"]);
  });

  it("substituto na janela e reposição em outra turma entram; aula antiga sai", async () => {
    const fake = seed();
    fake.seedDoc(`${C}/sessions/k1_a`, {classId: "k1", date: "2026-10-28", coachUid: "rui", status: "scheduled", makeupStudentIds: []});
    fake.seedDoc(`${C}/sessions/k1_old`, {classId: "k1", date: "2026-08-01", coachUid: "lia", status: "done", makeupStudentIds: []});
    fake.seedDoc(`${C}/sessions/k2_a`, {classId: "k2", date: "2026-10-20", coachUid: "rui", status: "done", makeupStudentIds: ["bia"]});
    await refreshStudentCoaches(db(fake), "c1", ["bia", "caio"], NOW);
    assert.deepEqual(coaches(fake, "bia"), ["ana", "rui"]);
    assert.deepEqual(coaches(fake, "caio"), ["ana", "rui"]);
  });

  it("quais alunos recalcular", () => {
    assert.deepEqual(studentsTouchedByClass({rosterStudentIds: ["a", "b"], coachUid: "x"}, {rosterStudentIds: ["b", "c"], coachUid: "x"}), ["c", "a"]);
    assert.deepEqual(studentsTouchedByClass({rosterStudentIds: ["a"], coachUid: "x"}, {rosterStudentIds: ["a"], coachUid: "y"}), ["a"]);
    assert.deepEqual(studentsTouchedByClass({rosterStudentIds: ["a"], seatsTaken: 1}, {rosterStudentIds: ["a"], seatsTaken: 2}), []);
    assert.deepEqual(studentsTouchedBySession({coachUid: "x", makeupStudentIds: []}, {coachUid: "x", makeupStudentIds: ["m"]}), {makeups: ["m"], classRoster: false});
    assert.deepEqual(studentsTouchedBySession({coachUid: "x", makeupStudentIds: ["m"]}, {coachUid: "y", makeupStudentIds: ["m"]}), {makeups: ["m"], classRoster: true});
    assert.deepEqual(studentsTouchedBySession({coachUid: "x", attendance: {}}, {coachUid: "x", attendance: {a: "present"}}), {makeups: [], classRoster: false});
  });
});

describe("reposição: candidatos só com o mínimo", () => {
  it("professor da aula recebe id, nome e créditos; outro professor não", async () => {
    const fake = seed();
    fake.seedDoc(`${C}/sessions/k1_a`, {classId: "k1", date: "2026-10-23", coachUid: "ana", status: "scheduled"});
    const r = await listMakeupCandidatesCore(db(fake), "ana", {centerId: "c1", sessionId: "k1_a"});
    assert.deepEqual(r.candidates, [{id: "duda", name: "DUDA", makeupCredits: 1}]);
    await assert.rejects(listMakeupCandidatesCore(db(fake), "rui", {centerId: "c1", sessionId: "k1_a"}), /Só o professor da aula/);
    await assert.rejects(listMakeupCandidatesCore(db(fake), "recep", {centerId: "c1", sessionId: "k1_a"}), /Só o professor da aula/);
  });
});

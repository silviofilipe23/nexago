import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {checkInStudentCore, parseCheckinQr} from "./training-center-checkin";
import {loadMyTrainingCentersCore} from "./training-center-athlete";

const C = "trainingCenters/c1";
// Sex 23/10/2026 18:30 em São Paulo.
const NOW = new Date("2026-10-23T21:30:00Z");
const db = (f: FakeFirestore) => f as unknown as Firestore;
const doc = (f: FakeFirestore, path: string) => f.store.get(path) as Record<string, unknown>;

function seed() {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {name: "CT Maré Alta", status: "active", timezone: "America/Sao_Paulo"});
  fake.seedDoc(`${C}/centerMembers/recep`, {uid: "recep", role: "receptionist", status: "active", displayName: "Camila"});
  fake.seedDoc(`${C}/centerMembers/tm`, {uid: "tm", role: "coach", status: "active"});
  fake.seedDoc(`${C}/centerMembers/paula`, {uid: "paula", role: "coach", status: "active"});
  fake.seedDoc(`${C}/students/s1`, {uid: "ana", name: "Marina Teles", status: "active", checkinCode: "ABCDEFGH23"});
  fake.seedDoc(`${C}/students/s2`, {name: "Lucas Prado", status: "active", billingHold: true, checkinCode: "LUCAS23456"});
  fake.seedDoc(`${C}/classes/k1`, {name: "BT Intermediário B", rosterStudentIds: ["s1", "s2"]});
  fake.seedDoc(`${C}/classes/k2`, {name: "Vôlei Avançado", rosterStudentIds: ["s1"]});
  // 19:00 (abre 18:00) e 21:00.
  fake.seedDoc(`${C}/sessions/k1_2026-10-23`, {classId: "k1", className: "BT Intermediário B", date: "2026-10-23",
    startTime: "19:00", durationMin: 60, status: "scheduled", coachUid: "tm", coachName: "Thiago",
    attendance: {s2: "excused"}, attendanceByStudent: {}});
  fake.seedDoc(`${C}/sessions/k2_2026-10-23`, {classId: "k2", className: "Vôlei Avançado", date: "2026-10-23",
    startTime: "21:00", durationMin: 60, status: "scheduled", coachUid: "paula"});
  return fake;
}

describe("check-in do aluno no centro", () => {
  it("QR da carteirinha → presente na aula da janela, com quem fez e auditoria", async () => {
    const fake = seed();
    const r = await checkInStudentCore(db(fake), {uid: "recep"}, {centerId: "c1", qr: "nexago-ct:c1:abcdefgh23"}, NOW);
    assert.equal(r.state, "checked_in");
    assert.equal(r.sessionId, "k1_2026-10-23");
    assert.equal(r.studentName, "Marina Teles");
    const s = doc(fake, `${C}/sessions/k1_2026-10-23`);
    assert.equal((s["attendance"] as Record<string, string>)["s1"], "present");
    assert.equal((s["attendance"] as Record<string, string>)["s2"], "excused", "não pisa no colega");
    assert.equal(((s["checkins"] as Record<string, Record<string, unknown>>)["s1"])!["byName"], "Camila");
    assert.equal([...fake.store.keys()].filter((k) => k.startsWith(`${C}/auditLogs/`)).length, 1);
    const again = await checkInStudentCore(db(fake), {uid: "recep"}, {centerId: "c1", code: "ABCDEFGH23"}, NOW);
    assert.equal(again.state, "already");
  });

  it("mensalidade em atraso devolve a pendência; com force registra", async () => {
    const fake = seed();
    const hold = await checkInStudentCore(db(fake), {uid: "recep"}, {centerId: "c1", studentId: "s2"}, NOW);
    assert.equal(hold.state, "hold");
    assert.equal(hold.billingHold, true);
    assert.equal((doc(fake, `${C}/sessions/k1_2026-10-23`)["attendance"] as Record<string, string>)["s2"], "excused");
    const ok = await checkInStudentCore(db(fake), {uid: "recep"}, {centerId: "c1", studentId: "s2", force: true}, NOW);
    assert.equal(ok.state, "checked_in");
    assert.equal((doc(fake, `${C}/sessions/k1_2026-10-23`)["attendance"] as Record<string, string>)["s2"], "present");
  });

  it("professor só faz check-in nas aulas dele; sem aula hoje e centro errado", async () => {
    const fake = seed();
    const paula = await checkInStudentCore(db(fake), {uid: "paula"}, {centerId: "c1", studentId: "s1"}, NOW);
    assert.equal(paula.sessionId, "k2_2026-10-23", "a de Paula é a próxima dela");
    const late = new Date("2026-10-24T03:00:00Z");
    assert.equal((await checkInStudentCore(db(fake), {uid: "recep"}, {centerId: "c1", studentId: "s1"}, late)).state,
      "no_session");
    const wrong = await checkInStudentCore(db(fake), {uid: "recep"}, {centerId: "c1", qr: "nexago-ct:outro:XYZ"}, NOW);
    assert.equal(wrong.state, "wrong_center");
    await assert.rejects(checkInStudentCore(db(fake), {uid: "zeca"}, {centerId: "c1", studentId: "s1"}, NOW), /equipe/);
    await assert.rejects(checkInStudentCore(db(fake), {uid: "recep"}, {centerId: "c1", qr: "https://x"}, NOW), /carteirinha/);
  });

  it("carteirinha nasce no getMyTrainingCenters e fica a mesma", async () => {
    const fake = seed();
    fake.seedDoc(`${C}/students/s1`, {uid: "ana", name: "Marina Teles", status: "active"});
    fake.seedDoc(`${C}/enrollments/e1`, {studentId: "s1", classId: "k1", status: "active"});
    const a = (await loadMyTrainingCentersCore(db(fake), "ana", NOW)).centers[0]!.checkinCode;
    assert.match(a, /^[A-HJ-NP-Z2-9]{10}$/);
    const b = (await loadMyTrainingCentersCore(db(fake), "ana", NOW)).centers[0]!.checkinCode;
    assert.equal(a, b);
    assert.deepEqual(parseCheckinQr(`nexago-ct:c1:${a.toLowerCase()}`), {centerId: "c1", code: a});
  });
});

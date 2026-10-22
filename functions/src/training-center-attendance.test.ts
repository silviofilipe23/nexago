import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {applySessionAttendanceEffects, sessionEffectsInputChanged} from "./training-center-attendance";
import {desiredEffects, effectDeltas, type ClassEnrollment, type EffectPolicies} from "./training-center-attendance-model";

const POL: EffectPolicies = {unexcusedAbsenceConsumes: true, excusedAbsenceMakeup: true};
const pack = (studentId: string, id = `e-${studentId}`): ClassEnrollment => ({id, studentId, planType: "class_pack", policies: POL});
const monthly = (studentId: string): ClassEnrollment => ({id: `e-${studentId}`, studentId, planType: "monthly", policies: POL});

describe("desiredEffects", () => {
  it("aula não finalizada não tem efeito", () => {
    assert.deepEqual(desiredEffects({status: "scheduled", attendance: {a: "present"}, makeupStudentIds: [], enrollments: [pack("a")], centerPolicies: POL}), {});
  });

  it("pacote: presença e falta não justificada consomem; justificada não", () => {
    const e = desiredEffects({
      status: "done",
      attendance: {a: "present", b: "absent", c: "excused"},
      makeupStudentIds: [],
      enrollments: [pack("a"), pack("b"), pack("c")],
      centerPolicies: POL,
    });
    assert.deepEqual(e, {a: {enrollmentId: "e-a", credit: -1, makeup: 0}, b: {enrollmentId: "e-b", credit: -1, makeup: 0}});
  });

  it("falta não justificada não consome quando o contrato diz que não", () => {
    const e = desiredEffects({
      status: "done",
      attendance: {b: "absent"},
      makeupStudentIds: [],
      enrollments: [{...pack("b"), policies: {...POL, unexcusedAbsenceConsumes: false}}],
      centerPolicies: POL,
    });
    assert.deepEqual(e, {});
  });

  it("mensalista: justificada gera reposição; presença não mexe em nada", () => {
    const e = desiredEffects({status: "done", attendance: {m: "excused", n: "present"}, makeupStudentIds: [], enrollments: [monthly("m"), monthly("n")], centerPolicies: POL});
    assert.deepEqual(e, {m: {enrollmentId: null, credit: 0, makeup: 1}});
  });

  it("aluno de reposição gasta 1 crédito de reposição ao comparecer", () => {
    const e = desiredEffects({status: "done", attendance: {r: "present"}, makeupStudentIds: ["r"], enrollments: [], centerPolicies: POL});
    assert.deepEqual(e, {r: {enrollmentId: null, credit: 0, makeup: -1}});
  });
});

describe("effectDeltas", () => {
  it("correção da chamada aplica só a diferença", () => {
    const applied = {a: {enrollmentId: "e-a", credit: -1, makeup: 0}};
    assert.deepEqual(effectDeltas(applied, applied), []);
    // presente → justificada: devolve o crédito
    assert.deepEqual(effectDeltas(applied, {}), [{studentId: "a", enrollmentId: "e-a", credit: 1, makeup: 0}]);
  });
});

describe("sessionEffectsInputChanged", () => {
  it("ignora a escrita do próprio effectsApplied", () => {
    const s = {status: "done", attendance: {a: "present"}, makeupStudentIds: []};
    assert.equal(sessionEffectsInputChanged(s, {...s, effectsApplied: {}}), false);
    assert.equal(sessionEffectsInputChanged({...s, status: "scheduled"}, s), true);
  });
});

describe("applySessionAttendanceEffects", () => {
  const C = "trainingCenters/c1";
  function seed() {
    const db = new FakeFirestore();
    db.seedDoc(C, {policies: POL});
    db.seedDoc(`${C}/sessions/s1`, {classId: "k1", status: "done", attendance: {a: "present", m: "excused", r: "present"}, makeupStudentIds: ["r"]});
    db.seedDoc(`${C}/enrollments/e-a`, {classId: "k1", studentId: "a", status: "active", creditsLeft: 8, contract: {planType: "class_pack", policies: POL}});
    db.seedDoc(`${C}/enrollments/e-m`, {classId: "k1", studentId: "m", status: "active", creditsLeft: null, contract: {planType: "monthly", policies: POL}});
    db.seedDoc(`${C}/enrollments/old`, {classId: "k1", studentId: "a", status: "cancelled", creditsLeft: 4, contract: {planType: "class_pack", policies: POL}});
    db.seedDoc(`${C}/students/a`, {makeupCredits: 0});
    db.seedDoc(`${C}/students/m`, {makeupCredits: 0});
    db.seedDoc(`${C}/students/r`, {makeupCredits: 2});
    return db;
  }
  const read = async (db: FakeFirestore, p: string) => (await db.doc(p).get()).data() as Record<string, unknown>;

  it("finalizar aplica créditos uma vez só", async () => {
    const db = seed();
    const fs = db as unknown as Firestore;
    assert.equal(await applySessionAttendanceEffects(fs, "c1", "s1"), 3);
    assert.equal((await read(db, `${C}/enrollments/e-a`))["creditsLeft"], 7);
    assert.equal((await read(db, `${C}/enrollments/old`))["creditsLeft"], 4);
    assert.equal((await read(db, `${C}/students/m`))["makeupCredits"], 1);
    assert.equal((await read(db, `${C}/students/r`))["makeupCredits"], 1);
    // segunda execução (gatilho repetido) não muda nada
    assert.equal(await applySessionAttendanceEffects(fs, "c1", "s1"), 0);
    assert.equal((await read(db, `${C}/enrollments/e-a`))["creditsLeft"], 7);
  });

  it("corrigir presença → justificada devolve o crédito; reabrir desfaz tudo", async () => {
    const db = seed();
    const fs = db as unknown as Firestore;
    await applySessionAttendanceEffects(fs, "c1", "s1");
    await db.doc(`${C}/sessions/s1`).update({attendance: {a: "excused", m: "excused", r: "present"}});
    await applySessionAttendanceEffects(fs, "c1", "s1");
    assert.equal((await read(db, `${C}/enrollments/e-a`))["creditsLeft"], 8);
    await db.doc(`${C}/sessions/s1`).update({status: "scheduled"});
    await applySessionAttendanceEffects(fs, "c1", "s1");
    assert.equal((await read(db, `${C}/students/m`))["makeupCredits"], 0);
    assert.equal((await read(db, `${C}/students/r`))["makeupCredits"], 2);
  });
});

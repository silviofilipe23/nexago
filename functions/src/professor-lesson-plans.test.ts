import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {parseLessonPlanInput, studentViewOf} from "./professor-lesson-plans";

const raw = {
  kind: "session", refId: "s1", objective: "Saque com direção", tags: ["saque", "xx"],
  blocks: [
    {name: "Aquecimento", minutes: 8, category: "fisico", note: "privada", notePublic: false},
    {name: "Saque em zonas", minutes: 15, category: "saque", note: "Ênfase na zona", notePublic: true},
  ],
  focus: [
    {athleteId: "a1", text: "Flexionar o joelho", public: true},
    {athleteId: "a2", text: "Dor no ombro — sem smash", public: false},
    {athleteId: "a1", text: "duplicado", public: true},
  ],
  published: true,
};

describe("plano de aula", () => {
  it("valida blocos e limpa tags/foco", () => {
    const p = parseLessonPlanInput(raw);
    assert.deepEqual(p.tags, ["saque"]);
    assert.equal(p.focus.length, 2);
    assert.throws(() => parseLessonPlanInput({...raw, blocks: [{name: "", minutes: 5}]}), /nome ao bloco 1/);
    assert.throws(() => parseLessonPlanInput({...raw, blocks: [{name: "x", minutes: 0}]}), /de 1 a 120/);
    assert.throws(() => parseLessonPlanInput({...raw, kind: "outra"}), /Aula inválida/);
  });

  it("visão do aluno: sem nota privada e só o foco dele, se público", () => {
    const p = parseLessonPlanInput(raw);
    const a1 = studentViewOf(p, "a1");
    assert.equal(a1.myFocus, "Flexionar o joelho");
    assert.deepEqual(a1.blocks.map((b) => b.note), ["", "Ênfase na zona"]);
    assert.equal(a1.durationMin, 23);
    assert.equal(studentViewOf(p, "a2").myFocus, null, "foco privado não vai");
    assert.ok(!JSON.stringify(studentViewOf(p, "a2")).includes("ombro"));
    assert.ok(!JSON.stringify(a1).includes("privada"));
  });
});

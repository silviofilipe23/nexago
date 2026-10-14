import {strict as assert} from "node:assert";
import {test} from "node:test";
import {
  COACH_AREAS,
  COACH_STAFF_ROLES,
  coachRoleCanRead,
  coachRoleCanWrite,
  isCoachStaffRole,
  type CoachArea,
  type CoachStaffRole,
} from "./coach-staff-roles";

test("isCoachStaffRole aceita so os quatro cargos", () => {
  for (const r of ["auxiliar", "preparador_fisico", "fisioterapeuta", "psicologo"]) {
    assert.equal(isCoachStaffRole(r), true, r);
  }
  for (const r of ["principal", "dono", "", undefined, null, 3]) {
    assert.equal(isCoachStaffRole(r), false, String(r));
  }
});

test("escrita implica leitura em toda area e cargo", () => {
  for (const role of COACH_STAFF_ROLES) {
    for (const area of COACH_AREAS) {
      if (coachRoleCanWrite(role, area)) {
        assert.equal(coachRoleCanRead(role, area), true, `${role}/${area}`);
      }
    }
  }
});

test("matriz exata por cargo", () => {
  const expected: Record<CoachStaffRole, {w: CoachArea[]; r: CoachArea[]}> = {
    auxiliar: {w: ["treinos", "convocacoes", "comunicacao"], r: ["atletas", "avaliacoes"]},
    preparador_fisico: {w: ["fisico"], r: ["atletas", "treinos", "avaliacoes"]},
    fisioterapeuta: {w: ["saude"], r: ["atletas", "treinos", "fisico"]},
    psicologo: {w: ["mental"], r: ["atletas"]},
  };
  for (const role of COACH_STAFF_ROLES) {
    const writes = COACH_AREAS.filter((a) => coachRoleCanWrite(role, a));
    const reads = COACH_AREAS.filter((a) => coachRoleCanRead(role, a) && !coachRoleCanWrite(role, a));
    assert.deepEqual(writes.slice().sort(), expected[role].w.slice().sort(), `${role} escreve`);
    assert.deepEqual(reads.slice().sort(), expected[role].r.slice().sort(), `${role} so le`);
  }
});

test("nenhum cargo de staff toca financeiro nem equipe", () => {
  for (const role of COACH_STAFF_ROLES) {
    for (const area of ["financeiro", "equipe"] as const) {
      assert.equal(coachRoleCanRead(role, area), false, `${role}/${area} le`);
      assert.equal(coachRoleCanWrite(role, area), false, `${role}/${area} escreve`);
    }
  }
});

test("cargo invalido nao ganha nada", () => {
  assert.equal(coachRoleCanRead("hacker" as CoachStaffRole, "atletas"), false);
  assert.equal(coachRoleCanWrite("hacker" as CoachStaffRole, "treinos"), false);
});

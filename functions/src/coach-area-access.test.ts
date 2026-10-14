import {strict as assert} from "node:assert";
import {test} from "node:test";
import {decideCoachAreaAccess, resolveCoachUid} from "./coach-area-access";

test("dono sempre pode, em toda area e modo", () => {
  assert.equal(decideCoachAreaAccess("c1", "c1", null, "financeiro", "write"), true);
  assert.equal(decideCoachAreaAccess("c1", "c1", null, "equipe", "read"), true);
});

test("estranho sem vinculo e negado", () => {
  assert.equal(decideCoachAreaAccess("c1", "x", null, "atletas", "read"), false);
});

test("membro segue a matriz do cargo", () => {
  const aux = {role: "auxiliar"};
  assert.equal(decideCoachAreaAccess("c1", "m", aux, "treinos", "write"), true);
  assert.equal(decideCoachAreaAccess("c1", "m", aux, "atletas", "read"), true);
  assert.equal(decideCoachAreaAccess("c1", "m", aux, "atletas", "write"), false);
  assert.equal(decideCoachAreaAccess("c1", "m", aux, "saude", "read"), false);
});

test("cargo desconhecido ou ausente no doc staff nega tudo", () => {
  for (const staff of [{role: "dono"}, {role: ""}, {}, {role: 7}]) {
    assert.equal(decideCoachAreaAccess("c1", "m", staff, "atletas", "read"), false);
  }
});

test("membro de OUTRO treinador nao passa: staffData e do vinculo com coachUid pedido", () => {
  // o chamador carrega staff do coachUid pedido; sem doc => null => nega
  assert.equal(decideCoachAreaAccess("B", "m", null, "atletas", "read"), false);
});

test("resolveCoachUid: default e quem chama; payload vazio ou so espacos tambem", () => {
  assert.equal(resolveCoachUid({}, "me"), "me");
  assert.equal(resolveCoachUid(undefined, "me"), "me");
  assert.equal(resolveCoachUid({coachUid: "  "}, "me"), "me");
  assert.equal(resolveCoachUid({coachUid: " c1 "}, "me"), "c1");
  assert.equal(resolveCoachUid({coachUid: 42}, "me"), "me");
});

test("contrato das callables: payload sem coachUid opera como hoje (dono)", () => {
  const caller = "u1";
  const coachUid = resolveCoachUid({squadId: "s"}, caller);
  assert.equal(coachUid, caller);
  assert.equal(decideCoachAreaAccess(coachUid, caller, null, "convocacoes", "write"), true);
});

test("contrato: coachUid forjado de outro treinador sem vinculo nega", () => {
  const coachUid = resolveCoachUid({coachUid: "B"}, "u1");
  assert.equal(coachUid, "B");
  assert.equal(decideCoachAreaAccess(coachUid, "u1", null, "convocacoes", "write"), false);
});

test("contrato: psicologo nao envia convocacao, auxiliar envia", () => {
  assert.equal(decideCoachAreaAccess("B", "m", {role: "psicologo"}, "convocacoes", "write"), false);
  assert.equal(decideCoachAreaAccess("B", "m", {role: "auxiliar"}, "convocacoes", "write"), true);
});

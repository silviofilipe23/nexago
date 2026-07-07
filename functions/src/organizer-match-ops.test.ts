import assert from "node:assert/strict";
import {test} from "node:test";

import {canFillBracketSlot} from "./category-bracket-advance";
import {
  isMatchAutoSchedulable,
  shouldPropagateMatchAdvance,
} from "./organizer-match-ops";

test("canFillBracketSlot preenche slot vazio de partida não iniciada", () => {
  assert.equal(
    canFillBracketSlot({status: "Scheduled", teamAId: ""}, "teamAId", "t1"),
    true,
  );
});

test("canFillBracketSlot é no-op quando o slot já tem o mesmo time", () => {
  assert.equal(
    canFillBracketSlot({status: "Scheduled", teamAId: "t1"}, "teamAId", "t1"),
    false,
  );
});

test("canFillBracketSlot corrige slot com time diferente se ainda não começou", () => {
  assert.equal(
    canFillBracketSlot({status: "Scheduled", teamAId: "t2"}, "teamAId", "t1"),
    true,
  );
});

test("canFillBracketSlot não sobrescreve partida em andamento", () => {
  assert.equal(
    canFillBracketSlot({status: "In Progress", teamAId: "t2"}, "teamAId", "t1"),
    false,
  );
  assert.equal(
    canFillBracketSlot({status: "in_progress", teamAId: ""}, "teamAId", "t1"),
    false,
  );
});

test("canFillBracketSlot não sobrescreve partida concluída", () => {
  assert.equal(
    canFillBracketSlot({status: "Completed", teamBId: "t2"}, "teamBId", "t1"),
    false,
  );
});

test("shouldPropagateMatchAdvance dispara ao concluir com vencedor", () => {
  assert.equal(
    shouldPropagateMatchAdvance(
      {status: "In Progress"},
      {status: "Completed", winnerId: "t1"},
    ),
    true,
  );
});

test("shouldPropagateMatchAdvance ignora partida sem vencedor", () => {
  assert.equal(
    shouldPropagateMatchAdvance(
      {status: "In Progress"},
      {status: "Completed", winnerId: ""},
    ),
    false,
  );
});

test("shouldPropagateMatchAdvance é idempotente quando nada relevante muda", () => {
  assert.equal(
    shouldPropagateMatchAdvance(
      {status: "Completed", winnerId: "t1"},
      {status: "Completed", winnerId: "t1"},
    ),
    false,
  );
});

test("shouldPropagateMatchAdvance redispara quando o vencedor é corrigido", () => {
  assert.equal(
    shouldPropagateMatchAdvance(
      {status: "Completed", winnerId: "t1"},
      {status: "Completed", winnerId: "t2"},
    ),
    true,
  );
});

test("isMatchAutoSchedulable ignora dependência quando respectBracketDeps é false", () => {
  assert.equal(
    isMatchAutoSchedulable({teamAId: "", teamBId: ""}, false),
    true,
  );
});

test("isMatchAutoSchedulable pula placeholder de chave (time ainda não decidido)", () => {
  assert.equal(
    isMatchAutoSchedulable({teamAId: "", teamBId: ""}, true),
    false,
  );
  assert.equal(
    isMatchAutoSchedulable({teamAId: "t1", teamBId: ""}, true),
    false,
  );
});

test("isMatchAutoSchedulable libera partida com as duas duplas já decididas", () => {
  assert.equal(
    isMatchAutoSchedulable({teamAId: "t1", teamBId: "t2"}, true),
    true,
  );
});

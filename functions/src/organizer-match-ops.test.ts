import assert from "node:assert/strict";
import {test} from "node:test";

import {canFillBracketSlot} from "./category-bracket-advance";
import {
  compareByMatchNumber,
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

test("compareByMatchNumber ordena pela numeração global, não por round por trilha", () => {
  // Em dupla eliminação, WB, LB, 3º lugar e final reiniciam `round` em 1 cada
  // um na sua própria trilha. Se a auto-programação ordenasse por round antes
  // do matchNumber, 3º lugar e final (round 1 nas suas trilhas) entrariam
  // antes da WB round 2 — regressão que esta função corrige.
  const matches = [
    {id: "final", matchNumber: 6, round: 1},
    {id: "wb-r2", matchNumber: 3, round: 2},
    {id: "third-place", matchNumber: 5, round: 1},
    {id: "wb-r1-b", matchNumber: 2, round: 1},
    {id: "lb-r1", matchNumber: 4, round: 1},
    {id: "wb-r1-a", matchNumber: 1, round: 1},
  ];

  const sorted = [...matches].sort(compareByMatchNumber);

  assert.deepEqual(
    sorted.map((m) => m.id),
    ["wb-r1-a", "wb-r1-b", "wb-r2", "lb-r1", "third-place", "final"],
  );
});

test("compareByMatchNumber coloca a final por último mesmo entrando em primeiro", () => {
  const matches = [
    {id: "final", matchNumber: 10},
    {id: "wb-r1", matchNumber: 1},
  ];

  const [first, last] = [...matches].sort(compareByMatchNumber);

  assert.equal(first.id, "wb-r1");
  assert.equal(last.id, "final");
});

test("compareByMatchNumber trata matchNumber ausente como 0", () => {
  const matches: Array<{id: string; matchNumber?: number}> = [
    {id: "a", matchNumber: 5},
    {id: "b"},
  ];

  const sorted = [...matches].sort(compareByMatchNumber);

  assert.deepEqual(sorted.map((m) => m.id), ["b", "a"]);
});

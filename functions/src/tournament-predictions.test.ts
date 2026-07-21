import assert from "node:assert/strict";
import {test} from "node:test";
import {HttpsError} from "firebase-functions/v2/https";

import {
  assertPickIsAllowed,
  bracketPredictionEntryPath,
  bracketPredictionEventId,
  computeChampionPickPoints,
  computeMatchPickPoints,
  CHAMPION_PICK_POINTS,
  MATCH_PICK_POINTS,
} from "./tournament-predictions";

function assertThrowsHttpsError(fn: () => void, code: string): void {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof HttpsError, "esperava HttpsError");
    assert.equal((error as HttpsError).code, code);
    return;
  }
  assert.fail("esperava que a função lançasse HttpsError");
}

// —— assertPickIsAllowed: pick aceito enquanto Scheduled ——

test("assertPickIsAllowed aceita pick em partida Scheduled pertencente ao torneio", () => {
  assert.doesNotThrow(() =>
    assertPickIsAllowed(
      {tournamentId: "t1", status: "Scheduled", teamAId: "team-a", teamBId: "team-b"},
      "t1",
      "team-a",
    ),
  );
});

test("assertPickIsAllowed aceita escolha do time B", () => {
  assert.doesNotThrow(() =>
    assertPickIsAllowed(
      {tournamentId: "t1", status: "Scheduled", teamAId: "team-a", teamBId: "team-b"},
      "t1",
      "team-b",
    ),
  );
});

// —— pick rejeitado após início da partida ——

test("assertPickIsAllowed rejeita partida In Progress", () => {
  assertThrowsHttpsError(
    () =>
      assertPickIsAllowed(
        {tournamentId: "t1", status: "In Progress", teamAId: "team-a", teamBId: "team-b"},
        "t1",
        "team-a",
      ),
    "failed-precondition",
  );
});

test("assertPickIsAllowed rejeita partida Completed", () => {
  assertThrowsHttpsError(
    () =>
      assertPickIsAllowed(
        {tournamentId: "t1", status: "Completed", teamAId: "team-a", teamBId: "team-b"},
        "t1",
        "team-a",
      ),
    "failed-precondition",
  );
});

test("assertPickIsAllowed rejeita partida inexistente", () => {
  assertThrowsHttpsError(
    () => assertPickIsAllowed(undefined, "t1", "team-a"),
    "not-found",
  );
});

test("assertPickIsAllowed rejeita partida de outro torneio", () => {
  assertThrowsHttpsError(
    () =>
      assertPickIsAllowed(
        {tournamentId: "t2", status: "Scheduled", teamAId: "team-a", teamBId: "team-b"},
        "t1",
        "team-a",
      ),
    "invalid-argument",
  );
});

test("assertPickIsAllowed rejeita id de vencedor que não é nenhum dos dois competidores", () => {
  assertThrowsHttpsError(
    () =>
      assertPickIsAllowed(
        {tournamentId: "t1", status: "Scheduled", teamAId: "team-a", teamBId: "team-b"},
        "t1",
        "team-c",
      ),
    "invalid-argument",
  );
});

// —— pontuação correta quando resultado bate/não bate com o palpite ——

test("computeMatchPickPoints soma pontos quando o palpite acerta o vencedor", () => {
  assert.equal(
    computeMatchPickPoints({picks: {"m1": "team-a"}}, "m1", "team-a"),
    MATCH_PICK_POINTS,
  );
});

test("computeMatchPickPoints não soma pontos quando o palpite erra o vencedor", () => {
  assert.equal(
    computeMatchPickPoints({picks: {"m1": "team-b"}}, "m1", "team-a"),
    0,
  );
});

test("computeMatchPickPoints não soma pontos quando não há palpite para a partida", () => {
  assert.equal(computeMatchPickPoints({picks: {}}, "m1", "team-a"), 0);
  assert.equal(computeMatchPickPoints({}, "m1", "team-a"), 0);
});

test("computeChampionPickPoints soma bônus só na final e quando acerta o campeão", () => {
  assert.equal(
    computeChampionPickPoints({championPick: "team-a"}, true, "team-a"),
    CHAMPION_PICK_POINTS,
  );
});

test("computeChampionPickPoints não soma bônus fora da final mesmo acertando o id", () => {
  assert.equal(
    computeChampionPickPoints({championPick: "team-a"}, false, "team-a"),
    0,
  );
});

test("computeChampionPickPoints não soma bônus quando erra o campeão", () => {
  assert.equal(
    computeChampionPickPoints({championPick: "team-b"}, true, "team-a"),
    0,
  );
});

test("computeChampionPickPoints não soma bônus sem championPick definido", () => {
  assert.equal(computeChampionPickPoints({}, true, "team-a"), 0);
});

// —— helpers de path/ids ——

test("bracketPredictionEntryPath monta o caminho do doc de entrada", () => {
  assert.equal(
    bracketPredictionEntryPath(" t1 ", " u1 "),
    "tournamentPredictions/t1/entries/u1",
  );
});

test("bracketPredictionEventId é estável e determinístico por (match, usuário)", () => {
  assert.equal(
    bracketPredictionEventId(" m1 ", " u1 "),
    "bracket_prediction_m1_u1",
  );
  assert.equal(
    bracketPredictionEventId("m1", "u1"),
    bracketPredictionEventId("m1", "u1"),
  );
});

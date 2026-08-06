import assert from "node:assert/strict";
import {test} from "node:test";
import {HttpsError} from "firebase-functions/v2/https";

import {
  assertPickIsAllowed,
  bracketPredictionEntryPath,
  bracketPredictionEventId,
  buildPredictionEntryPatch,
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

// —— formato gravado no doc de entrada ——

test("buildPredictionEntryPatch grava picks como MAPA aninhado, não como campo com ponto no nome", () => {
  const patch = buildPredictionEntryPatch({
    userId: "u1",
    picks: {m1: "team-a", m2: "team-b"},
    isNewEntry: true,
  });

  // Regressão: `set(..., {merge: true})` NÃO interpreta pontos como caminho de
  // campo (só `update()` faz isso). Um patch com a chave `picks.m1` criava um
  // campo de nome literal "picks.m1" e o mapa `picks` nunca existia — o app
  // lia `data['picks']` vazio e o palpite "sumia" ao reabrir a tela.
  assert.deepEqual(patch.picks, {m1: "team-a", m2: "team-b"});
  for (const key of Object.keys(patch)) {
    assert.ok(
      !key.includes("."),
      `chave de topo "${key}" tem ponto — viraria um campo literal no Firestore`,
    );
  }
});

test("buildPredictionEntryPatch omite `picks` quando não há pick novo", () => {
  const patch = buildPredictionEntryPatch({
    userId: "u1",
    picks: {},
    championPick: "team-a",
    isNewEntry: false,
  });

  // Um `picks: {}` explícito entra no document mask como o caminho `picks` e
  // o merge SUBSTITUIRIA o mapa inteiro por vazio, apagando os palpites já
  // salvos (ex.: envio só do campeão depois que a final travou).
  assert.ok(!("picks" in patch), "não deve enviar `picks` vazio");
  assert.equal(patch.championPick, "team-a");
});

test("buildPredictionEntryPatch só inicializa score/submittedAt em entrada nova", () => {
  const novo = buildPredictionEntryPatch({
    userId: "u1",
    picks: {m1: "team-a"},
    isNewEntry: true,
  });
  assert.equal(novo.score, 0);
  assert.ok("submittedAt" in novo);

  const existente = buildPredictionEntryPatch({
    userId: "u1",
    picks: {m1: "team-a"},
    isNewEntry: false,
  });
  // Reescrever score zeraria os pontos já creditados pelo trigger.
  assert.ok(!("score" in existente));
  assert.ok(!("submittedAt" in existente));
  assert.equal(existente.userId, "u1");
});

test("buildPredictionEntryPatch omite championPick quando não informado", () => {
  const patch = buildPredictionEntryPatch({
    userId: "u1",
    picks: {m1: "team-a"},
    isNewEntry: false,
  });
  assert.ok(!("championPick" in patch));
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

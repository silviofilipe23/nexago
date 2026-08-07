import assert from "node:assert/strict";
import {test} from "node:test";
import {HttpsError} from "firebase-functions/v2/https";

import {
  assertPickIsAllowed,
  bracketPredictionEntryPath,
  bracketPredictionEventId,
  buildPredictionEntryPatch,
  comparePredictionRanking,
  computeChampionPickPoints,
  computeMatchPickPoints,
  rankPredictionEntries,
  snapshotPredictionRanks,
  CHAMPION_PICK_POINTS,
  MATCH_PICK_POINTS,
  RANK_SNAPSHOT_BATCH_SIZE,
  type PredictionRankingEntry,
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

// —— ordem canônica do ranking (tem de bater com web e app) ——

function entry(
  userId: string,
  score: number,
  picksCount = 0,
): PredictionRankingEntry {
  return {userId, score, picksCount};
}

test("comparePredictionRanking ordena por pontuação decrescente", () => {
  assert.ok(comparePredictionRanking(entry("a", 10), entry("b", 4)) < 0);
  assert.ok(comparePredictionRanking(entry("a", 4), entry("b", 10)) > 0);
});

test("comparePredictionRanking desempata por número de palpites", () => {
  assert.ok(comparePredictionRanking(entry("a", 5, 9), entry("b", 5, 3)) < 0);
});

// O desempate por id compara code units, nunca `localeCompare`: uids do Firebase
// misturam maiúsculas e minúsculas, e `localeCompare` põe 'a' antes de 'B'
// enquanto o `compareTo` do Dart (app) põe 'B' antes de 'a'.
test("comparePredictionRanking desempata por id em code unit, não por locale", () => {
  assert.ok(comparePredictionRanking(entry("B1", 5, 2), entry("a1", 5, 2)) < 0);
  assert.equal("B1".localeCompare("a1") > 0, true, "premissa: localeCompare discordaria");
});

test("rankPredictionEntries numera as posições de 1 a N", () => {
  const ranks = rankPredictionEntries([
    entry("meio", 5, 4),
    entry("topo", 9, 2),
    entry("fundo", 1, 7),
  ]);
  assert.equal(ranks.get("topo"), 1);
  assert.equal(ranks.get("meio"), 2);
  assert.equal(ranks.get("fundo"), 3);
});

// —— foto das posições ——

interface FakeWrite {
  path: string;
  data: Record<string, unknown>;
}

function fakeDb(): {db: unknown; writes: FakeWrite[]; commits: number} {
  const writes: FakeWrite[] = [];
  const state = {commits: 0};
  const db = {
    doc: (path: string) => ({path}),
    batch: () => ({
      set: (ref: {path: string}, data: Record<string, unknown>) => {
        writes.push({path: ref.path, data});
      },
      commit: async () => {
        state.commits++;
      },
    }),
  };
  return {
    db,
    writes,
    get commits() {
      return state.commits;
    },
  } as {db: unknown; writes: FakeWrite[]; commits: number};
}

test("snapshotPredictionRanks grava previousRank em TODAS as entries", async () => {
  const fake = fakeDb();
  await snapshotPredictionRanks(fake.db as never, {
    tournamentId: "t1",
    entries: [entry("u-topo", 9), entry("u-meio", 5), entry("u-fundo", 0)],
  });

  assert.equal(fake.writes.length, 3, "quem não pontuou também muda de posição");
  const byPath = new Map(fake.writes.map((w) => [w.path, w.data]));
  assert.equal(byPath.get("tournamentPredictions/t1/entries/u-topo")?.previousRank, 1);
  assert.equal(byPath.get("tournamentPredictions/t1/entries/u-meio")?.previousRank, 2);
  assert.equal(byPath.get("tournamentPredictions/t1/entries/u-fundo")?.previousRank, 3);
});

test("snapshotPredictionRanks não grava a posição atual, só a anterior", async () => {
  const fake = fakeDb();
  await snapshotPredictionRanks(fake.db as never, {
    tournamentId: "t1",
    entries: [entry("u1", 3)],
  });
  assert.deepEqual(Object.keys(fake.writes[0].data).sort(), ["previousRank", "rankUpdatedAt"]);
});

test("snapshotPredictionRanks fatia em lotes abaixo do limite do Firestore", async () => {
  const fake = fakeDb();
  const entries = Array.from({length: RANK_SNAPSHOT_BATCH_SIZE + 10}, (_, i) =>
    entry(`u${String(i).padStart(4, "0")}`, i),
  );
  await snapshotPredictionRanks(fake.db as never, {tournamentId: "t1", entries});

  assert.equal(fake.writes.length, entries.length);
  assert.equal(fake.commits, 2);
});

test("snapshotPredictionRanks ignora torneio ou lista vazios", async () => {
  const fake = fakeDb();
  await snapshotPredictionRanks(fake.db as never, {tournamentId: "  ", entries: [entry("u1", 1)]});
  await snapshotPredictionRanks(fake.db as never, {tournamentId: "t1", entries: []});
  assert.equal(fake.writes.length, 0);
  assert.equal(fake.commits, 0);
});

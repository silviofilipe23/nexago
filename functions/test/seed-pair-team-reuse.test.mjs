import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {
  resolveSeedPairTeams,
  applyPaidPlans,
} = require("../scripts/seed-tournament-enrollments-lib");

/** Plano como `buildPairPlans` o entrega. */
function plan(categoryId, uid1, uid2) {
  return {
    categoryId,
    category: {id: categoryId, entryFee: 100},
    player1: {uid: uid1},
    player2: {uid: uid2},
  };
}

/** Índice `pairKey -> candidatos`, como sai da leitura das equipes de dupla. */
function index(entries) {
  return new Map(Object.entries(entries));
}

describe("seed: identidade da dupla", () => {
  it("dupla sem equipe no banco nasce com pairKey", () => {
    const [resolved] = resolveSeedPairTeams([plan("cat1", "aaa", "bbb")], index({}), new Set());

    assert.equal(resolved.reuseTeamId, null);
    assert.equal(resolved.pairKey, "aaa:bbb");
  });

  it("dupla que já tem equipe REUSA o doc em vez de criar outro", () => {
    const [resolved] = resolveSeedPairTeams(
      [plan("cat1", "bbb", "aaa")],
      index({"aaa:bbb": [{id: "team-velho", createdAtMs: 10}]}),
      new Set(),
    );

    // A chave é independente da ordem dos uids — o par (B,A) é o mesmo (A,B).
    assert.equal(resolved.pairKey, "aaa:bbb");
    assert.equal(resolved.reuseTeamId, "team-velho");
  });

  it("entre candidatos, o mais antigo vence (desempate pelo id)", () => {
    const [resolved] = resolveSeedPairTeams(
      [plan("cat1", "aaa", "bbb")],
      index({
        "aaa:bbb": [
          {id: "zz", createdAtMs: 50},
          {id: "aa", createdAtMs: 10},
          {id: "AA", createdAtMs: 10},
        ],
      }),
      new Set(),
    );

    assert.equal(resolved.reuseTeamId, "AA");
  });

  it("equipe já inscrita NESTE torneio não é reusada: a 2ª categoria ganha doc próprio", () => {
    const [resolved] = resolveSeedPairTeams(
      [plan("cat2", "aaa", "bbb")],
      index({"aaa:bbb": [{id: "team-velho", createdAtMs: 10}]}),
      new Set(["team-velho"]),
    );

    assert.equal(resolved.reuseTeamId, null);
    assert.equal(resolved.pairKey, "aaa:bbb");
  });

  it("o mesmo par em duas categorias do lote: só o primeiro reusa", () => {
    const resolved = resolveSeedPairTeams(
      [plan("cat1", "aaa", "bbb"), plan("cat2", "aaa", "bbb")],
      index({"aaa:bbb": [{id: "team-velho", createdAtMs: 10}]}),
      new Set(),
    );

    assert.equal(resolved[0].reuseTeamId, "team-velho");
    // Sem isso, as duas inscrições apontariam para o MESMO teamId e quebrariam
    // "um teamId = uma chave", que os leitores de campanha assumem.
    assert.equal(resolved[1].reuseTeamId, null);
  });

  it("par inválido (uid repetido) não ganha pairKey nem reuso", () => {
    const [resolved] = resolveSeedPairTeams([plan("cat1", "aaa", "aaa")], index({}), new Set());

    assert.equal(resolved.pairKey, "");
    assert.equal(resolved.reuseTeamId, null);
  });
});

/** Fake mínimo do Firestore: só o que `applyPaidPlans` usa. */
function fakeDb() {
  const writes = [];
  let generated = 0;
  return {
    writes,
    batch: () => ({
      set: (ref, data) => writes.push({collection: ref.collection, id: ref.id, data}),
      commit: async () => {},
    }),
    collection: (path) => ({
      doc: (id) => ({collection: path, id: id ?? `gen-${++generated}`}),
    }),
  };
}

const TOURNAMENT = {categories: [{id: "cat1", entryFee: 100}, {id: "cat2", entryFee: 100}]};

describe("seed: fiação da gravação", () => {
  it("plano com reuso não cria equipe, e a inscrição aponta para a equipe reusada", async () => {
    const db = fakeDb();
    const plans = resolveSeedPairTeams(
      [plan("cat1", "aaa", "bbb")],
      index({"aaa:bbb": [{id: "team-velho", createdAtMs: 10}]}),
      new Set(),
    );

    await applyPaidPlans(db, "proj", "torneio1", TOURNAMENT, plans);

    const teamWrites = db.writes.filter((w) => w.collection.endsWith("/teams"));
    const regWrites = db.writes.filter((w) => w.collection.endsWith("/inscriptions"));
    assert.equal(teamWrites.length, 0, "não pode nascer equipe nova para um par que já tem doc");
    assert.equal(regWrites.length, 1);
    assert.equal(regWrites[0].data.teamId, "team-velho");
  });

  it("plano sem reuso cria a equipe COM pairKey", async () => {
    const db = fakeDb();
    const plans = resolveSeedPairTeams([plan("cat1", "aaa", "bbb")], index({}), new Set());

    await applyPaidPlans(db, "proj", "torneio1", TOURNAMENT, plans);

    const teamWrites = db.writes.filter((w) => w.collection.endsWith("/teams"));
    assert.equal(teamWrites.length, 1);
    // Sem o campo, a equipe criada aqui fica invisível para `resolvePairTeamTx`
    // e a próxima inscrição da dupla cria OUTRO doc.
    assert.equal(teamWrites[0].data.pairKey, "aaa:bbb");
    assert.equal(teamWrites[0].data.player1Id, "aaa");
  });
});

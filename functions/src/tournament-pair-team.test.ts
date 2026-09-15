import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  isPairTeamDoc,
  pickPairTeamId,
  resolvePairTeamTx,
} from "./tournament-pair-team";

const TEAMS = "teams";
const INSCRIPTIONS = "inscriptions";

function ts(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

async function resolve(
  db: FakeFirestore,
  opts: {tournamentId: string; player1Id: string; player2Id: string},
) {
  return db.runTransaction(async (tx) =>
    resolvePairTeamTx(tx as never, {
      teamsRef: db.collection(TEAMS) as never,
      inscriptionsRef: db.collection(INSCRIPTIONS) as never,
      tournamentId: opts.tournamentId,
      player1Id: opts.player1Id,
      player2Id: opts.player2Id,
    }),
  );
}

describe("isPairTeamDoc", () => {
  it("dupla sem nome é par", () => {
    assert.equal(isPairTeamDoc({player1Id: "a", player2Id: "b"}), true);
  });

  it("equipe nomeada e trio+ não são par", () => {
    assert.equal(isPairTeamDoc({teamName: "Os Tubarões"}), false);
    assert.equal(isPairTeamDoc({teamSize: 3}), false);
    assert.equal(isPairTeamDoc(null), false);
  });
});

describe("pickPairTeamId", () => {
  it("o mais antigo vence", () => {
    assert.equal(
      pickPairTeamId([
        {id: "novo", createdAtMs: 200},
        {id: "velho", createdAtMs: 100},
      ]),
      "velho",
    );
  });

  it("empate de data desempata pelo id, para ser determinístico", () => {
    assert.equal(
      pickPairTeamId([
        {id: "b", createdAtMs: 100},
        {id: "a", createdAtMs: 100},
      ]),
      "a",
    );
  });

  it("sem candidato devolve vazio", () => {
    assert.equal(pickPairTeamId([]), "");
  });
});

describe("resolvePairTeamTx", () => {
  it("par sem equipe nenhuma ganha doc novo com pairKey", async () => {
    const db = new FakeFirestore();

    const out = await resolve(db, {
      tournamentId: "T1",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.reused, false);
    const team = db.store.get(`${TEAMS}/${out.teamId}`)!;
    assert.equal(team.pairKey, "uid-a:uid-b");
    assert.equal(team.player1Id, "uid-a");
    assert.equal(team.player2Id, "uid-b");
  });

  it("reaproveita o doc do par em OUTRO torneio", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/time-antigo`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });
    db.seedDoc(`${INSCRIPTIONS}/insc-1`, {teamId: "time-antigo", tournamentId: "T1"});

    const out = await resolve(db, {
      tournamentId: "T2",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.reused, true);
    assert.equal(out.teamId, "time-antigo");
    const team = db.store.get(`${TEAMS}/time-antigo`)!;
    assert.notEqual(team.updatedAt, undefined);
  });

  it("tournamentId vazio lança em vez de reaproveitar às cegas", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/time-antigo`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });

    await assert.rejects(
      () => resolve(db, {tournamentId: "", player1Id: "uid-a", player2Id: "uid-b"}),
      /tournamentId/,
    );
  });

  it("reaproveita mesmo com os papéis invertidos, sem trocar os player ids", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/time-antigo`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });

    const out = await resolve(db, {
      tournamentId: "T2",
      player1Id: "uid-b",
      player2Id: "uid-a",
    });

    assert.equal(out.teamId, "time-antigo");
    const team = db.store.get(`${TEAMS}/time-antigo`)!;
    assert.equal(team.player1Id, "uid-a");
    assert.equal(team.player2Id, "uid-b");
  });

  it("segunda categoria do MESMO torneio ganha doc próprio", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/time-antigo`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });
    db.seedDoc(`${INSCRIPTIONS}/insc-1`, {teamId: "time-antigo", tournamentId: "T1"});

    const out = await resolve(db, {
      tournamentId: "T1",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.reused, false);
    assert.notEqual(out.teamId, "time-antigo");
    assert.equal(db.store.get(`${TEAMS}/${out.teamId}`)!.pairKey, "uid-a:uid-b");
  });

  it("diante de dois docs do mesmo par, escolhe o mais antigo", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/velho`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });
    db.seedDoc(`${TEAMS}/novo`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-04T00:00:00Z"),
    });

    const out = await resolve(db, {
      tournamentId: "T9",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.teamId, "velho");
  });

  it("ignora equipe nomeada que carregue pairKey", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/nomeada`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      teamName: "Os Tubarões",
      teamSize: 4,
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });

    const out = await resolve(db, {
      tournamentId: "T2",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.reused, false);
    assert.notEqual(out.teamId, "nomeada");
  });

  it("pairKey mentiroso não sequestra a equipe: revalida pelos player ids", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/impostor`, {
      player1Id: "uid-x",
      player2Id: "uid-y",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });

    const out = await resolve(db, {
      tournamentId: "T2",
      player1Id: "uid-a",
      player2Id: "uid-b",
    });

    assert.equal(out.reused, false);
    assert.notEqual(out.teamId, "impostor");
  });

  it("par inválido (mesmo uid dos dois lados) não deduplica", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/qualquer`, {
      player1Id: "uid-a",
      player2Id: "uid-a",
      createdAt: ts("2026-09-01T00:00:00Z"),
    });

    const out = await resolve(db, {
      tournamentId: "T2",
      player1Id: "uid-a",
      player2Id: "uid-a",
    });

    assert.equal(out.reused, false);
    assert.equal(db.store.get(`${TEAMS}/${out.teamId}`)!.pairKey, undefined);
  });
});

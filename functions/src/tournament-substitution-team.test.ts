import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {applySubstitutionToTeamTx} from "./tournament-substitution-team";

const TEAMS = "teams";
const INSCRIPTIONS = "inscriptions";

function ts(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

/** Troca B→C na inscrição [registrationId], que aponta para [teamId]. */
async function substitute(
  db: FakeFirestore,
  opts: {
    tournamentId: string;
    registrationId: string;
    teamId: string;
    outUid: string;
    inUid: string;
    rosterAfter: string[];
    namedTeam?: boolean;
  },
) {
  return db.runTransaction(async (tx) => {
    const team = db.store.get(`${TEAMS}/${opts.teamId}`)!;
    return applySubstitutionToTeamTx(tx as never, {
      teamsRef: db.collection(TEAMS) as never,
      inscriptionsRef: db.collection(INSCRIPTIONS) as never,
      tournamentId: opts.tournamentId,
      registrationId: opts.registrationId,
      teamId: opts.teamId,
      team,
      outUid: opts.outUid,
      inUid: opts.inUid,
      rosterAfter: opts.rosterAfter,
      namedTeam: opts.namedTeam === true,
    });
  });
}

/** Dupla A+B com um doc só, servindo T1 (encerrado) e T2 (aberto). */
function seedSharedPair(db: FakeFirestore): void {
  db.seedDoc(`${TEAMS}/time-ab`, {
    player1Id: "uid-a",
    player2Id: "uid-b",
    pairKey: "uid-a:uid-b",
    createdAt: ts("2026-08-01T00:00:00Z"),
  });
  db.seedDoc(`${INSCRIPTIONS}/insc-t1`, {
    teamId: "time-ab",
    tournamentId: "T1",
    participantUids: ["uid-a", "uid-b"],
  });
  db.seedDoc(`${INSCRIPTIONS}/insc-t2`, {
    teamId: "time-ab",
    tournamentId: "T2",
    participantUids: ["uid-a", "uid-b"],
  });
}

describe("applySubstitutionToTeamTx", () => {
  it("doc compartilhado: bifurca e deixa o original intacto", async () => {
    const db = new FakeFirestore();
    seedSharedPair(db);

    const out = await substitute(db, {
      tournamentId: "T2",
      registrationId: "insc-t2",
      teamId: "time-ab",
      outUid: "uid-b",
      inUid: "uid-c",
      rosterAfter: ["uid-a", "uid-c"],
    });

    assert.equal(out.forked, true);
    assert.notEqual(out.teamId, "time-ab");

    // O doc do outro torneio segue sendo A+B, campo a campo.
    const original = db.store.get(`${TEAMS}/time-ab`)!;
    assert.equal(original.player1Id, "uid-a");
    assert.equal(original.player2Id, "uid-b");
    assert.equal(original.pairKey, "uid-a:uid-b");
    assert.equal(original.memberUids, undefined);
    assert.equal(original.updatedAt, undefined, "nem o updatedAt é tocado");

    // O doc novo é a dupla A+C, com a chave certa.
    const forked = db.store.get(`${TEAMS}/${out.teamId}`)!;
    assert.equal(forked.player1Id, "uid-a");
    assert.equal(forked.player2Id, "uid-c");
    assert.equal(forked.pairKey, "uid-a:uid-c");
  });

  it("doc compartilhado: bifurcar na vaga do player1 preserva a posição", async () => {
    const db = new FakeFirestore();
    seedSharedPair(db);

    const out = await substitute(db, {
      tournamentId: "T2",
      registrationId: "insc-t2",
      teamId: "time-ab",
      outUid: "uid-a",
      inUid: "uid-c",
      rosterAfter: ["uid-c", "uid-b"],
    });

    assert.equal(out.forked, true);
    const forked = db.store.get(`${TEAMS}/${out.teamId}`)!;
    assert.equal(forked.player1Id, "uid-c");
    assert.equal(forked.player2Id, "uid-b");
    assert.equal(forked.pairKey, "uid-b:uid-c");
  });

  it("doc compartilhado: a dupla nova reaproveita o doc que já tem", async () => {
    const db = new FakeFirestore();
    seedSharedPair(db);
    db.seedDoc(`${TEAMS}/time-ac`, {
      player1Id: "uid-a",
      player2Id: "uid-c",
      pairKey: "uid-a:uid-c",
      createdAt: ts("2026-08-15T00:00:00Z"),
    });

    const out = await substitute(db, {
      tournamentId: "T2",
      registrationId: "insc-t2",
      teamId: "time-ab",
      outUid: "uid-b",
      inUid: "uid-c",
      rosterAfter: ["uid-a", "uid-c"],
    });

    assert.equal(out.forked, true);
    assert.equal(out.teamId, "time-ac", "identidade única vale também no fork");
    assert.equal(db.store.get(`${TEAMS}/time-ab`)!.player2Id, "uid-b");
  });

  it("referência única: muta no lugar e recarimba o pairKey", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/time-ab`, {
      player1Id: "uid-a",
      player2Id: "uid-b",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-08-01T00:00:00Z"),
    });
    db.seedDoc(`${INSCRIPTIONS}/insc-t2`, {
      teamId: "time-ab",
      tournamentId: "T2",
      participantUids: ["uid-a", "uid-b"],
    });

    const out = await substitute(db, {
      tournamentId: "T2",
      registrationId: "insc-t2",
      teamId: "time-ab",
      outUid: "uid-b",
      inUid: "uid-c",
      rosterAfter: ["uid-a", "uid-c"],
    });

    assert.equal(out.forked, false);
    assert.equal(out.teamId, "time-ab", "sem doc novo: a inscrição segue apontando pro mesmo");
    const team = db.store.get(`${TEAMS}/time-ab`)!;
    assert.equal(team.player2Id, "uid-c");
    assert.deepEqual(team.memberUids, ["uid-a", "uid-c"]);
    assert.equal(team.pairKey, "uid-a:uid-c", "chave stale deixaria o doc invisível pro helper");
    assert.notEqual(team.updatedAt, undefined);
    assert.equal(db.store.size, 2, "nenhum doc de equipe criado");
  });

  it("equipe nomeada muta no lugar, sem pairKey, mesmo com duas inscrições apontando", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/equipe-nomeada`, {
      teamName: "Os Tubarões",
      teamSize: 4,
      memberUids: ["uid-cap", "uid-m1", "uid-m2", "uid-m3"],
      player1Id: "uid-cap",
      player2Id: "uid-m1",
      createdAt: ts("2026-08-01T00:00:00Z"),
    });
    db.seedDoc(`${INSCRIPTIONS}/insc-t1`, {teamId: "equipe-nomeada", tournamentId: "T1"});
    db.seedDoc(`${INSCRIPTIONS}/insc-t2`, {teamId: "equipe-nomeada", tournamentId: "T2"});

    const out = await substitute(db, {
      tournamentId: "T2",
      registrationId: "insc-t2",
      teamId: "equipe-nomeada",
      outUid: "uid-m1",
      inUid: "uid-novo",
      rosterAfter: ["uid-cap", "uid-novo", "uid-m2", "uid-m3"],
      namedTeam: true,
    });

    assert.equal(out.forked, false);
    assert.equal(out.teamId, "equipe-nomeada");
    const team = db.store.get(`${TEAMS}/equipe-nomeada`)!;
    assert.deepEqual(team.memberUids, ["uid-cap", "uid-novo", "uid-m2", "uid-m3"]);
    assert.equal(team.player2Id, "uid-novo");
    assert.equal(team.pairKey, undefined, "equipe nomeada nunca ganha chave de par");
  });

  it("doc com nome mas categoria de dupla também não bifurca", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/time-batizado`, {
      teamName: "Dupla Dinâmica",
      player1Id: "uid-a",
      player2Id: "uid-b",
      createdAt: ts("2026-08-01T00:00:00Z"),
    });
    db.seedDoc(`${INSCRIPTIONS}/insc-t1`, {teamId: "time-batizado", tournamentId: "T1"});
    db.seedDoc(`${INSCRIPTIONS}/insc-t2`, {teamId: "time-batizado", tournamentId: "T2"});

    const out = await substitute(db, {
      tournamentId: "T2",
      registrationId: "insc-t2",
      teamId: "time-batizado",
      outUid: "uid-b",
      inUid: "uid-c",
      rosterAfter: ["uid-a", "uid-c"],
    });

    assert.equal(out.forked, false, "doc que não é de par nunca é deduplicado nem bifurcado");
    assert.equal(db.store.get(`${TEAMS}/time-batizado`)!.player2Id, "uid-c");
    assert.equal(db.store.get(`${TEAMS}/time-batizado`)!.pairKey, undefined);
  });

  it("referência única com par novo incompleto não grava chave vazia", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${TEAMS}/time-solo`, {
      player1Id: "uid-a",
      createdAt: ts("2026-08-01T00:00:00Z"),
    });
    db.seedDoc(`${INSCRIPTIONS}/insc-t2`, {
      teamId: "time-solo",
      tournamentId: "T2",
      participantUids: ["uid-a"],
    });

    const out = await substitute(db, {
      tournamentId: "T2",
      registrationId: "insc-t2",
      teamId: "time-solo",
      outUid: "uid-a",
      inUid: "uid-c",
      rosterAfter: ["uid-c"],
    });

    assert.equal(out.forked, false);
    const team = db.store.get(`${TEAMS}/time-solo`)!;
    assert.equal(team.player1Id, "uid-c");
    assert.equal(team.pairKey, undefined);
  });

  it("elenco divergente já gravado: o par novo sai da inscrição, não do doc", async () => {
    const db = new FakeFirestore();
    // Estrago que a mutação in-place já causou em produção: o doc virou A+C
    // enquanto a inscrição de T1 seguiu com A+B.
    db.seedDoc(`${TEAMS}/time-ab`, {
      player1Id: "uid-a",
      player2Id: "uid-c",
      pairKey: "uid-a:uid-b",
      createdAt: ts("2026-08-01T00:00:00Z"),
    });
    db.seedDoc(`${INSCRIPTIONS}/insc-t1`, {
      teamId: "time-ab",
      tournamentId: "T1",
      participantUids: ["uid-a", "uid-b"],
    });
    db.seedDoc(`${INSCRIPTIONS}/insc-t2`, {
      teamId: "time-ab",
      tournamentId: "T2",
      participantUids: ["uid-a", "uid-b"],
    });

    const out = await substitute(db, {
      tournamentId: "T2",
      registrationId: "insc-t2",
      teamId: "time-ab",
      outUid: "uid-b",
      inUid: "uid-d",
      rosterAfter: ["uid-a", "uid-d"],
    });

    assert.equal(out.forked, true);
    assert.notEqual(out.teamId, "time-ab");
    const forked = db.store.get(`${TEAMS}/${out.teamId}`)!;
    assert.equal(forked.pairKey, "uid-a:uid-d");
    assert.equal(db.store.get(`${TEAMS}/time-ab`)!.player2Id, "uid-c", "compartilhado intacto");
  });
});

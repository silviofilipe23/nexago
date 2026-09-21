import assert from "node:assert/strict";
import {describe, it} from "node:test";
import type {Firestore} from "firebase-admin/firestore";

import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  markTeamRegistrationPaid,
  recomputeTeamGenderAfterRosterChange,
} from "./tournament-team-roster";

const PROJECT = "p1";
const TEAMS = `artifacts/${PROJECT}/public/data/teams`;

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function team(id: string, fake: FakeFirestore) {
  return fake.store.get(`${TEAMS}/${id}`);
}

describe("markTeamRegistrationPaid", () => {
  it("carimba registrationPaid e gender da dupla", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("users/a", {gender: "Masculino"});
    fake.seedDoc("users/b", {gender: "masculino"});
    fake.seedDoc(`${TEAMS}/t1`, {player1Id: "a", player2Id: "b"});

    await markTeamRegistrationPaid(db, PROJECT, "t1");

    assert.equal(team("t1", fake)?.registrationPaid, true);
    assert.equal(team("t1", fake)?.gender, "Masculino");
  });

  it("dupla de gêneros diferentes é Misto", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("users/a", {gender: "M"});
    fake.seedDoc("users/b", {gender: "feminino"});
    fake.seedDoc(`${TEAMS}/t1`, {player1Id: "a", player2Id: "b"});

    await markTeamRegistrationPaid(db, PROJECT, "t1");

    assert.equal(team("t1", fake)?.gender, "Misto");
  });

  it("equipe nomeada usa memberUids e respeita teamSize", async () => {
    const {fake, db} = makeDb();
    for (const uid of ["a", "b", "c", "d"]) {
      fake.seedDoc(`users/${uid}`, {gender: "feminino"});
    }
    fake.seedDoc(`${TEAMS}/t1`, {
      teamSize: 4,
      memberUids: ["a", "b", "c", "d"],
      player1Id: "a",
      player2Id: "b",
    });

    await markTeamRegistrationPaid(db, PROJECT, "t1");

    assert.equal(team("t1", fake)?.registrationPaid, true);
    assert.equal(team("t1", fake)?.gender, "Feminino");
  });

  // O caso que deixava 71 equipes fora da listagem no DEV: o carimbo de
  // pagamento não pode depender de um atleta ter declarado o gênero no perfil.
  it("atleta sem gender declarado não impede o carimbo de pagamento", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("users/a", {gender: "Masculino"});
    fake.seedDoc("users/b", {});
    fake.seedDoc(`${TEAMS}/t1`, {player1Id: "a", player2Id: "b"});

    await markTeamRegistrationPaid(db, PROJECT, "t1");

    assert.equal(team("t1", fake)?.registrationPaid, true);
    assert.equal(team("t1", fake)?.gender, undefined);
  });

  it("elenco incompleto ainda é carimbado como pago, sem gender", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("users/a", {gender: "Masculino"});
    fake.seedDoc(`${TEAMS}/t1`, {teamSize: 4, memberUids: ["a"]});

    await markTeamRegistrationPaid(db, PROJECT, "t1");

    assert.equal(team("t1", fake)?.registrationPaid, true);
    assert.equal(team("t1", fake)?.gender, undefined);
  });

  it("não inventa doc de equipe que não existe", async () => {
    const {fake, db} = makeDb();
    await markTeamRegistrationPaid(db, PROJECT, "fantasma");
    assert.equal(team("fantasma", fake), undefined);
  });

  it("teamId vazio não escreve nada", async () => {
    const {fake, db} = makeDb();
    await markTeamRegistrationPaid(db, PROJECT, "");
    assert.equal(fake.store.size, 0);
  });

  it("não apaga o gender já gravado quando o perfil regride", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("users/a", {gender: "Masculino"});
    fake.seedDoc("users/b", {});
    fake.seedDoc(`${TEAMS}/t1`, {
      player1Id: "a",
      player2Id: "b",
      gender: "Masculino",
    });

    await markTeamRegistrationPaid(db, PROJECT, "t1");

    assert.equal(team("t1", fake)?.gender, "Masculino");
  });
});

describe("recomputeTeamGenderAfterRosterChange", () => {
  it("troca o rótulo quando a substituição muda o gênero do elenco", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("users/a", {gender: "Masculino"});
    fake.seedDoc("users/nova", {gender: "Feminino"});
    fake.seedDoc(`${TEAMS}/t1`, {
      player1Id: "a",
      player2Id: "nova",
      gender: "Masculino",
      registrationPaid: true,
    });

    await recomputeTeamGenderAfterRosterChange(db, PROJECT, "t1");

    assert.equal(team("t1", fake)?.gender, "Misto");
  });

  it("equipe não paga não recebe gender por esta via", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("users/a", {gender: "Masculino"});
    fake.seedDoc("users/b", {gender: "Masculino"});
    fake.seedDoc(`${TEAMS}/t1`, {player1Id: "a", player2Id: "b"});

    await recomputeTeamGenderAfterRosterChange(db, PROJECT, "t1");

    assert.equal(team("t1", fake)?.gender, undefined);
    assert.equal(team("t1", fake)?.registrationPaid, undefined);
  });

  it("gênero indefinido preserva o rótulo antigo em vez de apagar", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("users/a", {gender: "Masculino"});
    fake.seedDoc("users/sem-perfil", {});
    fake.seedDoc(`${TEAMS}/t1`, {
      player1Id: "a",
      player2Id: "sem-perfil",
      gender: "Masculino",
      registrationPaid: true,
    });

    await recomputeTeamGenderAfterRosterChange(db, PROJECT, "t1");

    assert.equal(team("t1", fake)?.gender, "Masculino");
  });
});

import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  isActiveWithdrawalStaffMirror,
  assertCanWithdrawFromTournament,
} from "./tournament-wallet-access";

const OWNER = "ownerUid";
const MANAGER = "managerUid";
const EVENT_ADMIN = "eventAdminUid";
const SCORER = "scorerUid";
const OUTSIDER = "outsiderUid";
const TOURNAMENT = "t1";

function dbWith(entries: Array<[string, Record<string, unknown>]>): Firestore {
  const fake = new FakeFirestore();
  fake.seedDoc(`tournaments/${TOURNAMENT}`, {managerId: OWNER});
  for (const [path, data] of entries) fake.seedDoc(path, data);
  return fake as unknown as Firestore;
}

describe("isActiveWithdrawalStaffMirror", () => {
  it("gestor ativo saca", () => {
    assert.equal(isActiveWithdrawalStaffMirror({role: "manager", status: "active"}), true);
  });

  it("papel ausente conta como gestor", () => {
    assert.equal(isActiveWithdrawalStaffMirror({status: "active"}), true);
  });

  it("administrador do evento NÃO saca", () => {
    assert.equal(isActiveWithdrawalStaffMirror({role: "eventAdmin", status: "active"}), false);
  });

  it("mesário não saca", () => {
    assert.equal(isActiveWithdrawalStaffMirror({role: "scorer", status: "active"}), false);
  });

  it("gestor inativo não saca", () => {
    assert.equal(isActiveWithdrawalStaffMirror({role: "manager", status: "removed"}), false);
  });
});

describe("assertCanWithdrawFromTournament", () => {
  it("o dono do torneio saca", async () => {
    const db = dbWith([]);
    await assertCanWithdrawFromTournament(db, OWNER, TOURNAMENT);
  });

  it("gestor da equipe saca", async () => {
    const db = dbWith([
      [`users/${MANAGER}/tournamentStaff/${TOURNAMENT}`, {role: "manager", status: "active"}],
    ]);
    await assertCanWithdrawFromTournament(db, MANAGER, TOURNAMENT);
  });

  it("administrador do evento é recusado", async () => {
    const db = dbWith([
      [`users/${EVENT_ADMIN}/tournamentStaff/${TOURNAMENT}`, {role: "eventAdmin", status: "active"}],
    ]);
    await assert.rejects(
      () => assertCanWithdrawFromTournament(db, EVENT_ADMIN, TOURNAMENT),
      /permission-denied|acesso/i,
    );
  });

  it("mesário é recusado", async () => {
    const db = dbWith([
      [`users/${SCORER}/tournamentStaff/${TOURNAMENT}`, {role: "scorer", status: "active"}],
    ]);
    await assert.rejects(
      () => assertCanWithdrawFromTournament(db, SCORER, TOURNAMENT),
      /permission-denied|acesso/i,
    );
  });

  it("estranho é recusado", async () => {
    const db = dbWith([]);
    await assert.rejects(
      () => assertCanWithdrawFromTournament(db, OUTSIDER, TOURNAMENT),
      /permission-denied|acesso/i,
    );
  });
});

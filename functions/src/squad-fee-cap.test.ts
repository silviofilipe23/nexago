import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {discountFeeCapCents, feePercentForRegistration, tournamentFeePercent} from "./squad-fee-cap";

process.env.GCLOUD_PROJECT = "p";

describe("teto do desconto = taxa da plataforma", () => {
  it("é a taxa da cobrança, com o piso de R$ 1,50", () => {
    assert.equal(discountFeeCapCents(100, 8), 8_00);
    assert.equal(discountFeeCapCents(10, 8), 1_50);
    assert.equal(discountFeeCapCents(100, null), null);
  });

  it("% negociado no cadastro do organizador; sem organizador, sem teto", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    fake.seedDoc("organizers/org1", {commissionPercent: 5});
    assert.equal(await tournamentFeePercent(db, {managerId: "org1"}), 5);
    assert.equal(await tournamentFeePercent(db, {managerId: "org2"}), 8);
    assert.equal(await tournamentFeePercent(db, {}), null);

    fake.seedDoc("artifacts/p/public/data/inscriptions/reg1", {tournamentId: "t1"});
    fake.seedDoc("tournaments/t1", {managerId: "org1"});
    assert.equal(await feePercentForRegistration(db, "reg1"), 5);
    assert.equal(await feePercentForRegistration(db, "nada"), null);
  });

  it("acha o torneio do caminho legado, igual à cobrança (prévia não fica sem teto)", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    fake.seedDoc("organizers/org1", {commissionPercent: 5});
    fake.seedDoc("artifacts/p/public/data/inscriptions/reg1", {tournamentId: "legado"});
    fake.seedDoc("artifacts/p/public/data/tournaments/legado", {managerId: "org1"});
    assert.equal(await feePercentForRegistration(db, "reg1"), 5);

    // O doc do topo ganha quando os dois existem (mesma cascata de `loadTournamentData`).
    fake.seedDoc("artifacts/p/public/data/inscriptions/reg2", {tournamentId: "t2"});
    fake.seedDoc("tournaments/t2", {managerId: "org1"});
    fake.seedDoc("artifacts/p/public/data/tournaments/t2", {managerId: "org2"});
    assert.equal(await feePercentForRegistration(db, "reg2"), 5);
  });
});

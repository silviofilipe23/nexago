import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {discountFeeCapCents, feeRuleForRegistration, tournamentFeeRule} from "./squad-fee-cap";

process.env.GCLOUD_PROJECT = "p";

describe("teto do desconto = taxa da plataforma", () => {
  it("é a taxa da cobrança, com o piso da regra", () => {
    assert.equal(discountFeeCapCents(100, {percent: 8, floorReais: 1.5, payer: "organizador"}), 8_00);
    assert.equal(discountFeeCapCents(10, {percent: 8, floorReais: 1.5, payer: "organizador"}), 1_50);
    assert.equal(discountFeeCapCents(10, {percent: 8, floorReais: 2, payer: "organizador"}), 2_00);
    // Isento: a nexaGO não cobra, então não há de onde tirar desconto.
    assert.equal(discountFeeCapCents(100, {percent: 0, floorReais: 0, payer: "organizador"}), 0);
    assert.equal(discountFeeCapCents(100, null), null);
  });

  it("% negociado no cadastro do organizador; sem organizador, sem teto", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    fake.seedDoc("organizers/org1", {commissionPercent: 5});
    assert.deepEqual(await tournamentFeeRule(db, "t1", {managerId: "org1"}), {percent: 5, floorReais: 1.5, payer: "organizador"});
    assert.deepEqual(await tournamentFeeRule(db, "t1", {managerId: "org2"}), {percent: 8, floorReais: 1.5, payer: "organizador"});
    assert.equal(await tournamentFeeRule(db, "t1", {}), null);

    fake.seedDoc("artifacts/p/public/data/inscriptions/reg1", {tournamentId: "t1"});
    fake.seedDoc("tournaments/t1", {managerId: "org1"});
    assert.equal((await feeRuleForRegistration(db, "reg1"))?.percent, 5);
    assert.equal(await feeRuleForRegistration(db, "nada"), null);
  });

  it("acha o torneio do caminho legado, igual à cobrança (prévia não fica sem teto)", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    fake.seedDoc("organizers/org1", {commissionPercent: 5});
    fake.seedDoc("artifacts/p/public/data/inscriptions/reg1", {tournamentId: "legado"});
    fake.seedDoc("artifacts/p/public/data/tournaments/legado", {managerId: "org1"});
    assert.equal((await feeRuleForRegistration(db, "reg1"))?.percent, 5);

    // O doc do topo ganha quando os dois existem (mesma cascata de `loadTournamentData`).
    fake.seedDoc("artifacts/p/public/data/inscriptions/reg2", {tournamentId: "t2"});
    fake.seedDoc("tournaments/t2", {managerId: "org1"});
    fake.seedDoc("artifacts/p/public/data/tournaments/t2", {managerId: "org2"});
    assert.equal((await feeRuleForRegistration(db, "reg2"))?.percent, 5);
  });

  it("exceção do torneio ganha da comissão do organizador, com o piso dela", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    fake.seedDoc("organizers/org1", {commissionPercent: 5});
    fake.seedDoc("tournamentFees/t1", {mode: "custom", percent: 3, floorReais: 1, reason: "Parceria comercial", until: null});
    fake.seedDoc("artifacts/p/public/data/inscriptions/reg1", {tournamentId: "t1"});
    fake.seedDoc("tournaments/t1", {managerId: "org1"});
    assert.deepEqual(await feeRuleForRegistration(db, "reg1"), {percent: 3, floorReais: 1, payer: "organizador"});
  });
});

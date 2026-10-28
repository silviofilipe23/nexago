import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  chargePerkCents,
  claimFreeShare,
  creditFreeShare,
  ownPerkView,
  perkDiscountCents,
  perkMonthKey,
  recordPerkDiscount,
  resolveOwnPerk,
} from "./squad-own-perk";

process.env.GCLOUD_PROJECT = "p";

const NOW = new Date("2026-10-17T15:00:00Z");
const REG_PATH = "artifacts/p/public/data/inscriptions/reg1";

function makeDb(tier: string | null = "amb", status = "active"): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  if (tier) {
    fake.seedDoc("squadAmbassadors/amb1", {
      displayName: "João", tier, code: "JOAO10", commissionPct: 10, status, rulesVersion: null,
    });
  }
  fake.seedDoc(REG_PATH, {
    tournamentId: "t1", categoryId: "A", participantUids: ["amb1", "uidB"], sharePaidUids: [], paidAmount: 0, isPaid: false,
  });
  return {fake, db: fake as unknown as Firestore};
}

const claimInput = (db: Firestore, over: Partial<Parameters<typeof claimFreeShare>[1]> = {}) => ({
  uid: "amb1",
  registrationRef: db.doc(REG_PATH) as DocumentReference,
  tournamentId: "t1",
  entryFee: 100,
  shareReais: 50,
  isTeamRegistration: false,
  waitlist: false,
  ...over,
});

describe("resolveOwnPerk", () => {
  it("sem contrato ativo, nenhum benefício (pausado não vale)", async () => {
    assert.equal(await resolveOwnPerk(makeDb(null).db, "amb1", NOW), null);
    assert.equal(await resolveOwnPerk(makeDb("amb", "paused").db, "amb1", NOW), null);
  });

  it("pacote do nível: Athlete tem % e Ambassador tem gratuidade no mês", async () => {
    assert.deepEqual(await resolveOwnPerk(makeDb("ath").db, "amb1", NOW), {type: "discount", pct: 20});
    assert.deepEqual(await resolveOwnPerk(makeDb("amb").db, "amb1", NOW), {type: "free", limit: 1, used: 0, hiddenLimit: false});
  });

  it("vem da versão das regras congelada no contrato", async () => {
    const {fake, db} = makeDb("amb");
    fake.seedDoc("squadAmbassadors/amb1", {tier: "amb", status: "active", rulesVersion: 3});
    fake.seedDoc("squadConfig/rules", {version: 4, rules: {tiers: {amb: {registrations: {type: "freePerMonth", value: 5}}}}});
    fake.seedDoc("squadConfig/rules/versions/3", {rules: {tiers: {amb: {registrations: {type: "discount", value: 30}}}}});
    assert.deepEqual(await resolveOwnPerk(db, "amb1", NOW), {type: "discount", pct: 30});
  });

  it("conta só as gratuidades do mês corrente de SP", async () => {
    const {fake, db} = makeDb("amb");
    fake.seedDoc("squadPerkUses/old", {kind: "free", ambassadorId: "amb1", monthKey: "2026-09"});
    assert.equal((await resolveOwnPerk(db, "amb1", NOW) as {used: number}).used, 0);
    fake.seedDoc("squadPerkUses/now", {kind: "free", ambassadorId: "amb1", monthKey: "2026-10"});
    assert.equal((await resolveOwnPerk(db, "amb1", NOW) as {used: number}).used, 1);
    // Virada do mês pelo relógio de SP (UTC−3): 02:59Z ainda é 31/10 lá; 03:00Z já é novembro.
    assert.equal(perkMonthKey(new Date("2026-11-01T02:59:00Z")), "2026-10");
    assert.equal(perkMonthKey(new Date("2026-11-01T03:00:00Z")), "2026-11");
  });
});

describe("ownPerkView", () => {
  it("o teto oculto do ilimitado nunca vai para o cliente", () => {
    assert.deepEqual(ownPerkView({type: "free", limit: 4, used: 1, hiddenLimit: true}), {type: "free", available: true, remaining: null});
    assert.deepEqual(ownPerkView({type: "free", limit: 1, used: 1, hiddenLimit: false}), {type: "free", available: false, remaining: 0});
    assert.deepEqual(ownPerkView({type: "discount", pct: 20}), {type: "discount", pct: 20});
    assert.equal(ownPerkView(null), null);
  });
});

describe("perkDiscountCents", () => {
  it("% só da parcela do embaixador, mesmo pagando a dupla inteira", () => {
    assert.equal(perkDiscountCents(20, 50_00, 50_00, 0), 10_00);
    assert.equal(perkDiscountCents(20, 50_00, 100_00, 0), 10_00);
  });

  it("nunca deixa a cobrança (com o desconto do seguidor) abaixo do mínimo do Asaas", () => {
    assert.equal(perkDiscountCents(100, 50_00, 50_00, 0), 45_00);
    assert.equal(perkDiscountCents(50, 10_00, 10_00, 3_00), 2_00);
    assert.equal(perkDiscountCents(0, 50_00, 50_00, 0), 0);
  });

  it("registro por paymentId é o que o webhook lê", async () => {
    const {db} = makeDb();
    await recordPerkDiscount(db, {paymentId: "pay1", uid: "amb1", registrationId: "reg1", tournamentId: "t1", cents: 10_00, pct: 20}, NOW);
    assert.equal(await chargePerkCents(db, "pay1"), 10_00);
    assert.equal(await chargePerkCents(db, "pay2"), 0);
  });
});

describe("claimFreeShare", () => {
  it("credita a parcela, grava o uso do mês e não fecha a dupla sozinho", async () => {
    const {fake, db} = makeDb();
    const claim = await claimFreeShare(db, claimInput(db), NOW);
    assert.equal(claim.isPaid, false);
    assert.equal(claim.shareReais, 50);
    const reg = fake.store.get(REG_PATH)!;
    assert.equal(reg["paidAmount"], 50);
    assert.deepEqual(reg["sharePaidUids"], ["amb1"]);
    const use = fake.store.get("squadPerkUses/free_reg1_amb1")!;
    assert.equal(use["kind"], "free");
    assert.equal(use["monthKey"], "2026-10");
    assert.equal(use["cents"], 50_00);
  });

  it("parceiro já pagou: fecha a inscrição", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(REG_PATH, {tournamentId: "t1", participantUids: ["amb1", "uidB"], sharePaidUids: ["uidB"], paidAmount: 50, isPaid: false});
    assert.equal((await claimFreeShare(db, claimInput(db), NOW)).isPaid, true);
    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
  });

  it("gratuidade do mês esgotada, parcela já paga ou nível com % recusam", async () => {
    const used = makeDb();
    used.fake.seedDoc("squadPerkUses/free_regX_amb1", {kind: "free", ambassadorId: "amb1", monthKey: "2026-10"});
    await assert.rejects(claimFreeShare(used.db, claimInput(used.db), NOW), /já foram usadas/);

    const paid = makeDb();
    paid.fake.seedDoc(REG_PATH, {tournamentId: "t1", sharePaidUids: ["amb1"], paidAmount: 50, isPaid: false});
    await assert.rejects(claimFreeShare(paid.db, claimInput(paid.db), NOW), /já foi paga/);

    const ath = makeDb("ath");
    await assert.rejects(claimFreeShare(ath.db, claimInput(ath.db), NOW), /já foram usadas/);
  });

  it("equipe: credita a cota dinâmica, limitada ao que falta", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(REG_PATH, {tournamentId: "t1", sharePaidUids: ["u2", "u3"], paidAmount: 80, isPaid: false});
    const claim = await claimFreeShare(db, claimInput(db, {entryFee: 120, shareReais: 60, isTeamRegistration: true}), NOW);
    assert.equal(claim.shareReais, 40);
    assert.equal(claim.isPaid, true);
  });
});

describe("creditFreeShare", () => {
  it("organizador recebe o líquido de uma parcela paga, uma vez só", async () => {
    const {fake, db} = makeDb();
    const claim = await claimFreeShare(db, claimInput(db), NOW);
    const tournament = {managerId: "org1"};
    const input = {tournamentId: "t1", tournament, registrationId: "reg1", payerUid: "amb1", claim};
    assert.equal(await creditFreeShare(db, input), true);
    assert.equal(fake.store.get("tournamentWallets/t1")!["availableReais"], 46);
    const ledger = [...fake.store.entries()].find(([k]) => k.startsWith("tournamentWallets/t1/ledger/"))![1];
    assert.equal(ledger["grossReais"], 50);
    assert.equal(ledger["squadDiscountReais"], 50);
    assert.equal(ledger["asaasPaymentId"], "free_reg1_amb1");
    // Reentrega: o uso já marca `walletCreditedAt`.
    assert.equal(await creditFreeShare(db, input), false);
    assert.equal(fake.store.get("tournamentWallets/t1")!["availableReais"], 46);
  });

  it("torneio sem organizador não tem caixa", async () => {
    const {db} = makeDb();
    const claim = await claimFreeShare(db, claimInput(db), NOW);
    assert.equal(await creditFreeShare(db, {tournamentId: "t1", tournament: {}, registrationId: "reg1", payerUid: "amb1", claim}), false);
  });
});

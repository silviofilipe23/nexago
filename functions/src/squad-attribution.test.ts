import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  SELF_REFERRAL_MESSAGE,
  UNKNOWN_CODE_MESSAGE,
  checkSquadCodeCore,
  normalizeSquadCode,
  recordAttributionCore,
  resolveRegistrationAttribution,
} from "./squad-attribution";

const NOW = new Date("2026-10-17T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("squadAmbassadors/jv", {displayName: "João Victor", tier: "amb", code: "JOAO10", commissionPct: 10, rulesVersion: 2, status: "active"});
  fake.seedDoc("squadAmbassadors/rb", {displayName: "Rayssa Brito", tier: "pro", code: "RAYSSA", commissionPct: 15, rulesVersion: 2, status: "active"});
  fake.seedDoc("squadAmbassadors/old", {displayName: "Antigo", tier: "amb", code: "ANTIGO", commissionPct: 10, status: "ended"});
  return {fake, db: fake as unknown as Firestore};
}

function setModel(fake: FakeFirestore, model: "lastTouch" | "firstTouch", windowDays = 30) {
  fake.seedDoc("squadConfig/rules", {version: 2, rules: {attribution: {model, windowDays, blockSelfReferral: true}}});
}

describe("normalizeSquadCode", () => {
  it("maiúsculas, sem espaço, 3 a 20 letras/números", () => {
    assert.equal(normalizeSquadCode(" joao10 "), "JOAO10");
    assert.equal(normalizeSquadCode("jo"), null);
    assert.equal(normalizeSquadCode("JOÃO-10"), null);
    assert.equal(normalizeSquadCode(undefined), null);
  });
});

describe("recordAttributionCore", () => {
  it("grava o link do embaixador ativo; último toque sobrescreve", async () => {
    const {fake, db} = makeDb();
    assert.deepEqual(await recordAttributionCore(db, {uid: "atl", code: "joao10", origin: "link"}, NOW), {
      recorded: true,
      ambassadorName: "João Victor",
    });
    await recordAttributionCore(db, {uid: "atl", code: "RAYSSA", origin: "qr"}, new Date(NOW.getTime() + DAY));
    assert.equal(fake.store.get("squadAttributions/atl")!["ambassadorId"], "rb");
    assert.equal(fake.store.get("squadAttributions/atl")!["origin"], "qr");
  });

  it("primeiro toque mantém o anterior enquanto a janela vale", async () => {
    const {fake, db} = makeDb();
    setModel(fake, "firstTouch", 30);
    await recordAttributionCore(db, {uid: "atl", code: "JOAO10", origin: "link"}, NOW);
    const second = await recordAttributionCore(db, {uid: "atl", code: "RAYSSA", origin: "link"}, new Date(NOW.getTime() + 5 * DAY));
    assert.equal(second.recorded, false);
    assert.equal(fake.store.get("squadAttributions/atl")!["ambassadorId"], "jv");
    await recordAttributionCore(db, {uid: "atl", code: "RAYSSA", origin: "link"}, new Date(NOW.getTime() + 31 * DAY));
    assert.equal(fake.store.get("squadAttributions/atl")!["ambassadorId"], "rb");
  });

  it("código inexistente, encerrado ou do próprio atleta não grava", async () => {
    const {fake, db} = makeDb();
    assert.equal((await recordAttributionCore(db, {uid: "atl", code: "NADA99", origin: "link"}, NOW)).recorded, false);
    assert.equal((await recordAttributionCore(db, {uid: "atl", code: "ANTIGO", origin: "link"}, NOW)).recorded, false);
    assert.equal((await recordAttributionCore(db, {uid: "jv", code: "JOAO10", origin: "link"}, NOW)).recorded, false);
    assert.equal(fake.store.get("squadAttributions/atl"), undefined);
    await assert.rejects(
      recordAttributionCore(db, {uid: "atl", code: "JOAO10", origin: "email"}, NOW),
      (err: {code?: string}) => err.code === "invalid-argument",
    );
  });
});

describe("resolveRegistrationAttribution", () => {
  it("código digitado vence o link", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "jv", code: "JOAO10", origin: "link", at: NOW});
    const r = await resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: ["atl"], typedCode: "rayssa"}, NOW);
    assert.equal(r!.ambassador.uid, "rb");
    assert.equal(r!.origin, "code");
    assert.equal(r!.ambassador.rulesVersion, 2);
  });

  it("sem código, usa o link dentro da janela e ignora o vencido", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "jv", code: "JOAO10", origin: "qr", at: new Date(NOW.getTime() - 10 * DAY)});
    const r = await resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: [], typedCode: ""}, NOW);
    assert.equal(r!.origin, "qr");
    const late = await resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: [], typedCode: null}, new Date(NOW.getTime() + 25 * DAY));
    assert.equal(late, null);
  });

  it("código errado ou autoindicação digitada: erro claro; por link, ignora", async () => {
    const {fake, db} = makeDb();
    await assert.rejects(
      resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: [], typedCode: "NADA99"}, NOW),
      (err: {message?: string}) => err.message === UNKNOWN_CODE_MESSAGE,
    );
    // O embaixador é o parceiro de dupla do pagador.
    await assert.rejects(
      resolveRegistrationAttribution(db, {payerUid: "atl", athleteUids: ["atl", "jv"], typedCode: "JOAO10"}, NOW),
      (err: {message?: string}) => err.message === SELF_REFERRAL_MESSAGE,
    );
    fake.seedDoc("squadAttributions/jv", {ambassadorId: "jv", code: "JOAO10", origin: "link", at: NOW});
    assert.equal(await resolveRegistrationAttribution(db, {payerUid: "jv", athleteUids: ["jv"], typedCode: ""}, NOW), null);
  });

  it("com autoindicação liberada nas regras, o próprio código vale", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadConfig/rules", {version: 2, rules: {attribution: {blockSelfReferral: false}}});
    const r = await resolveRegistrationAttribution(db, {payerUid: "jv", athleteUids: ["jv"], typedCode: "JOAO10"}, NOW);
    assert.equal(r!.ambassador.uid, "jv");
  });
});

describe("checkSquadCodeCore", () => {
  it("devolve quem indicou, a origem e o % de desconto que vale para o atleta", async () => {
    const {fake, db} = makeDb();
    assert.deepEqual(
      await checkSquadCodeCore(db, {payerUid: "atl", athleteUids: ["atl"], code: "joao10", registrationId: "reg1", feePercent: 8}, NOW),
      {ambassadorName: "João Victor", code: "JOAO10", origin: "code", discountPct: 10, feePercent: 8, feeFloorReais: 1.5},
    );
    // Sem código: o link guardado, com o mesmo desconto.
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "rb", code: "RAYSSA", origin: "link", at: NOW});
    const viaLink = await checkSquadCodeCore(db, {payerUid: "atl", athleteUids: [], code: "", registrationId: "reg1"}, NOW);
    assert.equal(viaLink.origin, "link");
    assert.equal(viaLink.ambassadorName, "Rayssa Brito");
    // Pro sem % no contrato: vem das regras (padrão 15%).
    assert.equal(viaLink.discountPct, 15);
  });

  it("sem atribuição: nada", async () => {
    const {db} = makeDb();
    assert.deepEqual(
      await checkSquadCodeCore(db, {payerUid: "atl", athleteUids: [], code: "", registrationId: "reg1"}, NOW),
      {ambassadorName: null, code: null, origin: null, discountPct: 0, feePercent: null, feeFloorReais: 1.5},
    );
  });

  it("reserva e clubinho: % do contrato, teto da cobrança e o piso de cada uma", async () => {
    const {db} = makeDb();
    const club = await checkSquadCodeCore(
      db,
      {payerUid: "atl", athleteUids: [], code: "JOAO10", registrationId: "", purpose: "club", feePercent: 5, feeFloorReais: 0},
      NOW,
    );
    assert.equal(club.discountPct, 10);
    assert.equal(club.feePercent, 5);
    assert.equal(club.feeFloorReais, 0);
    const booking = await checkSquadCodeCore(
      db,
      {payerUid: "atl", athleteUids: [], code: "JOAO10", registrationId: "", purpose: "booking", feePercent: 8},
      NOW,
    );
    assert.equal(booking.discountPct, 10);
    assert.equal(booking.feeFloorReais, 1.5);
  });

  it("só na primeira: reserva já usada zera a reserva, mas não o clubinho nem a inscrição", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadChargeDiscounts/pay-old", {
      payerUid: "atl", ambassadorId: "jv", cents: 960, pct: 10, kind: "booking", confirmedAt: NOW,
    });
    const check = (purpose: "booking" | "club" | "registration") =>
      checkSquadCodeCore(db, {payerUid: "atl", athleteUids: [], code: "JOAO10", registrationId: "reg1", purpose}, NOW);
    assert.equal((await check("booking")).discountPct, 0);
    assert.equal((await check("club")).discountPct, 10);
    assert.equal((await check("registration")).discountPct, 10);
  });
});


import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  endCouponCore,
  saveCouponCore,
  setAutoDiscountActiveCore,
  setCouponPausedCore,
  withDiscountDefaults,
  type CouponInput,
} from "./store-coupons";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Ana Souza"};
const NOW = new Date("2026-10-16T18:00:00Z");

function coupon(over: Partial<CouponInput> = {}): CouponInput {
  return {
    code: " racha10 ",
    type: "percent",
    value: 10,
    maxDiscountCents: 5000,
    scope: {type: "store", ids: [], labels: []},
    minOrderCents: 15000,
    usageLimit: 300,
    onePerAthlete: true,
    stacksWithPix: true,
    appOnly: false,
    startDate: "2026-10-20",
    endDate: "2026-11-30",
    ...over,
  };
}

function fieldsOf(err: unknown): string[] {
  return (err as {details?: {fields: string[]}}).details?.fields ?? [];
}

describe("saveCouponCore", () => {
  it("cria com código normalizado, reserva a chave e nasce sem uso", async () => {
    const {fake, db} = makeDb();
    const {couponId} = await saveCouponCore(db, coupon(), ACTOR, NOW);

    const doc = fake.store.get(`storeCoupons/${couponId}`)!;
    assert.equal(doc["code"], "RACHA10");
    assert.equal(doc["uses"], 0);
    assert.equal(doc["paused"], false);
    assert.deepEqual(doc["createdBy"], ACTOR);
    assert.deepEqual(fake.store.get("storeCouponCodes/RACHA10"), {couponId});
  });

  it("recusa código repetido", async () => {
    const {db} = makeDb();
    await saveCouponCore(db, coupon(), ACTOR, NOW);
    await assert.rejects(saveCouponCore(db, coupon({code: "RACHA10"}), ACTOR, NOW), (err) => {
      assert.equal((err as {code: string}).code, "already-exists");
      assert.deepEqual(fieldsOf(err), ["code"]);
      return true;
    });
  });

  it("trocar o código de cupom não usado libera a chave antiga", async () => {
    const {fake, db} = makeDb();
    const {couponId} = await saveCouponCore(db, coupon(), ACTOR, NOW);
    await saveCouponCore(db, coupon({couponId, code: "RACHA15"}), ACTOR, NOW);

    assert.equal(fake.store.has("storeCouponCodes/RACHA10"), false);
    assert.deepEqual(fake.store.get("storeCouponCodes/RACHA15"), {couponId});
  });

  it("cupom já usado não muda código nem tipo, mas muda o resto", async () => {
    const {fake, db} = makeDb();
    const {couponId} = await saveCouponCore(db, coupon(), ACTOR, NOW);
    fake.store.set(`storeCoupons/${couponId}`, {...fake.store.get(`storeCoupons/${couponId}`)!, uses: 3});

    await assert.rejects(saveCouponCore(db, coupon({couponId, code: "OUTRO10"}), ACTOR, NOW), (err) => {
      assert.deepEqual(fieldsOf(err), ["code"]);
      return true;
    });
    await assert.rejects(
      saveCouponCore(db, coupon({couponId, type: "fixed", value: 3000, maxDiscountCents: null}), ACTOR, NOW),
      {code: "failed-precondition"},
    );
    await saveCouponCore(db, coupon({couponId, usageLimit: 500}), ACTOR, NOW);
    assert.equal(fake.store.get(`storeCoupons/${couponId}`)!["usageLimit"], 500);
    assert.equal(fake.store.get(`storeCoupons/${couponId}`)!["uses"], 3);
  });

  it("valida código, porcentagem, teto em valor fixo, escopo e datas", async () => {
    const {db} = makeDb();
    await assert.rejects(
      saveCouponCore(db, coupon({code: "AB", value: 120, endDate: "2026-10-01"}), ACTOR, NOW),
      (err) => {
        assert.deepEqual(fieldsOf(err), ["code", "endDate", "value"]);
        return true;
      },
    );
    await assert.rejects(
      saveCouponCore(db, coupon({type: "fixed", value: 3000, maxDiscountCents: 100}), ACTOR, NOW),
      (err) => {
        assert.deepEqual(fieldsOf(err), ["maxDiscountCents"]);
        return true;
      },
    );
    await assert.rejects(
      saveCouponCore(db, coupon({scope: {type: "category", ids: [], labels: []}}), ACTOR, NOW),
      (err) => {
        assert.deepEqual(fieldsOf(err), ["scope"]);
        return true;
      },
    );
  });

  it("aceita escopo com alvo e sem prazo", async () => {
    const {fake, db} = makeDb();
    const {couponId} = await saveCouponCore(
      db,
      coupon({scope: {type: "collection", ids: ["verao-2026"], labels: ["Verão 2026"]}, endDate: null, usageLimit: null}),
      ACTOR,
      NOW,
    );
    const doc = fake.store.get(`storeCoupons/${couponId}`)!;
    assert.deepEqual(doc["scope"], {type: "collection", ids: ["verao-2026"], labels: ["Verão 2026"]});
    assert.equal(doc["endDate"], null);
  });
});

describe("pausar e encerrar", () => {
  it("pausa, reativa e encerra; encerrado não volta", async () => {
    const {fake, db} = makeDb();
    const {couponId} = await saveCouponCore(db, coupon(), ACTOR, NOW);

    await setCouponPausedCore(db, {couponId, paused: true}, ACTOR, NOW);
    assert.equal(fake.store.get(`storeCoupons/${couponId}`)!["paused"], true);

    await endCouponCore(db, {couponId}, ACTOR, NOW);
    assert.deepEqual(fake.store.get(`storeCoupons/${couponId}`)!["endedAt"], NOW);
    // O código continua reservado: pedidos antigos apontam para ele.
    assert.ok(fake.store.has("storeCouponCodes/RACHA10"));

    await assert.rejects(setCouponPausedCore(db, {couponId, paused: false}, ACTOR, NOW), {
      code: "failed-precondition",
    });
  });

  it("cupom inexistente é not-found", async () => {
    const {db} = makeDb();
    await assert.rejects(endCouponCore(db, {couponId: "nao-existe"}, ACTOR, NOW), {code: "not-found"});
  });
});

describe("descontos automáticos", () => {
  it("liga/desliga uma regra preservando as outras", async () => {
    const {fake, db} = makeDb();
    const rules = await setAutoDiscountActiveCore(db, {id: "leve3pague2", active: true}, ACTOR, NOW);
    assert.equal(rules.find((r) => r.id === "leve3pague2")!.active, true);
    assert.equal(rules.find((r) => r.id === "pix")!.percent, 5);
    assert.equal((fake.store.get("storeConfig/discounts")!["rules"] as unknown[]).length, 3);
  });

  it("recusa regra desconhecida", async () => {
    const {db} = makeDb();
    await assert.rejects(setAutoDiscountActiveCore(db, {id: "x" as "pix", active: true}, ACTOR, NOW), {
      code: "invalid-argument",
    });
  });

  it("doc antigo ganha a regra nova do padrão", () => {
    const rules = withDiscountDefaults({rules: [{id: "pix", active: false}]});
    assert.equal(rules.length, 3);
    assert.equal(rules.find((r) => r.id === "pix")!.active, false);
  });
});

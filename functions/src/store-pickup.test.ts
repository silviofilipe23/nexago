import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  DEFAULT_SHIPPING_CONFIG,
  saveShippingRulesCore,
  savePickupPointCore,
  setPickupPointActiveCore,
  setShippingModeActiveCore,
  withShippingDefaults,
  type SavePickupPointInput,
  type ShippingRules,
} from "./store-pickup";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.store.set("arenas/a1", {name: "Arena Errejota", address: "Av. Perimetral, 1200", city: "Goiânia", state: "GO"});
  fake.store.set("arenas/pre", {name: "Arena Pré", unclaimed: true});
  fake.store.set("storeLocations/arena-errejota", {name: "Arena Errejota", type: "arena", arenaId: "a1"});
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Ana Souza"};
const NOW = new Date("2026-10-16T18:00:00Z");

function point(over: Partial<SavePickupPointInput> = {}): SavePickupPointInput {
  return {
    arenaId: "a1", counter: " Recepção ", hours: "8h–22h", managerName: "Paula R.",
    restockHours: 24, commissionPct: null, active: true, ...over,
  };
}

const RULES: ShippingRules = {
  freeShippingAboveCents: 29900, pickupDeadlineDays: 7, originZip: "74215-010",
  handlingHours: 48, cancelExpiredPickup: false, refundAsWalletCredit: true,
};

describe("savePickupPointCore", () => {
  it("cria o ponto com o id da arena, copia nome/endereço e liga ao local de estoque", async () => {
    const {fake, db} = makeDb();
    await savePickupPointCore(db, point(), ACTOR, NOW);

    const doc = fake.store.get("storePickupPoints/a1")!;
    assert.equal(doc["name"], "Arena Errejota");
    assert.equal(doc["address"], "Av. Perimetral, 1200");
    assert.equal(doc["counter"], "Recepção");
    assert.equal(doc["locationId"], "arena-errejota");
    assert.equal(doc["commissionPct"], null);
    assert.deepEqual(doc["createdAt"], NOW);
    assert.deepEqual(doc["updatedBy"], ACTOR);
  });

  it("não reescreve o createdAt ao editar", async () => {
    const {fake, db} = makeDb();
    await savePickupPointCore(db, point(), ACTOR, NOW);
    const later = new Date("2026-10-17T10:00:00Z");
    await savePickupPointCore(db, point({counter: "Lanchonete"}), ACTOR, later);

    const doc = fake.store.get("storePickupPoints/a1")!;
    assert.deepEqual(doc["createdAt"], NOW);
    assert.deepEqual(doc["updatedAt"], later);
    assert.equal(doc["counter"], "Lanchonete");
  });

  it("recusa arena inexistente e pré-cadastrada", async () => {
    const {db} = makeDb();
    await assert.rejects(savePickupPointCore(db, point({arenaId: "nao-existe"}), ACTOR, NOW), {code: "not-found"});
    await assert.rejects(savePickupPointCore(db, point({arenaId: "pre"}), ACTOR, NOW), {code: "failed-precondition"});
  });

  it("valida comissão e prazo de abastecimento", async () => {
    const {db} = makeDb();
    await assert.rejects(
      savePickupPointCore(db, point({commissionPct: 120, restockHours: 12 as 24}), ACTOR, NOW),
      (err: {details?: {fields: string[]}}) => {
        assert.deepEqual(err.details?.fields, ["commissionPct", "restockHours"]);
        return true;
      },
    );
  });
});

describe("setPickupPointActiveCore", () => {
  it("só liga ponto já configurado", async () => {
    const {fake, db} = makeDb();
    await assert.rejects(setPickupPointActiveCore(db, {arenaId: "a1", active: true}, ACTOR, NOW), {
      code: "failed-precondition",
    });
    await savePickupPointCore(db, point({active: false}), ACTOR, NOW);
    await setPickupPointActiveCore(db, {arenaId: "a1", active: true}, ACTOR, NOW);
    assert.equal(fake.store.get("storePickupPoints/a1")!["active"], true);
    assert.equal(fake.store.get("storePickupPoints/a1")!["counter"], "Recepção");
  });
});

describe("regras de frete", () => {
  it("grava as regras sobre o padrão e preserva as modalidades", async () => {
    const {fake, db} = makeDb();
    const saved = await saveShippingRulesCore(db, RULES, ACTOR, NOW);
    assert.equal(saved.freeShippingAboveCents, 29900);
    assert.equal(saved.defaultCommissionPct, 4);
    assert.equal(fake.store.get("storeConfig/shipping")!["pickupDeadlineDays"], 7);
    assert.equal((fake.store.get("storeConfig/shipping")!["modes"] as unknown[]).length, 3);
  });

  it("recusa CEP incompleto e prazo zero", async () => {
    const {db} = makeDb();
    await assert.rejects(
      saveShippingRulesCore(db, {...RULES, originZip: "74215", pickupDeadlineDays: 0}, ACTOR, NOW),
      (err: {details?: {fields: string[]}}) => {
        assert.deepEqual(err.details?.fields, ["originZip", "pickupDeadlineDays"]);
        return true;
      },
    );
  });

  it("liga/desliga modalidade fixa, mas não liga a calculada sem Melhor Envio", async () => {
    const {db} = makeDb();
    const next = await setShippingModeActiveCore(db, {modeId: "motoboy", active: true}, ACTOR, NOW);
    assert.equal(next.modes.find((m) => m.id === "motoboy")!.active, true);
    await assert.rejects(setShippingModeActiveCore(db, {modeId: "padrao", active: true}, ACTOR, NOW), {
      code: "failed-precondition",
    });
    // Desligar a calculada sempre pode.
    const off = await setShippingModeActiveCore(db, {modeId: "padrao", active: false}, ACTOR, NOW);
    assert.equal(off.modes.find((m) => m.id === "padrao")!.active, false);
  });

  it("completa doc antigo com modalidade nova do padrão", () => {
    const merged = withShippingDefaults({modes: [{id: "expressa", active: false}]});
    assert.equal(merged.modes.length, DEFAULT_SHIPPING_CONFIG.modes.length);
    assert.equal(merged.modes.find((m) => m.id === "expressa")!.active, false);
    assert.equal(merged.modes.find((m) => m.id === "expressa")!.priceCents, 3490);
  });
});

import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {saveStoreProductCore, type SaveProductInput} from "./store-catalog-write";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Ana Souza"};
const NOW = new Date("2026-10-15T18:00:00Z");

function input(over: Partial<SaveProductInput> = {}): SaveProductInput {
  return {
    name: "Camiseta Dry UV50 Areia",
    baseSku: "NX-CAM",
    category: "vestuario",
    collection: "verao-2026",
    brand: "NexaGO",
    description: "Camiseta em poliamida dry.",
    technicalDetails: [],
    badge: null,
    priceCents: 12990,
    compareAtPriceCents: null,
    costCents: 4820,
    channels: {app: true, web: true},
    fulfillment: {pickup: true, delivery: true},
    featured: false,
    shipping: {weightGrams: 180, lengthCm: 30, widthCm: 22, heightCm: 3},
    lowStockThreshold: 3,
    status: "ativo",
    active: true,
    ...over,
  };
}

describe("saveStoreProductCore — criação", () => {
  it("grava o produto, reserva o slug e nasce na versão 1", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);

    const doc = fake.store.get(`storeProducts/${productId}`)!;
    assert.equal(doc["name"], "Camiseta Dry UV50 Areia");
    assert.equal(doc["slug"], "camiseta-dry-uv50-areia");
    assert.equal(doc["version"], 1);
    assert.deepEqual(doc["updatedBy"], ACTOR);
    assert.equal(doc["publishedAt"] instanceof Date, true);
    assert.ok(fake.store.has("storeCatalogKeys/slug:camiseta-dry-uv50-areia"));
  });

  it("o custo vai para a coleção privada, nunca para o produto", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);

    assert.equal(fake.store.get(`storeProducts/${productId}`)!["costCents"], undefined);
    assert.equal(fake.store.get(`storeProductCosts/${productId}`)!["costCents"], 4820);
  });

  it("custo zero é custo informado, e vai gravado", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input({costCents: 0}), ACTOR, NOW);
    assert.equal(fake.store.get(`storeProductCosts/${productId}`)!["costCents"], 0);
  });

  it("custo nulo não cria o documento de custo", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input({costCents: null}), ACTOR, NOW);
    assert.equal(fake.store.has(`storeProductCosts/${productId}`), false);
  });

  it("nome repetido ganha slug com desempate, em vez de estourar", async () => {
    const {fake, db} = makeDb();
    await saveStoreProductCore(db, input(), ACTOR, NOW);
    const second = await saveStoreProductCore(db, input(), ACTOR, NOW);

    assert.equal(fake.store.get(`storeProducts/${second.productId}`)!["slug"], "camiseta-dry-uv50-areia-2");
    assert.ok(fake.store.has("storeCatalogKeys/slug:camiseta-dry-uv50-areia-2"));
  });

  it("rascunho salva mesmo sem canal, entrega nem preço", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(
      db,
      input({status: "rascunho", priceCents: 0, channels: {app: false, web: false}}),
      ACTOR,
      NOW,
    );
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["status"], "rascunho");
  });

  it("publicar sem canal é recusado, dizendo qual campo", async () => {
    const {db} = makeDb();
    await assert.rejects(
      () => saveStoreProductCore(db, input({channels: {app: false, web: false}}), ACTOR, NOW),
      (err: Error & {details?: {fields?: string[]}}) => {
        assert.deepEqual(err.details?.fields, ["channels"]);
        return true;
      },
    );
  });

  it("rascunho não ganha publishedAt", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input({status: "rascunho"}), ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["publishedAt"], null);
  });
});

describe("saveStoreProductCore — atualização", () => {
  async function seeded() {
    const made = makeDb();
    const {productId} = await saveStoreProductCore(made.db, input(), ACTOR, NOW);
    return {...made, productId};
  }

  it("incrementa a versão a cada escrita", async () => {
    const {fake, db, productId} = await seeded();
    await saveStoreProductCore(db, input({productId, version: 1, name: "Camiseta Dry UV50"}), ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["version"], 2);
  });

  it("versão velha é recusada, dizendo quem salvou antes", async () => {
    const {db, productId} = await seeded();
    await assert.rejects(
      () => saveStoreProductCore(db, input({productId, version: 99}), ACTOR, NOW),
      (err: Error & {code?: string; details?: {updatedBy?: {name: string}}}) => {
        assert.equal(err.code, "failed-precondition");
        assert.equal(err.details?.updatedBy?.name, "Ana Souza");
        return true;
      },
    );
  });

  it("manter o nome mantém o slug, sem gerar desempate contra si mesmo", async () => {
    const {fake, db, productId} = await seeded();
    await saveStoreProductCore(db, input({productId, version: 1}), ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["slug"], "camiseta-dry-uv50-areia");
  });

  it("trocar o nome libera a chave do slug antigo", async () => {
    const {fake, db, productId} = await seeded();
    await saveStoreProductCore(db, input({productId, version: 1, name: "Camiseta Areia Pro"}), ACTOR, NOW);
    assert.equal(fake.store.has("storeCatalogKeys/slug:camiseta-dry-uv50-areia"), false);
    assert.ok(fake.store.has("storeCatalogKeys/slug:camiseta-areia-pro"));
  });

  it("publicar pela primeira vez carimba publishedAt; republicar não remexe", async () => {
    const {fake, db} = makeDb();
    const first = await saveStoreProductCore(db, input({status: "rascunho"}), ACTOR, NOW);
    await saveStoreProductCore(db, input({productId: first.productId, version: 1}), ACTOR, NOW);
    const stamped = fake.store.get(`storeProducts/${first.productId}`)!["publishedAt"];

    const later = new Date("2026-11-20T18:00:00Z");
    await saveStoreProductCore(db, input({productId: first.productId, version: 2}), ACTOR, later);
    assert.deepEqual(fake.store.get(`storeProducts/${first.productId}`)!["publishedAt"], stamped);
  });
});

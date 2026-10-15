import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  archiveCore,
  duplicateCore,
  saveStoreProductCore,
  saveVariationsCore,
  type SaveProductInput,
  type SaveVariationsInput,
} from "./store-catalog-write";

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

describe("saveVariationsCore", () => {
  const AXES = [
    {id: "cor", label: "Cor", values: [
      {id: "branco", label: "Branco areia", hex: "#F2EDE4"},
      {id: "laranja", label: "Laranja", hex: "#FF6A1A"},
    ]},
    {id: "tam", label: "Tamanho", values: [{id: "p", label: "P"}, {id: "m", label: "M"}]},
  ];

  function variations(over: Partial<SaveVariationsInput> = {}): SaveVariationsInput {
    return {
      productId: "p1",
      version: 1,
      axes: AXES,
      skus: [
        {axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: 6}, priceCents: null, barcode: null},
        {axisValues: {cor: "branco", tam: "m"}, stockByLocation: {cd: 2}, priceCents: null, barcode: null},
        {axisValues: {cor: "laranja", tam: "p"}, stockByLocation: {cd: 4}, priceCents: null, barcode: null},
      ],
      ...over,
    };
  }

  async function seeded() {
    const made = makeDb();
    const {productId} = await saveStoreProductCore(made.db, input(), ACTOR, NOW);
    return {...made, productId};
  }

  it("grava um documento por SKU, com id e código vindos dos eixos", async () => {
    const {fake, db, productId} = await seeded();
    await saveVariationsCore(db, variations({productId}), ACTOR, NOW);

    const sku = fake.store.get(`storeProducts/${productId}/skus/branco_p`)!;
    assert.equal(sku["code"], "NX-CAM-BRANCO-P");
    assert.equal(sku["stock"], 6);
    assert.ok(fake.store.has(`storeProducts/${productId}/skus/laranja_p`));
  });

  it("os rollups do pai batem com a soma dos SKUs", async () => {
    const {fake, db, productId} = await seeded();
    await saveVariationsCore(db, variations({productId}), ACTOR, NOW);

    const product = fake.store.get(`storeProducts/${productId}`)!;
    assert.equal(product["skuCount"], 3);
    assert.equal(product["stockTotal"], 12);
    assert.equal(product["priceFromCents"], 12990);
  });

  it("estoque de vários locais soma no SKU e no rollup", async () => {
    const {fake, db, productId} = await seeded();
    await saveVariationsCore(db, variations({
      productId,
      skus: [{axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: 6, arena1: 4}, priceCents: null, barcode: null}],
    }), ACTOR, NOW);

    assert.equal(fake.store.get(`storeProducts/${productId}/skus/branco_p`)!["stock"], 10);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["stockTotal"], 10);
  });

  it("estoque negativo é recusado, em vez de virar rollup negativo", async () => {
    const {db, productId} = await seeded();
    await assert.rejects(
      () => saveVariationsCore(db, variations({
        productId,
        skus: [{axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: -3}, priceCents: null, barcode: null}],
      }), ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("tirar um SKU que tinha estoque diz o que seria perdido, em vez de sumir calado", async () => {
    const {db, productId} = await seeded();
    await saveVariationsCore(db, variations({productId}), ACTOR, NOW);

    await assert.rejects(
      () => saveVariationsCore(db, variations({
        productId,
        version: 2,
        skus: [{axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: 6}, priceCents: null, barcode: null}],
      }), ACTOR, NOW),
      (err: Error & {details?: {droppedWithStock?: string[]}}) => {
        assert.deepEqual(err.details?.droppedWithStock?.sort(), ["branco_m", "laranja_p"]);
        return true;
      },
    );
  });

  it("tirar um SKU zerado é permitido e some do rollup", async () => {
    const {fake, db, productId} = await seeded();
    await saveVariationsCore(db, variations({
      productId,
      skus: [
        {axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: 6}, priceCents: null, barcode: null},
        {axisValues: {cor: "branco", tam: "m"}, stockByLocation: {cd: 0}, priceCents: null, barcode: null},
      ],
    }), ACTOR, NOW);

    await saveVariationsCore(db, variations({
      productId,
      version: 2,
      skus: [{axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: 6}, priceCents: null, barcode: null}],
    }), ACTOR, NOW);

    assert.equal(fake.store.has(`storeProducts/${productId}/skus/branco_m`), false);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["skuCount"], 1);
  });

  it("código de SKU já usado por outro produto é recusado", async () => {
    const {fake, db, productId} = await seeded();
    fake.store.set("storeCatalogKeys/sku:NX-CAM-BRANCO-P", {productId: "outro", skuId: "x"});

    await assert.rejects(
      () => saveVariationsCore(db, variations({productId}), ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("acima do teto de SKUs é recusado antes de escrever", async () => {
    const {db, productId} = await seeded();
    const many = Array.from({length: 101}, (_, i) => ({
      axisValues: {cor: `c${i}`, tam: "p"},
      stockByLocation: {cd: 1},
      priceCents: null,
      barcode: null,
    }));
    await assert.rejects(
      () => saveVariationsCore(db, variations({productId, skus: many}), ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("versão velha é recusada", async () => {
    const {db, productId} = await seeded();
    await assert.rejects(
      () => saveVariationsCore(db, variations({productId, version: 99}), ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });
});

describe("archiveCore", () => {
  it("arquiva e depois restaura como rascunho", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);

    await archiveCore(db, {productId, version: 1}, ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["status"], "arquivado");

    await archiveCore(db, {productId, version: 2, restore: true}, ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["status"], "rascunho");
  });

  it("recusa versão velha", async () => {
    const {db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    await assert.rejects(
      () => archiveCore(db, {productId, version: 99}, ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });
});

describe("duplicateCore", () => {
  async function withVariations() {
    const made = makeDb();
    const {productId} = await saveStoreProductCore(made.db, input(), ACTOR, NOW);
    await saveVariationsCore(made.db, {
      productId,
      version: 1,
      axes: [{id: "cor", label: "Cor", values: [{id: "branco", label: "Branco"}]}],
      skus: [{axisValues: {cor: "branco"}, stockByLocation: {cd: 9}, priceCents: null, barcode: "789"}],
    }, ACTOR, NOW);
    return {...made, productId};
  }

  it("a cópia nasce rascunho, com nome e slug próprios", async () => {
    const {fake, db, productId} = await withVariations();
    const copy = await duplicateCore(db, {productId}, ACTOR, NOW);

    const doc = fake.store.get(`storeProducts/${copy.productId}`)!;
    assert.equal(doc["status"], "rascunho");
    assert.equal(doc["name"], "Cópia de Camiseta Dry UV50 Areia");
    assert.notEqual(doc["slug"], "camiseta-dry-uv50-areia");
    assert.equal(doc["version"], 1);
  });

  it("a cópia leva as variações com estoque zerado", async () => {
    const {fake, db, productId} = await withVariations();
    const copy = await duplicateCore(db, {productId}, ACTOR, NOW);

    const sku = fake.store.get(`storeProducts/${copy.productId}/skus/branco`)!;
    assert.equal(sku["stock"], 0);
    assert.deepEqual(sku["stockByLocation"], {});
    assert.equal(fake.store.get(`storeProducts/${copy.productId}`)!["stockTotal"], 0);
  });

  it("a cópia não herda o código de barras, que é único do original", async () => {
    const {fake, db, productId} = await withVariations();
    const copy = await duplicateCore(db, {productId}, ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${copy.productId}/skus/branco`)!["barcode"], null);
  });

  it("a cópia não leva o custo do original", async () => {
    const {fake, db, productId} = await withVariations();
    const copy = await duplicateCore(db, {productId}, ACTOR, NOW);
    assert.equal(fake.store.has(`storeProductCosts/${copy.productId}`), false);
  });
});

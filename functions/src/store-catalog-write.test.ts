import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  archiveCore,
  duplicateCore,
  saveStoreProductCore,
  savePhotosCore,
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

describe("fix pass — invariantes que a revisão final achou", () => {
  const AXES_FIX = [
    {id: "cor", label: "Cor", values: [
      {id: "branco", label: "Branco areia", hex: "#F2EDE4"},
      {id: "laranja", label: "Laranja", hex: "#FF6A1A"},
    ]},
    {id: "tam", label: "Tamanho", values: [{id: "p", label: "P"}, {id: "m", label: "M"}]},
  ];

  function sku(cor: string, tam: string, stock: number, priceCents: number | null = null) {
    return {axisValues: {cor, tam}, stockByLocation: {cd: stock}, priceCents, barcode: null};
  }

  async function withGrid() {
    const made = makeDb();
    const {productId} = await saveStoreProductCore(made.db, input(), ACTOR, NOW);
    await saveVariationsCore(made.db, {
      productId, version: 1, axes: AXES_FIX,
      skus: [sku("branco", "p", 6), sku("laranja", "m", 2)],
    }, ACTOR, NOW);
    return {...made, productId};
  }

  it("salvar o produto não apaga os eixos que o admin cadastrou", async () => {
    const {fake, db, productId} = await withGrid();
    await saveStoreProductCore(db, input({productId, version: 2, priceCents: 9990}), ACTOR, NOW);

    const doc = fake.store.get(`storeProducts/${productId}`)!;
    expectAxisIds(doc, ["cor", "tam"]);
    assert.equal(doc["skuCount"], 2);
  });

  function expectAxisIds(doc: Record<string, unknown>, ids: string[]) {
    const axes = (doc["axes"] ?? []) as {id: string}[];
    assert.deepEqual(axes.map((a) => a.id), ids);
  }

  it("dois SKUs na mesma combinação são recusados, em vez de virar estoque fantasma", async () => {
    const {db, productId} = await withGrid();
    await assert.rejects(
      () => saveVariationsCore(db, {
        productId, version: 2, axes: AXES_FIX,
        skus: [sku("branco", "p", 6), sku("branco", "p", 5)],
      }, ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("valor de eixo que não existe no eixo declarado é recusado", async () => {
    const {db, productId} = await withGrid();
    await assert.rejects(
      () => saveVariationsCore(db, {
        productId, version: 2, axes: AXES_FIX, skus: [sku("azul", "p", 7)],
      }, ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("SKU sem um dos eixos declarados é recusado, em vez de colapsar em 'unico'", async () => {
    const {db, productId} = await withGrid();
    await assert.rejects(
      () => saveVariationsCore(db, {
        productId, version: 2, axes: AXES_FIX,
        skus: [{axisValues: {cor: "branco"}, stockByLocation: {cd: 3}, priceCents: null, barcode: null}],
      }, ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("rollup e documentos sempre batem depois de um save válido", async () => {
    const {fake, productId} = await withGrid();
    const product = fake.store.get(`storeProducts/${productId}`)!;
    const docs = [...fake.store.keys()].filter((k) => k.startsWith(`storeProducts/${productId}/skus/`));
    assert.equal(product["skuCount"], docs.length);
    assert.equal(
      product["stockTotal"],
      docs.reduce((t, k) => t + (fake.store.get(k)!["stock"] as number), 0),
    );
  });

  it("custo omitido não quebra o save", async () => {
    const {fake, db} = makeDb();
    const semCusto = input();
    delete (semCusto as {costCents?: number | null}).costCents;
    const {productId} = await saveStoreProductCore(db, semCusto, ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["name"], "Camiseta Dry UV50 Areia");
  });

  it("custo nulo explícito apaga o custo que existia", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    assert.ok(fake.store.has(`storeProductCosts/${productId}`));

    await saveStoreProductCore(db, input({productId, version: 1, costCents: null}), ACTOR, NOW);
    // O doc fica (guarda o custo médio por SKU), mas o custo do produto some.
    assert.equal(fake.store.get(`storeProductCosts/${productId}`)!["costCents"], null);
  });

  it("entrada sem nome vira invalid-argument, não erro interno", async () => {
    const {db} = makeDb();
    const semNome = input({status: "rascunho"});
    delete (semNome as {name?: string}).name;
    await assert.rejects(
      () => saveStoreProductCore(db, semNome, ACTOR, NOW),
      (err: Error & {code?: string; details?: {fields?: string[]}}) => {
        assert.equal(err.code, "invalid-argument");
        assert.ok(err.details?.fields?.includes("name"));
        return true;
      },
    );
  });

  it("status fora do enum e preço negativo são recusados", async () => {
    const {db} = makeDb();
    await assert.rejects(
      () => saveStoreProductCore(db, input({status: "qualquer" as never}), ACTOR, NOW),
      (err: Error & {code?: string}) => (assert.equal(err.code, "invalid-argument"), true),
    );
    await assert.rejects(
      () => saveStoreProductCore(db, input({status: "rascunho", priceCents: -5}), ACTOR, NOW),
      (err: Error & {code?: string}) => (assert.equal(err.code, "invalid-argument"), true),
    );
  });

  it("baseSku com caractere que quebra caminho de documento é recusado", async () => {
    const {db} = makeDb();
    await assert.rejects(
      () => saveStoreProductCore(db, input({status: "rascunho", baseSku: "NX/CAM"}), ACTOR, NOW),
      (err: Error & {code?: string}) => (assert.equal(err.code, "invalid-argument"), true),
    );
  });

  it("baixar o preço do produto atualiza o 'a partir de'", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    await saveVariationsCore(db, {
      productId, version: 1, axes: AXES_FIX, skus: [sku("branco", "p", 6, 9900)],
    }, ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["priceFromCents"], 9900);

    await saveStoreProductCore(db, input({productId, version: 2, priceCents: 4900}), ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["priceFromCents"], 4900);
  });

  it("renomear a raiz do SKU não deixa chave órfã bloqueando outro produto", async () => {
    const {fake, db, productId} = await withGrid();
    assert.ok(fake.store.has("storeCatalogKeys/sku:NX-CAM-BRANCO-P"));

    await saveStoreProductCore(db, input({productId, version: 2, baseSku: "NX-TSH"}), ACTOR, NOW);
    await saveVariationsCore(db, {
      productId, version: 3, axes: AXES_FIX,
      skus: [sku("branco", "p", 6), sku("laranja", "m", 2)],
    }, ACTOR, NOW);

    assert.ok(fake.store.has("storeCatalogKeys/sku:NX-TSH-BRANCO-P"));
    assert.equal(fake.store.has("storeCatalogKeys/sku:NX-CAM-BRANCO-P"), false);
  });

  it("duplicar o mesmo produto duas vezes funciona", async () => {
    const {db, productId} = await withGrid();
    const first = await duplicateCore(db, {productId}, ACTOR, NOW);
    const second = await duplicateCore(db, {productId}, ACTOR, NOW);
    assert.notEqual(first.productId, second.productId);
  });

  it("a cópia leva o 'a partir de' das suas próprias variações", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    await saveVariationsCore(db, {
      productId, version: 1, axes: AXES_FIX, skus: [sku("branco", "p", 6, 8900)],
    }, ACTOR, NOW);

    const copy = await duplicateCore(db, {productId}, ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${copy.productId}`)!["priceFromCents"], 8900);
  });

  it("o documento do SKU não repete o id dentro dele, igual ao seed", async () => {
    const {fake, productId} = await withGrid();
    const doc = fake.store.get(`storeProducts/${productId}/skus/branco_p`)!;
    assert.equal(doc["id"], undefined);
    assert.equal(doc["code"], "NX-CAM-BRANCO-P");
  });
});

describe("códigos de barras desnormalizados no produto", () => {
  const AXES_BC = [
    {id: "cor", label: "Cor", values: [{id: "branco", label: "Branco"}, {id: "preto", label: "Preto"}]},
  ];

  it("o produto guarda os códigos dos SKUs, que é por onde a lista busca", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    await saveVariationsCore(db, {
      productId, version: 1, axes: AXES_BC,
      skus: [
        {axisValues: {cor: "branco"}, stockByLocation: {cd: 3}, priceCents: null, barcode: "789100001"},
        {axisValues: {cor: "preto"}, stockByLocation: {cd: 2}, priceCents: null, barcode: "789100002"},
      ],
    }, ACTOR, NOW);

    assert.deepEqual(fake.store.get(`storeProducts/${productId}`)!["barcodes"], [
      "789100001",
      "789100002",
    ]);
  });

  it("SKU sem código não deixa buraco na lista", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    await saveVariationsCore(db, {
      productId, version: 1, axes: AXES_BC,
      skus: [
        {axisValues: {cor: "branco"}, stockByLocation: {cd: 3}, priceCents: null, barcode: null},
        {axisValues: {cor: "preto"}, stockByLocation: {cd: 2}, priceCents: null, barcode: "789100002"},
      ],
    }, ACTOR, NOW);

    assert.deepEqual(fake.store.get(`storeProducts/${productId}`)!["barcodes"], ["789100002"]);
  });
});

describe("savePhotosCore", () => {
  const photo = (productId: string, n: number, over = {}) => ({
    id: `p${n}`,
    url: `https://storage.example/p${n}.jpg`,
    path: `store/products/${productId}/p${n}.jpg`,
    colorValueId: null,
    ...over,
  });

  it("grava a ordem, sobe a versão e preserva o resto do produto", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    const result = await savePhotosCore(
      db, {productId, version: 1, photos: [photo(productId, 2), photo(productId, 1)]}, ACTOR, NOW,
    );
    assert.equal(result.version, 2);
    const doc = fake.store.get(`storeProducts/${productId}`)!;
    assert.deepEqual((doc["photos"] as {id: string}[]).map((p) => p.id), ["p2", "p1"]);
    assert.equal(doc["name"], "Camiseta Dry UV50 Areia");
  });

  it("grava o lado da foto e recusa dois iguais ou lado desconhecido", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    await savePhotosCore(db, {productId, version: 1, photos: [
      photo(productId, 1, {view: "frente"}), photo(productId, 2, {view: "costas"}), photo(productId, 3),
    ]}, ACTOR, NOW);
    const saved = fake.store.get(`storeProducts/${productId}`)!["photos"] as {view: string | null}[];
    assert.deepEqual(saved.map((p) => p.view), ["frente", "costas", null]);

    await assert.rejects(savePhotosCore(db, {productId, version: 2, photos: [
      photo(productId, 1, {view: "frente"}), photo(productId, 2, {view: "frente"}),
    ]}, ACTOR, NOW), {code: "invalid-argument"});
    await assert.rejects(savePhotosCore(db, {productId, version: 2, photos: [
      photo(productId, 1, {view: "lado"}),
    ]}, ACTOR, NOW), {code: "invalid-argument"});
  });

  it("recusa caminho de outro produto, id repetido e mais de 10 fotos", async () => {
    const {db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    await assert.rejects(savePhotosCore(db, {productId, version: 1, photos: [photo("outro", 1)]}, ACTOR, NOW));
    await assert.rejects(
      savePhotosCore(db, {productId, version: 1, photos: [photo(productId, 1), photo(productId, 1)]}, ACTOR, NOW),
    );
    const many = Array.from({length: 11}, (_, i) => photo(productId, i));
    await assert.rejects(savePhotosCore(db, {productId, version: 1, photos: many}, ACTOR, NOW));
  });

  it("versão velha dá conflito", async () => {
    const {db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    await assert.rejects(savePhotosCore(db, {productId, version: 9, photos: []}, ACTOR, NOW));
  });
});

describe("saveVariationsCore — movimentação de ajuste", () => {
  const axes = [
    {id: "cor", label: "Cor", values: [{id: "branco", label: "Branco areia"}]},
    {id: "tam", label: "Tamanho", values: [{id: "p", label: "P"}, {id: "m", label: "M"}]},
  ];
  const movements = (fake: FakeFirestore) =>
    [...fake.store.entries()].filter(([k]) => k.startsWith("storeStockMovements/")).map(([, v]) => v);

  it("registra um ajuste com a diferença por SKU e local, e nada quando o saldo não muda", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    const skus = (p: number, m: number) => [
      {axisValues: {cor: "branco", tam: "p"}, barcode: null, priceCents: null, stockByLocation: {cd: p}},
      {axisValues: {cor: "branco", tam: "m"}, barcode: null, priceCents: null, stockByLocation: {cd: m}},
    ];
    await saveVariationsCore(db, {productId, version: 1, axes, skus: skus(5, 0)}, ACTOR, NOW);
    let all = movements(fake);
    assert.equal(all.length, 1);
    assert.equal(all[0]!["type"], "ajuste");
    const items = all[0]!["items"] as {skuCode: string; variantLabel: string; delta: number; before: number}[];
    assert.deepEqual(items.map((i) => [i.skuCode, i.variantLabel, i.delta, i.before]), [
      ["NX-CAM-BRANCO-P", "Branco areia · P", 5, 0],
    ]);

    await saveVariationsCore(db, {productId, version: 2, axes, skus: skus(5, 0)}, ACTOR, NOW);
    assert.equal(movements(fake).length, 1);

    await saveVariationsCore(db, {productId, version: 3, axes, skus: skus(3, 2)}, ACTOR, NOW);
    all = movements(fake);
    assert.equal(all.length, 2);
    // Alerta padrão do input() é 3: P com 3 não é baixo, M com 2 é.
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["lowStockSkuCount"], 1);
    const last = all.find((m) => (m["items"] as unknown[]).length === 2)!;
    assert.deepEqual((last["items"] as {delta: number}[]).map((i) => i.delta), [-2, 2]);
    assert.deepEqual(last["actor"], ACTOR);
  });
});

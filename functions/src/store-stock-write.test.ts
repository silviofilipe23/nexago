import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {saveStoreProductCore, saveVariationsCore, type SaveProductInput} from "./store-catalog-write";
import {
  advanceTransferCore,
  confirmStockEntryCore,
  saveStockEntryDraftCore,
  saveTransferCore,
  type StockEntryInput,
  type TransferInput,
} from "./store-stock-write";

const ACTOR = {uid: "admin1", name: "Ana Souza"};
const NOW = new Date("2026-10-16T13:00:00Z");

function product(): SaveProductInput {
  return {
    name: "Óculos Polarizado Sunline", baseSku: "NX-OCU", category: "acessorios", collection: null,
    brand: "NexaGO", description: "", technicalDetails: [], badge: null, priceCents: 19990,
    compareAtPriceCents: null, costCents: 5780, channels: {app: true, web: true},
    fulfillment: {pickup: true, delivery: false}, featured: false, shipping: null, lowStockThreshold: 3,
    status: "rascunho", active: false,
  };
}

async function setup(stock: Record<string, number> = {cd: 22}) {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  for (const [id, name] of [["cd", "CD Goiânia"], ["arena-cfc", "Arena CFC"]]) {
    await db.collection("storeLocations").doc(id).set({name, type: id === "cd" ? "cd" : "arena", order: 0});
  }
  const {productId} = await saveStoreProductCore(db, product(), ACTOR, NOW);
  await saveVariationsCore(db, {
    productId, version: 1, axes: [],
    skus: [{axisValues: {}, barcode: "789", priceCents: null, stockByLocation: stock}],
  }, ACTOR, NOW);
  const sku = () => fake.store.get(`storeProducts/${productId}/skus/unico`)!;
  const prod = () => fake.store.get(`storeProducts/${productId}`)!;
  const moves = () => [...fake.store.entries()].filter(([k]) => k.startsWith("storeStockMovements/")).map(([, v]) => v);
  return {fake, db, productId, sku, prod, moves};
}

function entry(productId: string, over: Partial<StockEntryInput> = {}): StockEntryInput {
  return {
    entryId: "entrada-0001", subtype: "compra", supplier: "Sunline Óculos Ltda.", nfNumber: "8812",
    purchaseOrder: "", originOrder: "", reason: "", toLocationId: "cd", receivedAt: "2026-10-16",
    freightCents: 0, items: [{productId, skuId: "unico", qty: 40, unitCostCents: 6250}], note: "",
    attachments: [], options: {updateAvgCost: true}, ...over,
  };
}

describe("confirmStockEntryCore", () => {
  it("soma no destino, recalcula o custo médio, grava a movimentação e sobe a versão", async () => {
    const {fake, db, productId, sku, prod, moves} = await setup();
    const before = prod()["version"] as number;
    const {units} = await confirmStockEntryCore(db, entry(productId), ACTOR, NOW);
    assert.equal(units, 40);
    assert.deepEqual(sku()["stockByLocation"], {cd: 62});
    assert.equal(sku()["stock"], 62);
    assert.equal(prod()["stockTotal"], 62);
    assert.equal(prod()["version"], before + 1);
    const costs = fake.store.get(`storeProductCosts/${productId}`)!;
    assert.equal((costs["skuCosts"] as Record<string, number>)["unico"], 6083);
    assert.equal((costs["lastPurchaseCents"] as Record<string, number>)["unico"], 6250);
    assert.equal(costs["costCents"], 5780);
    const entrada = moves().find((m) => m["type"] === "entrada")!;
    assert.equal(entrada["reference"], "NF 8812 · Sunline Óculos Ltda.");
    assert.equal((entrada["items"] as {before: number; after: number}[])[0]!.after, 62);
  });

  it("NF repetida do mesmo fornecedor é bloqueada", async () => {
    const {db, productId} = await setup();
    await confirmStockEntryCore(db, entry(productId), ACTOR, NOW);
    await assert.rejects(
      confirmStockEntryCore(db, entry(productId, {entryId: "entrada-0002"}), ACTOR, NOW),
      /já foi registrada em 2026-10-16/,
    );
  });

  it("compra sem fornecedor ou NF não confirma; rascunho salva", async () => {
    const {fake, db, productId} = await setup();
    const incompleta = entry(productId, {supplier: "", nfNumber: ""});
    await assert.rejects(confirmStockEntryCore(db, incompleta, ACTOR, NOW), /Faltam campos/);
    await saveStockEntryDraftCore(db, incompleta, ACTOR, NOW);
    assert.equal(fake.store.get("storeStockDrafts/entrada-0001")!["kind"], "entrada");
  });

  it("confirmar apaga o rascunho; rascunho de entrada já confirmada é recusado", async () => {
    const {fake, db, productId} = await setup();
    await saveStockEntryDraftCore(db, entry(productId), ACTOR, NOW);
    await confirmStockEntryCore(db, entry(productId), ACTOR, NOW);
    assert.equal(fake.store.has("storeStockDrafts/entrada-0001"), false);
    await assert.rejects(saveStockEntryDraftCore(db, entry(productId), ACTOR, NOW), /já foi confirmada/);
  });

  it("ajuste de inventário aceita negativo, não deixa o saldo negativo e não mexe no custo", async () => {
    const {fake, db, productId, sku, moves} = await setup({cd: 5});
    const ajuste = (qty: number, id: string) =>
      entry(productId, {entryId: id, subtype: "ajuste", supplier: "", nfNumber: "", reason: "Inventário semanal",
        items: [{productId, skuId: "unico", qty, unitCostCents: 0}]});
    await confirmStockEntryCore(db, ajuste(-2, "ajuste-0001"), ACTOR, NOW);
    assert.deepEqual(sku()["stockByLocation"], {cd: 3});
    const m = moves().find((x) => x["reference"] === "Inventário semanal")!;
    assert.equal(m["type"], "ajuste");
    assert.equal(fake.store.get(`storeProductCosts/${productId}`)!["skuCosts"], undefined);
    await assert.rejects(confirmStockEntryCore(db, ajuste(-9, "ajuste-0002"), ACTOR, NOW), /negativo/);
  });

  it("anexo fora da pasta da entrada é recusado", async () => {
    const {db, productId} = await setup();
    const e = entry(productId, {attachments: [{name: "nf.pdf", path: "store/stock/outra/nf.pdf", url: "https://x", contentType: "application/pdf"}]});
    await assert.rejects(confirmStockEntryCore(db, e, ACTOR, NOW), /Faltam campos/);
  });
});

function transfer(productId: string, over: Partial<TransferInput> = {}): TransferInput {
  return {
    fromLocationId: "cd", toLocationId: "arena-cfc", items: [{productId, skuId: "unico", qty: 6}],
    transport: "Van própria", departAt: "2026-10-16T17:00", arriveAt: "2026-10-17T08:00",
    receiver: "Diego Alves", note: "", submit: false, ...over,
  };
}

describe("transferência", () => {
  it("rascunho ganha código TR e não reserva nada", async () => {
    const {db, productId, sku} = await setup();
    const t1 = await saveTransferCore(db, transfer(productId), ACTOR, NOW);
    const t2 = await saveTransferCore(db, transfer(productId), ACTOR, NOW);
    assert.equal(t1.code, "TR-001");
    assert.equal(t2.code, "TR-002");
    assert.equal(t1.status, "rascunho");
    assert.equal(sku()["reservedByLocation"], undefined);
  });

  it("separação reserva, trânsito baixa a origem, recebimento soma no destino", async () => {
    const {fake, db, productId, sku, moves} = await setup();
    const draft = await saveTransferCore(db, transfer(productId), ACTOR, NOW);
    const sent = await saveTransferCore(db, transfer(productId, {transferId: draft.transferId, version: draft.version, submit: true}), ACTOR, NOW);
    assert.equal(sent.status, "separacao");
    assert.deepEqual(sku()["reservedByLocation"], {cd: 6});
    assert.deepEqual(sku()["stockByLocation"], {cd: 22});

    const transit = await advanceTransferCore(db, {transferId: draft.transferId, version: sent.version, action: "em_transito"}, ACTOR, NOW);
    assert.deepEqual(sku()["stockByLocation"], {cd: 16});
    assert.deepEqual(sku()["reservedByLocation"], {cd: 0});

    await advanceTransferCore(db, {
      transferId: draft.transferId, version: transit.version, action: "recebido",
      received: {[`${productId}/unico`]: 5},
    }, ACTOR, NOW);
    assert.deepEqual(sku()["stockByLocation"], {cd: 16, "arena-cfc": 5});
    const t = fake.store.get(`storeTransfers/${draft.transferId}`)!;
    assert.equal(t["status"], "recebido");
    assert.equal((t["items"] as {receivedQty: number}[])[0]!.receivedQty, 5);
    const types = moves().map((m) => m["type"]).sort();
    assert.deepEqual(types, ["ajuste", "ajuste", "transferencia", "transferencia"]);
    const divergence = moves().find((m) => String(m["reference"]).startsWith("Divergência"))!;
    assert.equal((divergence["items"] as {delta: number}[])[0]!.delta, -1);
  });

  it("não deixa reservar acima do disponível e cancelar libera a reserva", async () => {
    const {db, productId, sku} = await setup({cd: 4});
    await assert.rejects(saveTransferCore(db, transfer(productId, {submit: true}), ACTOR, NOW), /máx\. 4/);
    const t = await saveTransferCore(db, transfer(productId, {items: [{productId, skuId: "unico", qty: 3}], submit: true}), ACTOR, NOW);
    assert.deepEqual(sku()["reservedByLocation"], {cd: 3});
    await advanceTransferCore(db, {transferId: t.transferId, version: t.version, action: "cancelar"}, ACTOR, NOW);
    assert.deepEqual(sku()["reservedByLocation"], {cd: 0});
  });

  it("origem igual ao destino e ação fora de ordem são recusadas", async () => {
    const {db, productId} = await setup();
    await assert.rejects(saveTransferCore(db, transfer(productId, {toLocationId: "cd"}), ACTOR, NOW), /Dados inválidos/);
    const t = await saveTransferCore(db, transfer(productId), ACTOR, NOW);
    await assert.rejects(advanceTransferCore(db, {transferId: t.transferId, version: t.version, action: "recebido"}, ACTOR, NOW), /não vale/);
  });

  it("salvar a grade da tela 05 preserva a reserva da transferência", async () => {
    const {db, productId, sku, prod} = await setup();
    await saveTransferCore(db, transfer(productId, {submit: true}), ACTOR, NOW);
    await saveVariationsCore(db, {
      productId, version: prod()["version"] as number, axes: [],
      skus: [{axisValues: {}, barcode: "789", priceCents: null, stockByLocation: {cd: 22}}],
    }, ACTOR, NOW);
    assert.deepEqual(sku()["reservedByLocation"], {cd: 6});
  });
});

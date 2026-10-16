import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {saveStoreProductCore, saveVariationsCore, type SaveProductInput} from "./store-catalog-write";
import {createReturnCore, returnActionCore, type CreateReturnInput} from "./store-returns-write";

const ACTOR = {uid: "admin1", name: "Ana Souza"};
const NOW = new Date("2026-10-16T15:00:00Z");

const product = (): SaveProductInput => ({
  name: "Camiseta Dry UV50 Areia", baseSku: "NX-CAM", category: "vestuario", collection: null, brand: "NexaGO",
  description: "", technicalDetails: [], badge: null, priceCents: 12990, compareAtPriceCents: null, costCents: 4820,
  channels: {app: true, web: true}, fulfillment: {pickup: true, delivery: false}, featured: false, shipping: null,
  lowStockThreshold: 3, status: "rascunho", active: false,
});

async function setup() {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  for (const [id, name] of [["cd", "CD Goiânia"], ["arena-errejota", "Arena Errejota"]]) {
    await db.collection("storeLocations").doc(id).set({name, type: id === "cd" ? "cd" : "arena", order: 0});
  }
  const {productId} = await saveStoreProductCore(db, product(), ACTOR, NOW);
  const axes = [
    {id: "cor", label: "Cor", values: [{id: "laranja", label: "Laranja"}]},
    {id: "tam", label: "Tamanho", values: [{id: "p", label: "P"}, {id: "m", label: "M"}]},
  ];
  await saveVariationsCore(db, {
    productId, version: 1, axes,
    skus: [
      {axisValues: {cor: "laranja", tam: "p"}, barcode: null, priceCents: null, stockByLocation: {cd: 5}},
      {axisValues: {cor: "laranja", tam: "m"}, barcode: null, priceCents: null, stockByLocation: {cd: 5, "arena-errejota": 2}},
    ],
  }, ACTOR, NOW);
  const sku = (id: string) => fake.store.get(`storeProducts/${productId}/skus/${id}`)!;
  const ret = (id = "troca-0001") => fake.store.get(`storeReturns/${id}`)!;
  const moves = () => [...fake.store.entries()].filter(([k]) => k.startsWith("storeStockMovements/")).map(([, v]) => v)
    .filter((m) => m["returnId"]);
  return {fake, db, productId, sku, ret, moves};
}

const req = (productId: string, over: Partial<CreateReturnInput> = {}): CreateReturnInput => ({
  returnId: "troca-0001", customerName: "Juliana Prado", customerContact: "", orderRef: "NX-4790",
  orderDate: "2026-10-03", deliveredAt: "2026-10-05", productId, skuId: "laranja_p", newSkuId: "laranja_m",
  reason: "tamanho", message: "Ficou apertada nos ombros", photos: [], resolution: "troca",
  returnMethod: {type: "arena", locationId: "arena-errejota"}, paidCents: 12990, ...over,
});

describe("trocas · servidor", () => {
  it("abre com código TC, frete pelo motivo e status analisar", async () => {
    const {db, productId, ret} = await setup();
    const {code} = await createReturnCore(db, req(productId), ACTOR, NOW);
    assert.equal(code, "TC-001");
    assert.equal(ret()["status"], "analisar");
    assert.equal((ret()["item"] as {variantLabel: string}).variantLabel, "Laranja · P");
    assert.equal((ret()["newItem"] as {variantLabel: string}).variantLabel, "Laranja · M");
    assert.deepEqual(ret()["returnMethod"], {type: "arena", locationId: "arena-errejota", costCents: 0, paidBy: "cliente"});
  });

  it("troca na arena: aprovar reserva o M lá; receber devolve o P e entrega o M", async () => {
    const {db, productId, sku, ret, moves} = await setup();
    await createReturnCore(db, req(productId), ACTOR, NOW);
    await returnActionCore(db, {returnId: "troca-0001", version: 1, action: "aprovar"}, ACTOR, NOW);
    assert.deepEqual(sku("laranja_m")["reservedByLocation"], {"arena-errejota": 1});
    assert.equal(ret()["status"], "aprovada");

    await returnActionCore(db, {returnId: "troca-0001", version: 2, action: "receber", inspection: "ok"}, ACTOR, NOW);
    assert.equal(ret()["status"], "concluida");
    assert.deepEqual(sku("laranja_p")["stockByLocation"], {cd: 5, "arena-errejota": 1});
    assert.deepEqual(sku("laranja_m")["stockByLocation"], {cd: 5, "arena-errejota": 1});
    assert.deepEqual(sku("laranja_m")["reservedByLocation"], {"arena-errejota": 0});
    assert.deepEqual(moves().map((m) => [m["type"], m["reference"]]).sort(), [["entrada", "Devolução TC-001"], ["saida", "Troca TC-001"]]);
  });

  it("produto avariado não volta ao estoque", async () => {
    const {db, productId, sku} = await setup();
    await createReturnCore(db, req(productId, {resolution: "reembolso", newSkuId: null, reason: "defeito"}), ACTOR, NOW);
    await returnActionCore(db, {returnId: "troca-0001", version: 1, action: "aprovar"}, ACTOR, NOW);
    await returnActionCore(db, {returnId: "troca-0001", version: 2, action: "receber", inspection: "avariado"}, ACTOR, NOW);
    assert.deepEqual(sku("laranja_p")["stockByLocation"], {cd: 5});
  });

  it("reembolso fica pendente para o Financeiro com o valor pago", async () => {
    const {db, productId, ret} = await setup();
    await createReturnCore(db, req(productId, {resolution: "reembolso", newSkuId: null}), ACTOR, NOW);
    await returnActionCore(db, {returnId: "troca-0001", version: 1, action: "aprovar"}, ACTOR, NOW);
    await returnActionCore(db, {returnId: "troca-0001", version: 2, action: "receber", inspection: "ok"}, ACTOR, NOW);
    assert.deepEqual(ret()["settlement"], {type: "reembolso", amountCents: 12990, status: "pendente"});
  });

  it("sem estoque da variação nova não aprova a troca", async () => {
    const {db, productId} = await setup();
    await createReturnCore(db, req(productId, {newSkuId: "laranja_p", skuId: "laranja_m", returnMethod: {type: "arena", locationId: "arena-errejota"}}), ACTOR, NOW);
    await assert.rejects(returnActionCore(db, {returnId: "troca-0001", version: 1, action: "aprovar"}, ACTOR, NOW), /Sem estoque/);
  });

  it("fora do prazo pede confirmação; recusa exige motivo", async () => {
    const {db, productId, ret} = await setup();
    await createReturnCore(db, req(productId, {deliveredAt: "2026-08-01"}), ACTOR, NOW);
    await assert.rejects(returnActionCore(db, {returnId: "troca-0001", version: 1, action: "aprovar"}, ACTOR, NOW), /Fora do prazo/);
    await assert.rejects(returnActionCore(db, {returnId: "troca-0001", version: 1, action: "recusar"}, ACTOR, NOW), /motivo/);
    await returnActionCore(db, {returnId: "troca-0001", version: 1, action: "recusar", refusalReason: "Fora do prazo"}, ACTOR, NOW);
    assert.equal(ret()["status"], "recusada");
    assert.equal(ret()["refusalReason"], "Fora do prazo");
  });

  it("reenvio por avaria sem retorno: concluir despacha a peça do CD", async () => {
    const {db, productId, sku, ret} = await setup();
    await createReturnCore(db, req(productId, {reason: "avaria", resolution: "reenvio", newSkuId: null}), ACTOR, NOW);
    await returnActionCore(db, {returnId: "troca-0001", version: 1, action: "aprovar", skipReturn: true}, ACTOR, NOW);
    assert.deepEqual(sku("laranja_p")["reservedByLocation"], {cd: 1});
    await returnActionCore(db, {returnId: "troca-0001", version: 2, action: "concluir"}, ACTOR, NOW);
    assert.equal(ret()["status"], "concluida");
    assert.deepEqual(sku("laranja_p")["stockByLocation"], {cd: 4});
  });

  it("versão velha dá conflito", async () => {
    const {db, productId} = await setup();
    await createReturnCore(db, req(productId), ACTOR, NOW);
    await assert.rejects(returnActionCore(db, {returnId: "troca-0001", version: 9, action: "aprovar"}, ACTOR, NOW), /alterada por outra pessoa/);
  });
});

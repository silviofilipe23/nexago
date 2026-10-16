import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {saveStoreProductCore, saveVariationsCore, type SaveProductInput} from "./store-catalog-write";
import {
  createOrderCore,
  orderActionCore,
  refundOrderCore,
  saveOrderNoteCore,
  sweepExpiredPickupsCore,
  type CreateOrderInput,
} from "./store-orders-write";
import {advanceTransferCore, saveTransferCore} from "./store-stock-write";

const ACTOR = {uid: "admin1", name: "Lucas M."};
const NOW = new Date("2026-10-14T17:08:00Z");

const product = (): SaveProductInput => ({
  name: "Camiseta Dry UV50 Areia", baseSku: "NX-CAM", category: "vestuario", collection: null, brand: "NexaGO",
  description: "", technicalDetails: [], badge: null, priceCents: 12990, compareAtPriceCents: null, costCents: 4820,
  channels: {app: true, web: true}, fulfillment: {pickup: true, delivery: true}, featured: false, shipping: null,
  lowStockThreshold: 3, status: "rascunho", active: false,
});

async function setup() {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  for (const [id, name] of [["cd", "CD Goiânia"], ["arena-errejota", "Arena Errejota"]]) {
    await db.collection("storeLocations").doc(id).set({name, type: id === "cd" ? "cd" : "arena", order: 0});
  }
  const {productId} = await saveStoreProductCore(db, product(), ACTOR, NOW);
  await saveVariationsCore(db, {
    productId, version: 1,
    axes: [{id: "tam", label: "Tamanho", values: [{id: "p", label: "P"}, {id: "m", label: "M"}]}],
    skus: [
      {axisValues: {tam: "p"}, barcode: null, priceCents: null, stockByLocation: {cd: 5}},
      {axisValues: {tam: "m"}, barcode: null, priceCents: null, stockByLocation: {cd: 5, "arena-errejota": 2}},
    ],
  }, ACTOR, NOW);
  const sku = (id: string) => fake.store.get(`storeProducts/${productId}/skus/${id}`)!;
  const order = (id = "pedido-0001") => fake.store.get(`storeOrders/${id}`)!;
  const moves = () => [...fake.store.entries()].filter(([k]) => k.startsWith("storeStockMovements/")).map(([, v]) => v)
    .filter((m) => m["orderId"]);
  const transfers = () => [...fake.store.entries()].filter(([k]) => k.startsWith("storeTransfers/"));
  return {fake, db, productId, sku, order, moves, transfers};
}

const create = (productId: string, over: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  orderId: "pedido-0001", channel: "app_ios",
  customer: {uid: "athlete1", name: "Marcelo Antunes", email: "m@x.com", phone: "(62) 99812-4471", cpf: "123.482.331-00",
    level: 3, orderIndex: 6},
  items: [{productId, skuId: "m", qty: 1}],
  couponId: null, couponCode: null, couponDiscountCents: 0, pixDiscountCents: 650, walletCents: 0, shippingCents: 0,
  payments: [{method: "pix", amountCents: 12340, txid: "E18236120202610141410s0123ab9F2A", feeCents: 99}],
  paid: true, pix: null,
  delivery: {type: "arena", locationId: "arena-errejota", pickupPointId: null},
  ...over,
});

const reserved = (s: Record<string, unknown>, loc: string) => ((s["reservedByLocation"] ?? {}) as Record<string, number>)[loc] ?? 0;
const stock = (s: Record<string, unknown>, loc: string) => ((s["stockByLocation"] ?? {}) as Record<string, number>)[loc] ?? 0;

describe("pedidos · servidor", () => {
  it("cria numerado, com total conferido, e reserva na arena que tem a peça", async () => {
    const {db, productId, sku, order} = await setup();
    const r = await createOrderCore(db, create(productId), ACTOR, NOW);
    assert.equal(r.number, "NX-0001");
    const o = order();
    assert.equal(o["status"], "sep");
    assert.equal(o["totalCents"], 12340);
    assert.deepEqual(o["reservation"], {locationId: "arena-errejota", active: true});
    assert.match(String((o["delivery"] as Record<string, unknown>)["pickupCode"]), /^\d{4}$/);
    assert.equal(reserved(sku("m"), "arena-errejota"), 1);
  });

  it("recusa pagamento que não fecha e item sem estoque", async () => {
    const {db, productId} = await setup();
    await assert.rejects(createOrderCore(db, create(productId, {payments: [{method: "pix", amountCents: 100}]}), ACTOR, NOW),
      /não fecham/);
    await assert.rejects(createOrderCore(db, create(productId, {items: [{productId, skuId: "p", qty: 9}],
      payments: [{method: "pix", amountCents: 9 * 12990 - 650}]}), ACTOR, NOW), /Sem estoque/);
  });

  it("separado no balcão vira 'Na arena' e a retirada exige o código; gera Saída na arena", async () => {
    const {db, productId, sku, order, moves} = await setup();
    await createOrderCore(db, create(productId), ACTOR, NOW);
    const sep = await orderActionCore(db, {orderId: "pedido-0001", version: 1, action: "marcar_separado"}, ACTOR, NOW);
    assert.equal(sep.status, "ret");
    assert.equal(sep.notice?.kind, "pickup_code");
    const code = (order()["delivery"] as Record<string, unknown>)["pickupCode"] as string;
    const wrong = code === "0000" ? "1111" : "0000";
    await assert.rejects(orderActionCore(db, {orderId: "pedido-0001", version: 2, action: "confirmar_retirada", pickupCode: wrong},
      ACTOR, NOW), /não confere/);
    const done = await orderActionCore(db, {orderId: "pedido-0001", version: 2, action: "confirmar_retirada", pickupCode: code},
      ACTOR, NOW);
    assert.equal(done.status, "rtd");
    assert.equal(stock(sku("m"), "arena-errejota"), 1);
    assert.equal(reserved(sku("m"), "arena-errejota"), 0);
    assert.equal(moves().length, 1);
    assert.equal(moves()[0]!["type"], "saida");
    assert.equal(order()["reservation"], null);
  });

  it("versão velha não passa", async () => {
    const {db, productId} = await setup();
    await createOrderCore(db, create(productId), ACTOR, NOW);
    await orderActionCore(db, {orderId: "pedido-0001", version: 1, action: "iniciar_separacao"}, ACTOR, NOW);
    await assert.rejects(orderActionCore(db, {orderId: "pedido-0001", version: 1, action: "marcar_separado"}, ACTOR, NOW),
      /alterado por outra pessoa/);
  });

  it("remessa leva o pedido: a reserva passa para a transferência e volta na arena no recebimento", async () => {
    const {db, productId, sku, order} = await setup();
    // P não tem na arena: reserva no CD.
    await createOrderCore(db, create(productId, {items: [{productId, skuId: "p", qty: 2}],
      payments: [{method: "pix", amountCents: 2 * 12990 - 650}]}), ACTOR, NOW);
    assert.equal(reserved(sku("p"), "cd"), 2);
    await orderActionCore(db, {orderId: "pedido-0001", version: 1, action: "marcar_separado"}, ACTOR, NOW);
    assert.equal(order()["status"], "sepd");

    const t = await saveTransferCore(db, {
      fromLocationId: "cd", toLocationId: "arena-errejota", items: [{productId, skuId: "p", qty: 2}],
      transport: "", departAt: "", arriveAt: "", receiver: "", note: "", submit: true, orderIds: ["pedido-0001"],
    }, ACTOR, NOW);
    // A mesma peça não conta duas vezes: continua 2 reservadas no CD (agora pela remessa).
    assert.equal(reserved(sku("p"), "cd"), 2);
    assert.equal(order()["transferId"], t.transferId);
    assert.equal(order()["transferCode"], t.code);
    assert.deepEqual(order()["reservation"], {locationId: "cd", active: false});

    const out = await advanceTransferCore(db, {transferId: t.transferId, version: t.version, action: "em_transito"}, ACTOR, NOW);
    const got = await advanceTransferCore(db, {transferId: t.transferId, version: out.version, action: "recebido"}, ACTOR, NOW);
    assert.equal(order()["status"], "ret");
    assert.deepEqual(order()["reservation"], {locationId: "arena-errejota", active: true});
    assert.equal(reserved(sku("p"), "arena-errejota"), 2);
    assert.equal(reserved(sku("p"), "cd"), 0);
    assert.equal(got.notices.length, 1);
    assert.ok((order()["delivery"] as Record<string, unknown>)["pickupDeadline"] instanceof Date);
  });

  it("remessa que não leva tudo ou vai para outra arena é recusada", async () => {
    const {db, productId} = await setup();
    await createOrderCore(db, create(productId, {items: [{productId, skuId: "p", qty: 2}],
      payments: [{method: "pix", amountCents: 2 * 12990 - 650}]}), ACTOR, NOW);
    const base = {fromLocationId: "cd", toLocationId: "arena-errejota", transport: "", departAt: "", arriveAt: "",
      receiver: "", note: "", submit: true, orderIds: ["pedido-0001"]};
    await assert.rejects(saveTransferCore(db, {...base, items: [{productId, skuId: "p", qty: 1}]}, ACTOR, NOW), /todas as peças/);
  });

  it("cancelar a remessa na separação devolve a reserva ao pedido", async () => {
    const {db, productId, sku, order} = await setup();
    await createOrderCore(db, create(productId, {items: [{productId, skuId: "p", qty: 2}],
      payments: [{method: "pix", amountCents: 2 * 12990 - 650}]}), ACTOR, NOW);
    const t = await saveTransferCore(db, {
      fromLocationId: "cd", toLocationId: "arena-errejota", items: [{productId, skuId: "p", qty: 2}],
      transport: "", departAt: "", arriveAt: "", receiver: "", note: "", submit: true, orderIds: ["pedido-0001"],
    }, ACTOR, NOW);
    await advanceTransferCore(db, {transferId: t.transferId, version: t.version, action: "cancelar"}, ACTOR, NOW);
    assert.equal(reserved(sku("p"), "cd"), 2);
    assert.deepEqual(order()["reservation"], {locationId: "cd", active: true});
    assert.equal(order()["transferId"], null);
  });

  it("cancelar pago solta a reserva e registra reembolso pendente; trânsito é bloqueado", async () => {
    const {db, productId, sku, order} = await setup();
    await createOrderCore(db, create(productId), ACTOR, NOW);
    await assert.rejects(orderActionCore(db, {orderId: "pedido-0001", version: 1, action: "cancelar"}, ACTOR, NOW), /motivo/);
    const r = await orderActionCore(db, {orderId: "pedido-0001", version: 1, action: "cancelar", reason: "Cliente desistiu"},
      ACTOR, NOW);
    assert.equal(r.status, "can");
    assert.equal(reserved(sku("m"), "arena-errejota"), 0);
    assert.equal(order()["refundedCents"], 12340);
    assert.equal((order()["refunds"] as Record<string, unknown>[])[0]!["status"], "pendente");
    assert.equal(order()["cancelReason"], "Cliente desistiu");
  });

  it("cancelar na arena abre a transferência de volta em rascunho", async () => {
    const {db, productId, order, transfers} = await setup();
    await createOrderCore(db, create(productId), ACTOR, NOW);
    await orderActionCore(db, {orderId: "pedido-0001", version: 1, action: "marcar_separado"}, ACTOR, NOW);
    const r = await orderActionCore(db, {orderId: "pedido-0001", version: 2, action: "cancelar", reason: "Não veio"}, ACTOR, NOW);
    assert.ok(r.returnTransferId);
    const [, t] = transfers()[0]!;
    assert.equal(t["status"], "rascunho");
    assert.equal(t["fromLocationId"], "arena-errejota");
    assert.equal(t["toLocationId"], "cd");
    assert.match(String(order()["history"] && (order()["history"] as Record<string, unknown>[]).slice(-1)[0]!["detail"]), /TR-001/);
  });

  it("entrega em casa: envia com rastreio (Saída no CD), entrega, e não cancela em trânsito", async () => {
    const {db, productId, sku, order} = await setup();
    await createOrderCore(db, create(productId, {
      delivery: {type: "casa", modeId: "expressa", modeName: "Expressa", address: "Rua 1, 10", city: "Anápolis", uf: "GO", zip: "75000-000"},
      shippingCents: 3490, payments: [{method: "pix", amountCents: 12340 + 3490}],
    }), ACTOR, NOW);
    assert.deepEqual(order()["reservation"], {locationId: "cd", active: true});
    await orderActionCore(db, {orderId: "pedido-0001", version: 1, action: "marcar_separado"}, ACTOR, NOW);
    await assert.rejects(orderActionCore(db, {orderId: "pedido-0001", version: 2, action: "enviar"}, ACTOR, NOW), /transportadora/);
    const sent = await orderActionCore(db, {orderId: "pedido-0001", version: 2, action: "enviar", carrier: "Loggi",
      tracking: "LG123", trackingUrl: "https://loggi.com/r/LG123", eta: "2026-10-16"}, ACTOR, NOW);
    assert.equal(sent.status, "tra");
    assert.equal(stock(sku("m"), "cd"), 4);
    assert.equal(reserved(sku("m"), "cd"), 0);
    await assert.rejects(orderActionCore(db, {orderId: "pedido-0001", version: 3, action: "cancelar", reason: "x"}, ACTOR, NOW),
      /troca/);
    const done = await orderActionCore(db, {orderId: "pedido-0001", version: 3, action: "entregue"}, ACTOR, NOW);
    assert.equal(done.status, "ent");
  });

  it("reembolso parcial por item rateia os descontos e não passa do que resta", async () => {
    const {db, productId, order} = await setup();
    await createOrderCore(db, create(productId, {items: [{productId, skuId: "p", qty: 2}],
      pixDiscountCents: 1299, payments: [{method: "pix", amountCents: 2 * 12990 - 1299}]}), ACTOR, NOW);
    const r = await refundOrderCore(db, {orderId: "pedido-0001", version: 1, mode: "itens", items: [{index: 0, qty: 1}],
      destination: "saldo", reason: "Defeito de costura"}, ACTOR, NOW);
    assert.equal(r.amountCents, 12341); // 12990 × (24681 / 25980)
    await assert.rejects(refundOrderCore(db, {orderId: "pedido-0001", version: 2, mode: "itens", items: [{index: 0, qty: 2}],
      destination: "saldo", reason: "x"}, ACTOR, NOW), /acima/);
    const rest = await refundOrderCore(db, {orderId: "pedido-0001", version: 2, mode: "total", destination: "original",
      reason: "Resto"}, ACTOR, NOW);
    assert.equal(rest.amountCents, 24681 - 12341);
    assert.equal(order()["refundedCents"], 24681);
    await assert.rejects(refundOrderCore(db, {orderId: "pedido-0001", version: 3, mode: "total", destination: "original",
      reason: "De novo"}, ACTOR, NOW), /Não há valor/);
  });

  it("nota interna grava autor e hora sem subir a versão", async () => {
    const {db, productId, order} = await setup();
    await createOrderCore(db, create(productId), ACTOR, NOW);
    await saveOrderNoteCore(db, {orderId: "pedido-0001", text: "Cliente pediu embrulho"}, ACTOR, NOW);
    assert.deepEqual(order()["internalNote"], {text: "Cliente pediu embrulho", by: ACTOR, at: NOW});
    assert.equal(order()["version"], 1);
  });

  it("varredura cancela retirada vencida e devolve como saldo quando a config manda", async () => {
    const {db, productId, order} = await setup();
    await createOrderCore(db, create(productId), ACTOR, NOW);
    await orderActionCore(db, {orderId: "pedido-0001", version: 1, action: "marcar_separado"}, ACTOR, NOW);
    const notices: unknown[] = [];
    const later = new Date(NOW.getTime() + 10 * 86_400_000);
    const r = await sweepExpiredPickupsCore(db, later, async (n) => notices.push(n));
    assert.deepEqual(r.canceled, ["pedido-0001"]);
    assert.equal(order()["status"], "can");
    assert.equal((order()["refunds"] as Record<string, unknown>[])[0]!["destination"], "saldo");
    assert.equal(notices.length, 1);
    // Dentro do prazo, nada acontece.
    assert.deepEqual((await sweepExpiredPickupsCore(db, later)).canceled, []);
  });
});

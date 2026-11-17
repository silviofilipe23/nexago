import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {saveStoreProductCore, saveVariationsCore, type SaveProductInput} from "./store-catalog-write";
import {
  confirmStoreOrderPaymentCore,
  createStoreOrderCore,
  quoteCheckoutCore,
  type CheckoutPayments,
} from "./store-checkout";
import {pixDiscountOf} from "./store-checkout-price";
import {syncStoreSquadOnOrderWriteCore} from "./store-squad";
import {createPendingCommission} from "./squad-commission-lifecycle";

const ACTOR = {uid: "admin1", name: "Lucas M."};
const NOW = new Date("2026-10-17T15:00:00Z");
const ARENA = {type: "arena" as const, arenaId: "arena-errejota"};
const STORE_ON = {registration: true, booking: true, club: true, store: true};

const product = (): SaveProductInput => ({
  name: "Camiseta Dry UV50 Areia", baseSku: "NX-CAM", category: "vestuario", collection: null, brand: "NexaGO",
  description: "", technicalDetails: [], badge: null, priceCents: 12990, compareAtPriceCents: null, costCents: 4820,
  channels: {app: true, web: true}, fulfillment: {pickup: true, delivery: true}, featured: false, shipping: null,
  lowStockThreshold: 3, status: "rascunho", active: false,
});

class FakePay implements CheckoutPayments {
  created: Array<{orderId: string; totalCents: number}> = [];
  async customer() {
    return {name: "Ana Lima", email: "ana@x.com", phone: "(62) 99999-0000", cpf: "12345678909", asaasCustomerId: "cus_1"};
  }
  async createPix(p: {orderId: string; totalCents: number}) {
    this.created.push({orderId: p.orderId, totalCents: p.totalCents});
    return {paymentId: `pay_${this.created.length}`, copyPaste: "pix"};
  }
  async createCard(p: {orderId: string}) {
    return {paymentId: "card_1", invoiceUrl: `https://sandbox.asaas.com/i/${p.orderId}`};
  }
  async cancelCharge() {
    return;
  }
}

/** Loja com 2 camisetas (R$ 259,80) no carrinho da Ana, João (10%) e a indicação dele por link. */
async function setup(opts: {storeOn?: boolean; followerPct?: number; link?: boolean} = {}) {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  for (const [id, name] of [["cd", "CD Goiânia"], ["arena-errejota", "Arena Errejota"]]) {
    await db.collection("storeLocations").doc(id).set({name, type: id === "cd" ? "cd" : "arena", order: 0});
  }
  const {productId} = await saveStoreProductCore(db, product(), ACTOR, NOW);
  await saveVariationsCore(db, {
    productId, version: 1,
    axes: [{id: "tam", label: "Tamanho", values: [{id: "m", label: "M"}]}],
    skus: [{axisValues: {tam: "m"}, barcode: null, priceCents: null, stockByLocation: {cd: 9, "arena-errejota": 9}}],
  }, ACTOR, NOW);
  const p = fake.store.get(`storeProducts/${productId}`)!;
  fake.store.set(`storeProducts/${productId}`, {...p, status: "ativo", active: true});
  fake.seedDoc("storePickupPoints/arena-errejota", {name: "Arena Errejota", active: true, locationId: "arena-errejota"});
  fake.seedDoc("storeCarts/ana", {items: [{productId, skuId: "m", qty: 2}]});
  fake.seedDoc("users/ana", {fullName: "Ana Lima"});

  fake.seedDoc("squadConfig/rules", {version: 2, rules: {attribution: {
    followerDiscountScope: {...STORE_ON, store: opts.storeOn ?? true},
  }}});
  fake.seedDoc("squadAmbassadors/jv", {
    displayName: "João Victor", tier: "amb", code: "JOAO10", commissionPct: 10,
    followerDiscountPct: opts.followerPct ?? 10, rulesVersion: 2, status: "active",
  });
  if (opts.link ?? true) {
    fake.seedDoc("squadAttributions/ana", {ambassadorId: "jv", code: "JOAO10", origin: "link", at: NOW});
  }
  return {fake, db};
}

function seedCoupon(fake: FakeFirestore, pct: number) {
  fake.seedDoc("storeCouponCodes/AREIA", {couponId: "cp1"});
  fake.seedDoc("storeCoupons/cp1", {code: "AREIA", type: "percent", value: pct, maxDiscountCents: null,
    scope: {type: "store", ids: [], labels: []}, minOrderCents: null, usageLimit: null, uses: 0, onePerAthlete: false,
    stacksWithPix: true, appOnly: false, startDate: "2026-10-01", endDate: null, paused: false});
}

const SUBTOTAL = 25980;

async function order(db: Firestore, input: {couponCode?: string | null; squadCode?: string | null} = {}) {
  const base = {channel: "web" as const, delivery: ARENA, couponCode: input.couponCode ?? null, squadCode: input.squadCode ?? null};
  const quote = await quoteCheckoutCore(db, "ana", base, NOW);
  const pay = new FakePay();
  const r = await createStoreOrderCore(db, "ana", {...base, expectedTotalCents: quote.totalCents, cpf: null}, pay, NOW,
    () => "ord_pedido_1");
  return {quote, r};
}

describe("Loja · código de embaixador na cotação", () => {
  it("indicação por link: % do contrato nos produtos, Pix sobre o que sobrou", async () => {
    const {db} = await setup();
    const q = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null}, NOW);
    const squad = 2598;
    assert.deepEqual(
      {code: q.squad?.code, name: q.squad?.ambassadorName, origin: q.squad?.origin, cents: q.squadDiscountCents, applied: q.squad?.applied},
      {code: "JOAO10", name: "João Victor", origin: "link", cents: squad, applied: true},
    );
    assert.equal(q.pixDiscountCents, pixDiscountOf(SUBTOTAL - squad, 5));
    assert.equal(q.totalCents, SUBTOTAL - squad - pixDiscountOf(SUBTOTAL - squad, 5));
  });

  it("Loja desligada na regra global (o padrão do programa): nada de embaixador", async () => {
    const {db} = await setup({storeOn: false});
    const q = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null}, NOW);
    assert.equal(q.squad, null);
    assert.equal(q.squadDiscountCents, 0);
  });

  it("embaixador dá mais que o cupom: vale o embaixador e o cupom avisa sem travar", async () => {
    const {fake, db} = await setup({followerPct: 15});
    seedCoupon(fake, 10);
    const q = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: "areia"}, NOW);
    assert.equal(q.squad?.applied, true);
    assert.equal(q.squadDiscountCents, Math.round(SUBTOTAL * 0.15));
    assert.equal(q.coupon?.problem, "nao_acumula");
    assert.equal(q.coupon?.message, "O desconto da indicação de João Victor é maior que este cupom");
    assert.equal(q.totalCents, SUBTOTAL - q.squadDiscountCents - q.pixDiscountCents);
  });

  it("cupom dá mais (ou empata): vale o cupom e o pedido sai sem embaixador", async () => {
    const {fake, db} = await setup({followerPct: 10});
    seedCoupon(fake, 10);
    const q = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: "areia"}, NOW);
    assert.equal(q.coupon?.problem, null);
    assert.equal(q.squad?.applied, false);
    assert.equal(q.squad?.reason, "cupom_maior");
    assert.equal(q.squadDiscountCents, 0);
  });

  it("código digitado que não vale: a cotação avisa no campo; o pedido recusa antes de cobrar", async () => {
    const {db} = await setup({link: false});
    const q = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null, squadCode: "nada99"}, NOW);
    assert.deepEqual({applied: q.squad?.applied, reason: q.squad?.reason, msg: q.squad?.message},
      {applied: false, reason: "invalido", msg: "Código de embaixador não encontrado."});
    assert.equal(q.squadDiscountCents, 0);
    const pay = new FakePay();
    await assert.rejects(
      createStoreOrderCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null, squadCode: "nada99",
        expectedTotalCents: q.totalCents, cpf: null}, pay, NOW, () => "ord_pedido_1"),
      (err: {details?: {field?: string}}) => err.details?.field === "squadCode",
    );
    assert.deepEqual(pay.created, []);
  });

  it("código digitado vence o link", async () => {
    const {fake, db} = await setup();
    fake.seedDoc("squadAmbassadors/rb", {displayName: "Rayssa B.", tier: "amb", code: "RAY10", commissionPct: 10,
      followerDiscountPct: 5, rulesVersion: 2, status: "active"});
    const q = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null, squadCode: "ray10"}, NOW);
    assert.deepEqual({code: q.squad?.code, origin: q.squad?.origin}, {code: "RAY10", origin: "code"});
  });
});

describe("Loja · pedido, desconto e comissão", () => {
  it("pedido com embaixador: o desconto ocupa o lugar do cupom; registra desconto e comissão pendente", async () => {
    const {fake, db} = await setup();
    const {quote} = await order(db);
    const o = fake.store.get("storeOrders/ord_pedido_1")!;
    assert.deepEqual(
      {id: o["couponId"], code: o["couponCode"], cents: o["couponDiscountCents"], total: o["totalCents"]},
      {id: null, code: "JOAO10", cents: 2598, total: quote.totalCents},
    );
    assert.deepEqual(o["squad"], {ambassadorId: "jv", code: "JOAO10", origin: "link", pct: 10, discountCents: 2598});
    const discount = fake.store.get("squadChargeDiscounts/pay_1")!;
    assert.deepEqual({kind: discount["kind"], source: discount["sourceId"], cents: discount["cents"], confirmed: discount["confirmedAt"]},
      {kind: "store", source: "ord_pedido_1", cents: 2598, confirmed: null});
    const c = fake.store.get("squadCommissions/store_ord_pedido_1")!;
    const products = SUBTOTAL - 2598 - quote.pixDiscountCents;
    assert.deepEqual(
      {source: c["source"], order: c["orderId"], status: c["status"], t: c["tournamentName"], cat: c["categoryName"],
        label: c["convertedLabel"], amb: c["ambassadorId"], gross: c["grossCents"], amount: c["amountCents"]},
      {source: "store", order: "ord_pedido_1", status: "pending", t: "Loja nexaGO", cat: "Pedido NX-0001",
        label: "Ana L.", amb: "jv", gross: quote.totalCents, amount: Math.round(products * 0.1)},
    );
  });

  it("cupom vence: pedido sem embaixador, sem desconto de indicação e sem comissão", async () => {
    const {fake, db} = await setup({followerPct: 5});
    seedCoupon(fake, 10);
    await order(db, {couponCode: "areia"});
    const o = fake.store.get("storeOrders/ord_pedido_1")!;
    assert.deepEqual({id: o["couponId"], code: o["couponCode"], squad: o["squad"] ?? null}, {id: "cp1", code: "AREIA", squad: null});
    assert.equal(fake.store.get("squadChargeDiscounts/pay_1"), undefined);
    assert.equal(fake.store.get("squadCommissions/store_ord_pedido_1"), undefined);
  });

  it("pago: comissão liberada sobre os produtos (sem frete) e desconto marcado como usado", async () => {
    const {fake, db} = await setup();
    const {quote} = await order(db);
    await confirmStoreOrderPaymentCore(db, "ord_pedido_1", {paymentId: "pay_1", valueCents: quote.totalCents}, NOW);
    await syncStoreSquadOnOrderWriteCore(db, "ord_pedido_1", NOW);
    const c = fake.store.get("squadCommissions/store_ord_pedido_1")!;
    assert.equal(c["status"], "released");
    assert.equal(c["amountCents"], Math.round((SUBTOTAL - 2598 - quote.pixDiscountCents) * 0.1));
    assert.ok(fake.store.get("squadChargeDiscounts/pay_1")!["confirmedAt"]);
    await syncStoreSquadOnOrderWriteCore(db, "ord_pedido_1", NOW);
    assert.equal(fake.store.get("squadCommissions/store_ord_pedido_1")!["status"], "released", "idempotente");
  });

  it("cancelado sem pagar: comissão cancelada", async () => {
    const {fake, db} = await setup();
    await order(db);
    const o = fake.store.get("storeOrders/ord_pedido_1")!;
    fake.seedDoc("storeOrders/ord_pedido_1", {...o, status: "can"});
    await syncStoreSquadOnOrderWriteCore(db, "ord_pedido_1", NOW);
    const c = fake.store.get("squadCommissions/store_ord_pedido_1")!;
    assert.deepEqual({status: c["status"], reason: c["cancelReason"]}, {status: "canceled", reason: "payment_failed"});
  });

  it("uma conversão por área: a da inscrição não tira a da Loja, e a da Loja não tira a da inscrição", async () => {
    const {fake, db} = await setup();
    fake.seedDoc("squadCommissions/reg1_ana", {payerUid: "ana", ambassadorId: "jv", status: "released"});
    await order(db);
    assert.equal(fake.store.get("squadCommissions/store_ord_pedido_1")!["status"], "pending");
    const reg = await createPendingCommission(db, {
      registrationId: "reg2", tournamentId: "t1", tournamentName: "Open", categoryName: "Mista", paymentId: "p9",
      payerUid: "ana", convertedUids: ["ana"], convertedLabel: "Ana L.", grossCents: 10000,
      attribution: {ambassador: {uid: "jv", displayName: "João Victor", tier: "amb", code: "JOAO10", commissionPct: 10,
        followerDiscountPct: 10, rulesVersion: 2, codeScope: STORE_ON}, origin: "link"},
    }, NOW);
    assert.equal(reg, null, "a inscrição continua com a regra dela (já tinha conversão de inscrição)");
    fake.store.delete("squadCommissions/reg1_ana");
    const reg2 = await createPendingCommission(db, {
      registrationId: "reg3", tournamentId: "t1", tournamentName: "Open", categoryName: "Mista", paymentId: "p10",
      payerUid: "ana", convertedUids: ["ana"], convertedLabel: "Ana L.", grossCents: 10000,
      attribution: {ambassador: {uid: "jv", displayName: "João Victor", tier: "amb", code: "JOAO10", commissionPct: 10,
        followerDiscountPct: 10, rulesVersion: 2, codeScope: STORE_ON}, origin: "link"},
    }, NOW);
    assert.equal(reg2, "reg3_ana", "comissão da Loja não conta como conversão de inscrição");
  });

  it("segunda compra na Loja: sem comissão nova; desconto só na primeira", async () => {
    const {fake, db} = await setup();
    fake.seedDoc("squadCommissions/store_ord_0", {payerUid: "ana", source: "store", status: "released"});
    fake.seedDoc("squadChargeDiscounts/pay_0", {payerUid: "ana", kind: "store", cents: 2598, confirmedAt: NOW});
    const {quote} = await order(db);
    assert.equal(quote.squadDiscountCents, 0);
    assert.equal(fake.store.get("squadCommissions/store_ord_pedido_1"), undefined);
  });
});

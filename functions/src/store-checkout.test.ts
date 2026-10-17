import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {saveStoreProductCore, saveVariationsCore, type SaveProductInput} from "./store-catalog-write";
import {
  buildOrderView,
  confirmStoreOrderPaymentCore,
  createStoreOrderCore,
  expireStorePixCore,
  quoteCheckoutCore,
  recordLatePixRefundCore,
  releaseCouponOnCancelCore,
  type CheckoutPayments,
} from "./store-checkout";
import {pixDiscountOf, priceCoupon, shippingFor, type QuoteLine} from "./store-checkout-price";
import {DEFAULT_SHIPPING_CONFIG} from "./store-pickup";

const ACTOR = {uid: "admin1", name: "Lucas M."};
const NOW = new Date("2026-10-17T15:00:00Z");

const product = (): SaveProductInput => ({
  name: "Camiseta Dry UV50 Areia", baseSku: "NX-CAM", category: "vestuario", collection: null, brand: "NexaGO",
  description: "", technicalDetails: [], badge: null, priceCents: 12990, compareAtPriceCents: null, costCents: 4820,
  channels: {app: true, web: true}, fulfillment: {pickup: true, delivery: true}, featured: false, shipping: null,
  lowStockThreshold: 3, status: "rascunho", active: false,
});

async function setup(opts: {web?: boolean; stockM?: number} = {}) {
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
      {axisValues: {tam: "m"}, barcode: null, priceCents: null, stockByLocation: {cd: opts.stockM ?? 5, "arena-errejota": 2}},
    ],
  }, ACTOR, NOW);
  // Publica (o save do backoffice grava rascunho).
  const p = fake.store.get(`storeProducts/${productId}`)!;
  fake.store.set(`storeProducts/${productId}`, {...p, status: "ativo", active: true, channels: {app: true, web: opts.web ?? true}});
  fake.seedDoc("storePickupPoints/arena-errejota", {name: "Arena Errejota", active: true, locationId: "arena-errejota"});
  fake.seedDoc("storeAddresses/ana", {items: [{
    id: "casa", label: "Casa", recipient: "Ana Lima", phone: "(62) 99999-0000", zip: "74210-130", street: "Rua T-37",
    number: "1240", complement: "Ap 802", district: "Setor Bueno", city: "Goiânia", uf: "GO",
  }]});
  const cart = (items: unknown[]) => fake.seedDoc("storeCarts/ana", {items});
  return {fake, db, productId, cart};
}

class FakePay implements CheckoutPayments {
  created: Array<{orderId: string; totalCents: number}> = [];
  canceled: string[] = [];
  /** Roda durante a criação da cobrança (simula outro pedido levando o saldo nesse meio-tempo). */
  onCreate: (() => void) | null = null;
  async customer() {
    return {name: "Ana Lima", email: "ana@x.com", phone: "(62) 99999-0000", cpf: "12345678909", asaasCustomerId: "cus_1"};
  }
  async createPix(p: {orderId: string; totalCents: number}) {
    this.created.push({orderId: p.orderId, totalCents: p.totalCents});
    this.onCreate?.();
    return {paymentId: `pay_${this.created.length}`, copyPaste: "00020126580014br.gov.bcb.pix0136pix-da-loja"};
  }
  async cancelCharge(id: string) {
    this.canceled.push(id);
  }
}

const ARENA = {type: "arena" as const, arenaId: "arena-errejota"};

describe("checkout · preço", () => {
  const line = (over: Partial<QuoteLine> = {}): QuoteLine => ({
    key: "a", productId: "a", skuId: "u", qty: 1, name: "A", variantLabel: "", imageUrl: null, category: "vestuario",
    collection: null, baseCents: 10000, extraCents: 0, unitCents: 10000, totalCents: 10000, personalized: false,
    customizationLabel: null, problem: null, ...over,
  });
  const coupon = (data: Record<string, unknown>) => ({id: "c1", athleteUse: null, reserved: 0, data: {
    type: "percent", value: 10, maxDiscountCents: null, scope: {type: "store", ids: []}, minOrderCents: null,
    usageLimit: null, uses: 0, onePerAthlete: false, stacksWithPix: true, appOnly: false, startDate: "2026-10-01",
    endDate: null, paused: false, ...data,
  }});

  it("desconto Pix: o que sobra do arredondamento, igual à vitrine", () => {
    assert.equal(pixDiscountOf(28990, 5), 28990 - 27541);
    assert.equal(pixDiscountOf(12990, null), 0);
  });

  it("cupom na ordem da spec: status, canal, escopo, mínimo, limite, por atleta", () => {
    const lines = [line(), line({key: "b", productId: "b", category: "bolas"})];
    assert.equal(priceCoupon("x", null, lines, "web", null, NOW).problem, "nao_existe");
    assert.equal(priceCoupon("c", coupon({paused: true}), lines, "web", null, NOW).problem, "pausado");
    assert.equal(priceCoupon("c", coupon({startDate: "2026-11-01"}), lines, "web", null, NOW).problem, "agendado");
    assert.equal(priceCoupon("c", coupon({appOnly: true}), lines, "web", null, NOW).problem, "so_app");
    assert.equal(priceCoupon("c", coupon({appOnly: true}), lines, "app_ios", null, NOW).problem, null);
    assert.equal(priceCoupon("c", coupon({scope: {type: "category", ids: ["redes"]}}), lines, "web", null, NOW).problem,
      "fora_do_escopo");
    assert.equal(priceCoupon("c", coupon({minOrderCents: 50000}), lines, "web", null, NOW).message,
      "Cupom vale a partir de R$ 500 em produtos");
    assert.equal(priceCoupon("c", coupon({usageLimit: 3, uses: 3}), lines, "web", null, NOW).problem, "esgotado");
    // Pedido esperando o Pix segura o uso: 2 pagos + 1 reservado esgotam um limite de 3.
    assert.equal(priceCoupon("c", {...coupon({usageLimit: 3, uses: 2}), reserved: 1}, lines, "web", null, NOW).problem,
      "esgotado");
    const used = {...coupon({onePerAthlete: true}), athleteUse: "usado" as const};
    assert.equal(priceCoupon("c", used, lines, "web", null, NOW).problem, "ja_usado");
    const held = {...coupon({onePerAthlete: true}), athleteUse: "reservado" as const};
    assert.equal(priceCoupon("c", held, lines, "web", null, NOW).problem, "reservado");
  });

  it("cupom: % sobre os itens do escopo com teto; fixo até o elegível; arena só na retirada dela", () => {
    const lines = [line(), line({key: "b", productId: "b", category: "bolas", totalCents: 30000})];
    assert.equal(priceCoupon("c", coupon({scope: {type: "category", ids: ["bolas"]}}), lines, "web", null, NOW).discountCents, 3000);
    assert.equal(priceCoupon("c", coupon({maxDiscountCents: 1500}), lines, "web", null, NOW).discountCents, 1500);
    assert.equal(priceCoupon("c", coupon({type: "fixed", value: 99999}), lines, "web", null, NOW).discountCents, 40000);
    const arena = coupon({scope: {type: "arena", ids: ["arena-errejota"]}});
    assert.equal(priceCoupon("c", arena, lines, "web", ARENA, NOW).problem, null);
    assert.equal(priceCoupon("c", arena, lines, "web", {type: "casa", addressId: "x", modeId: "expressa"}, NOW).problem,
      "fora_do_escopo");
  });

  it("frete: só modo ativo de preço fixo; grátis a partir do mínimo", () => {
    assert.deepEqual(shippingFor(DEFAULT_SHIPPING_CONFIG, "expressa", 10000), {cents: 3490, free: false, modeName: "Expressa"});
    assert.equal(shippingFor(DEFAULT_SHIPPING_CONFIG, "expressa", 39900)?.cents, 0);
    assert.equal(shippingFor(DEFAULT_SHIPPING_CONFIG, "padrao", 10000), null, "calculado sem integração não vale");
    assert.equal(shippingFor(DEFAULT_SHIPPING_CONFIG, "motoboy", 10000), null, "inativo");
  });
});

describe("checkout · cotação e pedido", () => {
  it("cotação relê preço e canal do servidor e aplica o Pix", async () => {
    const {db, productId, cart} = await setup();
    cart([{productId, skuId: "m", qty: 2}]);
    const q = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null}, NOW);
    assert.equal(q.subtotalCents, 25980);
    assert.equal(q.pixDiscountCents, pixDiscountOf(25980, 5));
    assert.equal(q.shippingCents, 0);
    assert.equal(q.totalCents, 25980 - pixDiscountOf(25980, 5));
    assert.deepEqual(q.problems, []);
    assert.equal(q.lines[0]!.variantLabel, "M");
  });

  it("produto fora do canal ou sem saldo marca a linha; sem entrega pede a entrega", async () => {
    const off = await setup({web: false});
    off.cart([{productId: off.productId, skuId: "m", qty: 1}]);
    const q = await quoteCheckoutCore(off.db, "ana", {channel: "web", delivery: null, couponCode: null}, NOW);
    assert.equal(q.lines[0]!.problem, "indisponivel");
    assert.deepEqual(q.problems.sort(), ["entrega_faltando", "linha_com_problema"]);
    const empty = await setup({stockM: 0});
    empty.cart([{productId: empty.productId, skuId: "m", qty: 3}]);
    const q2 = await quoteCheckoutCore(empty.db, "ana", {channel: "web", delivery: ARENA, couponCode: null}, NOW);
    assert.equal(q2.lines[0]!.problem, "esgotado", "a arena tem 2 e o CD 0: 3 não cabem em nenhum");
  });

  it("entrega em casa: endereço do atleta e frete da modalidade", async () => {
    const {db, productId, cart} = await setup();
    cart([{productId, skuId: "m", qty: 1}]);
    const q = await quoteCheckoutCore(db, "ana", {
      channel: "app_ios", delivery: {type: "casa", addressId: "casa", modeId: "expressa"}, couponCode: null,
    }, NOW);
    assert.equal(q.shippingCents, 3490);
    assert.equal(q.totalCents, 12990 - pixDiscountOf(12990, 5) + 3490);
    const noAddr = await quoteCheckoutCore(db, "ana", {
      channel: "app_ios", delivery: {type: "casa", addressId: "nao-existe", modeId: "expressa"}, couponCode: null,
    }, NOW);
    assert.ok(noAddr.problems.includes("endereco_faltando"));
  });

  it("estoque com a conta da reserva: o mesmo SKU soma e o local é um só (arena inteira ou CD)", async () => {
    const {db, productId, cart} = await setup({stockM: 1});
    // M: CD 1, arena 2. Duas linhas de M (uma personalizada) somam 2: a arena cobre.
    cart([{productId, skuId: "m", qty: 1}, {productId, skuId: "m", qty: 1, lineId: "l-outra"}]);
    const ok = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null}, NOW);
    assert.deepEqual(ok.lines.map((l) => l.problem), [null, null]);
    // Com P (só no CD) a arena não cobre tudo: vai tudo do CD, e lá M só tem 1 pras 2 linhas.
    cart([{productId, skuId: "m", qty: 1}, {productId, skuId: "m", qty: 1, lineId: "l-outra"}, {productId, skuId: "p", qty: 1}]);
    const short = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null}, NOW);
    assert.deepEqual(short.lines.map((l) => l.problem), ["esgotado", "esgotado", null]);
  });

  it("personalizada adulterada no carrinho (fonte fora da config, arte de outro) sai do pedido", async () => {
    const {fake, db, productId, cart} = await setup();
    fake.seedDoc(`storeProductCustomization/${productId}`, {active: true, updatedAt: NOW});
    const name = {text: "ANA", fontId: "bloco", color: "#ffffff", placement: "costas_superior"};
    cart([{productId, skuId: "m", qty: 1, lineId: "l1", customization: {configVersion: 1, name}}]);
    const ok = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null}, NOW);
    assert.equal(ok.lines[0]!.problem, null);
    cart([{productId, skuId: "m", qty: 1, lineId: "l1", customization: {configVersion: 1, name: {...name, fontId: "comic"}}}]);
    const font = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null}, NOW);
    assert.equal(font.lines[0]!.problem, "personalizacao_off");
    fake.seedDoc("storeConfig/blocklist", {terms: ["ANA"]});
    cart([{productId, skuId: "m", qty: 1, lineId: "l1", customization: {configVersion: 1, name}}]);
    const blocked = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null}, NOW);
    assert.equal(blocked.lines[0]!.problem, "personalizacao_off");
  });

  it("cupom fora do formato não derruba a cotação: vira não encontrado", async () => {
    const {db, productId, cart} = await setup();
    cart([{productId, skuId: "m", qty: 1}]);
    const q = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: "black-friday/2"}, NOW);
    assert.equal(q.coupon?.problem, "nao_existe");
    assert.equal(q.totalCents, 12990 - pixDiscountOf(12990, 5));
  });

  it("pedido: cobra o Pix, reserva, guarda a cobrança e limpa o carrinho", async () => {
    const {fake, db, productId, cart} = await setup();
    cart([{productId, skuId: "m", qty: 1}, {productId, skuId: "p", qty: 1, lineId: "l-outra"}]);
    const pay = new FakePay();
    const quote = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null}, NOW);
    const r = await createStoreOrderCore(db, "ana", {
      channel: "web", delivery: ARENA, couponCode: null, expectedTotalCents: quote.totalCents, cpf: null,
    }, pay, NOW, () => "ord_teste_0001");
    assert.equal(r.number, "NX-0001");
    assert.equal(r.totalCents, quote.totalCents);
    assert.deepEqual(pay.created, [{orderId: "ord_teste_0001", totalCents: quote.totalCents}]);
    const o = fake.store.get("storeOrders/ord_teste_0001")!;
    assert.equal(o["status"], "pag");
    assert.deepEqual(o["charge"], {provider: "asaas", paymentId: "pay_1", method: "pix"});
    assert.equal((o["pix"] as Record<string, unknown>)["copyPaste"], "00020126580014br.gov.bcb.pix0136pix-da-loja");
    assert.equal((o["customer"] as Record<string, unknown>)["uid"], "ana");
    assert.deepEqual(fake.store.get("storeCarts/ana")!["items"], []);
  });

  it("total diferente do visto: nada é cobrado e volta a cotação nova", async () => {
    const {db, productId, cart} = await setup();
    cart([{productId, skuId: "m", qty: 1}]);
    const pay = new FakePay();
    await assert.rejects(createStoreOrderCore(db, "ana", {
      channel: "web", delivery: ARENA, couponCode: null, expectedTotalCents: 1, cpf: null,
    }, pay, NOW, () => "ord_pedido_x"), /mudaram/);
    assert.equal(pay.created.length, 0);
  });

  it("sem estoque na reserva: a cobrança criada é cancelada", async () => {
    const {fake, db, productId, cart} = await setup();
    cart([{productId, skuId: "m", qty: 2}]);
    const pay = new FakePay();
    const quote = await quoteCheckoutCore(db, "ana", {channel: "web", delivery: ARENA, couponCode: null}, NOW);
    // Outro pedido leva o saldo enquanto a cobrança é criada (depois da cotação, antes da reserva).
    pay.onCreate = () => {
      const sku = fake.store.get(`storeProducts/${productId}/skus/m`)!;
      fake.store.set(`storeProducts/${productId}/skus/m`, {...sku, reservedByLocation: {cd: 5, "arena-errejota": 2}});
    };
    await assert.rejects(createStoreOrderCore(db, "ana", {
      channel: "web", delivery: ARENA, couponCode: null, expectedTotalCents: quote.totalCents, cpf: null,
    }, pay, NOW, () => "ord_pedido_y"), (e: {message: string; details?: {quote?: {lines: QuoteLine[]}}}) => {
      assert.match(e.message, /Sem estoque/);
      assert.equal(e.details?.quote?.lines[0]?.problem, "esgotado", "volta a cotação nova com a linha marcada");
      return true;
    });
    assert.deepEqual(pay.canceled, ["pay_1"]);
    assert.equal(fake.store.has("storeOrders/ord_pedido_y"), false);
  });
});

describe("checkout · pagamento e Pix vencido", () => {
  async function paidSetup(withCoupon = false) {
    const s = await setup();
    s.fake.seedDoc(`storeProductCustomization/${s.productId}`, {active: true, updatedAt: NOW});
    if (withCoupon) {
      s.fake.seedDoc("storeCouponCodes/AREIA10", {couponId: "cp1"});
      s.fake.seedDoc("storeCoupons/cp1", {code: "AREIA10", type: "percent", value: 10, maxDiscountCents: null,
        scope: {type: "store", ids: [], labels: []}, minOrderCents: null, usageLimit: null, uses: 4, onePerAthlete: true,
        stacksWithPix: false, appOnly: false, startDate: "2026-10-01", endDate: null, paused: false});
    }
    s.cart([
      {productId: s.productId, skuId: "m", qty: 1},
      {productId: s.productId, skuId: "p", qty: 1, lineId: "l1", customization: {
        configVersion: 1, extraPriceCents: 1490, name: {text: "ANA", fontId: "bloco", color: "#ffffff", placement: "costas_superior"},
      }},
    ]);
    const pay = new FakePay();
    const input = {channel: "app_ios" as const, delivery: ARENA, couponCode: withCoupon ? "areia10" : null};
    const quote = await quoteCheckoutCore(s.db, "ana", input, NOW);
    await createStoreOrderCore(s.db, "ana", {...input, expectedTotalCents: quote.totalCents, cpf: null}, pay, NOW, () => "ord_pedido_1");
    return {...s, quote};
  }

  it("cupom que não acumula com Pix: sem desconto Pix", async () => {
    const {quote} = await paidSetup(true);
    assert.equal(quote.coupon?.discountCents, Math.round(((12990 + 12990 + 1490) * 10) / 100));
    assert.equal(quote.pixDiscountCents, 0);
  });

  it("confirmar: pag → sep, conta o cupom, marca o atleta e abre a fila de arte", async () => {
    const {fake, db, quote} = await paidSetup(true);
    const r = await confirmStoreOrderPaymentCore(db, "ord_pedido_1", {paymentId: "pay_1", valueCents: quote.totalCents}, NOW);
    assert.equal(r.outcome, "confirmed");
    const o = fake.store.get("storeOrders/ord_pedido_1")!;
    assert.equal(o["status"], "sep");
    assert.equal(o["pix"], null);
    assert.equal(fake.store.get("storeCoupons/cp1")!["uses"], 5);
    assert.equal(fake.store.get("storeCouponUses/cp1_ana")!["status"], "usado");
    assert.equal(fake.store.get("storeCouponUses/cp1")!["reserved"], 0);
    const item = fake.store.get("storeCustomItems/ord_pedido_1-1")!;
    assert.equal(item["name"], "ANA");
    assert.equal(item["status"], "aprovar");
    assert.equal(item["orderCode"], "NX-0001");
    const again = await confirmStoreOrderPaymentCore(db, "ord_pedido_1", {paymentId: "pay_1", valueCents: quote.totalCents}, NOW);
    assert.equal(again.outcome, "already_paid");
    assert.equal(fake.store.get("storeCoupons/cp1")!["uses"], 5, "não conta duas vezes");
  });

  it("cupom fica reservado enquanto o Pix não cai: outro pedido do atleta não leva o mesmo cupom", async () => {
    const {fake, db, cart, productId} = await paidSetup(true);
    assert.equal(fake.store.get("storeCouponUses/cp1_ana")!["status"], "reservado");
    assert.equal(fake.store.get("storeCouponUses/cp1")!["reserved"], 1);
    cart([{productId, skuId: "p", qty: 1}]);
    const input = {channel: "app_ios" as const, delivery: ARENA, couponCode: "AREIA10"};
    const q = await quoteCheckoutCore(db, "ana", input, NOW);
    assert.equal(q.coupon?.problem, "reservado");
    await assert.rejects(createStoreOrderCore(db, "ana", {...input, expectedTotalCents: q.totalCents, cpf: null},
      new FakePay(), NOW, () => "ord_pedido_2"), /esperando o Pix/);
  });

  it("cancelado sem pagar devolve o cupom reservado (uma vez só)", async () => {
    const {fake, db} = await paidSetup(true);
    const later = new Date(NOW.getTime() + 31 * 60_000);
    await expireStorePixCore(db, later, {getPayment: async () => ({status: "PENDING", valueCents: 0}), deleteCharge: async () => {}});
    assert.equal(await releaseCouponOnCancelCore(db, "ord_pedido_1", later), true);
    assert.equal(fake.store.has("storeCouponUses/cp1_ana"), false);
    assert.equal(fake.store.get("storeCouponUses/cp1")!["reserved"], 0);
    assert.equal(fake.store.get("storeCoupons/cp1")!["uses"], 4, "não pagou, não usou");
    assert.equal(await releaseCouponOnCancelCore(db, "ord_pedido_1", later), false);
  });

  it("valor menor ou cobrança de outro pedido não confirmam", async () => {
    const {db, quote} = await paidSetup();
    assert.equal((await confirmStoreOrderPaymentCore(db, "ord_pedido_1", {paymentId: "pay_1", valueCents: quote.totalCents - 1}, NOW))
      .outcome, "value_mismatch");
    assert.equal((await confirmStoreOrderPaymentCore(db, "ord_pedido_1", {paymentId: "outro", valueCents: quote.totalCents}, NOW))
      .outcome, "unknown_order");
  });

  it("Pix vencido sem pagamento: apaga a cobrança, cancela e devolve a reserva", async () => {
    const {fake, db, productId} = await paidSetup();
    const deleted: string[] = [];
    const later = new Date(NOW.getTime() + 31 * 60_000);
    const r = await expireStorePixCore(db, later, {
      getPayment: async () => ({status: "PENDING", valueCents: 0}),
      deleteCharge: async (id) => void deleted.push(id),
    });
    assert.deepEqual(r.canceled, ["ord_pedido_1"]);
    assert.deepEqual(deleted, ["pay_1"]);
    assert.equal(fake.store.get("storeOrders/ord_pedido_1")!["status"], "can");
    const sku = fake.store.get(`storeProducts/${productId}/skus/m`)!;
    const reserved = (sku["reservedByLocation"] ?? {}) as Record<string, number>;
    assert.equal(reserved["arena-errejota"] ?? 0, 0);
  });

  it("Pix vencido mas pago (webhook perdido): confirma em vez de cancelar", async () => {
    const {fake, db, quote} = await paidSetup();
    const later = new Date(NOW.getTime() + 31 * 60_000);
    const r = await expireStorePixCore(db, later, {
      getPayment: async () => ({status: "RECEIVED", valueCents: quote.totalCents}),
      deleteCharge: async () => assert.fail("não apaga cobrança paga"),
    });
    assert.deepEqual(r.confirmed, ["ord_pedido_1"]);
    assert.equal(fake.store.get("storeOrders/ord_pedido_1")!["status"], "sep");
  });

  it("Pix vencido pago com valor que não fecha: nunca cancela dinheiro que entrou", async () => {
    const {fake, db, quote} = await paidSetup();
    const later = new Date(NOW.getTime() + 31 * 60_000);
    const r = await expireStorePixCore(db, later, {
      getPayment: async () => ({status: "RECEIVED", valueCents: quote.totalCents - 100}),
      deleteCharge: async () => assert.fail("não apaga cobrança paga"),
    });
    assert.deepEqual(r.failed, ["ord_pedido_1"]);
    assert.equal(fake.store.get("storeOrders/ord_pedido_1")!["status"], "pag");
  });

  it("Pix pago depois do cancelamento: o estorno entra no pedido (uma vez)", async () => {
    const {fake, db, quote} = await paidSetup();
    const later = new Date(NOW.getTime() + 31 * 60_000);
    await expireStorePixCore(db, later, {getPayment: async () => ({status: "PENDING", valueCents: 0}), deleteCharge: async () => {}});
    await recordLatePixRefundCore(db, "ord_pedido_1", "pay_1", quote.totalCents, later);
    await recordLatePixRefundCore(db, "ord_pedido_1", "pay_1", quote.totalCents, later);
    const o = fake.store.get("storeOrders/ord_pedido_1")!;
    assert.equal(o["refundedCents"], quote.totalCents);
    assert.equal((o["refunds"] as unknown[]).length, 1);
  });

  it("antes de vencer, a varredura não mexe", async () => {
    const {db} = await paidSetup();
    const r = await expireStorePixCore(db, NOW, {
      getPayment: async () => assert.fail("não consulta"), deleteCharge: async () => assert.fail("não apaga"),
    });
    assert.deepEqual(r, {confirmed: [], canceled: [], failed: [], customItemIds: []});
  });
});

describe("checkout · visão do atleta", () => {
  it("sem CPF nem reserva; código de retirada só com o pedido na arena", () => {
    const base = {
      number: "NX-0001", status: "sep", customer: {uid: "ana", cpf: "12345678909", name: "Ana"},
      items: [{productId: "p", productName: "Camiseta", variantLabel: "M", qty: 1, unitCents: 100, totalCents: 100,
        customization: {name: "ANA"}}],
      delivery: {type: "arena", placeName: "Arena Errejota", pickupCode: "4821", pickupDeadline: null},
      reservation: {locationId: "arena-errejota", active: true}, internalNote: "nota", totalCents: 100,
      pix: {copyPaste: "x".repeat(40), expiresAt: NOW},
    };
    const v = buildOrderView("ord_pedido_1", base)!;
    assert.equal(JSON.stringify(v).includes("12345678909"), false);
    assert.equal("reservation" in v, false);
    assert.equal("internalNote" in v, false);
    assert.equal((v["delivery"] as Record<string, unknown>)["pickupCode"], null);
    assert.equal(v["pix"], null, "Pix só aparece aguardando pagamento");
    const ready = buildOrderView("ord_pedido_1", {...base, status: "ret"})!;
    assert.equal((ready["delivery"] as Record<string, unknown>)["pickupCode"], "4821");
    assert.equal(buildOrderView("ord_2", {...base, customer: {uid: null}}), null);
  });
});

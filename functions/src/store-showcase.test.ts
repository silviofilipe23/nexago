import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  bannerFromData,
  buildShowcaseConfig,
  buildShowcaseDelivery,
  buildShowcaseProduct,
  pixPriceCents,
  STORE_CATEGORIES,
} from "./store-showcase";
import {rebuildShowcaseConfig, syncShowcaseProduct} from "./store-showcase-sync";

const NOW = new Date("2026-10-16T18:00:00Z");

function product(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Camiseta Dry UV50 Areia", slug: "camiseta-dry-uv50-areia", category: "vestuario",
    collection: "verao-2026", brand: "NexaGO", badge: null, priceCents: 12990, compareAtPriceCents: null,
    axes: [{id: "tam", label: "Tamanho", values: [{id: "p", label: "P"}, {id: "m", label: "M"}]}],
    channels: {app: true, web: true}, fulfillment: {pickup: true, delivery: true},
    status: "ativo", active: true, photos: [{id: "f1", url: "https://cdn/x.jpg"}], soldLast30: 51,
    publishedAt: new Date("2026-10-01T12:00:00Z"),
    updatedBy: {uid: "admin1", name: "Ana"}, lowStockThreshold: 10, stockTotal: 9,
    ...over,
  };
}

function sku(id: string, stock: number, over: Record<string, unknown> = {}) {
  return {id, data: {axisValues: {tam: id}, priceCents: null, stockByLocation: {cd: stock}, ...over}};
}

describe("buildShowcaseProduct", () => {
  it("leva só o que a vitrine mostra — nada de autor, alerta de estoque ou saldo", () => {
    const out = buildShowcaseProduct(product(), [sku("m", 4), sku("p", 5)], null, NOW)!;
    assert.equal(out.name, "Camiseta Dry UV50 Areia");
    assert.equal(out.coverUrl, "https://cdn/x.jpg");
    assert.equal(out.soldOut, false);
    assert.deepEqual(out.variants.map((v) => [v.id, v.inStock, v.priceCents]), [["m", true, 12990], ["p", true, 12990]]);
    const keys = Object.keys(out);
    for (const secret of ["updatedBy", "lowStockThreshold", "stockTotal", "baseSku", "version"]) {
      assert.ok(!keys.includes(secret), `${secret} não pode ir para a vitrine`);
    }
  });

  it("rascunho, arquivado, pausado, sem canal ou sem SKU some da vitrine", () => {
    const skus = [sku("m", 1)];
    assert.equal(buildShowcaseProduct(product({status: "rascunho"}), skus, null, NOW), null);
    assert.equal(buildShowcaseProduct(product({status: "arquivado"}), skus, null, NOW), null);
    assert.equal(buildShowcaseProduct(product({active: false}), skus, null, NOW), null);
    assert.equal(buildShowcaseProduct(product({channels: {app: false, web: false}}), skus, null, NOW), null);
    assert.equal(buildShowcaseProduct(product(), [], null, NOW), null);
    assert.equal(buildShowcaseProduct(null, skus, null, NOW), null);
  });

  it("reserva conta: peça toda reservada é esgotada", () => {
    const out = buildShowcaseProduct(product(), [sku("m", 2, {reservedByLocation: {cd: 2}})], null, NOW)!;
    assert.equal(out.soldOut, true);
    assert.equal(out.variants[0]!.inStock, false);
  });

  it("faixa de preço só entre variações com saldo; sem saldo nenhum, entre todas", () => {
    const skus = [sku("p", 0, {priceCents: 9990}), sku("m", 3), sku("g", 2, {priceCents: 14990})];
    const out = buildShowcaseProduct(product(), skus, null, NOW)!;
    assert.equal(out.minPriceCents, 12990);
    assert.equal(out.maxPriceCents, 14990);

    const esgotado = buildShowcaseProduct(product(), skus.map((s) => ({...s, data: {...s.data, stockByLocation: {}}})), null, NOW)!;
    assert.equal(esgotado.minPriceCents, 9990);
    assert.equal(esgotado.maxPriceCents, 14990);
  });

  it("selo 'nova' vencido não vai; dentro do prazo leva a data em que vence", () => {
    const vencido = buildShowcaseProduct(product({badge: "nova", publishedAt: new Date("2026-09-01T00:00:00Z")}), [sku("m", 1)], null, NOW)!;
    assert.equal(vencido.badge, null);
    assert.equal(vencido.badgeExpiresAt, null);

    const nova = buildShowcaseProduct(product({badge: "nova"}), [sku("m", 1)], null, NOW)!;
    assert.equal(nova.badge, "nova");
    assert.equal(nova.badgeExpiresAt?.toISOString(), "2026-10-31T12:00:00.000Z");

    const top = buildShowcaseProduct(product({badge: "mais-vendida"}), [sku("m", 1)], null, NOW)!;
    assert.equal(top.badge, "mais-vendida");
    assert.equal(top.badgeExpiresAt, null);
  });

  it("preço 'de' só quando é maior que o preço de venda", () => {
    assert.equal(buildShowcaseProduct(product({compareAtPriceCents: 15990}), [sku("m", 1)], null, NOW)!.compareAtPriceCents, 15990);
    assert.equal(buildShowcaseProduct(product({compareAtPriceCents: 12990}), [sku("m", 1)], null, NOW)!.compareAtPriceCents, null);
  });

  it("personalizável vem da config ativa, não do doc do produto", () => {
    assert.equal(buildShowcaseProduct(product(), [sku("m", 1)], {active: true}, NOW)!.customizable, true);
    assert.equal(buildShowcaseProduct(product(), [sku("m", 1)], {active: false}, NOW)!.customizable, false);
  });

  it("saldo só até o teto da compra; estoque baixo pelo alerta do produto", () => {
    const skus = [sku("p", 0), sku("m", 2), sku("g", 10), sku("gg", 40), sku("xg", 3, {reservedByLocation: {cd: 1}})];
    const out = buildShowcaseProduct(product({lowStockThreshold: 3}), skus, null, NOW)!;
    const byId = new Map(out.variants.map((v) => [v.id, v]));
    assert.deepEqual(byId.get("p"), {...byId.get("p")!, maxQty: 0, lowStock: false, inStock: false});
    assert.equal(byId.get("m")!.maxQty, 2);
    assert.equal(byId.get("m")!.lowStock, true);
    assert.equal(byId.get("g")!.maxQty, 10);
    assert.equal(byId.get("g")!.lowStock, false);
    assert.equal(byId.get("gg")!.maxQty, 10, "acima do teto o público não sabe o saldo");
    assert.equal(byId.get("xg")!.maxQty, 2, "reserva sai do saldo livre");
    assert.equal(byId.get("xg")!.lowStock, true);
  });

  it("galeria na ordem do backoffice, com a cor de cada foto; sem foto sem url", () => {
    const out = buildShowcaseProduct(product({
      photos: [
        {id: "a", url: "", path: "x"},
        {id: "b", url: "https://cdn/branco.jpg", path: "y", colorValueId: "branco", view: "frente"},
        {id: "c", url: "https://cdn/geral.jpg", path: "z", colorValueId: null},
      ],
    }), [sku("m", 1)], null, NOW)!;
    assert.deepEqual(out.photos, [
      {url: "https://cdn/branco.jpg", colorValueId: "branco", view: "frente"},
      {url: "https://cdn/geral.jpg", colorValueId: null, view: null},
    ]);
    assert.equal(out.coverUrl, "https://cdn/branco.jpg");
    assert.ok(!JSON.stringify(out.photos).includes("path"), "caminho do Storage não vai para a vitrine");
  });

  it("descrição e detalhes técnicos, sem linha pela metade", () => {
    const out = buildShowcaseProduct(product({
      description: "  Camiseta leve.  ",
      technicalDetails: [{label: "Tecido", value: "Poliamida"}, {label: "Proteção", value: ""}, null],
    }), [sku("m", 1)], null, NOW)!;
    assert.equal(out.description, "Camiseta leve.");
    assert.deepEqual(out.details, [{label: "Tecido", value: "Poliamida"}]);
  });
});

describe("buildShowcaseDelivery", () => {
  it("sem config: só a Expressa (fixa); a calculada espera a integração de frete", () => {
    const d = buildShowcaseDelivery(null);
    assert.equal(d.freeAboveCents, 39900);
    assert.deepEqual(d.modes.map((m) => [m.id, m.priceCents]), [["expressa", 3490]]);
  });

  it("calculada entra com a integração ligada; desligada e sem preço ficam de fora", () => {
    const d = buildShowcaseDelivery({
      melhorEnvioConnected: true,
      freeShippingAboveCents: 0,
      modes: [{id: "expressa", active: false}, {id: "motoboy", active: true, priceCents: 0}],
    });
    assert.equal(d.freeAboveCents, null);
    assert.deepEqual(d.modes.map((m) => [m.id, m.priceCents]), [["padrao", null]]);
  });
});

describe("pixPriceCents", () => {
  it("arredonda ao centavo, meio centavo sobe", () => {
    assert.equal(pixPriceCents(28990, 5), 27541);
    assert.equal(pixPriceCents(12990, 5), 12341);
    assert.equal(pixPriceCents(6990, 5), 6641);
    assert.equal(pixPriceCents(10000, 5), 9500);
  });
});

describe("bannerFromData", () => {
  it("descarta banner sem título ou sem coleção, e o desligado", () => {
    assert.equal(bannerFromData({id: "b", title: "", primary: {collectionId: "verao-2026"}}), null);
    assert.equal(bannerFromData({id: "b", title: "x", primary: {}}), null);
    assert.equal(bannerFromData({id: "b", title: "x", primary: {collectionId: "c"}, active: false}), null);
  });

  it("corta título e subtítulo nos limites e solta secundário sem destino", () => {
    const b = bannerFromData({
      id: "verao", kicker: "COLEÇÃO VERÃO 26", title: "x".repeat(60), subtitle: "y".repeat(100),
      primary: {label: "Ver coleção", collectionId: "verao-2026"}, secondary: {label: "Kits"},
      startDate: "2026-10-01", endDate: "ontem",
    })!;
    assert.equal(b.title.length, 50);
    assert.equal(b.subtitle.length, 90);
    assert.equal(b.secondary, null);
    assert.equal(b.startDate, "2026-10-01");
    assert.equal(b.endDate, null);
  });
});

describe("buildShowcaseConfig", () => {
  it("sem nada gravado vale o padrão: Pix 5%, troca 30 dias, sem retirada", () => {
    const c = buildShowcaseConfig({discounts: null, returns: null, campaigns: null, pickupPoints: [], arenas: new Map()});
    assert.deepEqual(c.benefits, {pixDiscountPct: 5, pickupReadyHours: null, exchangeDays: 30});
    assert.deepEqual(c.categories.map((x) => x.id), STORE_CATEGORIES.map((x) => x.id));
    assert.deepEqual(c.banners, []);
    assert.deepEqual(c.delivery.modes.map((m) => m.id), ["expressa"]);
  });

  it("Pix desligado some; prazo da retirada é o do ponto mais lento", () => {
    const c = buildShowcaseConfig({
      discounts: {rules: [{id: "pix", active: false}]},
      returns: {windowDays: 15},
      campaigns: null,
      pickupPoints: [
        {arenaId: "a1", data: {name: "Arena Errejota", active: true, restockHours: 24}},
        {arenaId: "a2", data: {name: "Arena CFC", active: true, restockHours: 48}},
        {arenaId: "a3", data: {name: "Pausada", active: false, restockHours: 24}},
      ],
      arenas: new Map([["a1", {location: {latitude: -16.7, longitude: -49.3}}]]),
    });
    assert.equal(c.benefits.pixDiscountPct, null);
    assert.equal(c.benefits.exchangeDays, 15);
    assert.equal(c.benefits.pickupReadyHours, 48);
    assert.deepEqual(c.pickupArenas.map((a) => a.arenaId), ["a2", "a1"]);
    assert.equal(c.pickupArenas[1]!.latitude, -16.7);
    assert.equal(c.pickupArenas[0]!.latitude, null);
  });
});

describe("sincronização", () => {
  function makeDb() {
    const fake = new FakeFirestore();
    fake.seedDoc("storeProducts/p1", product());
    fake.seedDoc("storeProducts/p1/skus/m", sku("m", 3).data);
    return {fake, db: fake as unknown as Firestore};
  }

  it("grava o espelho e o apaga quando o produto sai de venda", async () => {
    const {fake, db} = makeDb();
    assert.equal(await syncShowcaseProduct(db, "p1", NOW), "set");
    assert.equal(fake.store.get("storeShowcase/p1")?.["name"], "Camiseta Dry UV50 Areia");

    fake.seedDoc("storeProducts/p1", product({active: false}));
    assert.equal(await syncShowcaseProduct(db, "p1", NOW), "deleted");
    assert.equal(fake.store.has("storeShowcase/p1"), false);
  });

  it("lê a personalização do doc à parte", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("storeProductCustomization/p1", {active: true});
    await syncShowcaseProduct(db, "p1", NOW);
    assert.equal(fake.store.get("storeShowcase/p1")?.["customizable"], true);
  });

  it("monta a config pública com os pontos ativos e a localização da arena", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("storePickupPoints/a1", {name: "Arena Errejota", active: true, restockHours: 24});
    fake.seedDoc("storePickupPoints/a2", {name: "Arena CFC", active: false, restockHours: 48});
    fake.seedDoc("arenas/a1", {name: "Arena Errejota", latitude: -16.7, longitude: -49.3});
    fake.seedDoc("storeConfig/campaigns", {
      banners: [{id: "verao", title: "Equipamento de quem joga na areia", primary: {collectionId: "verao-2026"}}],
    });
    await rebuildShowcaseConfig(fake as unknown as Firestore, NOW);
    const doc = fake.store.get("storePublic/showcase")!;
    assert.deepEqual((doc["pickupArenas"] as {arenaId: string}[]).map((a) => a.arenaId), ["a1"]);
    assert.equal((doc["benefits"] as {pickupReadyHours: number}).pickupReadyHours, 24);
    assert.equal((doc["banners"] as unknown[]).length, 1);
  });
});

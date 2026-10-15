import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SKUS_PER_PRODUCT,
  badgeIsVisible,
  publishValidationErrors,
  rollupsOf,
  skuCodeFrom,
  skuIdFromAxisValues,
  slugify,
  sumStock,
  type Axis,
  type ProductForValidation,
  type SkuDoc,
} from "./store-catalog";

const AXES: Axis[] = [
  {id: "cor", label: "Cor", values: [
    {id: "branco", label: "Branco areia", hex: "#F2EDE4"},
    {id: "laranja", label: "Laranja", hex: "#FF6A1A"},
  ]},
  {id: "tam", label: "Tamanho", values: [
    {id: "p", label: "P"},
    {id: "m", label: "M"},
  ]},
];

function sku(over: Partial<SkuDoc> = {}): SkuDoc {
  return {
    id: "branco_p",
    code: "NX-CAM-BRANCO-P",
    barcode: null,
    axisValues: {cor: "branco", tam: "p"},
    priceCents: null,
    stockByLocation: {cd: 6},
    stock: 6,
    ...over,
  };
}

function product(over: Partial<ProductForValidation> = {}): ProductForValidation {
  return {
    name: "Camiseta Dry UV50 Areia",
    category: "vestuario",
    priceCents: 12990,
    compareAtPriceCents: null,
    channels: {app: true, web: true},
    fulfillment: {pickup: true, delivery: true},
    shipping: {weightGrams: 180, lengthCm: 30, widthCm: 22, heightCm: 3},
    ...over,
  };
}

describe("slugify", () => {
  it("tira acento, caixa e pontuação", () => {
    assert.equal(slugify("Óculos Polarizado Sunline"), "oculos-polarizado-sunline");
    assert.equal(slugify("Rede Oficial Beach 8,5 m"), "rede-oficial-beach-8-5-m");
  });

  it("não deixa traço sobrando nas pontas nem repetido", () => {
    assert.equal(slugify("  Kit --- Demarcação  "), "kit-demarcacao");
  });

  it("nome sem nenhuma letra cai num fallback, em vez de slug vazio", () => {
    assert.equal(slugify("###"), "produto");
    assert.equal(slugify(""), "produto");
  });
});

describe("identidade do SKU", () => {
  it("o id vem dos valores de eixo, na ordem dos eixos", () => {
    assert.equal(skuIdFromAxisValues({tam: "p", cor: "branco"}, AXES), "branco_p");
  });

  it("o código junta a raiz com os valores em caixa alta", () => {
    assert.equal(skuCodeFrom("NX-CAM", {cor: "branco", tam: "p"}, AXES), "NX-CAM-BRANCO-P");
  });

  it("produto sem eixo tem um SKU só, com o código igual à raiz", () => {
    assert.equal(skuIdFromAxisValues({}, []), "unico");
    assert.equal(skuCodeFrom("NX-RED", {}, []), "NX-RED");
  });
});

describe("rollups", () => {
  it("soma o estoque de todos os locais", () => {
    assert.equal(sumStock({cd: 6, arena1: 4}), 10);
    assert.equal(sumStock({}), 0);
  });

  it("conta SKUs, soma estoque e acha o menor preço", () => {
    const skus = [
      sku({stock: 6}),
      sku({id: "branco_m", code: "NX-CAM-BRANCO-M", stock: 2, priceCents: 14990}),
      sku({id: "laranja_p", code: "NX-CAM-LARANJA-P", stock: 4}),
    ];
    assert.deepEqual(rollupsOf(skus, 12990), {skuCount: 3, stockTotal: 12, priceFromCents: 12990});
  });

  it("preço de variação mais barato puxa o 'a partir de'", () => {
    const skus = [sku({priceCents: 9990}), sku({id: "b", code: "NX-CAM-B", priceCents: null})];
    assert.equal(rollupsOf(skus, 12990).priceFromCents, 9990);
  });
});

describe("publishValidationErrors", () => {
  it("produto completo não tem erro", () => {
    assert.deepEqual(publishValidationErrors(product()), []);
  });

  it("cobra nome, categoria e preço", () => {
    const errors = publishValidationErrors(product({name: "ab", category: "", priceCents: 0}));
    assert.deepEqual(errors.sort(), ["category", "name", "priceCents"]);
  });

  it("cobra ao menos um canal", () => {
    assert.deepEqual(publishValidationErrors(product({channels: {app: false, web: false}})), ["channels"]);
  });

  it("cobra ao menos uma forma de entrega", () => {
    assert.deepEqual(
      publishValidationErrors(product({fulfillment: {pickup: false, delivery: false}})),
      ["fulfillment"],
    );
  });

  it("com entrega ligada, cobra peso e dimensões", () => {
    assert.deepEqual(publishValidationErrors(product({shipping: null})), ["shipping"]);
  });

  it("sem entrega, não cobra peso nem dimensões", () => {
    const p = product({fulfillment: {pickup: true, delivery: false}, shipping: null});
    assert.deepEqual(publishValidationErrors(p), []);
  });

  it("preço 'de' tem que ser maior que o de venda", () => {
    assert.deepEqual(publishValidationErrors(product({compareAtPriceCents: 9990})), ["compareAtPriceCents"]);
  });

  it("não cobra foto: isso é da fatia D", () => {
    assert.deepEqual(publishValidationErrors(product()), []);
  });
});

describe("badgeIsVisible", () => {
  const publishedAt = new Date("2026-10-01T12:00:00Z");

  it("'nova' vale nos primeiros 30 dias", () => {
    assert.equal(badgeIsVisible("nova", publishedAt, new Date("2026-10-20T12:00:00Z")), true);
  });

  it("'nova' expira depois de 30 dias, sem job nenhum", () => {
    assert.equal(badgeIsVisible("nova", publishedAt, new Date("2026-11-05T12:00:00Z")), false);
  });

  it("os outros selos não expiram", () => {
    assert.equal(badgeIsVisible("mais-vendida", publishedAt, new Date("2027-01-01T12:00:00Z")), true);
  });

  it("sem selo, nada a mostrar", () => {
    assert.equal(badgeIsVisible(null, publishedAt, new Date()), false);
  });

  it("'nova' sem data de publicação não aparece", () => {
    assert.equal(badgeIsVisible("nova", null, new Date()), false);
  });
});

describe("MAX_SKUS_PER_PRODUCT", () => {
  it("é 100, o teto que mantém a transação dentro das 500 operações", () => {
    assert.equal(MAX_SKUS_PER_PRODUCT, 100);
  });
});

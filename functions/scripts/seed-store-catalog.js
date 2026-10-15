/* eslint-disable */
/**
 * Semeia o catálogo da Loja com os 8 produtos do desenho da tela de Produtos.
 *
 * Escreve pelo Admin SDK, que não passa pelas callables nem pelas rules — é
 * seed, não fluxo de usuário. Idempotente: os ids são fixos, rodar de novo
 * sobrescreve em vez de duplicar.
 *
 *   node scripts/seed-store-catalog.js --project volley-track-dev-4596c
 *   node scripts/seed-store-catalog.js --project <id> --yes
 *
 * Sem --yes é DRY-RUN: só lista o que seria escrito.
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");

const AXES_CAMISETA = [
  {
    id: "cor",
    label: "Cor",
    values: [
      {id: "branco", label: "Branco areia", hex: "#F2EDE4"},
      {id: "laranja", label: "Laranja", hex: "#FF6A1A"},
      {id: "preto", label: "Preto", hex: "#141416"},
    ],
  },
  {
    id: "tam",
    label: "Tamanho",
    values: [
      {id: "p", label: "P"},
      {id: "m", label: "M"},
      {id: "g", label: "G"},
      {id: "gg", label: "GG"},
      {id: "xg", label: "XG"},
    ],
  },
];

/** A grade do desenho: cor × tamanho. Soma 45 unidades. */
const GRADE_CAMISETA = {
  branco: {p: 6, m: 2, g: 3, gg: 5, xg: 0},
  laranja: {p: 4, m: 7, g: 5, gg: 2, xg: 1},
  preto: {p: 3, m: 4, g: 2, gg: 1, xg: 0},
};

function camisetaSkus() {
  const out = [];
  for (const [cor, porTamanho] of Object.entries(GRADE_CAMISETA)) {
    for (const [tam, stock] of Object.entries(porTamanho)) {
      out.push({
        id: `${cor}_${tam}`,
        code: `NX-CAM-${cor.toUpperCase()}-${tam.toUpperCase()}`,
        barcode: null,
        axisValues: {cor, tam},
        priceCents: null,
        stockByLocation: {cd: stock},
        stock,
      });
    }
  }
  return out;
}

/** Produto sem eixo: um SKU só, com o código igual à raiz. */
function skuUnico(baseSku, stock) {
  return [{
    id: "unico",
    code: baseSku,
    barcode: null,
    axisValues: {},
    priceCents: null,
    stockByLocation: {cd: stock},
    stock,
  }];
}

const PRODUCTS = [
  {
    id: "p-bola-pro-beach", name: "Bola NexaGO Pro Beach", baseSku: "NX-BOL",
    slug: "bola-nexago-pro-beach", category: "bolas", collection: "linha-pro",
    priceCents: 28990, compareAtPriceCents: 32990, costCents: null,
    lowStockThreshold: 10, soldLast30: 64, active: true, status: "ativo",
    axes: [], skus: skuUnico("NX-BOL", 86),
  },
  {
    id: "p-camiseta-dry-uv50", name: "Camiseta Dry UV50 Areia", baseSku: "NX-CAM",
    slug: "camiseta-dry-uv50-areia", category: "vestuario", collection: "verao-2026",
    priceCents: 12990, compareAtPriceCents: null, costCents: 4820,
    lowStockThreshold: 10, soldLast30: 51, active: true, status: "ativo",
    axes: AXES_CAMISETA, skus: camisetaSkus(),
  },
  {
    id: "p-oculos-sunline", name: "Óculos Polarizado Sunline", baseSku: "NX-OCU",
    slug: "oculos-polarizado-sunline", category: "acessorios", collection: "verao-2026",
    priceCents: 19990, compareAtPriceCents: null, costCents: null,
    lowStockThreshold: 10, soldLast30: 21, active: true, status: "ativo",
    axes: [], skus: skuUnico("NX-OCU", 22),
  },
  {
    id: "p-viseira-dry-fit", name: "Viseira Dry Fit", baseSku: "NX-VIS",
    slug: "viseira-dry-fit", category: "acessorios", collection: "verao-2026",
    priceCents: 6990, compareAtPriceCents: null, costCents: null,
    lowStockThreshold: 12, soldLast30: 47, active: true, status: "ativo",
    axes: [], skus: skuUnico("NX-VIS", 9),
  },
  {
    id: "p-rede-oficial-beach", name: "Rede Oficial Beach 8,5 m", baseSku: "NX-RED",
    slug: "rede-oficial-beach-8-5-m", category: "rede-quadra", collection: "linha-pro",
    priceCents: 45990, compareAtPriceCents: null, costCents: null,
    lowStockThreshold: 6, soldLast30: 6, active: true, status: "ativo",
    axes: [], skus: skuUnico("NX-RED", 14),
  },
  {
    id: "p-kit-demarcacao", name: "Kit Demarcação de Quadra", baseSku: "NX-KIT",
    slug: "kit-demarcacao-de-quadra", category: "rede-quadra", collection: "linha-pro",
    priceCents: 34990, compareAtPriceCents: null, costCents: null,
    lowStockThreshold: 12, soldLast30: 9, active: true, status: "ativo",
    axes: [], skus: skuUnico("NX-KIT", 11),
  },
  {
    id: "p-garrafa-termica", name: "Garrafa Térmica 750 ml", baseSku: "NX-SQU",
    slug: "garrafa-termica-750-ml", category: "acessorios", collection: "verao-2026",
    priceCents: 8990, compareAtPriceCents: 10990, costCents: null,
    lowStockThreshold: 10, soldLast30: 33, active: true, status: "ativo",
    axes: [], skus: skuUnico("NX-SQU", 58),
  },
  {
    id: "p-mochila-praia", name: "Mochila Praia Impermeável", baseSku: "NX-MOC",
    slug: "mochila-praia-impermeavel", category: "acessorios", collection: null,
    priceCents: 23990, compareAtPriceCents: null, costCents: null,
    lowStockThreshold: 10, soldLast30: 12, active: false, status: "ativo",
    axes: [], skus: skuUnico("NX-MOC", 0),
  },
];

module.exports = {PRODUCTS};

function rollupsOf(skus, priceCents) {
  const prices = skus.map((s) => s.priceCents).filter((p) => p !== null);
  return {
    skuCount: skus.length,
    stockTotal: skus.reduce((t, s) => t + s.stock, 0),
    priceFromCents: Math.min(priceCents, ...prices),
  };
}

async function main() {
  // Guard e initializeApp ficam aqui, não no topo: assim dá para `require` este
  // arquivo só para conferir os dados, sem precisar de projeto nem de credencial.
  const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
  if (!projectId) {
    console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
    process.exit(1);
  }
  admin.initializeApp({projectId});

  const db = admin.firestore();
  const now = new Date();

  for (const p of PRODUCTS) {
    const rollups = rollupsOf(p.skus, p.priceCents);
    console.log(
      `${p.id}  ${p.name}  ${rollups.skuCount} SKU(s)  ${rollups.stockTotal} un.` +
        (p.costCents !== null ? `  custo ${p.costCents}` : ""),
    );
    if (!APPLY) continue;

    const batch = db.batch();
    const ref = db.collection("storeProducts").doc(p.id);
    batch.set(ref, {
      name: p.name, slug: p.slug, baseSku: p.baseSku, category: p.category,
      collection: p.collection, brand: "NexaGO", description: "", technicalDetails: [],
      badge: null, priceCents: p.priceCents, compareAtPriceCents: p.compareAtPriceCents,
      axes: p.axes, channels: {app: true, web: true},
      fulfillment: {pickup: true, delivery: true}, featured: false,
      shipping: {weightGrams: 300, lengthCm: 30, widthCm: 22, heightCm: 5},
      lowStockThreshold: p.lowStockThreshold, status: p.status, active: p.active,
      photos: [], soldLast30: p.soldLast30, ...rollups,
      publishedAt: p.status === "ativo" ? now : null,
      version: 1, createdAt: now, updatedAt: now,
      updatedBy: {uid: "seed", name: "seed-store-catalog"},
    });
    batch.set(db.collection("storeCatalogKeys").doc(`slug:${p.slug}`), {productId: p.id});

    for (const sku of p.skus) {
      const {id, ...data} = sku;
      batch.set(ref.collection("skus").doc(id), data);
      batch.set(db.collection("storeCatalogKeys").doc(`sku:${sku.code}`), {
        productId: p.id, skuId: id,
      });
    }

    // Custo ausente é "não informado": não criar o documento.
    if (p.costCents !== null) {
      batch.set(db.collection("storeProductCosts").doc(p.id), {
        costCents: p.costCents, updatedAt: now,
      });
    }
    await batch.commit();
  }

  const totalSkus = PRODUCTS.reduce((t, p) => t + p.skus.length, 0);
  console.log(
    APPLY
      ? `\nEscrito em ${projectId}: ${PRODUCTS.length} produtos, ${totalSkus} SKUs.`
      : `\nDRY-RUN em ${projectId}: ${PRODUCTS.length} produtos, ${totalSkus} SKUs (passe --yes para escrever).`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

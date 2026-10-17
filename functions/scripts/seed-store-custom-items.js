/* eslint-disable */
/**
 * Itens de exemplo na fila de arte (Loja › Personalizados, tela 10), para testar a tela
 * enquanto o checkout da Loja não cria itens de verdade.
 *
 *   storeCustomItems/seed-*  — 6 itens, um por situação do desenho.
 *
 * Ids fixos `seed-*`: rodar de novo sobrescreve os mesmos docs (volta tudo ao estado
 * inicial). `--clean` apaga só esses docs.
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-store-custom-items.js --project <projectId> [--product <productId>]          # dry-run
 *   node scripts/seed-store-custom-items.js --project <projectId> [--product <productId>] --yes    # grava
 *   node scripts/seed-store-custom-items.js --project <projectId> --clean --yes                    # apaga
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const CLEAN = process.argv.includes("--clean");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

const HOUR = 3600 * 1000;

function items(productId, productName, now) {
  const at = (hoursAgo) => new Date(now.getTime() - hoursAgo * HOUR);
  const base = (id, hoursAgo, extra) => ({
    orderId: `seed-order-${id}`,
    productId,
    productName,
    customer: {uid: null, name: extra.customerName},
    finalFiles: [],
    history: [],
    version: 1,
    createdAt: at(hoursAgo),
    // SLA de 4 h corridas (aproximação de "4 h úteis" para o exemplo).
    slaDueAt: at(hoursAgo - 4),
    updatedAt: at(hoursAgo),
    ...extra,
  });
  const image = (w, h, format, sizeBytes) => ({url: null, widthPx: w, heightPx: h, format, sizeBytes, backgroundRemoved: false});
  return {
    "seed-4835": base("4835", 2, {
      orderCode: "NX-4835", customerName: "Marcelo Antunes", variantLabel: "Preta · M", status: "aprovar",
      name: "ANTUNES", font: "bloco", nameColor: "#ffffff", namePlacement: "costas_superior",
      image: image(2400, 2400, "png", 1_800_000), imageArea: "peito_esquerdo",
      back: {type: "numero", number: "10"},
      finalFiles: [{name: "arte-NX4835-frente.png", url: null}, {name: "arte-NX4835-costas.pdf", url: null}],
    }),
    "seed-4833": base("4833", 5, {
      orderCode: "NX-4833", customerName: "Duda Ferraz", variantLabel: "Branca · P", status: "aprovar",
      name: "DUDA", font: "classica", nameColor: "#111111", namePlacement: "costas_superior",
      image: image(800, 800, "jpg", 400_000), imageArea: "centro_frente",
      back: {type: "imagem", image: image(2000, 2000, "png", 1_200_000)},
    }),
    "seed-4826": base("4826", 21, {
      orderCode: "NX-4826", customerName: "Lucas Teo", variantLabel: "Viseira · Preta", status: "nova_imagem",
      image: image(600, 600, "jpg", 250_000), imageArea: "peito_esquerdo",
      request: {reason: "baixa_resolucao", note: "", at: at(20), by: {uid: "seed", name: "Seed"}},
    }),
    "seed-4824": base("4824", 30, {
      orderCode: "NX-4824", customerName: "Paula Ramos", variantLabel: "Bola Pro Beach", status: "producao",
      name: "PAULA R.", font: "bloco", nameColor: "#ff6a1a", namePlacement: "frente",
      approvedAt: at(28), approvedBy: {uid: "seed", name: "Seed"},
    }),
    "seed-4820": base("4820", 72, {
      orderCode: "NX-4820", customerName: "Equipe Areia GO", variantLabel: "Kit 8 camisetas", status: "producao",
      units: ["ANA", "BIA", "CAU", "DANI", "EDU", "FE", "GABI", "HELO"].map((name, i) => ({name, number: String(i + 1)})),
      back: {type: "numero", number: ""},
      font: "bloco", nameColor: "#ffffff", namePlacement: "costas_superior",
      image: image(3000, 3000, "png", 2_400_000), imageArea: "centro_frente",
      approvedAt: at(70), approvedBy: {uid: "seed", name: "Seed"},
    }),
    "seed-4811": base("4811", 120, {
      orderCode: "NX-4811", customerName: "Bia Torres", variantLabel: "Garrafa 750 ml", status: "pronto",
      name: "BIA", font: "mono", nameColor: "#111111", namePlacement: "frente",
      approvedAt: at(118), approvedBy: {uid: "seed", name: "Seed"}, readyAt: at(20),
    }),
  };
}

async function main() {
  const col = db.collection("storeCustomItems");
  if (CLEAN) {
    const snap = await col.get();
    const seeds = snap.docs.filter((d) => d.id.startsWith("seed-"));
    console.log(`\n${seeds.length} itens seed em ${projectId}${APPLY ? "" : " (DRY-RUN — use --yes para apagar)"}`);
    if (APPLY) await Promise.all(seeds.map((d) => d.ref.delete()));
    return;
  }

  let productId = argValue("--product");
  let productName = "Camiseta personalizada";
  if (productId) {
    const p = await db.collection("storeProducts").doc(productId).get();
    if (!p.exists) throw new Error(`Produto ${productId} não existe.`);
    productName = p.data().name || productName;
  } else {
    productId = "seed-produto";
  }

  const docs = items(productId, productName, new Date());
  console.log(`\nFila de arte em ${projectId}${APPLY ? "" : " (DRY-RUN — use --yes para gravar)"}:`);
  for (const [id, data] of Object.entries(docs)) {
    console.log(`  ${id.padEnd(10)} ${data.orderCode}  ${data.customer.name.padEnd(18)} ${data.status}`);
    if (APPLY) await col.doc(id).set(data);
  }
  console.log(APPLY ? "\nGravado." : "\nNada gravado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

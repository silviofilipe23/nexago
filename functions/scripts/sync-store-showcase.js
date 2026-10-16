/* eslint-disable */
/**
 * Recalcula a vitrine pública da Loja: `storeShowcase/{id}` de cada produto e `storePublic/showcase`.
 *
 * Em operação normal os gatilhos de `store-showcase-sync.ts` fazem isto sozinhos a cada escrita
 * do catálogo. Este script é o backfill: produtos gravados antes dos gatilhos existirem (o seed
 * do catálogo, por exemplo) só entram na vitrine quando alguém os toca — ou quando isto roda.
 * Usa a mesma função dos gatilhos (`lib/`), então rode `npm run build` antes.
 *
 * Uso (na pasta functions/):
 *   node scripts/sync-store-showcase.js --project volley-track-dev-4596c          # DRY-RUN: lista
 *   node scripts/sync-store-showcase.js --project volley-track-dev-4596c --yes
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}
admin.initializeApp({projectId});
const db = admin.firestore();
const {syncShowcaseProduct, rebuildShowcaseConfig} = require("../lib/store-showcase-sync");

async function main() {
  const products = await db.collection("storeProducts").get();
  console.log(`\n${products.size} produto(s) em storeProducts (${projectId}).`);
  if (!APPLY) {
    for (const d of products.docs) {
      const p = d.data();
      console.log(`  ${d.id}  ${p.status}/${p.active ? "ativo" : "pausado"}  ${p.name}`);
    }
    console.log("\nDRY-RUN — use --yes para recalcular a vitrine.");
    return;
  }
  let set = 0;
  let deleted = 0;
  for (const d of products.docs) {
    const result = await syncShowcaseProduct(db, d.id);
    if (result === "set") set++;
    else deleted++;
    console.log(`  ${result === "set" ? "na vitrine" : "fora     "}  ${d.id}`);
  }
  await rebuildShowcaseConfig(db);
  console.log(`\nVitrine: ${set} produto(s) à venda, ${deleted} fora. storePublic/showcase recalculado.`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

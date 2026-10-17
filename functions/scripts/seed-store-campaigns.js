/* eslint-disable */
/**
 * Grava os banners de campanha da vitrine em `storeConfig/campaigns`.
 *
 *   { banners: [{ id, kicker, title, subtitle, imageUrl, primary: {label, collectionId},
 *                 secondary: {label, categoryId, url} | null, startDate, endDate, active }] }
 *
 * O caminho normal é a tela Loja › Campanhas do backoffice (callable `saveStoreCampaigns`); este
 * script fica para ambiente vazio e QA. Ele grava sem `version`, então uma tela aberta recebe
 * "Recarregar" no próximo save (se já tinha salvo pela tela uma vez). O gatilho
 * `onStoreConfigWrittenSyncShowcase` copia os banners válidos para `storePublic/showcase`;
 * sem as functions deployadas, rode `scripts/sync-store-showcase.js --yes` depois.
 *
 * Título até 50 caracteres, subtítulo até 90 (o resto é cortado). Datas são civis de São Paulo
 * (YYYY-MM-DD, inclusivas); sem data = sempre no ar. A vitrine mostra até 3 ao mesmo tempo.
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-store-campaigns.js --project <id>            # mostra o atual + o que gravaria
 *   node scripts/seed-store-campaigns.js --project <id> --yes
 *   node scripts/seed-store-campaigns.js --project <id> --clear --yes   # tira todos os banners
 *   --image <url>  foto da campanha (sem ela a vitrine usa o fundo da marca)
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const CLEAR = process.argv.includes("--clear");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}
admin.initializeApp({projectId});
const ref = admin.firestore().collection("storeConfig").doc("campaigns");

/** A campanha do desenho da tela 01. */
const VERAO_26 = {
  id: "verao-26",
  kicker: "COLEÇÃO VERÃO 26",
  title: "Equipamento de quem joga na areia",
  subtitle: "Bolas, vestuário UV e acessórios testados no circuito NexaGO.",
  imageUrl: argValue("--image") ?? null,
  primary: {label: "Ver coleção", collectionId: "verao-2026"},
  secondary: {label: "Kits pra arena", categoryId: "kits", url: null},
  startDate: null,
  endDate: null,
  active: true,
};

async function main() {
  const current = (await ref.get()).data() ?? null;
  console.log(`\nstoreConfig/campaigns em ${projectId}:`, JSON.stringify(current?.banners ?? "(não existe)", null, 2));
  const next = {banners: CLEAR ? [] : [VERAO_26], updatedAt: admin.firestore.FieldValue.serverTimestamp()};
  console.log("\nGravaria:", JSON.stringify(next.banners, null, 2));
  if (!APPLY) {
    console.log("\nDRY-RUN — use --yes para gravar.");
    return;
  }
  await ref.set(next);
  console.log("Gravado.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

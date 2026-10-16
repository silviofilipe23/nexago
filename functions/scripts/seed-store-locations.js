/* eslint-disable */
/**
 * Cadastra os locais de estoque da Loja em `storeLocations/{id}`.
 *
 *   storeLocations/{id} { name, type: 'cd' | 'arena', arenaId, order, active }
 *
 * O id `cd` é o CD principal: é o local que a grade da tela de produto ajusta
 * (MAIN_LOCATION no backoffice). Não renomeie o id — só o `name`.
 *
 * Idempotente: grava com merge, então rodar de novo atualiza nome/ordem sem
 * apagar nada. Local que saiu da lista NÃO é apagado (pode ter saldo); use
 * `active: false` editando a lista abaixo.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-store-locations.js --project <projectId>          # dry-run
 *   node scripts/seed-store-locations.js --project <projectId> --yes    # grava
 */

const admin = require("firebase-admin");

/** `arenaId` liga o local à arena do app (retirada); null até ser preenchido. */
const LOCATIONS = [
  {id: "cd", name: "CD Goiânia", type: "cd", arenaId: null, order: 0, active: true},
  {id: "arena-errejota", name: "Arena Errejota", type: "arena", arenaId: null, order: 1, active: true},
  {id: "arena-cfc", name: "Arena CFC", type: "arena", arenaId: null, order: 2, active: true},
  {id: "praia-bt-sul", name: "Praia BT Sul", type: "arena", arenaId: null, order: 3, active: true},
];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

async function main() {
  console.log(`\nLocais de estoque em ${projectId}${APPLY ? "" : " (DRY-RUN — use --yes para gravar)"}:`);
  for (const {id, ...data} of LOCATIONS) {
    const ref = db.collection("storeLocations").doc(id);
    const snap = await ref.get();
    console.log(`  ${snap.exists ? "atualiza" : "cria    "} ${id.padEnd(16)} ${data.name} (${data.type})`);
    if (APPLY) await ref.set(data, {merge: true});
  }
  console.log(APPLY ? "\nGravado." : "\nNada gravado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

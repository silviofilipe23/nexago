/* eslint-disable */
/**
 * Recalcula o espelho público do Squad: `squadPublic/{uid}` de cada contrato em `squadAmbassadors`.
 *
 * Em operação normal os gatilhos de `squad-public-sync.ts` fazem isto sozinhos (contrato, perfil e
 * ranking). Este script é o backfill: contratos gravados antes dos gatilhos existirem só entram na
 * página "Conheça o Squad" quando alguém os toca — ou quando isto roda. Também apaga espelho órfão
 * (sem contrato). Usa a mesma função dos gatilhos (`lib/`), então rode `npm run build` antes.
 *
 * Uso (na pasta functions/):
 *   node scripts/sync-squad-public.js --project volley-track-dev-4596c          # DRY-RUN: lista
 *   node scripts/sync-squad-public.js --project volley-track-dev-4596c --yes
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
// `artifactsPublicDataBase()` (caminho do ranking) lê o projeto do ambiente.
process.env.GCLOUD_PROJECT = projectId;
admin.initializeApp({projectId});
const db = admin.firestore();
const {syncSquadPublic} = require("../lib/squad-public-sync");

async function main() {
  const [contracts, mirrors] = await Promise.all([
    db.collection("squadAmbassadors").get(),
    db.collection("squadPublic").get(),
  ]);
  const contractIds = new Set(contracts.docs.map((d) => d.id));
  const orphans = mirrors.docs.filter((d) => !contractIds.has(d.id));
  console.log(`\n${contracts.size} contrato(s) em squadAmbassadors, ${mirrors.size} na página (${projectId}).`);
  if (!APPLY) {
    for (const d of contracts.docs) {
      const c = d.data();
      console.log(`  ${d.id}  ${c.status}  ${c.tier}  ${c.code}  ${c.displayName ?? ""}`);
    }
    if (orphans.length) console.log(`\n${orphans.length} espelho(s) sem contrato seriam apagados.`);
    console.log("\nDRY-RUN — use --yes para recalcular a página.");
    return;
  }
  let set = 0;
  let deleted = 0;
  for (const d of contracts.docs) {
    const result = await syncSquadPublic(db, d.id);
    if (result === "set") set++;
    else deleted++;
    console.log(`  ${result === "set" ? "na página" : "fora     "}  ${d.id}  ${d.data().code ?? ""}`);
  }
  for (const d of orphans) {
    await d.ref.delete();
    console.log(`  órfão apagado  ${d.id}`);
  }
  console.log(`\nPágina do Squad: ${set} embaixador(es), ${deleted} fora, ${orphans.length} órfão(s) apagado(s).`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

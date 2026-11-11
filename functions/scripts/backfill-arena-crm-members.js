/* eslint-disable */
/**
 * Cria o espelho `arenaCrmMembers/{uid}` ("tenho contrato de mensalista", lido pelo app para
 * mostrar Meu contrato) dos contratos do CRM que já existiam antes do gatilho
 * `onArenaCrmContractWrittenSyncMember`. Daqui pra frente quem mantém é o gatilho. Idempotente.
 *
 * Uso (na pasta functions/, após `npm run build`):
 *   node scripts/backfill-arena-crm-members.js --project volley-track-dev-4596c          # simulação
 *   node scripts/backfill-arena-crm-members.js --project volley-track-dev-4596c --yes    # grava
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}
const apply = process.argv.includes("--yes");
admin.initializeApp({projectId});
const {syncArenaCrmMember} = require("../lib/arena-crm-athlete");

async function main() {
  const db = admin.firestore();
  const snap = await db.collection("arenaCrmContracts").get();
  const athletes = new Set();
  for (const d of snap.docs) {
    const uid = d.get("athleteId");
    if (typeof uid === "string" && uid.trim()) athletes.add(uid.trim());
  }
  for (const uid of athletes) {
    const mirror = await db.collection("arenaCrmMembers").doc(uid).get();
    console.log(`${mirror.exists ? "=" : "+"} ${uid}`);
    if (apply) await syncArenaCrmMember(db, uid);
  }
  console.log(apply
    ? `${snap.size} contrato(s); espelho recalculado para ${athletes.size} atleta(s).`
    : `${snap.size} contrato(s) de ${athletes.size} atleta(s). Simulação — rode com --yes para gravar.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

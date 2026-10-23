/* eslint-disable */
/**
 * Concede o papel `center` (claim + `users/{uid}.roles`) a quem JÁ tem vínculo ativo com algum
 * Centro de Treinamento. Daqui pra frente quem concede é o trigger `onTrainingCenterMemberRole`;
 * este script cobre os vínculos criados antes do deploy dele. Idempotente.
 *
 * Uso (na pasta functions/, após `npm run build`):
 *   node scripts/backfill-center-role.js --project volley-track-dev-4596c          # simulação
 *   node scripts/backfill-center-role.js --project volley-track-dev-4596c --yes    # grava
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
const {ensureCenterRole} = require("../lib/center-role");
const {rolesFromClaims} = require("../lib/auth-roles");

async function main() {
  const db = admin.firestore();
  // Sem `where("status")`: filtrar uma collection group por campo exige um índice que o app não
  // usa; os vínculos são poucos, então lê todos e filtra aqui.
  const snap = await db.collectionGroup("centerMembers").get();
  const uids = new Set();
  for (const d of snap.docs) {
    if (d.ref.parent.parent?.parent.id !== "trainingCenters") continue;
    if (d.get("status") !== "active") continue;
    const uid = d.get("uid") || d.id;
    if (typeof uid === "string" && uid) uids.add(uid);
  }
  let granted = 0;
  for (const uid of uids) {
    let user;
    try {
      user = await admin.auth().getUser(uid);
    } catch (e) {
      console.warn(`- ${uid}: conta não encontrada (${e.code || e.message})`);
      continue;
    }
    const has = rolesFromClaims(user.customClaims).includes("center");
    console.log(`${has ? "=" : "+"} ${uid} ${user.email || ""}`);
    if (!apply) continue;
    await ensureCenterRole(db, uid);
    if (!has) granted++;
  }
  console.log(apply
    ? `${uids.size} vínculo(s) ativo(s); papel concedido a ${granted}.`
    : `${uids.size} vínculo(s) ativo(s). Simulação — rode com --yes para gravar.`);
}

main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});

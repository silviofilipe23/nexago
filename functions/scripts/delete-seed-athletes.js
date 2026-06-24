/* eslint-disable */
/**
 * Remove os atletas de teste criados por seed-athletes.js
 * (perfis users/{uid} com `seedTestAthlete: true` + contas no Auth).
 *
 * Pré-requisitos: mesmas credenciais admin do seed
 *   gcloud auth application-default login   (ou GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Uso (na pasta functions/):
 *   node scripts/delete-seed-athletes.js --project <projectId>          # DRY-RUN (só lista)
 *   node scripts/delete-seed-athletes.js --project <projectId> --yes    # apaga de verdade
 *
 * Seguro por padrão: sem --yes, apenas mostra quantos seriam removidos.
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const APPLY = process.argv.includes("--yes");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const auth = admin.auth();
const db = admin.firestore();

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function run() {
  const snap = await db
    .collection("users")
    .where("seedTestAthlete", "==", true)
    .get();
  const uids = snap.docs.map((d) => d.id);

  console.log(`Encontrados ${uids.length} atletas de seed em ${projectId}.`);
  if (uids.length === 0) return;

  if (!APPLY) {
    console.log("DRY-RUN: nada foi apagado. Rode com --yes para remover.");
    console.log("Exemplos:", uids.slice(0, 5).join(", "));
    return;
  }

  // 1) Apaga os docs do Firestore (lotes de 450).
  for (const part of chunk(snap.docs, 450)) {
    const batch = db.batch();
    for (const doc of part) batch.delete(doc.ref);
    await batch.commit();
  }
  console.log(`Firestore: ${uids.length} docs users/* removidos.`);

  // 2) Apaga as contas do Auth (lotes de 1000).
  let deleted = 0;
  let failed = 0;
  for (const part of chunk(uids, 1000)) {
    const res = await auth.deleteUsers(part);
    deleted += res.successCount;
    failed += res.failureCount;
    for (const err of res.errors) {
      console.warn("Falha Auth:", part[err.index], err.error.message);
    }
  }
  console.log(`Auth: ${deleted} contas removidas, ${failed} falha(s).`);
  console.log("Limpeza concluída.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha na limpeza:", err);
    process.exit(1);
  });

/* eslint-disable */
/**
 * Cria/atualiza public_profiles/{uid} para todo users/{uid} — mesma lógica do
 * callable `backfillPublicProfiles` (functions/src/public-profile-sync.ts),
 * rodada localmente via Admin SDK.
 *
 * Motivo: o espelho público só é mantido pelo trigger reativo
 * `onUserWrittenSyncPublicProfile` (dispara em toda escrita NOVA em
 * users/{uid}). Contas que nunca foram reescritas desde que o trigger foi
 * deployado nunca ganharam o doc em public_profiles — e ficam invisíveis
 * para qualquer tela de descoberta/busca que lê esse espelho.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Requer lib/ compilada (rode `npm run build` na pasta functions/ se necessário).
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-public-profiles-mirror.js --project volley-track-dev-4596c
 *   node scripts/backfill-public-profiles-mirror.js --project <projectId> --yes
 *   node scripts/backfill-public-profiles-mirror.js --project <projectId> --yes --limit 50
 */

const admin = require("firebase-admin");
const {buildPublicProfileData} = require("../lib/public-profile-sync");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const LIMIT = parseInt(argValue("--limit") || "0", 10);

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function* iterateUserDocs() {
  let lastId = null;
  while (true) {
    let query = db
      .collection("users")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(400);
    if (lastId) query = query.startAfter(lastId);
    const snap = await query.get();
    if (snap.empty) return;
    for (const doc of snap.docs) yield doc;
    lastId = snap.docs[snap.docs.length - 1].id;
  }
}

async function run() {
  let scanned = 0;
  let missing = 0;
  const candidates = [];

  for await (const doc of iterateUserDocs()) {
    scanned += 1;
    const mirrorSnap = await db.collection("public_profiles").doc(doc.id).get();
    if (!mirrorSnap.exists) {
      missing += 1;
      candidates.push(doc);
      if (LIMIT > 0 && candidates.length >= LIMIT) break;
    }
  }

  console.log(`Verificados ${scanned} doc(s) em users/ (${projectId}).`);
  console.log(`Faltando espelho em public_profiles: ${missing} doc(s).`);
  if (candidates.length === 0) return;

  const preview = candidates.slice(0, 10).map((doc) => {
    const data = doc.data();
    const label =
      (typeof data.fullName === "string" && data.fullName.trim()) ||
      (typeof data.email === "string" && data.email.trim()) ||
      doc.id;
    return `${doc.id} (${label}) role=${data.role} roles=${JSON.stringify(data.roles)}`;
  });
  console.log("Exemplos:\n" + preview.join("\n"));

  if (!APPLY) {
    console.log("DRY-RUN: nada foi alterado. Rode com --yes para aplicar.");
    return;
  }

  let created = 0;
  for (const part of chunk(candidates, 400)) {
    const batch = db.batch();
    for (const doc of part) {
      batch.set(db.collection("public_profiles").doc(doc.id), {
        ...buildPublicProfileData(doc.data()),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    created += part.length;
    console.log(`... ${created}/${candidates.length} criados`);
  }

  console.log(`Backfill concluído: ${created} doc(s) criado(s) em public_profiles.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no backfill:", err);
    process.exit(1);
  });

/* eslint-disable */
/**
 * Credita os 30 XP do passo `photo` da gamificação de perfil para quem já tem
 * foto e nunca recebeu o evento `profile_step_photo`.
 *
 * Motivo: até o fix em `functions/src/profile-completion-shared.ts`, o passo
 * `photo` era derivado SÓ de `users/{uid}.avatarUrl` — um campo legado que
 * nenhuma superfície grava. O app e o portal do atleta gravam
 * `profilePhotoUrl`, então o passo nunca fechava: sem os 30 XP, sem
 * `allStepsComplete` e sem as conquistas IDENTITY / PROFILE_COMPLETE.
 *
 * Idempotência: o crédito passa por `syncProfileCompletionRewardsForUser`, que
 * só grava dentro de uma transação quando `gamification_events/profile_step_*`
 * ainda NÃO existe. Rodar duas vezes não credita em dobro. Como é a mesma
 * função do gatilho, ela também fecha qualquer outro passo já devido e
 * sincroniza as conquistas — o relatório mostra passo a passo o que saiu.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Requer lib/ compilada (rode `npm run build` na pasta functions/ se necessário).
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-profile-photo-xp.js --project volley-track-dev-4596c
 *   node scripts/backfill-profile-photo-xp.js --project <projectId> --yes
 *   node scripts/backfill-profile-photo-xp.js --project <projectId> --yes --limit 50
 */

const admin = require("firebase-admin");
const {
  computeProfileRewardContext,
  profileStepEventId,
} = require("../lib/profile-completion-shared");
const {
  syncProfileCompletionRewardsForUser,
} = require("../lib/profile-completion-gamification");

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

const PHOTO_EVENT_ID = profileStepEventId("photo");

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
  let withPhoto = 0;
  const candidates = [];

  for await (const doc of iterateUserDocs()) {
    scanned += 1;
    const ctx = computeProfileRewardContext(doc.data() ?? {});
    if (!ctx.stepDone.photo) continue;
    withPhoto += 1;

    const eventSnap = await doc.ref
      .collection("gamification_events")
      .doc(PHOTO_EVENT_ID)
      .get();
    if (eventSnap.exists) continue;

    candidates.push(doc);
    if (LIMIT > 0 && candidates.length >= LIMIT) break;
  }

  console.log(`Verificados ${scanned} doc(s) em users/ (${projectId}).`);
  console.log(`Com foto no perfil: ${withPhoto} doc(s).`);
  console.log(`Sem o evento ${PHOTO_EVENT_ID}: ${candidates.length} doc(s).`);
  if (candidates.length === 0) return;

  const preview = candidates.slice(0, 10).map((doc) => {
    const data = doc.data() ?? {};
    const label =
      (typeof data.fullName === "string" && data.fullName.trim()) ||
      (typeof data.email === "string" && data.email.trim()) ||
      doc.id;
    const field = ["profilePhotoUrl", "avatarUrl", "photoURL"].find(
      (key) => typeof data[key] === "string" && data[key].trim(),
    );
    return `${doc.id} (${label}) foto em ${field}`;
  });
  console.log("Exemplos:\n" + preview.join("\n"));

  if (!APPLY) {
    console.log("DRY-RUN: nada foi alterado. Rode com --yes para aplicar.");
    return;
  }

  let processed = 0;
  let totalXp = 0;
  const stepTally = {};
  let failures = 0;

  for (const doc of candidates) {
    try {
      const result = await syncProfileCompletionRewardsForUser(db, doc.id);
      totalXp += result.totalXpGained;
      for (const stepId of result.newlyAwardedStepIds) {
        stepTally[stepId] = (stepTally[stepId] ?? 0) + 1;
      }
    } catch (err) {
      failures += 1;
      console.error(`Falha em ${doc.id}:`, err?.message ?? err);
    }
    processed += 1;
    if (processed % 50 === 0 || processed === candidates.length) {
      console.log(`... ${processed}/${candidates.length} processados`);
    }
  }

  console.log(`Backfill concluído: ${totalXp} XP creditado(s) em ${processed} atleta(s).`);
  console.log(`Passos creditados: ${JSON.stringify(stepTally)}`);
  if (failures > 0) console.log(`Falhas: ${failures} — reexecute (é idempotente).`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no backfill:", err);
    process.exit(1);
  });

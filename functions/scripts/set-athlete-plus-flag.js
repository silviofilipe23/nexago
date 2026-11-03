/* eslint-disable */
/**
 * Liga/desliga o card da lista de espera do nexaGO+ na Início do app —
 * `appConfig/athletePlus.waitlistEnabled`. Doc ausente = desligado (o card não aparece).
 *
 * Spec: docs/superpowers/specs/2026-11-03-nexago-plus-atleta-design.md (Fase 0). Exige
 * as rules de `athletePlusWaitlist` publicadas ANTES de ligar — sem elas o "Quero ser
 * avisado" cai no catch-all que nega tudo. Respostas: scripts/athlete-plus-waitlist-report.js.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/set-athlete-plus-flag.js --project <projectId> --show
 *   node scripts/set-athlete-plus-flag.js --project <projectId> --enable          # dry-run
 *   node scripts/set-athlete-plus-flag.js --project <projectId> --enable --yes
 *   node scripts/set-athlete-plus-flag.js --project <projectId> --disable --yes
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const SHOW_ONLY = process.argv.includes("--show");
const ENABLE = process.argv.includes("--enable");
const DISABLE = process.argv.includes("--disable");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}
if (!SHOW_ONLY && ENABLE === DISABLE) {
  console.error("Informe exatamente um: --enable ou --disable (ou use --show).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const DOC_PATH = "appConfig/athletePlus";

async function run() {
  const snap = await db.doc(DOC_PATH).get();
  const current = snap.exists && snap.data().waitlistEnabled === true;
  console.log(`\n${DOC_PATH} (${projectId}): ${current ? "LIGADO" : "desligado"}` +
    (snap.exists ? "" : " (doc não existe)"));
  if (SHOW_ONLY) return;

  const next = ENABLE;
  if (next === current) {
    console.log("Nada a fazer.");
    return;
  }
  console.log(`Vai gravar: waitlistEnabled = ${next}`);
  if (!APPLY) {
    console.log("\nDRY-RUN — rode de novo com --yes para gravar.");
    return;
  }
  await db.doc(DOC_PATH).set(
    {waitlistEnabled: next, updatedAt: admin.firestore.FieldValue.serverTimestamp()},
    {merge: true},
  );
  console.log("Gravado.");
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});

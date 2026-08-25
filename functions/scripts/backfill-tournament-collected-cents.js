/* eslint-disable */
/**
 * Recalcula a arrecadação de `tournaments` a partir das inscrições pagas, já separada por canal:
 * `collectedCents` (total), `collectedViaAppCents`, `collectedViaOrganizerCents` e
 * `collectedToVerifyCents` (declarado sem baixa do organizador).
 *
 * A Cloud Function `onTournamentInscriptionWriteSyncCollectedCents` mantém esses campos a cada
 * escrita de inscrição, mas só a partir do deploy — torneio parado nunca é recalculado. Sem este
 * backfill, os portais caem no fallback pelo `paymentMode` do wizard, que erra justamente onde
 * houve baixa manual em torneio "pelo app".
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/, após `npm run build`):
 *   node scripts/backfill-tournament-collected-cents.js --project <projectId>           # dry-run
 *   node scripts/backfill-tournament-collected-cents.js --project <projectId> --yes
 *   node scripts/backfill-tournament-collected-cents.js --project <projectId> --yes --limit 10
 */

const admin = require("firebase-admin");
const {
  computeTournamentCollectedStats,
} = require("../lib/tournament-collected-stats");
// De `firebase-paths`, e não de `tournament-collected-stats`: o TS não re-exporta o que importa,
// então `require("../lib/tournament-collected-stats").artifactsInscriptionsPath` é undefined.
const {artifactsInscriptionsPath} = require("../lib/firebase-paths");

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
  console.error("Informe o projeto: --project <projectId>");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

/** `null` = campo ausente, diferente de zero — mesma regra da CF, pra que torneio zerado receba
 *  os campos do recorte em vez de ficar preso no fallback. */
function storedCents(value) {
  return typeof value === "number" && Number.isFinite(value) ?
    Math.round(value) :
    null;
}

function isUpToDate(tournament, stats) {
  return (
    storedCents(tournament.collectedCents) === stats.totalCents &&
    storedCents(tournament.collectedViaAppCents) === stats.viaAppCents &&
    storedCents(tournament.collectedViaOrganizerCents) === stats.viaOrganizerCents &&
    storedCents(tournament.collectedToVerifyCents) === stats.toVerifyCents
  );
}

async function main() {
  const snap = await db.collection("tournaments").get();
  const docs = LIMIT > 0 ? snap.docs.slice(0, LIMIT) : snap.docs;
  let updated = 0;

  for (const doc of docs) {
    const tournament = doc.data();
    const inscriptionsSnap = await db
      .collection(artifactsInscriptionsPath(projectId))
      .where("tournamentId", "==", doc.id)
      .get();
    const inscriptions = inscriptionsSnap.docs.map((d) => d.data());
    const stats = computeTournamentCollectedStats(tournament, inscriptions);

    if (isUpToDate(tournament, stats)) {
      console.log(`skip ${doc.id} collectedCents=${stats.totalCents}`);
      continue;
    }

    const before = storedCents(tournament.collectedCents) ?? 0;
    console.log(
      `${APPLY ? "update" : "dry-run"} ${doc.id}: ${before} -> ${stats.totalCents} ` +
        `(app=${stats.viaAppCents} direto=${stats.viaOrganizerCents} aConferir=${stats.toVerifyCents})`,
    );
    if (APPLY) {
      await doc.ref.set({
        collectedCents: stats.totalCents,
        collectedViaAppCents: stats.viaAppCents,
        collectedViaOrganizerCents: stats.viaOrganizerCents,
        collectedToVerifyCents: stats.toVerifyCents,
      }, {merge: true});
      updated += 1;
    }
  }

  console.log(`done. updated=${updated} total=${docs.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

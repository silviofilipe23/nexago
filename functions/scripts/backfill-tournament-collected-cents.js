/* eslint-disable */
/**
 * Recalcula `tournaments.collectedCents` a partir das inscrições pagas.
 *
 * Uso (na pasta functions/, após `npm run build`):
 *   node scripts/backfill-tournament-collected-cents.js --project <projectId> --yes
 *   node scripts/backfill-tournament-collected-cents.js --project <projectId> --yes --limit 10
 */

const admin = require("firebase-admin");
const {
  computeTournamentCollectedCents,
  artifactsInscriptionsPath,
} = require("../lib/tournament-collected-stats");

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
    const collectedCents = computeTournamentCollectedCents(tournament, inscriptions);
    const current =
      typeof tournament.collectedCents === "number" ?
        Math.round(tournament.collectedCents) :
        0;

    if (current === collectedCents) {
      console.log(`skip ${doc.id} collectedCents=${collectedCents}`);
      continue;
    }

    console.log(
      `${APPLY ? "update" : "dry-run"} ${doc.id}: ${current} -> ${collectedCents}`,
    );
    if (APPLY) {
      await doc.ref.set({collectedCents}, {merge: true});
      updated += 1;
    }
  }

  console.log(`done. updated=${updated} total=${docs.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

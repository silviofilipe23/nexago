/* eslint-disable */
/**
 * Backfill: grava `sport` (de `tournaments/{id}.sport`) nas partidas que não o têm.
 *
 * O placar depende do esporte (futevôlei: set até 18; demais: 21) e passou a ler
 * `matches/{id}.sport`, gravado na criação da chave. Partidas geradas antes disso
 * não têm o campo e cairiam na regra de vôlei de praia. Só futevôlei precisa do
 * campo (ausente já equivale a 21), então o script só grava onde o torneio é
 * `footvolley`.
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-match-sport.js --project volley-track-dev-4596c        # dry-run
 *   node scripts/backfill-match-sport.js --project volley-track-dev-4596c --yes
 *
 * Pré-requisitos: gcloud auth application-default login (ou GOOGLE_APPLICATION_CREDENTIALS).
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
const db = admin.firestore();

/** Mesmo caminho de `artifactsMatchesPath` em src/firebase-paths.ts. */
const MATCHES_PATH = `artifacts/${projectId}/public/data/matches`;

async function main() {
  const tournaments = await db
    .collection("tournaments")
    .where("sport", "==", "footvolley")
    .get();
  console.log(`Torneios de futevôlei: ${tournaments.size}`);

  let planned = 0;
  let written = 0;
  for (const t of tournaments.docs) {
    const matches = await db
      .collection(MATCHES_PATH)
      .where("tournamentId", "==", t.id)
      .get();
    const missing = matches.docs.filter((m) => !m.data().sport);
    planned += missing.length;
    console.log(`  ${t.id}: ${missing.length}/${matches.size} partidas sem sport`);
    if (!APPLY) continue;
    for (let i = 0; i < missing.length; i += 400) {
      const batch = db.batch();
      for (const m of missing.slice(i, i + 400)) {
        batch.update(m.ref, {sport: "footvolley"});
      }
      await batch.commit();
      written += Math.min(400, missing.length - i);
    }
  }
  console.log(
    APPLY
      ? `Gravadas ${written} partidas.`
      : `DRY-RUN: ${planned} partidas seriam atualizadas (use --yes).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

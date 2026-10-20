/* eslint-disable */
/**
 * Backfill de `arenaClassSessions.extraAthleteIds` — as contas dos encaixes (reposição e aula
 * experimental) de cada aula. É por esse array que a agenda do atleta (`getMyClassAgenda`) acha a
 * aula em que ele foi encaixado; o encaixe passou a gravá-lo na própria transação, mas as aulas com
 * encaixe feitas antes ficaram sem.
 *
 * Varre as aulas a partir de hoje − 60 dias que têm `extras` e grava o array calculado do mapa.
 * Idempotente: só escreve quando o array muda.
 *
 * Pré-requisito: gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-class-extra-athlete-ids.js --project volley-track-dev-4596c          # dry-run
 *   node scripts/backfill-class-extra-athlete-ids.js --project volley-track-dev-4596c --yes
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

function dayKey(d) {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"}).format(d);
}

function extraAthleteIdsOf(extras) {
  return [...new Set(Object.values(extras || {}).map((e) => e && e.athleteId).filter((id) => typeof id === "string" && id))].sort();
}

(async () => {
  const fromKey = dayKey(new Date(Date.now() - 60 * 86400000));
  const snap = await db.collection("arenaClassSessions").where("date", ">=", fromKey).get();
  let candidates = 0;
  let written = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const extras = data.extras && typeof data.extras === "object" ? data.extras : {};
    if (Object.keys(extras).length === 0 && !Array.isArray(data.extraAthleteIds)) continue;
    const next = extraAthleteIdsOf(extras);
    const current = Array.isArray(data.extraAthleteIds) ? [...data.extraAthleteIds].sort() : null;
    if (current && JSON.stringify(current) === JSON.stringify(next)) continue;
    candidates += 1;
    console.log(`${doc.id}: ${JSON.stringify(current)} → ${JSON.stringify(next)}`);
    if (APPLY) {
      await doc.ref.set({extraAthleteIds: next}, {merge: true});
      written += 1;
    }
  }
  console.log(`${snap.size} aula(s) desde ${fromKey}; ${candidates} a corrigir; ${APPLY ? `${written} gravada(s)` : "dry-run (use --yes)"}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

/* eslint-disable */
/**
 * Recupera os palpites gravados no formato errado em
 * `tournamentPredictions/{tournamentId}/entries/{userId}`.
 *
 * A `submitBracketPrediction` montava o patch com chaves `picks.${matchId}`
 * e gravava com `set(..., {merge: true})`. Diferente do `update()`, o `set()`
 * NÃO interpreta ponto como separador de caminho: cada chave virou um campo
 * de nome LITERAL `picks.<matchId>` no topo do documento e o mapa `picks`
 * nunca existiu. Consequências: o app lia `data.picks` vazio (o palpite
 * "sumia" ao reabrir a tela) e o trigger de pontuação, que lê
 * `entry.picks[matchId]`, nunca creditava acerto de partida.
 *
 * Este passe move cada campo literal `picks.<matchId>` para dentro do mapa
 * `picks` e apaga o campo antigo, na mesma escrita. Palpite que já exista no
 * mapa `picks` (salvo depois da correção) tem prioridade e é preservado.
 *
 * Rode DEPOIS do deploy da function corrigida — senão um novo envio recria
 * os campos com ponto.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-prediction-picks-map.js --project volley-track-dev-4596c
 *   node scripts/backfill-prediction-picks-map.js --project <projectId> --yes
 *   node scripts/backfill-prediction-picks-map.js --project <projectId> --yes --limit 50
 */

const admin = require("firebase-admin");
const {FieldPath, FieldValue} = require("firebase-admin/firestore");

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

const LEGACY_PREFIX = "picks.";

/** Separa os campos legados (`picks.<matchId>`) dos palpites já corretos. */
function planEntryMigration(data) {
  const currentPicks =
    data && typeof data.picks === "object" && !Array.isArray(data.picks) ?
      data.picks :
      {};

  const toMigrate = {};
  const toDelete = [];

  for (const key of Object.keys(data || {})) {
    if (!key.startsWith(LEGACY_PREFIX)) continue;
    toDelete.push(key);

    const matchId = key.slice(LEGACY_PREFIX.length).trim();
    const teamId = typeof data[key] === "string" ? data[key].trim() : "";
    if (!matchId || !teamId) continue;
    // Palpite salvo depois da correção manda — não sobrescreve com o legado.
    if (typeof currentPicks[matchId] === "string" && currentPicks[matchId].trim()) {
      continue;
    }
    toMigrate[matchId] = teamId;
  }

  return {toMigrate, toDelete};
}

/** Refs de `entries` de todos os torneios — os docs pai de
 * `tournamentPredictions/{tid}` nunca são criados (a function escreve direto
 * na subcoleção), então `listDocuments()` é obrigatório: um `.get()` na
 * coleção pai não retorna nada. */
async function listEntryRefs() {
  const parents = await db.collection("tournamentPredictions").listDocuments();
  const refs = [];
  for (const parent of parents) {
    const snap = await parent.collection("entries").get();
    for (const doc of snap.docs) refs.push(doc);
  }
  return refs;
}

async function main() {
  const all = await listEntryRefs();
  const docs = LIMIT > 0 ? all.slice(0, LIMIT) : all;
  let updated = 0;

  for (const doc of docs) {
    const {toMigrate, toDelete} = planEntryMigration(doc.data());
    if (toDelete.length === 0) {
      console.log(`skip ${doc.ref.path} (sem campo legado)`);
      continue;
    }

    const migrated = Object.keys(toMigrate);
    console.log(
      `${APPLY ? "update" : "dry-run"} ${doc.ref.path}: ` +
        `migra ${migrated.length} palpite(s), apaga ${toDelete.length} campo(s) legado(s)`,
    );

    if (!APPLY) continue;

    // Uma única escrita: `FieldPath("picks", matchId)` grava dentro do mapa
    // sem tocar nos outros palpites; `FieldPath(key)` de um segmento só é a
    // única forma de endereçar o campo cujo NOME tem ponto.
    const args = [];
    for (const [matchId, teamId] of Object.entries(toMigrate)) {
      args.push(new FieldPath("picks", matchId), teamId);
    }
    for (const key of toDelete) {
      args.push(new FieldPath(key), FieldValue.delete());
    }
    await doc.ref.update(...args);
    updated += 1;
  }

  console.log(`done. updated=${updated} total=${docs.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

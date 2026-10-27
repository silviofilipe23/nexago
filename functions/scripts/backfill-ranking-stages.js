/* eslint-disable */
/**
 * Carimba `rankingStages/{esporte}` com as etapas que JÁ pontuaram, para o
 * "subiu/caiu N posições na última etapa" do app funcionar sem esperar o
 * próximo torneio. Daqui para frente quem carimba é o motor
 * (`tryAwardGlobalRankingForMatch`), uma vez por partida que pontua.
 *
 * De onde sai cada etapa:
 *   - torneios: os `results[]` dos docs por esporte (dupla e atleta — categoria
 *     individual só tem doc de atleta), com o ano do resultado;
 *   - hora: a partida concluída mais recente do torneio (`parseMatchPlayedAt`,
 *     a mesma que o motor usa). Torneio sem partida concluída fica de fora.
 *
 * Idempotente (merge por torneio). Rodar de novo só reescreve as mesmas chaves.
 *
 * Pré-requisitos: credenciais admin (`gcloud auth application-default login`)
 * e lib/ compilada (`npm run build` na pasta functions/).
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-ranking-stages.js --project volley-track-dev-4596c
 *   node scripts/backfill-ranking-stages.js --project volley-track-dev-4596c --yes
 *
 * Sem --yes é DRY-RUN: lista as etapas por esporte e não escreve nada.
 */

const admin = require("firebase-admin");
const {
  athleteRankingsBySportPath,
  teamRankingsBySportPath,
} = require("../lib/tournament-ranking");
const {
  collectRankingStageTournaments,
  recordRankingStage,
} = require("../lib/ranking-stages");
const {parseMatchPlayedAt} = require("../lib/tournament-match-gamification");
const {isMatchCompleted} = require("../lib/match-status");
const {artifactsMatchesPath} = require("../lib/firebase-paths");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId = argValue("--project");

if (!projectId) {
  console.error("Uso: --project <projectId> [--yes]");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

/** Hora da partida concluída mais recente do torneio; `null` sem nenhuma. */
async function lastMatchAt(tournamentId) {
  const snap = await db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  let latest = null;
  for (const doc of snap.docs) {
    const match = doc.data();
    if (!isMatchCompleted(match.status)) continue;
    const at = parseMatchPlayedAt(match, new Date(0));
    if (at.getTime() <= 0) continue;
    if (latest == null || at > latest) latest = at;
  }
  return latest;
}

async function main() {
  const docs = [];
  for (const path of [teamRankingsBySportPath(projectId), athleteRankingsBySportPath(projectId)]) {
    const snap = await db.collection(path).select("sport", "results").get();
    for (const doc of snap.docs) docs.push(doc.data());
  }
  const bySport = collectRankingStageTournaments(docs);

  let written = 0;
  for (const [sportCode, tournaments] of bySport) {
    const stages = [];
    for (const [tournamentId, year] of tournaments) {
      const at = await lastMatchAt(tournamentId);
      if (at == null) {
        console.log(`   ${sportCode} ${tournamentId}: sem partida concluída — fica de fora`);
        continue;
      }
      stages.push({tournamentId, year, at});
    }
    stages.sort((a, b) => b.at - a.at);
    console.log(`\n== ${sportCode}: ${stages.length} etapa(s); mais recentes:`);
    for (const s of stages.slice(0, 5)) {
      console.log(`   ${s.at.toISOString()}  ${s.year}  ${s.tournamentId}`);
    }
    if (APPLY) {
      for (const s of stages) {
        await recordRankingStage(db, projectId, {sportCode, ...s});
        written++;
      }
    }
  }
  if (APPLY) console.log(`\n${written} etapa(s) gravada(s).`);
  else console.log("\nNada foi gravado. Rode de novo com --yes para aplicar.");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

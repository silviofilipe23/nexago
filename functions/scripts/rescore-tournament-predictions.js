/* eslint-disable */
/**
 * Repontua palpites de partidas que JÁ estavam concluídas quando os picks
 * ainda não eram legíveis (ver `backfill-prediction-picks-map.js`).
 *
 * O trigger `onTournamentMatchCompletedScoreBracketPredictions` só roda na
 * transição da partida para concluída. Quem acertou uma partida encerrada
 * ANTES da correção não recebeu ponto nem XP, e o trigger nunca mais dispara
 * pra ela — daí este passe.
 *
 * Reusa a MESMA função do trigger (`processBracketPredictionScoring`), então
 * a regra de pontuação não é duplicada aqui e o crédito continua idempotente
 * pelos docs `users/{uid}/gamification_events/{eventId}`: rodar de novo não
 * pontua duas vezes, e partidas já creditadas pelo trigger são ignoradas.
 *
 * Rode DEPOIS de `backfill-prediction-picks-map.js` — sem os picks no mapa
 * `picks` não há o que pontuar.
 *
 * Pré-requisitos: `npm --prefix functions run build` (usa `lib/`) e
 * credenciais admin:
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/rescore-tournament-predictions.js --project volley-track-dev-4596c
 *   node scripts/rescore-tournament-predictions.js --project <projectId> --yes
 *   node scripts/rescore-tournament-predictions.js --project <projectId> --tournament <tid> --yes
 */

const admin = require("firebase-admin");
const {
  computeChampionPickPoints,
  computeMatchPickPoints,
  processBracketPredictionScoring,
} = require("../lib/tournament-predictions");
const {isFinalMatchType} = require("../lib/tournament-completion");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const ONLY_TOURNAMENT = argValue("--tournament");
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

const matchesPath = () => `artifacts/${projectId}/public/data/matches`;

/** Torneios que têm alguma entrada de palpite. Os docs pai
 * `tournamentPredictions/{tid}` nunca são criados (a function escreve direto
 * na subcoleção), então `listDocuments()` é obrigatório. */
async function listTournamentIds() {
  if (ONLY_TOURNAMENT) return [ONLY_TOURNAMENT.trim()];
  const parents = await db.collection("tournamentPredictions").listDocuments();
  return parents.map((p) => p.id);
}

/** Partidas concluídas com vencedor definido — o mesmo recorte que faria o
 * trigger disparar. Filtra `status` em memória pra não exigir índice composto. */
async function completedMatches(tournamentId) {
  const snap = await db
    .collection(matchesPath())
    .where("tournamentId", "==", tournamentId)
    .get();
  return snap.docs.filter((d) => {
    const m = d.data();
    return String(m.status) === "Completed" && String(m.winnerId || "").trim();
  });
}

/** Quanto ESTE passe creditaria — só pra relatar no dry-run. O crédito real
 * (e a idempotência) fica por conta de `processBracketPredictionScoring`. */
async function previewPoints(tournamentId, matchDoc) {
  const m = matchDoc.data();
  const winnerId = String(m.winnerId).trim();
  const isFinal = isFinalMatchType(String(m.matchType || ""));
  const entries = await db
    .collection(`tournamentPredictions/${tournamentId}/entries`)
    .get();

  let pending = 0;
  for (const e of entries.docs) {
    const pontos =
      computeMatchPickPoints(e.data(), matchDoc.id, winnerId) +
      computeChampionPickPoints(e.data(), isFinal, winnerId);
    if (pontos <= 0) continue;
    // Já creditado pelo trigger? Então este passe não faria nada.
    const ev = await db
      .doc(`users/${e.id}/gamification_events/bracket_prediction_${matchDoc.id}_${e.id}`)
      .get();
    if (!ev.exists) pending++;
  }
  return pending;
}

async function main() {
  const tournamentIds = await listTournamentIds();
  let creditedMatches = 0;

  for (const tid of tournamentIds) {
    const matches = await completedMatches(tid);
    if (matches.length === 0) {
      console.log(`skip ${tid} (nenhuma partida concluída)`);
      continue;
    }

    for (const matchDoc of matches) {
      const pending = await previewPoints(tid, matchDoc);
      if (pending === 0) {
        console.log(`skip ${tid}/${matchDoc.id} (nada pendente de crédito)`);
        continue;
      }

      console.log(
        `${APPLY ? "credita" : "dry-run"} ${tid}/${matchDoc.id}: ` +
          `${pending} palpite(s) acertaram e ainda não foram pontuados`,
      );
      if (!APPLY) continue;

      await processBracketPredictionScoring({
        db,
        matchId: matchDoc.id,
        match: matchDoc.data(),
      });
      creditedMatches += 1;
    }
  }

  console.log(`done. partidas creditadas=${creditedMatches}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

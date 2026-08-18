/* eslint-disable */
/**
 * Backfill: migração ×10 do histórico do ranking global (fase 3).
 *
 * Contexto (18/08): `tournament-ranking.ts` reescalou a tabela-base de
 * pontos (`DEFAULT_GLOBAL_POINTS`) de 100 para 1000 no 1º lugar — ×10 em
 * toda a tabela, paridade de PROPORÇÕES com `pointsByPlace` do app
 * (`nexago_app/lib/features/ranking/domain/ranking_constants.dart`). A
 * partir do deploy, todo doc novo já nasce na escala ×10 e carimbado com
 * `scaleVersion: 2` (`RANKING_SCALE_VERSION`, exportado de
 * `functions/src/tournament-ranking.ts`). Isso sozinho NÃO migra o que já
 * estava gravado na escala antiga (×1):
 *
 *   (a) `artifacts/{projectId}/public/data/tournamentCategoryResults` —
 *       `pointsEarned` na escala velha, sem `scaleVersion`;
 *   (b) `artifacts/{projectId}/public/data/athleteRankings` e
 *       `.../teamRankings` — `results[].points` na escala velha, e os
 *       agregados (`totalPoints`, `pointsByYear`, `tournamentsCount`)
 *       calculados em cima deles, também desatualizados.
 *
 * Sem este backfill, o ranking global fica misturado: torneios antigos
 * pesando 10× menos que torneios novos no mesmo período.
 *
 * Este script cobre os dois pontos:
 *   1. Multiplica `pointsEarned` × 10 (arredondado) em cada doc de
 *      `tournamentCategoryResults` ainda não carimbado.
 *   2. Multiplica cada `results[].points` × 10 em `athleteRankings` e
 *      `teamRankings`, e RECALCULA `totalPoints`/`pointsByYear`/
 *      `tournamentsCount` com a MESMA regra de `aggregateRankingResults`
 *      pós-D1 (`functions/src/tournament-ranking.ts`): soma TODOS os
 *      resultados de cada ano (sem descarte de "melhores N") e o total
 *      entre os anos. Reimplementada abaixo em JS puro — script standalone,
 *      sem import do bundle compilado das functions; ver comentário de
 *      paridade junto à função `aggregateRankingResults` mais abaixo.
 *
 * Em ambos os casos o carimbo `scaleVersion: 2` marca o doc como migrado.
 *
 * RUNBOOK — ordem obrigatória:
 *   1. Deploy das functions com a tabela ×10 + `scaleVersion` no motor
 *      (`tournament-ranking.ts`, Task 4 da fase 3).
 *   2. Rode este backfill em seguida. Não há janela de risco como no
 *      backfill de rating (nada some/desliga sozinho enquanto o script não
 *      roda) — mas até rodar, o ranking exibido mistura as duas escalas.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-ranking-scale-x10.js --project volley-track-dev-4596c
 *   node scripts/backfill-ranking-scale-x10.js --project <id> --yes
 *   node scripts/backfill-ranking-scale-x10.js --project <id> --yes --limit 50
 *
 * Sem --yes é DRY-RUN: só lista o que mudaria, sem escrever.
 *
 * Idempotência: docs com `scaleVersion >= 2` são pulados (skip) na
 * re-execução — inclusive os que o motor novo já escreve nascendo
 * carimbados, que portanto NUNCA são multiplicados de novo. `--limit` limita
 * quantos docs PENDENTES (ainda sem o carimbo) cada coleção processa por
 * execução — não dá pra empurrar o filtro `scaleVersion` pra dentro da query
 * do Firestore (docs antigos não têm o campo), então o filtro roda em
 * memória depois do `.get()` e o limite corta a lista já filtrada.
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
const LIMIT = parseInt(argValue("--limit") || "0", 10);

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

/**
 * Mesmo valor de `RANKING_SCALE_VERSION` em `functions/src/tournament-ranking.ts`
 * — cópia literal (script standalone, sem import do bundle compilado).
 */
const RANKING_SCALE_VERSION = 2;

/**
 * Reimplementação em JS puro de `aggregateRankingResults`
 * (`functions/src/tournament-ranking.ts`, pós-D1) — MESMA regra: soma TODOS
 * os resultados de cada ano (sem descarte de "melhores N") e o total entre
 * os anos. Comentário de paridade: qualquer mudança na função original tem
 * que ser espelhada aqui também, senão o backfill diverge do motor.
 */
function aggregateRankingResults(results) {
  const pointsByYear = {};
  let totalPoints = 0;
  for (const result of results) {
    const year = String(result.year ?? 0);
    const points = Math.max(0, Math.round(Number(result.points) || 0));
    pointsByYear[year] = (pointsByYear[year] || 0) + points;
  }
  for (const year of Object.keys(pointsByYear)) totalPoints += pointsByYear[year];
  return {totalPoints, tournamentsCount: results.length, pointsByYear};
}

function tournamentCategoryResultsPath() {
  return `artifacts/${projectId}/public/data/tournamentCategoryResults`;
}

function rankingCollectionPath(coll) {
  return `artifacts/${projectId}/public/data/${coll}`;
}

/** Já carimbado (motor novo, ou execução anterior deste script) → pula. */
function alreadyScaled(data) {
  return (Number(data.scaleVersion) || 0) >= RANKING_SCALE_VERSION;
}

async function migrateTournamentCategoryResults() {
  const snap = await db.collection(tournamentCategoryResultsPath()).get();
  const pending = snap.docs.filter((doc) => !alreadyScaled(doc.data()));
  const targets = LIMIT > 0 ? pending.slice(0, LIMIT) : pending;

  console.log(
    `\n[tournamentCategoryResults] ${pending.length} doc(s) pendente(s)` +
      (LIMIT > 0 ? `, processando ${targets.length} (--limit ${LIMIT})` : "") +
      ":",
  );
  for (const doc of targets) {
    const d = doc.data();
    const update = {
      pointsEarned: Math.round((Number(d.pointsEarned) || 0) * 10),
      scaleVersion: RANKING_SCALE_VERSION,
    };
    console.log(`  ${doc.id}: ${d.pointsEarned} → ${update.pointsEarned}`);
    if (APPLY) await doc.ref.update(update);
  }
  return targets.length;
}

async function migrateRankingCollection(coll) {
  const snap = await db.collection(rankingCollectionPath(coll)).get();
  const pending = snap.docs.filter((doc) => !alreadyScaled(doc.data()));
  const targets = LIMIT > 0 ? pending.slice(0, LIMIT) : pending;

  console.log(
    `\n[${coll}] ${pending.length} doc(s) pendente(s)` +
      (LIMIT > 0 ? `, processando ${targets.length} (--limit ${LIMIT})` : "") +
      ":",
  );
  for (const doc of targets) {
    const d = doc.data();
    const results = Array.isArray(d.results) ? d.results : [];
    const scaled = results.map((r) => ({
      ...r,
      points: Math.round((Number(r.points) || 0) * 10),
    }));
    const aggregates = aggregateRankingResults(scaled);
    const update = {
      results: scaled,
      totalPoints: aggregates.totalPoints,
      tournamentsCount: aggregates.tournamentsCount,
      pointsByYear: aggregates.pointsByYear,
      scaleVersion: RANKING_SCALE_VERSION,
    };
    console.log(`  ${coll}/${doc.id}: total ${d.totalPoints} → ${aggregates.totalPoints}`);
    if (APPLY) await doc.ref.update(update);
  }
  return targets.length;
}

async function run() {
  console.log(
    APPLY
      ? `Aplicando backfill de escala ×10 do ranking em ${projectId}…`
      : `DRY-RUN em ${projectId} (passe --yes para escrever).`,
  );

  const resultsPending = await migrateTournamentCategoryResults();
  const athletesPending = await migrateRankingCollection("athleteRankings");
  const teamsPending = await migrateRankingCollection("teamRankings");

  console.log("\nResumo:");
  console.log(`  tournamentCategoryResults migrados: ${resultsPending}`);
  console.log(`  athleteRankings migrados: ${athletesPending}`);
  console.log(`  teamRankings migrados: ${teamsPending}`);
  if (!APPLY) {
    console.log("  (dry-run — nada escrito; rode de novo com --yes)");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

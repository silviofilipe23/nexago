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
 *   2. Rode este backfill em seguida. Uma versão anterior deste comentário
 *      dizia que não havia janela de risco entre o deploy e a execução do
 *      script — ERRADO: a janela É real (um torneio pode terminar uma
 *      partida bem nesse meio-tempo). Duas mitigações cobrem os dois lados
 *      possíveis da corrida, e por isso a janela hoje é inofensiva:
 *        - Motor (`upsertGlobalRankingDoc`, `tournament-ranking.ts`):
 *          migração ON-WRITE. Ao gravar sobre um doc de
 *          `athleteRankings`/`teamRankings` que já existe mas ainda não tem
 *          `scaleVersion: 2`, o motor reescala ×10 os `results[].points`
 *          ANTIGOS do doc antes de mesclar a nova entrada (que já nasce na
 *          escala ×10). Sem isso, o doc ficava com pontos ×1 (antigos) e
 *          ×10 (novo) misturados e MESMO ASSIM carimbado com
 *          `scaleVersion: 2` — escapando pra sempre da varredura deste
 *          script (dado misto permanente, falso-verde no dry-run).
 *        - Script (ver `migrateOneDoc` abaixo): cada doc é migrado dentro
 *          de UMA TRANSAÇÃO (`db.runTransaction`) que RELÊ o doc no momento
 *          do commit em vez de reaproveitar o snapshot da varredura inicial
 *          (usado só pra listar candidatos e aplicar `--limit`). Se o motor
 *          escrever no doc entre o `.get()` inicial e a transação, a
 *          releitura pega o dado fresco — ou vê `scaleVersion` já ≥2 e pula
 *          — em vez de sobrescrever `results[]` com o snapshot obsoleto e
 *          perder o prêmio que chegou no meio.
 *      Mesmo assim, rodar o backfill logo após o deploy reduz a chance de
 *      qualquer premiação cair na janela — mas o resultado final é correto
 *      (nunca dado misto, nunca prêmio perdido) mesmo que demore.
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
 *
 * Falha por doc não aborta a corrida: cada doc migra na sua própria
 * transação, erro é contado e reportado no resumo final, e o processo sai
 * com código != 0 se algum doc falhou — pra CI/operador perceberem sem
 * perder o progresso dos docs que deram certo.
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

/**
 * Migra UM doc dentro de uma transação: relê o doc no momento do commit (em
 * vez de reaproveitar o snapshot da varredura inicial, que só serve pra
 * listar candidatos e aplicar `--limit`), reconfirma que ainda está
 * pendente, recalcula o update a partir do dado FRESCO e escreve (se
 * `APPLY`). É essa releitura que fecha o "mode B" da corrida deploy→script
 * descrita no cabeçalho: se o motor gravou uma premiação nova no doc entre
 * o `.get()` da varredura e esta transação, o update é calculado em cima do
 * dado atual — nunca sobrescreve `results[]` com o snapshot obsoleto.
 *
 * @param {FirebaseFirestore.DocumentReference} ref
 * @param {(fresh: Record<string, any>) => Record<string, any>} computeUpdate
 *   Recebe o dado fresco (já confirmado pendente) e devolve o update a
 *   escrever.
 * @returns {Promise<{status: "migrated"|"already-scaled"|"missing", update?: object, before?: object}>}
 */
async function migrateOneDoc(ref, computeUpdate) {
  return db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) return {status: "missing"};
    const fresh = snap.data();
    if (alreadyScaled(fresh)) return {status: "already-scaled"};
    const update = computeUpdate(fresh);
    if (APPLY) txn.update(ref, update);
    return {status: "migrated", update, before: fresh};
  });
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

  let migrated = 0;
  let errors = 0;
  for (const doc of targets) {
    try {
      const outcome = await migrateOneDoc(doc.ref, (fresh) => ({
        pointsEarned: Math.round((Number(fresh.pointsEarned) || 0) * 10),
        scaleVersion: RANKING_SCALE_VERSION,
      }));
      if (outcome.status === "migrated") {
        console.log(`  ${doc.id}: ${outcome.before.pointsEarned} → ${outcome.update.pointsEarned}`);
        migrated++;
      } else if (outcome.status === "already-scaled") {
        console.log(`  ${doc.id}: já migrado por outra escrita entre a varredura e a transação — pulado`);
      } else {
        console.log(`  ${doc.id}: doc sumiu entre a varredura e a transação — pulado`);
      }
    } catch (err) {
      // Falha isolada NÃO aborta a corrida: os demais docs seguem migrando;
      // o erro é contado e reportado no resumo, com exit code != 0 no final.
      errors++;
      console.error(`  ${doc.id}: ERRO na transação —`, err && err.message ? err.message : err);
    }
  }
  return {migrated, errors};
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

  let migrated = 0;
  let errors = 0;
  for (const doc of targets) {
    try {
      const outcome = await migrateOneDoc(doc.ref, (fresh) => {
        const results = Array.isArray(fresh.results) ? fresh.results : [];
        const scaled = results.map((r) => ({
          ...r,
          points: Math.round((Number(r.points) || 0) * 10),
        }));
        const aggregates = aggregateRankingResults(scaled);
        return {
          results: scaled,
          totalPoints: aggregates.totalPoints,
          tournamentsCount: aggregates.tournamentsCount,
          pointsByYear: aggregates.pointsByYear,
          scaleVersion: RANKING_SCALE_VERSION,
        };
      });
      if (outcome.status === "migrated") {
        console.log(
          `  ${coll}/${doc.id}: total ${outcome.before.totalPoints} → ${outcome.update.totalPoints}`,
        );
        migrated++;
      } else if (outcome.status === "already-scaled") {
        console.log(
          `  ${coll}/${doc.id}: já migrado por outra escrita entre a varredura e a transação — pulado`,
        );
      } else {
        console.log(`  ${coll}/${doc.id}: doc sumiu entre a varredura e a transação — pulado`);
      }
    } catch (err) {
      errors++;
      console.error(`  ${coll}/${doc.id}: ERRO na transação —`, err && err.message ? err.message : err);
    }
  }
  return {migrated, errors};
}

async function run() {
  console.log(
    APPLY
      ? `Aplicando backfill de escala ×10 do ranking em ${projectId}…`
      : `DRY-RUN em ${projectId} (passe --yes para escrever).`,
  );

  const resultsOutcome = await migrateTournamentCategoryResults();
  const athletesOutcome = await migrateRankingCollection("athleteRankings");
  const teamsOutcome = await migrateRankingCollection("teamRankings");

  const totalErrors = resultsOutcome.errors + athletesOutcome.errors + teamsOutcome.errors;

  console.log("\nResumo:");
  console.log(
    `  tournamentCategoryResults: ${resultsOutcome.migrated} migrado(s), ${resultsOutcome.errors} erro(s)`,
  );
  console.log(
    `  athleteRankings: ${athletesOutcome.migrated} migrado(s), ${athletesOutcome.errors} erro(s)`,
  );
  console.log(`  teamRankings: ${teamsOutcome.migrated} migrado(s), ${teamsOutcome.errors} erro(s)`);
  if (!APPLY) {
    console.log("  (dry-run — nada escrito; rode de novo com --yes)");
  }
  if (totalErrors > 0) {
    console.error(
      `\n${totalErrors} doc(s) falharam na transação — revise os erros acima antes de reexecutar.`,
    );
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

/* eslint-disable */
/**
 * Recálculo retroativo do ranking geral com os pesos da fase 3.
 *
 * PROBLEMA (19/08): a fase 3 pôs peso por preset de categoria, grade do
 * torneio (`rankingWeight`) e modulador por tamanho de chave em
 * `functions/src/tournament-ranking.ts` — mas só para premiações NOVAS. O
 * `backfill-ranking-scale-x10.js` que rodou antes fez apenas a reescala ×10,
 * por decisão explícita da spec (D9: "na regra antiga toda categoria pagava
 * tabela cheia, então old×10 = o que a regra da época teria pago"). Resultado
 * prático: campeão de uma categoria intermediária antiga vale 1000 no ranking,
 * enquanto o campeão da mesma categoria hoje vale 250 (1000 × 0.25). Este
 * script é a EMENDA daquela decisão — reescreve o histórico com a fórmula
 * vigente, para que passado e presente pesem igual.
 *
 * FÓRMULA (idêntica ao motor, ver `scripts/lib/ranking-recompute.js`):
 *
 *     pontos = round( base(finalPlace) × pesoPreset × rankingWeight × fatorChave )
 *
 * De onde vem cada fator:
 *   - `base(finalPlace)`: inverso de `finalPlaceForAward` — 1-4 direto,
 *     5 = quartas (330), 9 = fase de grupos (100). Por isso o recálculo não
 *     precisa reprocessar partida nenhuma: a colocação apurada está gravada.
 *   - `pesoPreset`: da faixa `minLevel`..`level` da categoria quando ela tem
 *     piso; categoria LEGADA (sem piso) infere o preset pelo teto. Decisão do
 *     dono em 19/08 — ver `presetWeightForCategory`.
 *   - `rankingWeight`: do doc do torneio, com o mesmo saneamento do motor.
 *   - `fatorChave`: `bracketSizeFactor` sobre as duplas PAGAS da categoria,
 *     contadas AGORA (paridade com `loadPaidTeamIds` de
 *     `functions/src/league-ranking.ts`: `isPaid === true`, sem `waitlist`,
 *     `teamId` distinto). É o único fator que pode ter envelhecido desde o
 *     evento — um estorno posterior derruba o fator. Aceito pelo dono ao
 *     escolher "fórmula completa de hoje".
 *
 * SEM CARIMBO, DE PROPÓSITO: como o recálculo é função pura do dado gravado,
 * ele CONVERGE — rodar duas vezes dá o mesmo resultado, e entrada escrita pelo
 * motor novo já nasce no valor final e não é tocada. Um marcador tipo
 * `scaleVersion: 3` só reabriria a corrida que o backfill ×10 teve que fechar:
 * doc ainda não recalculado que recebe premiação nova sairia carimbado com
 * dado misto e escaparia da varredura para sempre. Aqui não existe "escapar":
 * a próxima execução reconverge qualquer doc.
 *
 * O QUE ELE NÃO FAZ:
 *   - NÃO reavalia elegibilidade: entrada que existe continua existindo, mesmo
 *     que a categoria hoje não passasse no gate de 10 duplas pagas ou estivesse
 *     com `rankingEnabled` desligado. O gate valeu na hora da premiação; tirar
 *     ponto de quem já tem é decisão à parte. O resumo REPORTA esses casos.
 *   - NÃO toca no ranking de liga (`leagueRankings` tem tabela própria,
 *     `rankingPointsByPlace`).
 *   - NÃO recalcula colocação/pódio — `finalPlace` é entrada, nunca saída.
 *   - NÃO mexe em `scaleVersion` nem no motor.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/recompute-ranking-weights.js --project volley-track-dev-4596c
 *   node scripts/recompute-ranking-weights.js --project <id> --yes
 *   node scripts/recompute-ranking-weights.js --project <id> --yes --limit 50
 *
 * Sem --yes é DRY-RUN: lista o contexto por categoria e cada doc que mudaria,
 * sem escrever. `--limit` corta quantos docs que MUDARIAM cada coleção
 * processa nesta execução (o resto fica para a próxima — o script converge).
 *
 * Falha por doc não aborta a corrida: cada doc é migrado na sua própria
 * transação (que RELÊ o doc no commit, tornando inofensiva uma premiação que
 * caia no meio da execução), o erro é contado e reportado, e o processo sai
 * com código != 0 se algum doc falhou.
 */

const admin = require("firebase-admin");
const {
  presetWeightForCategory,
  sanitizeRankingWeight,
  bracketSizeFactor,
  pointsForEntry,
  aggregateRankingResults,
} = require("./lib/ranking-recompute");

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

/** Mesmo valor de `MIN_TEAMS_FOR_GLOBAL_RANKING` no motor (só p/ relatório). */
const MIN_TEAMS_FOR_GLOBAL_RANKING = 10;

const dataPath = (coll) => `artifacts/${projectId}/public/data/${coll}`;

const avisos = [];
function avisar(msg) {
  if (!avisos.includes(msg)) avisos.push(msg);
}

// ---------------------------------------------------------------------------
// Contexto por (torneio, categoria) — resolvido uma vez e reusado.
// ---------------------------------------------------------------------------

const contextos = new Map();

async function contextFor(tournamentId, categoryId) {
  const chave = `${tournamentId}|${categoryId}`;
  if (contextos.has(chave)) return contextos.get(chave);

  const ctx = await resolveContext(tournamentId, categoryId);
  contextos.set(chave, ctx);
  return ctx;
}

async function resolveContext(tournamentId, categoryId) {
  const base = {tournamentId, categoryId, ok: false};

  if (!tournamentId || !categoryId) {
    return {...base, motivo: "entrada sem tournamentId/categoryId"};
  }

  const snap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!snap.exists) {
    return {...base, motivo: "torneio não existe mais"};
  }
  const tournament = snap.data() || {};
  const categorias = Array.isArray(tournament.categories) ? tournament.categories : [];
  const categoria = categorias.find(
    (c) => String(c.id ?? c.categoryId ?? "") === String(categoryId),
  );

  const identidade = {
    ...base,
    tournamentName: tournament.name || "(sem nome)",
    categoryName: categoria?.name || categoria?.categoryName || "(categoria não encontrada)",
    level: categoria?.level ?? null,
    minLevel: categoria?.minLevel ?? null,
    isLeagueStage: String(tournament.leagueId ?? "").trim().length > 0,
    rankingEnabled: tournament.rankingEnabled === true,
  };

  if (!categoria) {
    return {...identidade, motivo: "categoria não está mais no torneio"};
  }

  const peso = presetWeightForCategory(categoria);
  if (!peso) {
    return {
      ...identidade,
      motivo: `teto de nível irreconhecível (level=${JSON.stringify(categoria.level)})`,
    };
  }

  const paidTeams = await countPaidTeams(tournamentId, categoryId);
  const rankingWeight = sanitizeRankingWeight(tournament.rankingWeight);
  const bracketFactor = bracketSizeFactor(paidTeams);

  return {
    ...identidade,
    ok: true,
    weight: peso.weight,
    presetKey: peso.presetKey,
    inferred: peso.inferred,
    rankingWeight,
    paidTeams,
    bracketFactor,
    elegivelHoje:
      identidade.isLeagueStage ||
      (identidade.rankingEnabled && paidTeams >= MIN_TEAMS_FOR_GLOBAL_RANKING),
  };
}

/** Paridade com `loadPaidTeamIds` (functions/src/league-ranking.ts). */
async function countPaidTeams(tournamentId, categoryId) {
  const snap = await db
    .collection(dataPath("inscriptions"))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const ids = new Set();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.isPaid !== true) continue;
    if (d.waitlist === true) continue;
    const teamId = (d.teamId || "").trim();
    if (teamId) ids.add(teamId);
  }
  return ids.size;
}

/** Pontos novos de uma entrada, ou `null` quando não dá para decidir. */
async function recomputeEntry(entry) {
  const ctx = await contextFor(entry.tournamentId, entry.categoryId);
  if (!ctx.ok) {
    avisar(
      `${ctx.tournamentName ?? entry.tournamentId} / ${ctx.categoryName ?? entry.categoryId}: ` +
        `${ctx.motivo} — entradas mantidas como estão`,
    );
    return null;
  }
  const pontos = pointsForEntry(entry.finalPlace, ctx);
  if (pontos == null) {
    avisar(
      `${ctx.tournamentName} / ${ctx.categoryName}: finalPlace=${JSON.stringify(entry.finalPlace)} ` +
        "fora da tabela — entrada mantida como está",
    );
    return null;
  }
  return pontos;
}

// ---------------------------------------------------------------------------
// Migração dos docs.
// ---------------------------------------------------------------------------

/**
 * Migra UM doc dentro de uma transação que RELÊ o doc no commit: se o motor
 * gravou uma premiação entre a varredura e a escrita, o update é calculado em
 * cima do dado fresco em vez do snapshot obsoleto.
 *
 * @param {FirebaseFirestore.DocumentReference} ref
 * @param {(fresh: Record<string, any>) => Promise<object|null>} computeUpdate
 *   Devolve o update, ou `null` quando não há nada a mudar.
 */
async function migrateOneDoc(ref, computeUpdate) {
  return db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) return {status: "missing"};
    const fresh = snap.data();
    const update = await computeUpdate(fresh);
    if (update == null) return {status: "unchanged"};
    if (APPLY) txn.update(ref, update);
    return {status: "migrated", update, before: fresh};
  });
}

async function migrateTournamentCategoryResults() {
  const snap = await db.collection(dataPath("tournamentCategoryResults")).get();

  const candidatos = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const pontos = await recomputeEntry(d);
    if (pontos == null) continue;
    if (pontos === Number(d.pointsEarned)) continue;
    candidatos.push({doc, de: Number(d.pointsEarned), para: pontos});
  }
  const alvos = LIMIT > 0 ? candidatos.slice(0, LIMIT) : candidatos;

  console.log(
    `\n[tournamentCategoryResults] ${snap.size} doc(s), ${candidatos.length} mudariam` +
      (LIMIT > 0 ? `, processando ${alvos.length} (--limit ${LIMIT})` : "") +
      ":",
  );

  let migrated = 0;
  let errors = 0;
  for (const alvo of alvos) {
    try {
      const outcome = await migrateOneDoc(alvo.doc.ref, async (fresh) => {
        const pontos = await recomputeEntry(fresh);
        if (pontos == null || pontos === Number(fresh.pointsEarned)) return null;
        return {pointsEarned: pontos};
      });
      if (outcome.status === "migrated") {
        console.log(
          `  ${alvo.doc.id}: ${outcome.before.pointsEarned} → ${outcome.update.pointsEarned}`,
        );
        migrated++;
      } else if (outcome.status === "unchanged") {
        console.log(`  ${alvo.doc.id}: já estava no valor final na releitura — pulado`);
      } else {
        console.log(`  ${alvo.doc.id}: doc sumiu entre a varredura e a transação — pulado`);
      }
    } catch (err) {
      errors++;
      console.error(`  ${alvo.doc.id}: ERRO na transação —`, err && err.message ? err.message : err);
    }
  }
  return {migrated, errors, candidatos: candidatos.length, total: snap.size};
}

/** Recalcula `results[]`; devolve `null` quando nenhum ponto muda. */
async function recomputeResults(fresh) {
  const results = Array.isArray(fresh.results) ? fresh.results : [];
  let mudou = false;
  const novos = [];
  for (const r of results) {
    const pontos = await recomputeEntry(r);
    if (pontos == null || pontos === Number(r.points)) {
      novos.push(r);
      continue;
    }
    novos.push({...r, points: pontos});
    mudou = true;
  }
  if (!mudou) return null;
  const agregados = aggregateRankingResults(novos);
  return {
    results: novos,
    totalPoints: agregados.totalPoints,
    tournamentsCount: agregados.tournamentsCount,
    pointsByYear: agregados.pointsByYear,
  };
}

async function migrateRankingCollection(coll) {
  const snap = await db.collection(dataPath(coll)).get();

  const candidatos = [];
  for (const doc of snap.docs) {
    const update = await recomputeResults(doc.data());
    if (update) candidatos.push({doc, update});
  }
  const alvos = LIMIT > 0 ? candidatos.slice(0, LIMIT) : candidatos;

  console.log(
    `\n[${coll}] ${snap.size} doc(s), ${candidatos.length} mudariam` +
      (LIMIT > 0 ? `, processando ${alvos.length} (--limit ${LIMIT})` : "") +
      ":",
  );

  let migrated = 0;
  let errors = 0;
  for (const alvo of alvos) {
    try {
      const outcome = await migrateOneDoc(alvo.doc.ref, (fresh) => recomputeResults(fresh));
      if (outcome.status === "migrated") {
        console.log(
          `  ${coll}/${alvo.doc.id}: total ${outcome.before.totalPoints} → ${outcome.update.totalPoints}`,
        );
        migrated++;
      } else if (outcome.status === "unchanged") {
        console.log(`  ${coll}/${alvo.doc.id}: já estava no valor final na releitura — pulado`);
      } else {
        console.log(`  ${coll}/${alvo.doc.id}: doc sumiu entre a varredura e a transação — pulado`);
      }
    } catch (err) {
      errors++;
      console.error(
        `  ${coll}/${alvo.doc.id}: ERRO na transação —`,
        err && err.message ? err.message : err,
      );
    }
  }
  return {migrated, errors, candidatos: candidatos.length, total: snap.size};
}

// ---------------------------------------------------------------------------
// Relatório.
// ---------------------------------------------------------------------------

function imprimirContextos() {
  console.log("\nContexto por categoria (peso aplicado):");
  const resolvidos = [...contextos.values()];
  if (resolvidos.length === 0) {
    console.log("  (nenhuma entrada no histórico)");
    return;
  }
  for (const ctx of resolvidos) {
    if (!ctx.ok) {
      console.log(
        `  ✗ ${ctx.tournamentName ?? ctx.tournamentId} / ${ctx.categoryName ?? ctx.categoryId}: ${ctx.motivo}`,
      );
      continue;
    }
    const origem = ctx.inferred
      ? `inferido pelo teto "${ctx.level}"`
      : `faixa "${ctx.minLevel}".."${ctx.level}"`;
    console.log(
      `  • ${ctx.tournamentName} / ${ctx.categoryName}\n` +
        `      preset=${ctx.presetKey ?? "legado"} (${origem}) peso=${ctx.weight}` +
        ` · rankingWeight=${ctx.rankingWeight} · pagas=${ctx.paidTeams} → fatorChave=${ctx.bracketFactor}` +
        ` · multiplicador=${(ctx.weight * ctx.rankingWeight * ctx.bracketFactor).toFixed(4)}`,
    );
  }
}

function imprimirGate() {
  const reprovadas = [...contextos.values()].filter((c) => c.ok && !c.elegivelHoje);
  if (reprovadas.length === 0) return;
  console.log(
    "\nAtenção — categorias que HOJE não passariam no gate do ranking geral " +
      `(mínimo ${MIN_TEAMS_FOR_GLOBAL_RANKING} duplas pagas, ou rankingEnabled desligado).` +
      "\nOs pontos foram MANTIDOS (este script não reavalia elegibilidade); decida caso a caso:",
  );
  for (const ctx of reprovadas) {
    console.log(
      `  - ${ctx.tournamentName} / ${ctx.categoryName}: pagas=${ctx.paidTeams}, ` +
        `rankingEnabled=${ctx.rankingEnabled}`,
    );
  }
}

async function run() {
  console.log(
    APPLY
      ? `Aplicando recálculo de pesos do ranking em ${projectId}…`
      : `DRY-RUN em ${projectId} (passe --yes para escrever).`,
  );

  const resultsOutcome = await migrateTournamentCategoryResults();
  const athletesOutcome = await migrateRankingCollection("athleteRankings");
  const teamsOutcome = await migrateRankingCollection("teamRankings");

  imprimirContextos();

  if (avisos.length > 0) {
    console.log("\nAvisos (entradas deixadas como estavam):");
    for (const a of avisos) console.log(`  ! ${a}`);
  }

  imprimirGate();

  const totalErrors = resultsOutcome.errors + athletesOutcome.errors + teamsOutcome.errors;

  console.log("\nResumo:");
  for (const [nome, o] of [
    ["tournamentCategoryResults", resultsOutcome],
    ["athleteRankings", athletesOutcome],
    ["teamRankings", teamsOutcome],
  ]) {
    console.log(
      `  ${nome}: ${o.migrated} alterado(s) de ${o.candidatos} candidato(s) ` +
        `em ${o.total} doc(s), ${o.errors} erro(s)`,
    );
  }
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

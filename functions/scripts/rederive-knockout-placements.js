/* eslint-disable */
/**
 * Re-derivação da colocação do histórico pela ESTRUTURA da chave (19/08).
 *
 * PROBLEMA: até a escada por fase alcançada, o motor só tinha dois destinos
 * abaixo do pódio — `quarters` para qualquer eliminação de mata-mata e `groups`
 * para participação. Numa chave de 22 duplas, as 18 eliminadas (da 5ª à 22ª
 * colocação) foram TODAS carimbadas `finalPlace: 5`: quem caiu na primeira
 * rodada da losers recebeu o mesmo que quem chegou às quartas. Como o formato
 * do torneio decidia a pontuação, a mesma campanha valia 3,3× mais em dupla
 * eliminação do que em fase de grupos.
 *
 * O QUE FAZ: para cada categoria já encerrada, lê as partidas gravadas, chama
 * `placementTiersFromMatches` — a MESMA função que o motor usa na premiação
 * (cópia JS travada pelo teste de paridade) — descobre em que rodada cada dupla
 * caiu, reescreve `finalPlace` e recalcula os pontos com a fórmula vigente:
 * `base × pesoPreset × rankingWeight × fatorChave`, reaproveitando
 * `scripts/lib/ranking-recompute.js` (PR #258).
 *
 * Como o doc de atleta não guarda `teamId`, a ponte atleta→dupla sai dos
 * membros do time (`memberUids`, ou player1Id/player2Id no formato antigo).
 *
 * O QUE NÃO FAZ:
 *   - NÃO mexe no pódio: resultado com `finalPlace` entre 1 e 4 tem só os
 *     pontos recalculados; a colocação é preservada como está.
 *   - NÃO reavalia elegibilidade (gate de 10 duplas pagas / `rankingEnabled`).
 *   - NÃO adivinha: categoria cuja chave não fecha fica intocada e reportada.
 *
 * ORDEM: este script roda ANTES de `recompute-ranking-weights.js`. É ele quem
 * converte o contrato antigo de `finalPlace` (9 = participação) para o novo
 * (9 = oitavas, 0 = participação); rodar o outro primeiro promoveria quem caiu
 * na fase de grupos a oitavas.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/rederive-knockout-placements.js --project volley-track-dev-4596c
 *   node scripts/rederive-knockout-placements.js --project <id> --yes
 *   node scripts/rederive-knockout-placements.js --project <id> --yes --limit 50
 *
 * Sem --yes é DRY-RUN. Idempotente: doc já no valor final não é reescrito.
 */

const admin = require("firebase-admin");
const {placementTiersFromMatches} = require("./lib/bracket-placement-tiers");
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

const dataPath = (coll) => `artifacts/${projectId}/public/data/${coll}`;

/** Cópia de `normalizeMatchType` (functions/src/match-status.ts). */
function normalizeMatchType(raw) {
  return String(raw ?? "").trim().toLowerCase().replace(/_/g, " ");
}

/** Topo da faixa de cada degrau — mesmo mapa de `finalPlaceForAward`. */
const FINAL_PLACE_BY_TIER = {quarters: 5, r16: 9, r32: 17};

const avisos = [];
function avisar(msg) {
  if (!avisos.includes(msg)) avisos.push(msg);
}

// ---------------------------------------------------------------------------
// Leitura da categoria.
// ---------------------------------------------------------------------------

const contextos = new Map();
const chaveDoPar = (tournamentId, categoryId) => `${tournamentId}|${categoryId}`;

async function contextFor(tournamentId, categoryId) {
  const chave = chaveDoPar(tournamentId, categoryId);
  if (!contextos.has(chave)) {
    contextos.set(chave, await resolveContext(tournamentId, categoryId));
  }
  return contextos.get(chave);
}

async function resolveContext(tournamentId, categoryId) {
  const base = {tournamentId, categoryId, ok: false};
  if (!tournamentId || !categoryId) {
    return {...base, motivo: "entrada sem tournamentId/categoryId"};
  }

  const snap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!snap.exists) return {...base, motivo: "torneio não existe mais"};
  const tournament = snap.data() || {};
  const categorias = Array.isArray(tournament.categories) ? tournament.categories : [];
  const categoria = categorias.find(
    (c) => String(c.id ?? c.categoryId ?? "") === String(categoryId),
  );

  const identidade = {
    ...base,
    tournamentName: tournament.name || "(sem nome)",
    categoryName: categoria?.name || categoria?.categoryName || "(categoria não encontrada)",
  };
  if (!categoria) return {...identidade, motivo: "categoria não está mais no torneio"};

  const peso = presetWeightForCategory(categoria);
  if (!peso) {
    return {
      ...identidade,
      motivo: `teto de nível irreconhecível (level=${JSON.stringify(categoria.level)})`,
    };
  }

  const matches = await loadMatches(tournamentId, categoryId);
  const paidTeams = await countPaidTeams(tournamentId, categoryId);

  return {
    ...identidade,
    ok: true,
    matches,
    tiers: placementTiersFromMatches(matches),
    weight: peso.weight,
    presetKey: peso.presetKey,
    inferred: peso.inferred,
    rankingWeight: sanitizeRankingWeight(tournament.rankingWeight),
    paidTeams,
    bracketFactor: bracketSizeFactor(paidTeams),
  };
}

async function loadMatches(tournamentId, categoryId) {
  const snap = await db
    .collection(dataPath("matches"))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();
  return snap.docs.map((doc) => ({id: doc.id, ...doc.data()}));
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
    if (d.isPaid !== true || d.waitlist === true) continue;
    const teamId = (d.teamId || "").trim();
    if (teamId) ids.add(teamId);
  }
  return ids.size;
}

/** Paridade com `extractTeamMemberUids` (functions/src/tournament-team-category.ts). */
async function loadTeamAthleteIds(teamId) {
  const snap = await db.doc(`${dataPath("teams")}/${teamId}`).get();
  if (!snap.exists) return [];
  const team = snap.data() || {};
  const out = [];
  const push = (raw) => {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (id && !out.includes(id)) out.push(id);
  };
  if (Array.isArray(team.memberUids)) {
    for (const raw of team.memberUids) push(raw);
    if (out.length > 0) return out;
  }
  push(team.player1Id);
  push(team.player2Id);
  return out;
}

// ---------------------------------------------------------------------------
// Re-derivação.
// ---------------------------------------------------------------------------

/**
 * Onde a dupla foi eliminada, segundo as partidas gravadas. Vale a partida de
 * rodada MAIS ALTA em que ela aparece como perdedora e que tenha degrau no
 * mapa: na dupla eliminação a mesma dupla perde na WB (sem ser eliminada) antes
 * de perder na LB, e é a segunda derrota que define a colocação.
 *
 * Devolve 0 (participação, "sem colocação de mata-mata") quando a dupla não
 * perdeu nenhuma partida com degrau — o caso de quem caiu na fase de grupos.
 */
function finalPlaceForTeam(teamId, matches, tiers) {
  let melhor = null;
  for (const match of matches) {
    const tipo = normalizeMatchType(match.matchType);
    const round = Number(match.round ?? 0);
    const winnerId = (match.winnerId || "").trim();
    if (!winnerId || winnerId === teamId) continue;
    const lados = [(match.teamAId || "").trim(), (match.teamBId || "").trim()];
    if (!lados.includes(teamId)) continue;
    const tier =
      tipo === "lb" ? tiers.lb[round] : tipo === "knockout" ? tiers.knockout[round] : undefined;
    if (!tier) continue;
    if (!melhor || round > melhor.round) melhor = {round, tier};
  }
  return melhor ? FINAL_PLACE_BY_TIER[melhor.tier] : 0;
}

/**
 * Recusa a categoria inteira quando a chave não fecha. Chave torta some do
 * radar se o script "consertar" o que não entende — mesma disciplina do
 * recálculo de pesos (PR #258).
 */
function motivoParaRecusar(ctx, resultados) {
  if (!ctx.matches || ctx.matches.length === 0) return "sem partidas gravadas";
  for (const match of ctx.matches) {
    const tipo = normalizeMatchType(match.matchType);
    if (tipo === "group" || tipo === "groups" || match.isGroupMatch === true) continue;
    if (String(match.status) !== "completed") continue;
    if (!(match.winnerId || "").trim()) {
      return `partida ${match.id} concluída sem winnerId`;
    }
  }
  const podio = resultados.filter(
    (r) => Number(r.finalPlace) >= 1 && Number(r.finalPlace) <= 4,
  );
  if (podio.length !== 4) {
    return `pódio gravado tem ${podio.length} dupla(s), esperado 4`;
  }
  return null;
}

/**
 * Colocação e pontos novos de UMA dupla. Pódio é intocável: 1º-4º mantém a
 * colocação gravada e só tem os pontos recalculados.
 */
function novoResultadoDaDupla(teamId, finalPlaceAtual, ctx) {
  const atual = Number(finalPlaceAtual);
  const finalPlace =
    atual >= 1 && atual <= 4 ? atual : finalPlaceForTeam(teamId, ctx.matches, ctx.tiers);
  return {finalPlace, points: pointsForEntry(finalPlace, ctx)};
}

/**
 * Monta, para cada par (torneio, categoria), o resultado novo de cada dupla e
 * de cada atleta. Só pares aprovados por `motivoParaRecusar` entram.
 */
async function montarPlano() {
  const snap = await db.collection(dataPath("tournamentCategoryResults")).get();

  const porPar = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    const chave = chaveDoPar(d.tournamentId, d.categoryId);
    if (!porPar.has(chave)) porPar.set(chave, []);
    porPar.get(chave).push({id: doc.id, ref: doc.ref, ...d});
  }

  const plano = new Map();
  for (const [chave, resultados] of porPar) {
    const [tournamentId, categoryId] = chave.split("|");
    const ctx = await contextFor(tournamentId, categoryId);
    if (!ctx.ok) {
      avisar(
        `${ctx.tournamentName ?? tournamentId} / ${ctx.categoryName ?? categoryId}: ${ctx.motivo}` +
          " — categoria não tocada",
      );
      continue;
    }
    const recusa = motivoParaRecusar(ctx, resultados);
    if (recusa) {
      avisar(`${ctx.tournamentName} / ${ctx.categoryName}: ${recusa} — categoria não tocada`);
      continue;
    }

    const porDupla = new Map();
    const porAtleta = new Map();
    for (const r of resultados) {
      const teamId = (r.teamId || "").trim();
      if (!teamId) continue;
      const novo = novoResultadoDaDupla(teamId, r.finalPlace, ctx);
      porDupla.set(teamId, novo);
      for (const uid of await loadTeamAthleteIds(teamId)) porAtleta.set(uid, novo);
    }
    plano.set(chave, {ctx, resultados, porDupla, porAtleta});
  }
  return plano;
}

// ---------------------------------------------------------------------------
// Escrita.
// ---------------------------------------------------------------------------

async function migrateOneDoc(ref, computeUpdate) {
  return db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) return {status: "missing"};
    const update = computeUpdate(snap.data());
    if (update == null) return {status: "unchanged"};
    if (APPLY) txn.update(ref, update);
    return {status: "migrated", update, before: snap.data()};
  });
}

async function escreverResultadosDeCategoria(plano) {
  const candidatos = [];
  for (const {resultados, porDupla} of plano.values()) {
    for (const r of resultados) {
      const novo = porDupla.get((r.teamId || "").trim());
      if (!novo || novo.points == null) continue;
      if (Number(r.finalPlace) === novo.finalPlace && Number(r.pointsEarned) === novo.points) {
        continue;
      }
      candidatos.push({r, novo});
    }
  }
  const alvos = LIMIT > 0 ? candidatos.slice(0, LIMIT) : candidatos;
  console.log(`\n[tournamentCategoryResults] ${candidatos.length} doc(s) mudariam:`);

  let migrated = 0;
  let errors = 0;
  for (const {r, novo} of alvos) {
    try {
      const outcome = await migrateOneDoc(r.ref, (fresh) => {
        if (Number(fresh.finalPlace) === novo.finalPlace && Number(fresh.pointsEarned) === novo.points) {
          return null;
        }
        return {finalPlace: novo.finalPlace, pointsEarned: novo.points};
      });
      if (outcome.status === "migrated") {
        console.log(
          `  ${r.id}: colocação ${r.finalPlace} → ${novo.finalPlace}, ` +
            `pontos ${r.pointsEarned} → ${novo.points}`,
        );
        migrated++;
      }
    } catch (err) {
      errors++;
      console.error(`  ${r.id}: ERRO na transação —`, err && err.message ? err.message : err);
    }
  }
  return {migrated, errors, candidatos: candidatos.length};
}

/** Recalcula `results[]` de um doc de ranking; `null` quando nada muda. */
function recomputeResults(fresh, plano, chaveDoDono) {
  const results = Array.isArray(fresh.results) ? fresh.results : [];
  let mudou = false;
  const novos = results.map((entry) => {
    const par = plano.get(chaveDoPar(entry.tournamentId, entry.categoryId));
    if (!par) return entry;
    const novo = chaveDoDono(par);
    if (!novo || novo.points == null) return entry;
    if (Number(entry.finalPlace) === novo.finalPlace && Number(entry.points) === novo.points) {
      return entry;
    }
    mudou = true;
    return {...entry, finalPlace: novo.finalPlace, points: novo.points};
  });
  if (!mudou) return null;
  const agregados = aggregateRankingResults(novos);
  return {
    results: novos,
    totalPoints: agregados.totalPoints,
    tournamentsCount: agregados.tournamentsCount,
    pointsByYear: agregados.pointsByYear,
  };
}

async function escreverRanking(coll, plano, seletor) {
  const snap = await db.collection(dataPath(coll)).get();

  const candidatos = [];
  for (const doc of snap.docs) {
    const update = recomputeResults(doc.data(), plano, (par) => seletor(par, doc.id));
    if (update) candidatos.push({doc, update});
  }
  const alvos = LIMIT > 0 ? candidatos.slice(0, LIMIT) : candidatos;
  console.log(`\n[${coll}] ${candidatos.length} doc(s) mudariam de ${snap.size}:`);

  let migrated = 0;
  let errors = 0;
  for (const alvo of alvos) {
    try {
      const outcome = await migrateOneDoc(alvo.doc.ref, (fresh) =>
        recomputeResults(fresh, plano, (par) => seletor(par, alvo.doc.id)),
      );
      if (outcome.status === "migrated") {
        console.log(
          `  ${coll}/${alvo.doc.id}: total ${outcome.before.totalPoints} → ${outcome.update.totalPoints}`,
        );
        migrated++;
      }
    } catch (err) {
      errors++;
      console.error(`  ${coll}/${alvo.doc.id}: ERRO —`, err && err.message ? err.message : err);
    }
  }
  return {migrated, errors, candidatos: candidatos.length, total: snap.size};
}

function imprimirContextos(plano) {
  console.log("\nContexto por categoria:");
  if (plano.size === 0) {
    console.log("  (nenhuma categoria elegível)");
    return;
  }
  for (const {ctx, porDupla} of plano.values()) {
    const degraus = {};
    for (const {finalPlace} of porDupla.values()) {
      degraus[finalPlace] = (degraus[finalPlace] || 0) + 1;
    }
    const rotulo = {0: "participação", 5: "quartas", 9: "oitavas", 17: "16-avos"};
    const resumo = Object.entries(degraus)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([place, n]) => `${n}× ${rotulo[place] ?? `${place}º`}`)
      .join(" · ");
    console.log(
      `  • ${ctx.tournamentName} / ${ctx.categoryName}\n` +
        `      peso=${ctx.weight} · rankingWeight=${ctx.rankingWeight} · pagas=${ctx.paidTeams}` +
        ` → fatorChave=${ctx.bracketFactor}\n` +
        `      distribuição: ${resumo}`,
    );
  }
}

async function run() {
  console.log(
    APPLY
      ? `Aplicando re-derivação de colocação em ${projectId}…`
      : `DRY-RUN em ${projectId} (passe --yes para escrever).`,
  );

  const plano = await montarPlano();

  const resultados = await escreverResultadosDeCategoria(plano);
  const atletas = await escreverRanking(
    "athleteRankings",
    plano,
    (par, docId) => par.porAtleta.get(docId),
  );
  const duplas = await escreverRanking(
    "teamRankings",
    plano,
    (par, docId) => par.porDupla.get(docId),
  );

  imprimirContextos(plano);

  if (avisos.length > 0) {
    console.log("\nAvisos (nada foi escrito nestes casos):");
    for (const a of avisos) console.log(`  ! ${a}`);
  }

  const totalErrors = resultados.errors + atletas.errors + duplas.errors;
  console.log("\nResumo:");
  console.log(
    `  tournamentCategoryResults: ${resultados.migrated} alterado(s) de ${resultados.candidatos} candidato(s), ${resultados.errors} erro(s)`,
  );
  console.log(
    `  athleteRankings: ${atletas.migrated} alterado(s) de ${atletas.candidatos} candidato(s) em ${atletas.total} doc(s), ${atletas.errors} erro(s)`,
  );
  console.log(
    `  teamRankings: ${duplas.migrated} alterado(s) de ${duplas.candidatos} candidato(s) em ${duplas.total} doc(s), ${duplas.errors} erro(s)`,
  );
  if (!APPLY) console.log("  (dry-run — nada escrito; rode de novo com --yes)");
  if (totalErrors > 0) {
    console.error(`\n${totalErrors} doc(s) falharam — revise antes de reexecutar.`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

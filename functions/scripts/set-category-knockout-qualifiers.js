/* eslint-disable */
/**
 * Muda o número de CLASSIFICADOS POR GRUPO de uma categoria
 * `groups_knockout` e refaz SÓ a fase de mata-mata — sem tocar em nenhum jogo
 * de grupo (nem nos resultados já lançados).
 *
 * Caso típico: categoria com 2 grupos e 2 classificados cai direto na
 * SEMIFINAL. Passando `--qualifiers 4`, os 4 melhores de cada grupo passam e a
 * chave ganha QUARTAS DE FINAL (2 grupos × 4 = 8 classificados).
 *
 * Por que não regerar a chave pelo portal: `generateCategoryBracket` APAGA e
 * recria TODAS as partidas da categoria, inclusive os jogos de grupo já
 * jogados. Este script só substitui as partidas de mata-mata.
 *
 * O que faz:
 *   - Reconstrói o mata-mata com a MESMA função do servidor
 *     (`buildGroupsKnockoutMatches`), então o cruzamento sai idêntico ao que o
 *     portal geraria com esse número de classificados.
 *   - Renumera o mata-mata a partir do maior `matchNumber` de grupo que existe
 *     de fato no banco (e desloca junto `winnerAdvance`/`loserAdvance`).
 *   - Grava `teamAQualifier`/`teamBQualifier` ("1º Grupo A"…), então as duplas
 *     entram sozinhas quando os grupos terminarem, via
 *     `tryFillKnockoutFromGroupStandings`.
 *   - Atualiza `qualifiersPerGroup` em `categoryOps.<cat>.bracketConfig` e em
 *     `categories[]`, para o portal e o app lerem o mesmo número.
 *
 * O que NÃO faz (de propósito):
 *   - mexer em jogos de grupo, placares, inscrições ou grupos (`groupsPreview`)
 *   - notificar atletas (a callable notifica; aqui é operação manual)
 *   - suportar `single_elimination` / `double_elimination`
 *
 * Pré-requisitos:
 *   npm run build            # o script usa ../lib (build do TypeScript)
 *   firebase login           # a ADC do Firebase CLI já basta
 *
 * Uso (na pasta functions/):
 *   # 1) dry-run (não escreve nada):
 *   node scripts/set-category-knockout-qualifiers.js \
 *     --project volley-track-dev-4596c \
 *     --tournament TmiRySyk6vH0WeDlCsRj \
 *     --category "Feminino Intermediário" \
 *     --qualifiers 4
 *
 *   # 2) aplicar:
 *   … --yes
 *
 * Flags:
 *   --project <id>       projeto (ou GCLOUD_PROJECT). Obrigatório.
 *   --tournament <id>    id do torneio. Obrigatório.
 *   --category <id|nome> id ou nome da categoria. Obrigatório.
 *   --qualifiers <n>     classificados por grupo. Obrigatório.
 *   --yes                aplica; sem isso é DRY-RUN.
 *   --force              ignora as guardas (mata-mata com resultado / fase de
 *                        grupos que não bate com o `groupsPreview`).
 */

const admin = require("firebase-admin");
const {
  buildGroupsKnockoutMatches,
  isBalancedQualifierTotal,
} = require("../lib/category-bracket-builders");
const {
  isMatchCompleted,
  isMatchInProgress,
  MatchStatus,
} = require("../lib/match-status");
const {artifactsMatchesPath} = require("../lib/firebase-paths");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const FORCE = process.argv.includes("--force");

const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const tournamentId = (argValue("--tournament") || "").trim();
const categoryRaw = (argValue("--category") || "").trim();
const qualifiers = Number(argValue("--qualifiers"));

if (!projectId) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}
if (!tournamentId) {
  console.error("Informe --tournament <tournamentId>");
  process.exit(1);
}
if (!categoryRaw) {
  console.error("Informe --category <id|nome>");
  process.exit(1);
}
if (!Number.isInteger(qualifiers) || qualifiers < 1) {
  console.error("Informe --qualifiers <n> (inteiro >= 1)");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const matchesPath = artifactsMatchesPath(projectId);

function normalizeKey(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function categoryInscriptionId(category) {
  return String(category?.id ?? category?.categoryId ?? "").trim();
}

function categoryDisplayName(category) {
  return String(category?.categoryName ?? category?.name ?? "").trim();
}

function findCategory(tournament, rawKey) {
  const categories = Array.isArray(tournament?.categories)
    ? tournament.categories
    : [];
  const key = normalizeKey(rawKey);
  if (!key) return null;
  for (const c of categories) {
    if (normalizeKey(categoryInscriptionId(c)) === key) return c;
    if (normalizeKey(categoryDisplayName(c)) === key) return c;
  }
  const partial = categories.filter((c) => {
    const name = normalizeKey(categoryDisplayName(c));
    return name && (name.includes(key) || key.includes(name));
  });
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    console.error(`"${rawKey}" casa com mais de uma categoria:`);
    for (const c of partial) {
      console.error(`  ${categoryInscriptionId(c)} — ${categoryDisplayName(c)}`);
    }
    process.exit(1);
  }
  return null;
}

function isGroupStageMatch(data) {
  if (data.isGroupMatch === true) return true;
  const type = String(data.matchType ?? "").trim().toLowerCase();
  return type === "group" || type === "groups";
}

function hasResult(data) {
  const winnerId = String(data.winnerId ?? "").trim();
  return (
    isMatchCompleted(data.status) ||
    isMatchInProgress(data.status) ||
    winnerId.length > 0
  );
}

function matchLabel(data) {
  const a = String(data.teamAId ?? "").trim() || data.teamADescription || "?";
  const b = String(data.teamBId ?? "").trim() || data.teamBDescription || "?";
  return `r${data.round} #${data.matchNumber} [${data.matchType}] ${a} × ${b}`;
}

/** Desloca a numeração global do mata-mata (e os ponteiros de avanço). */
function shiftMatchNumbers(drafts, offset) {
  if (offset === 0) return drafts;
  return drafts.map((draft) => {
    const next = {...draft, matchNumber: draft.matchNumber + offset};
    if (draft.winnerAdvance) {
      next.winnerAdvance = {
        ...draft.winnerAdvance,
        matchNumber: draft.winnerAdvance.matchNumber + offset,
      };
    }
    if (draft.loserAdvance) {
      next.loserAdvance = {
        ...draft.loserAdvance,
        matchNumber: draft.loserAdvance.matchNumber + offset,
      };
    }
    return next;
  });
}

/** Placeholders "Vencedor Jogo #N" são gerados com a numeração antiga. */
function shiftDescriptions(drafts, offset) {
  if (offset === 0) return drafts;
  const fix = (text) =>
    typeof text === "string"
      ? text.replace(/Jogo #(\d+)/g, (_, n) => `Jogo #${Number(n) + offset}`)
      : text;
  return drafts.map((draft) => {
    const next = {...draft};
    if (next.teamADescription) next.teamADescription = fix(next.teamADescription);
    if (next.teamBDescription) next.teamBDescription = fix(next.teamBDescription);
    return next;
  });
}

/**
 * Confere a chave montada ANTES de gravar: numeração única, todo ponteiro de
 * avanço apontando para uma partida que existe e todo "Jogo #N" citando um
 * número real. Uma chave com ponteiro solto não avança sozinha e só aparece no
 * dia do jogo — nem `--force` passa por cima disso.
 */
function assertConsistency(matches) {
  const numbers = matches.map((m) => m.matchNumber);
  const known = new Set(numbers);
  const problems = [];

  if (known.size !== numbers.length) {
    problems.push(`matchNumber repetido em ${numbers.join(", ")}`);
  }
  for (const m of matches) {
    for (const [field, slot] of [
      ["winnerAdvance", m.winnerAdvance],
      ["loserAdvance", m.loserAdvance],
    ]) {
      if (slot && !known.has(slot.matchNumber)) {
        problems.push(
          `#${m.matchNumber}.${field} aponta para #${slot.matchNumber}, que não existe`,
        );
      }
    }
    for (const text of [m.teamADescription, m.teamBDescription]) {
      const ref = typeof text === "string" ? text.match(/Jogo #(\d+)/) : null;
      if (ref && !known.has(Number(ref[1]))) {
        problems.push(`#${m.matchNumber} cita "${text}", mas #${ref[1]} não existe`);
      }
    }
  }

  if (problems.length > 0) {
    console.error("Chave gerada inconsistente — nada foi escrito:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

async function loadTournament() {
  const snap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!snap.exists) {
    throw new Error(`Torneio não encontrado: tournaments/${tournamentId}`);
  }
  return {id: snap.id, ...(snap.data() ?? {})};
}

async function run() {
  const tournament = await loadTournament();
  const category = findCategory(tournament, categoryRaw);
  if (!category) {
    console.error(`Categoria não encontrada: ${categoryRaw}`);
    console.error(
      "Categorias:",
      (tournament.categories ?? [])
        .map((c) => `${categoryInscriptionId(c)} (${categoryDisplayName(c)})`)
        .join(", "),
    );
    process.exit(1);
  }
  const categoryId = categoryInscriptionId(category);
  const categoryLabel = categoryDisplayName(category) || categoryId;

  const ops = (tournament.categoryOps ?? {})[categoryId];
  if (!ops) {
    console.error(
      `A categoria ${categoryLabel} (${categoryId}) não tem chave publicada ` +
        "(categoryOps ausente). Publique a chave pelo portal primeiro.",
    );
    process.exit(1);
  }

  const format = String(
    ops.bracketFormatOverride ?? category.bracketFormat ?? "",
  ).trim();
  if (format !== "groups_knockout") {
    console.error(
      `Este script só trata "groups_knockout" — a categoria está em "${format}".`,
    );
    process.exit(1);
  }

  const groups = (Array.isArray(ops.groupsPreview) ? ops.groupsPreview : [])
    .map((g) => ({
      id: String(g?.id ?? "").trim(),
      teamIds: (Array.isArray(g?.teamIds) ? g.teamIds : [])
        .map((id) => String(id).trim())
        .filter(Boolean),
    }))
    .filter((g) => g.id && g.teamIds.length > 0);
  if (groups.length === 0) {
    console.error("categoryOps.groupsPreview vazio — não há grupos para classificar.");
    process.exit(1);
  }

  const seeds = (Array.isArray(ops.seeds) ? ops.seeds : [])
    .map((id) => String(id).trim())
    .filter(Boolean);
  const currentQualifiers =
    ops.bracketConfig?.qualifiersPerGroup ?? category.qualifiersPerGroup ?? 2;

  // --- Guardas de configuração ---
  const blockers = [];
  const tooSmall = groups.find((g) => g.teamIds.length < qualifiers);
  if (tooSmall) {
    blockers.push(
      `o grupo ${tooSmall.id} tem ${tooSmall.teamIds.length} dupla(s), ` +
        `menos que os ${qualifiers} classificados pedidos`,
    );
  }
  const totalQualifiers = groups.length * qualifiers;
  if (!isBalancedQualifierTotal(totalQualifiers)) {
    blockers.push(
      `${totalQualifiers} classificados (${groups.length} grupos × ${qualifiers}) ` +
        "não formam um mata-mata equilibrado (precisa ser 2, 4, 8, 16…)",
    );
  }
  if (blockers.length > 0) {
    console.error("Bloqueado:");
    for (const b of blockers) console.error(`  - ${b}`);
    process.exit(1);
  }

  // --- Partidas atuais ---
  const snap = await db
    .collection(matchesPath)
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const groupDocs = snap.docs.filter((d) => isGroupStageMatch(d.data()));
  const knockoutDocs = snap.docs.filter((d) => !isGroupStageMatch(d.data()));
  if (groupDocs.length === 0) {
    console.error("Nenhum jogo de grupo encontrado — a chave não está publicada.");
    process.exit(1);
  }

  const played = knockoutDocs.filter((d) => hasResult(d.data()));
  const maxGroupNumber = groupDocs.reduce(
    (max, d) => Math.max(max, Number(d.data().matchNumber) || 0),
    0,
  );

  // --- Novo mata-mata, pela mesma função do servidor ---
  const allDrafts = buildGroupsKnockoutMatches(seeds, groups, qualifiers);
  const generatedGroupCount = allDrafts.filter((d) => d.isGroupMatch).length;
  const knockoutDrafts = allDrafts.filter((d) => !d.isGroupMatch);

  // A numeração é global e contínua: o mata-mata gerado começa logo depois dos
  // jogos de grupo GERADOS. Deslocamos para continuar os que existem de fato.
  const generatedStart = Math.min(...knockoutDrafts.map((d) => d.matchNumber));
  const offset = maxGroupNumber + 1 - generatedStart;
  const newMatches = shiftDescriptions(
    shiftMatchNumbers(knockoutDrafts, offset),
    offset,
  );
  assertConsistency(newMatches);

  const warnings = [];
  if (generatedGroupCount !== groupDocs.length) {
    warnings.push(
      `a fase de grupos gerada pelo groupsPreview tem ${generatedGroupCount} jogos, ` +
        `mas existem ${groupDocs.length} no banco — os grupos salvos podem estar ` +
        "desatualizados em relação às partidas",
    );
  }
  const poolIdsInMatches = new Set(
    groupDocs.map((d) => String(d.data().poolId ?? "").trim()).filter(Boolean),
  );
  const missingPools = groups
    .map((g) => g.id)
    .filter((id) => !poolIdsInMatches.has(id));
  if (missingPools.length > 0) {
    warnings.push(
      `grupos sem nenhum jogo no banco: ${missingPools.join(", ")}`,
    );
  }

  // --- Relatório ---
  console.log(APPLY ? "APLICANDO mudança…" : "DRY-RUN (passe --yes para escrever)");
  console.log(`  projeto:      ${projectId}`);
  console.log(`  torneio:      ${tournament.name || tournamentId} (${tournamentId})`);
  console.log(`  categoria:    ${categoryLabel} (${categoryId})`);
  console.log(`  formato:      ${format}`);
  console.log(
    `  grupos:       ${groups.map((g) => `${g.id}:${g.teamIds.length}`).join(", ")}`,
  );
  console.log(`  classificados: ${currentQualifiers} → ${qualifiers} por grupo ` +
    `(${totalQualifiers} no mata-mata)`);
  console.log(`  jogos de grupo: ${groupDocs.length} (intocados; até #${maxGroupNumber})`);

  console.log(`\n  mata-mata atual (${knockoutDocs.length} partidas — serão APAGADAS):`);
  for (const doc of knockoutDocs
    .slice()
    .sort(
      (a, b) =>
        (a.data().round - b.data().round) ||
        (a.data().matchNumber - b.data().matchNumber),
    )) {
    const d = doc.data();
    console.log(
      `    ${matchLabel(d)} status=${d.status}` +
        (hasResult(d) ? "  <-- TEM RESULTADO" : ""),
    );
  }

  console.log(`\n  mata-mata novo (${newMatches.length} partidas):`);
  for (const m of newMatches) {
    const a = m.teamAId || m.teamADescription || "?";
    const b = m.teamBId || m.teamBDescription || "?";
    const adv = m.winnerAdvance
      ? ` → vencedor p/ #${m.winnerAdvance.matchNumber}.${m.winnerAdvance.teamSlot === "teamAId" ? "A" : "B"}`
      : "";
    console.log(`    r${m.round} #${m.matchNumber} [${m.matchType}] ${a} × ${b}${adv}`);
  }

  if (played.length > 0) {
    warnings.push(
      `${played.length} partida(s) de mata-mata já têm resultado/andamento e ` +
        "serão apagadas",
    );
  }
  if (warnings.length > 0) {
    console.log("\n  Atenção:");
    for (const w of warnings) console.log(`    - ${w}`);
    if (!FORCE) {
      console.error("\nBloqueado. Revise acima e rode com --force se for mesmo isso.");
      process.exit(1);
    }
    console.log("    (--force informado, seguindo assim mesmo)");
  }

  if (!APPLY) {
    console.log("\nPlano:");
    console.log(`  1. apagar ${knockoutDocs.length} partidas de mata-mata`);
    console.log(`  2. criar ${newMatches.length} partidas (#${newMatches[0].matchNumber}…#${newMatches[newMatches.length - 1].matchNumber})`);
    console.log(`  3. categoryOps.${categoryId}.bracketConfig.qualifiersPerGroup = ${qualifiers}`);
    console.log(`  4. categories[${categoryId}].qualifiersPerGroup = ${qualifiers}`);
    console.log("\nNada escrito. Rode de novo com --yes.");
    return;
  }

  // --- Escrita ---
  const batch = db.batch();
  const col = db.collection(matchesPath);

  for (const doc of knockoutDocs) batch.delete(doc.ref);

  for (const draft of newMatches) {
    batch.set(col.doc(), {
      tournamentId,
      categoryId,
      round: draft.round,
      matchType: draft.matchType,
      poolId: draft.poolId,
      teamAId: draft.teamAId,
      teamBId: draft.teamBId,
      status: MatchStatus.scheduled,
      resultA: "",
      resultB: "",
      isGroupMatch: draft.isGroupMatch,
      matchNumber: draft.matchNumber,
      ...(draft.winnerAdvance ? {winnerAdvance: draft.winnerAdvance} : {}),
      ...(draft.loserAdvance ? {loserAdvance: draft.loserAdvance} : {}),
      ...(draft.teamAQualifier ? {teamAQualifier: draft.teamAQualifier} : {}),
      ...(draft.teamBQualifier ? {teamBQualifier: draft.teamBQualifier} : {}),
      ...(draft.teamADescription ? {teamADescription: draft.teamADescription} : {}),
      ...(draft.teamBDescription ? {teamBDescription: draft.teamBDescription} : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // `categories` é um array — reescreve só o item da categoria.
  const nextCategories = (tournament.categories ?? []).map((c) =>
    categoryInscriptionId(c) === categoryId
      ? {...c, qualifiersPerGroup: qualifiers}
      : c,
  );

  batch.set(
    db.doc(`tournaments/${tournamentId}`),
    {
      categories: nextCategories,
      categoryOps: {
        [categoryId]: {
          bracketConfig: {
            ...(ops.bracketConfig ?? {}),
            qualifiersPerGroup: qualifiers,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  await batch.commit();

  console.log(
    `\nOK — ${knockoutDocs.length} partidas apagadas, ${newMatches.length} criadas.`,
  );
  console.log(
    "As duplas entram nas novas partidas sozinhas quando os grupos terminarem " +
      "(tryFillKnockoutFromGroupStandings).",
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

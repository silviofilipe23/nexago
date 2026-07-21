/* eslint-disable */
/**
 * Transfere a inscrição de uma equipe (dupla) de uma categoria para outra
 * no mesmo torneio.
 *
 * Caso típico: "Silvio / Diogo" inscritos na categoria A → mover para B.
 *
 * O que atualiza:
 *   - inscriptions/{id}.categoryId (A → B)
 *   - cancela convites pendentes da categoria antiga
 *   - remove teamId de categoryOps[A].seeds / groupsPreview (se houver)
 *
 * O que NÃO faz (de propósito):
 *   - regenerar chave / mexer em matches
 *   - estorno ou ajuste de taxa
 *   - promover fila de espera automaticamente
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   # Dry-run: achar a dupla pelo nome
 *   node scripts/transfer-inscription-category.js \
 *     --project volley-track-dev-4596c \
 *     --tournament <tournamentId> \
 *     --to-category "<id ou nome da categoria destino>" \
 *     --names "Silvio,Diogo"
 *
 *   # Aplicar
 *   … --yes
 *
 *   # Por registrationId
 *   … --registration <registrationId> --to-category <B> --yes
 *
 * Flags extras:
 *   --from-category <A>     restringe a busca / valida origem
 *   --force-bracket         permite mesmo se a equipe estiver em matches da A
 *   --force-waitlist        se B estiver lotada, grava waitlist:true
 *   --ack-fee-delta         obrigatório se taxas A≠B e inscrição já paga
 *
 * Sem --yes é DRY-RUN (só imprime o plano).
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const FORCE_BRACKET = process.argv.includes("--force-bracket");
const FORCE_WAITLIST = process.argv.includes("--force-waitlist");
const ACK_FEE_DELTA = process.argv.includes("--ack-fee-delta");

const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const tournamentId = (argValue("--tournament") || "").trim();
const toCategoryRaw = (argValue("--to-category") || "").trim();
const fromCategoryRaw = (argValue("--from-category") || "").trim();
const registrationIdArg = (argValue("--registration") || "").trim();
const namesRaw = (argValue("--names") || "").trim();
const uidsRaw = (argValue("--uids") || "").trim();

if (!projectId) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}
if (!tournamentId) {
  console.error("Informe --tournament <tournamentId>");
  process.exit(1);
}
if (!toCategoryRaw) {
  console.error("Informe --to-category <id|nome>");
  process.exit(1);
}
if (!registrationIdArg && !namesRaw && !uidsRaw) {
  console.error("Informe --registration, --names \"A,B\" ou --uids u1,u2");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

function inscriptionsPath() {
  return `artifacts/${projectId}/public/data/inscriptions`;
}
function teamsPath() {
  return `artifacts/${projectId}/public/data/teams`;
}
function matchesPath() {
  return `artifacts/${projectId}/public/data/matches`;
}

function normalizeKey(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function nameTokens(raw) {
  return normalizeKey(raw)
    .split(/[\s/|,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function displayNameOf(userData) {
  if (!userData) return "";
  for (const k of ["fullName", "displayName", "nickname", "name"]) {
    const v = userData[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function categoryInscriptionId(category) {
  return String(category?.id ?? category?.categoryId ?? "").trim();
}

function categoryDisplayName(category) {
  return String(category?.categoryName ?? category?.name ?? "").trim();
}

function findCategory(tournament, rawKey) {
  const categories = Array.isArray(tournament?.categories) ? tournament.categories : [];
  const key = normalizeKey(rawKey);
  if (!key) return null;
  for (const c of categories) {
    const id = normalizeKey(categoryInscriptionId(c));
    const name = normalizeKey(categoryDisplayName(c));
    if (id === key || name === key) return c;
  }
  // Match parcial por nome (ex.: "Iniciante Masc")
  for (const c of categories) {
    const name = normalizeKey(categoryDisplayName(c));
    if (name && (name.includes(key) || key.includes(name))) return c;
  }
  return null;
}

function resolveCategoryEntryFeeCents(tournament, categoryId) {
  const categories = Array.isArray(tournament?.categories) ? tournament.categories : [];
  const cat = categories.find((c) => categoryInscriptionId(c) === categoryId);
  if (!cat) return 0;
  const cents = cat.entryFeeCents ?? cat.priceCents ?? cat.feeCents;
  if (typeof cents === "number" && Number.isFinite(cents)) return Math.round(cents);
  const reais = cat.entryFee ?? cat.price ?? cat.fee;
  if (typeof reais === "number" && Number.isFinite(reais)) return Math.round(reais * 100);
  return 0;
}

function maxTeamsOf(category) {
  const n =
    category?.maxTeams ??
    category?.spotsTotal ??
    category?.maxSpots ??
    category?.capacity;
  return typeof n === "number" && n > 0 ? Math.trunc(n) : null;
}

async function loadTournament() {
  const snap = await db.collection("tournaments").doc(tournamentId).get();
  if (!snap.exists) {
    throw new Error(`Torneio não encontrado: tournaments/${tournamentId}`);
  }
  return {id: snap.id, ...(snap.data() ?? {})};
}

async function loadUserLabel(uid) {
  const snap = await db.collection("users").doc(uid).get();
  const name = displayNameOf(snap.data());
  return name || uid;
}

async function athleteUidsFromInscription(data) {
  const uids = new Set();
  const teamId = typeof data.teamId === "string" ? data.teamId.trim() : "";
  if (teamId) {
    const teamSnap = await db.doc(`${teamsPath()}/${teamId}`).get();
    const team = teamSnap.data() ?? {};
    for (const id of [team.player1Id, team.player2Id]) {
      if (typeof id === "string" && id.trim()) uids.add(id.trim());
    }
  }
  for (const id of data.participantUids ?? []) {
    if (typeof id === "string" && id.trim()) uids.add(id.trim());
  }
  for (const id of [data.player1Id, data.player2Id]) {
    if (typeof id === "string" && id.trim()) uids.add(id.trim());
  }
  return [...uids];
}

function parseNameNeedles() {
  if (!namesRaw) return [];
  return namesRaw
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => nameTokens(n)[0] || normalizeKey(n));
}

function parseUids() {
  if (!uidsRaw) return [];
  return uidsRaw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

function labelsMatchNeedles(labels, needles) {
  if (needles.length === 0) return true;
  const hay = labels.map((l) => normalizeKey(l));
  return needles.every((needle) =>
    hay.some((h) => h.includes(needle) || needle.includes(h.split(" ")[0] || "")),
  );
}

async function findInscriptionCandidates(fromCategoryId) {
  const snap = await db
    .collection(inscriptionsPath())
    .where("tournamentId", "==", tournamentId)
    .get();

  const needles = parseNameNeedles();
  const wantUids = new Set(parseUids());
  const candidates = [];

  for (const doc of snap.docs) {
    if (registrationIdArg && doc.id !== registrationIdArg) continue;
    const data = doc.data() ?? {};
    const catId = String(data.categoryId ?? "").trim();
    if (fromCategoryId && catId !== fromCategoryId) continue;

    const uids = await athleteUidsFromInscription(data);
    if (wantUids.size > 0) {
      const ok = [...wantUids].every((u) => uids.includes(u));
      if (!ok) continue;
    }

    const labels = [];
    for (const uid of uids) labels.push(await loadUserLabel(uid));

    if (needles.length > 0 && !labelsMatchNeedles(labels, needles)) continue;

    candidates.push({
      registrationId: doc.id,
      data,
      uids,
      labels,
      displayTeam: labels.filter(Boolean).join(" / ") || doc.id,
      categoryId: catId,
      teamId: typeof data.teamId === "string" ? data.teamId.trim() : "",
    });
  }

  return candidates;
}

async function countActiveInCategory(categoryId) {
  const snap = await db
    .collection(inscriptionsPath())
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();
  let active = 0;
  for (const doc of snap.docs) {
    const d = doc.data() ?? {};
    if (d.waitlist === true) continue;
    active += 1;
  }
  return {total: snap.size, active};
}

async function athleteAlreadyInCategory(uids, categoryId, exceptRegistrationId) {
  const snap = await db
    .collection(inscriptionsPath())
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();
  const conflicts = [];
  for (const doc of snap.docs) {
    if (doc.id === exceptRegistrationId) continue;
    const otherUids = await athleteUidsFromInscription(doc.data() ?? {});
    for (const uid of uids) {
      if (otherUids.includes(uid)) {
        conflicts.push({registrationId: doc.id, uid});
      }
    }
  }
  return conflicts;
}

async function teamInMatches(teamId, categoryId) {
  if (!teamId) return [];
  const snap = await db
    .collection(matchesPath())
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();
  const hits = [];
  for (const doc of snap.docs) {
    const d = doc.data() ?? {};
    const a = String(d.teamAId ?? d.team1Id ?? "").trim();
    const b = String(d.teamBId ?? d.team2Id ?? "").trim();
    if (a === teamId || b === teamId) {
      hits.push({matchId: doc.id, status: d.status ?? null});
    }
  }
  return hits;
}

async function cancelPendingInvites(uids, fromCategoryId) {
  // Convites podem estar em tournamentRegistrationInvites com filtros variados.
  const col = db.collection("tournamentRegistrationInvites");
  let cancelled = 0;
  for (const uid of uids) {
    const snap = await col
      .where("tournamentId", "==", tournamentId)
      .where("inviteeUid", "==", uid)
      .get();
    for (const doc of snap.docs) {
      const d = doc.data() ?? {};
      const status = String(d.status ?? "").toLowerCase();
      if (status && status !== "pending") continue;
      const cat = String(d.categoryId ?? "").trim();
      if (fromCategoryId && cat && cat !== fromCategoryId) continue;
      if (APPLY) {
        await doc.ref.set(
          {
            status: "cancelled",
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            cancelledReason: "category_transfer",
          },
          {merge: true},
        );
      }
      cancelled += 1;
    }
  }
  return cancelled;
}

function scrubCategoryOps(tournament, fromCategoryId, teamId) {
  if (!teamId || !fromCategoryId) return null;
  const ops = tournament.categoryOps;
  if (!ops || typeof ops !== "object") return null;
  const entry = ops[fromCategoryId];
  if (!entry || typeof entry !== "object") return null;

  const seeds = Array.isArray(entry.seeds) ? entry.seeds.filter((id) => id !== teamId) : entry.seeds;
  let groupsPreview = entry.groupsPreview;
  if (Array.isArray(groupsPreview)) {
    groupsPreview = groupsPreview.map((g) => {
      if (!g || typeof g !== "object") return g;
      const teamIds = Array.isArray(g.teamIds) ? g.teamIds.filter((id) => id !== teamId) : g.teamIds;
      return {...g, teamIds};
    });
  }

  const seedsChanged = JSON.stringify(seeds) !== JSON.stringify(entry.seeds);
  const groupsChanged = JSON.stringify(groupsPreview) !== JSON.stringify(entry.groupsPreview);
  if (!seedsChanged && !groupsChanged) return null;

  return {
    [`categoryOps.${fromCategoryId}.seeds`]: seeds ?? [],
    [`categoryOps.${fromCategoryId}.groupsPreview`]: groupsPreview ?? [],
  };
}

async function run() {
  const tournament = await loadTournament();
  const toCat = findCategory(tournament, toCategoryRaw);
  if (!toCat) {
    console.error(`Categoria destino não encontrada: ${toCategoryRaw}`);
    console.error(
      "Categorias:",
      (tournament.categories ?? [])
        .map((c) => `${categoryInscriptionId(c)} (${categoryDisplayName(c)})`)
        .join(", "),
    );
    process.exit(1);
  }
  const toCategoryId = categoryInscriptionId(toCat);
  const toCategoryLabel = categoryDisplayName(toCat) || toCategoryId;

  let fromCategoryId = "";
  if (fromCategoryRaw) {
    const fromCat = findCategory(tournament, fromCategoryRaw);
    if (!fromCat) {
      console.error(`Categoria origem não encontrada: ${fromCategoryRaw}`);
      process.exit(1);
    }
    fromCategoryId = categoryInscriptionId(fromCat);
  }

  const candidates = await findInscriptionCandidates(fromCategoryId || null);
  if (candidates.length === 0) {
    console.error("Nenhuma inscrição encontrada com esses critérios.");
    process.exit(1);
  }
  if (candidates.length > 1) {
    console.error(`Encontrei ${candidates.length} inscrições — refine com --from-category ou --registration:`);
    for (const c of candidates) {
      console.error(
        `  ${c.registrationId} | ${c.displayTeam} | cat=${c.categoryId} | paid=${c.data.isPaid === true} | waitlist=${c.data.waitlist === true}`,
      );
    }
    process.exit(1);
  }

  const target = candidates[0];
  if (target.categoryId === toCategoryId) {
    console.error(`Já está em ${toCategoryLabel} (${toCategoryId}). Nada a fazer.`);
    process.exit(1);
  }

  const fromCatObj = findCategory(tournament, target.categoryId);
  const fromCategoryLabel = categoryDisplayName(fromCatObj) || target.categoryId;
  fromCategoryId = target.categoryId;

  const feeFrom = resolveCategoryEntryFeeCents(tournament, fromCategoryId);
  const feeTo = resolveCategoryEntryFeeCents(tournament, toCategoryId);
  const wasPaid = target.data.isPaid === true || Number(target.data.paidAmount) > 0;
  const feeDelta = feeTo - feeFrom;

  const conflicts = await athleteAlreadyInCategory(target.uids, toCategoryId, target.registrationId);
  const destCounts = await countActiveInCategory(toCategoryId);
  const maxTeams = maxTeamsOf(toCat);
  const wouldBeFull = maxTeams != null && destCounts.active >= maxTeams;
  const matchHits = await teamInMatches(target.teamId, fromCategoryId);

  console.log(APPLY ? "APLICANDO transferência…" : "DRY-RUN (passe --yes para escrever)");
  console.log(`  projeto:     ${projectId}`);
  console.log(`  torneio:     ${tournament.name || tournamentId} (${tournamentId})`);
  console.log(`  equipe:      ${target.displayTeam}`);
  console.log(`  uids:        ${target.uids.join(", ")}`);
  console.log(`  inscrição:   ${target.registrationId}`);
  console.log(`  teamId:      ${target.teamId || "(solo/sem team)"}`);
  console.log(`  de:          ${fromCategoryLabel} (${fromCategoryId})`);
  console.log(`  para:        ${toCategoryLabel} (${toCategoryId})`);
  console.log(`  pago:        ${wasPaid} (paidAmount=${target.data.paidAmount ?? 0})`);
  console.log(`  waitlist:    ${target.data.waitlist === true}`);
  console.log(`  taxa A→B:    ${feeFrom}¢ → ${feeTo}¢ (delta ${feeDelta}¢)`);
  console.log(`  destino:     ${destCounts.active} ativas / ${destCounts.total} total` +
    (maxTeams != null ? ` (max ${maxTeams})` : ""));
  if (matchHits.length > 0) {
    console.log(`  matches em A: ${matchHits.length} → ${matchHits.map((m) => m.matchId).join(", ")}`);
  }

  const blockers = [];
  if (conflicts.length > 0) {
    blockers.push(
      `atleta(s) já inscrito(s) em ${toCategoryLabel}: ${conflicts
        .map((c) => `${c.uid}@${c.registrationId}`)
        .join(", ")}`,
    );
  }
  if (wouldBeFull && !FORCE_WAITLIST) {
    blockers.push(
      `categoria destino lotada (${destCounts.active}/${maxTeams}). Use --force-waitlist para ir pra fila.`,
    );
  }
  if (matchHits.length > 0 && !FORCE_BRACKET) {
    blockers.push(
      `equipe está em ${matchHits.length} partida(s) da categoria origem. Use --force-bracket (e regenere a chave depois).`,
    );
  }
  if (wasPaid && feeDelta !== 0 && !ACK_FEE_DELTA) {
    blockers.push(
      `taxa diferente (delta ${feeDelta}¢) e inscrição paga. Use --ack-fee-delta para confirmar que o financeiro será tratado manualmente.`,
    );
  }

  if (blockers.length > 0) {
    console.error("\nBloqueado:");
    for (const b of blockers) console.error(`  - ${b}`);
    process.exit(1);
  }

  const setWaitlist = wouldBeFull && FORCE_WAITLIST;
  const opsPatch = scrubCategoryOps(tournament, fromCategoryId, target.teamId);

  if (!APPLY) {
    console.log("\nPlano:");
    console.log(`  1. inscriptions/${target.registrationId}.categoryId = ${toCategoryId}`);
    if (setWaitlist) console.log("  2. waitlist = true (destino lotado)");
    console.log("  3. cancelar convites pendentes da categoria origem");
    if (opsPatch) console.log("  4. limpar seeds/groupsPreview da categoria origem");
    else console.log("  4. categoryOps: nada a limpar");
    console.log("\nNada escrito. Rode de novo com --yes.");
    return;
  }

  const updates = {
    categoryId: toCategoryId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (setWaitlist) updates.waitlist = true;

  await db.doc(`${inscriptionsPath()}/${target.registrationId}`).set(updates, {merge: true});

  const cancelled = await cancelPendingInvites(target.uids, fromCategoryId);
  console.log(`  convites cancelados: ${cancelled}`);

  if (opsPatch) {
    await db.collection("tournaments").doc(tournamentId).update(opsPatch);
    console.log("  categoryOps origem limpo (seeds/groups)");
  }

  console.log("\nOK — inscrição transferida.");
  console.log("Próximos passos manuais:");
  console.log("  - Se havia chave na categoria origem, regenere o bracket.");
  if (feeDelta !== 0 && wasPaid) {
    console.log("  - Ajuste financeiro da diferença de taxa com a dupla.");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

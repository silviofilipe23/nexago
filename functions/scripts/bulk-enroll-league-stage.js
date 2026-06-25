/* eslint-disable */
/**
 * Inscrição em massa: emparelha atletas por categoria em torneio-etapa de liga,
 * grava teams + inscriptions com uniforme e pagamento pendente (directWithOrganizer).
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Requer lib/ compilada (rode `npm run build` na pasta functions/ se necessário).
 *
 * Uso (na pasta functions/):
 *   node scripts/bulk-enroll-league-stage.js --project volley-track-dev-4596c
 *   node scripts/bulk-enroll-league-stage.js --project <projectId> --yes
 *   node scripts/bulk-enroll-league-stage.js --project <projectId> --limit 10 --yes
 */

const fs = require("fs");
const admin = require("firebase-admin");
const {isTournamentProfileReady} = require("../lib/athlete-tournament-access");
const {genderTypeDisplayLabel} = require("../lib/category-display-labels");
const {
  computeAge,
  isAgeEligible,
  parseAgeRestriction,
  restrictionHasLimit,
} = require("../lib/category-age-eligibility");
const {
  categoryLevelRank,
  isTeamEligible,
  resolveAthleteLevelRank,
  tournamentSportToLevelSportCode,
} = require("../lib/category-level-eligibility");
const {
  findRegistrationConflict,
  pairAlreadyRegistered,
  parseCategoryRegistration,
} = require("../lib/tournament-pair-uniqueness");
const {
  assertTournamentAcceptsRegistration,
  loadTournamentData,
  findCategory,
} = require("../lib/tournament-registration-guards");
const {isDirectWithOrganizerPaymentMode} = require("../lib/tournament-registration-pix-helpers");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const LEAGUE_NAME = argValue("--league-name") || "nexaGO League";
const TOURNAMENT_NAME =
  argValue("--tournament-name") || "Open Goiânia beach volley";
const LIMIT = parseInt(argValue("--limit") || "0", 10);
const CREDENTIALS_PATH = (
  argValue("--credentials") ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  ""
).trim();

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

if (CREDENTIALS_PATH) {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`Arquivo de credenciais não encontrado: ${CREDENTIALS_PATH}`);
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  admin.initializeApp({
    projectId,
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  admin.initializeApp({projectId});
}

const db = admin.firestore();
const {Timestamp, FieldValue} = admin.firestore;

function isCredentialsError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Could not load the default credentials") ||
    msg.includes("Unable to detect a Project Id")
  );
}

function printCredentialsHelp() {
  console.error(`
Credenciais do Firebase Admin não encontradas.

  gcloud auth application-default login
  node scripts/bulk-enroll-league-stage.js --project ${projectId} --yes

Ou:
  export GOOGLE_APPLICATION_CREDENTIALS=/caminho/sa.json
`);
}

function artifactsTeamsPath(pid) {
  return `artifacts/${pid}/public/data/teams`;
}

function artifactsInscriptionsPath(pid) {
  return `artifacts/${pid}/public/data/inscriptions`;
}

function normalizeText(raw) {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function namesMatch(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function isAthleteUser(data) {
  if (data.hasAthleteRole === true) return true;
  const role =
    typeof data.role === "string" ? data.role.trim().toLowerCase() : "";
  if (role === "athlete") return true;
  if (Array.isArray(data.roles)) {
    return data.roles.some(
      (r) => typeof r === "string" && r.trim().toLowerCase() === "athlete",
    );
  }
  return false;
}

async function findLeagueByName(name) {
  const snap = await db.collection("leagues").get();
  for (const doc of snap.docs) {
    const leagueName = String(doc.data().name ?? "").trim();
    if (namesMatch(leagueName, name)) {
      return {id: doc.id, data: doc.data()};
    }
  }
  return null;
}

function stageTournamentIds(league) {
  const stages = Array.isArray(league.stages) ? league.stages : [];
  const ids = new Set();
  for (const stage of stages) {
    if (!stage || typeof stage !== "object") continue;
    const status = String(stage.status ?? "").trim().toLowerCase();
    if (status && status !== "defined") continue;
    const tournamentIds = Array.isArray(stage.tournamentIds)
      ? stage.tournamentIds
      : [];
    for (const raw of tournamentIds) {
      const id = String(raw ?? "").trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

async function findTournamentForStage(tournamentIds, tournamentName) {
  for (const id of tournamentIds) {
    const data = await loadTournamentData(db, projectId, id);
    if (!data) continue;
    const name = String(data.name ?? "").trim();
    if (!namesMatch(name, tournamentName)) continue;

    try {
      await assertTournamentAcceptsRegistration(db, projectId, id);
    } catch {
      continue;
    }

    if (!isDirectWithOrganizerPaymentMode(data.paymentMode)) {
      console.warn(
        `Torneio ${id} (${name}) ignorado: paymentMode não é directWithOrganizer.`,
      );
      continue;
    }

    return {id, data};
  }
  return null;
}

/** ID da categoria gravado em `inscriptions.categoryId` (`categories[].id`). */
function categoryInscriptionId(category) {
  return String(category.id ?? category.categoryId ?? "").trim();
}

function categoryDisplayName(category) {
  return String(category.categoryName ?? category.name ?? "").trim();
}

/** Normaliza chave legada (nome) para o id canônico da categoria. */
function canonicalCategoryId(tournament, rawKey) {
  const trimmed = String(rawKey ?? "").trim();
  if (!trimmed) return "";
  const category = findCategory(tournament, trimmed);
  if (!category) return trimmed;
  const id = categoryInscriptionId(category);
  return id || trimmed;
}

function tournamentCategories(tournament) {
  return Array.isArray(tournament.categories) ? tournament.categories : [];
}

function athleteGenderLabel(userData) {
  const g = userData.gender;
  if (typeof g !== "string") return null;
  const trimmed = g.trim();
  return trimmed || null;
}

function matchesCategoryGender(category, athleteGender) {
  const catGender = genderTypeDisplayLabel(category.genderType);
  if (!catGender || catGender === "Misto") return true;
  if (!athleteGender) return false;
  return athleteGender === catGender;
}

function parseBirthDate(raw) {
  if (raw instanceof Timestamp) return raw.toDate();
  if (raw instanceof Date) return raw;
  if (typeof raw === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

function tournamentStartDate(tournament) {
  return parseBirthDate(tournament.startAt ?? tournament.startDate);
}

function isAthleteAgeEligible(tournament, category, userData, now = new Date()) {
  const restriction = parseAgeRestriction(category);
  if (!restrictionHasLimit(restriction)) return true;
  const birthDate = parseBirthDate(userData.birthDate);
  if (!birthDate) return false;
  const age = computeAge({
    birthDate,
    reference: restriction.reference,
    tournamentStart: tournamentStartDate(tournament),
    now,
  });
  return isAgeEligible(restriction, age);
}

function isCategoryOpen(category) {
  if (category.registrationClosed === true) return false;
  if (category.isCompleted === true) return false;
  return true;
}

function isAthleteEligibleForCategory(
  tournament,
  category,
  userData,
  sportCode,
) {
  if (!isCategoryOpen(category)) return false;
  const athleteRank = resolveAthleteLevelRank(userData, sportCode);
  const catRank = categoryLevelRank(category);
  if (
    !isTeamEligible({
      categoryRank: catRank,
      athleteRanks: [athleteRank],
    })
  ) {
    return false;
  }
  if (!matchesCategoryGender(category, athleteGenderLabel(userData))) {
    return false;
  }
  if (!isAthleteAgeEligible(tournament, category, userData)) {
    return false;
  }
  return true;
}

function genderPreferenceScore(category, athleteGender) {
  const catGender = genderTypeDisplayLabel(category.genderType);
  if (!catGender || catGender === "Misto") return 1;
  if (athleteGender && catGender === athleteGender) return 2;
  return 0;
}

function resolveCategoryForAthlete(tournament, userData) {
  const categories = tournamentCategories(tournament);
  const sportCode = tournamentSportToLevelSportCode(tournament.sport);
  const athleteRank = resolveAthleteLevelRank(userData, sportCode);
  const athleteGender = athleteGenderLabel(userData);

  const eligible = categories.filter(
    (c) =>
      categoryInscriptionId(c) &&
      isAthleteEligibleForCategory(tournament, c, userData, sportCode),
  );
  if (eligible.length === 0) return null;

  const exactLevel = eligible.filter(
    (c) => categoryLevelRank(c) === athleteRank,
  );
  const pool = exactLevel.length > 0 ? exactLevel : eligible;

  pool.sort((a, b) => {
    const gDiff =
      genderPreferenceScore(b, athleteGender) -
      genderPreferenceScore(a, athleteGender);
    if (gDiff !== 0) return gDiff;
    const rankDiff = categoryLevelRank(a) - categoryLevelRank(b);
    if (rankDiff !== 0) return rankDiff;
    return categoryInscriptionId(a).localeCompare(categoryInscriptionId(b));
  });

  const category = pool[0];
  const categoryId = categoryInscriptionId(category);
  if (!categoryId) return null;

  let warning;
  if (exactLevel.length === 0) {
    warning = `nível fallback (${categoryDisplayName(category)})`;
  } else if (genderPreferenceScore(category, athleteGender) < 2) {
    const catGender = genderTypeDisplayLabel(category.genderType);
    if (catGender === "Misto") {
      warning = "categoria Misto (sem match exato de gênero)";
    }
  }

  return {category, categoryId, warning};
}

const DEFAULT_TOP_SIZES = ["PP", "P", "M", "G", "GG", "XGG"];
const DEFAULT_SHORTS_SIZES = ["PP", "P", "M", "G", "GG", "XGG"];

function categoryRequiresUniform(category) {
  const t = String(category.uniformType ?? "none");
  return t === "top_only" || t === "top" || t === "full";
}

function categoryRequiresShorts(category) {
  return category.uniformType === "full";
}

function topSizeOptions(category) {
  const raw = category.uniformSizeOptionsTop;
  const list = Array.isArray(raw)
    ? raw
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter((s) => s.length > 0)
    : [];
  return list.length > 0 ? list : DEFAULT_TOP_SIZES;
}

function shortsSizeOptions(category) {
  const raw = category.uniformSizeOptionsShorts;
  const list = Array.isArray(raw)
    ? raw
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter((s) => s.length > 0)
    : [];
  return list.length > 0 ? list : DEFAULT_SHORTS_SIZES;
}

function randomItem(list) {
  if (!list.length) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

/** Número de camisa aleatório entre 1 e 99 (regra do backend). */
function randomJerseyNumber() {
  return Math.floor(Math.random() * 99) + 1;
}

function defaultJerseyNameForAthlete(userData) {
  const nick =
    typeof userData.nickname === "string" ? userData.nickname.trim() : "";
  if (nick) return nick;
  for (const key of ["fullName", "displayName", "name"]) {
    const full = typeof userData[key] === "string" ? userData[key].trim() : "";
    if (!full) continue;
    const parts = full.split(/\s+/).filter((p) => p.length > 0);
    if (parts.length === 0) continue;
    return parts.length > 1 ? parts[parts.length - 1] : parts[0];
  }
  return null;
}

function defaultUniformForCategory(category, userData) {
  const tops = topSizeOptions(category);
  const shorts = shortsSizeOptions(category);
  const payload = {};

  if (categoryRequiresUniform(category)) {
    payload.sizeTop = randomItem(tops);
    if (categoryRequiresShorts(category)) {
      payload.sizeShorts = randomItem(shorts);
    }
    if (category.uniformNumberOnShirt === true) {
      payload.jerseyNumber = randomJerseyNumber();
    }
    if (category.uniformNameOnShirt === true) {
      const name = defaultJerseyNameForAthlete(userData);
      if (name) payload.jerseyName = name;
    }
  }

  return payload;
}

function registrationUniformPlayer1(uniform) {
  const out = {};
  if (uniform.sizeTop) out.sizeTopPlayer1 = uniform.sizeTop;
  if (uniform.sizeShorts) out.sizeShortsPlayer1 = uniform.sizeShorts;
  if (uniform.jerseyNumber != null) {
    out.jerseyNumberPlayer1 = uniform.jerseyNumber;
  }
  if (uniform.jerseyName) out.jerseyNamePlayer1 = uniform.jerseyName;
  return out;
}

function registrationUniformPlayer2(uniform) {
  const out = {};
  if (uniform.sizeTop) out.sizeTopPlayer2 = uniform.sizeTop;
  if (uniform.sizeShorts) out.sizeShortsPlayer2 = uniform.sizeShorts;
  if (uniform.jerseyNumber != null) {
    out.jerseyNumberPlayer2 = uniform.jerseyNumber;
  }
  if (uniform.jerseyName) out.jerseyNamePlayer2 = uniform.jerseyName;
  return out;
}

async function loadTournamentRegistrationIndex(tournamentId, tournament) {
  const enrolledUids = new Set();
  const byCategory = new Map();
  const teamsPath = artifactsTeamsPath(projectId);
  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const rawCategoryId = String(data.categoryId ?? "").trim();
    const categoryId = canonicalCategoryId(tournament, rawCategoryId);
    const participants = Array.isArray(data.participantUids)
      ? data.participantUids
          .map((p) => String(p).trim())
          .filter((p) => p.length > 0)
      : [];
    for (const uid of participants) enrolledUids.add(uid);

    const player1 = String(data.player1Id ?? "").trim();
    if (player1) enrolledUids.add(player1);

    const teamId = String(data.teamId ?? "").trim();
    let team = null;
    if (teamId) {
      const teamSnap = await db.doc(`${teamsPath}/${teamId}`).get();
      if (teamSnap.exists) team = teamSnap.data();
    }

    const parsed = parseCategoryRegistration(doc.id, data, team);
    if (!categoryId) continue;
    const list = byCategory.get(categoryId) ?? [];
    list.push(parsed);
    byCategory.set(categoryId, list);
  }

  return {enrolledUids, byCategory};
}

function addParsedRegistration(byCategory, categoryId, parsed) {
  const list = byCategory.get(categoryId) ?? [];
  list.push(parsed);
  byCategory.set(categoryId, list);
}

async function shouldWaitlist(_tournament, tournamentId, categoryId) {
  try {
    const checked = await assertTournamentAcceptsRegistration(
      db,
      projectId,
      tournamentId,
      categoryId,
    );
    return checked.__shouldWaitlist === true;
  } catch {
    return false;
  }
}

async function buildEnrollmentPlans(params) {
  const {tournament, tournamentId, athletes, byCategory} = params;
  const grouped = new Map();
  for (const a of athletes) {
    const list = grouped.get(a.categoryId) ?? [];
    list.push(a);
    grouped.set(a.categoryId, list);
  }

  const plans = [];
  let skippedPairs = 0;

  for (const [categoryId, members] of grouped) {
    const sorted = [...members].sort((a, b) => a.uid.localeCompare(b.uid));
    const category =
      sorted[0]?.category ??
      tournamentCategories(tournament).find(
        (c) => categoryInscriptionId(c) === categoryId,
      );
    if (!category) continue;

    const existing = byCategory.get(categoryId) ?? [];

    for (let i = 0; i + 1 < sorted.length; i += 2) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];
      if (
        pairAlreadyRegistered(existing, p1.uid, p2.uid) ||
        findRegistrationConflict(existing, p1.uid, p2.uid)
      ) {
        skippedPairs += 1;
        continue;
      }

      const waitlist = await shouldWaitlist(tournament, tournamentId, categoryId);
      plans.push({
        kind: "pair",
        categoryId,
        category,
        player1Id: p1.uid,
        player2Id: p2.uid,
        player1Data: p1.userData,
        player2Data: p2.userData,
        waitlist,
      });

      const fakeRegId = `plan-${p1.uid}-${p2.uid}`;
      const fakeParsed = parseCategoryRegistration(
        fakeRegId,
        {
          participantUids: [p1.uid, p2.uid],
          partnerPending: false,
        },
        {player1Id: p1.uid, player2Id: p2.uid},
      );
      addParsedRegistration(byCategory, categoryId, fakeParsed);
      existing.push(fakeParsed);
    }

    if (sorted.length % 2 === 1) {
      const solo = sorted[sorted.length - 1];
      const waitlist = await shouldWaitlist(tournament, tournamentId, categoryId);
      plans.push({
        kind: "solo",
        categoryId,
        category: solo.category,
        player1Id: solo.uid,
        player1Data: solo.userData,
        waitlist,
      });
    }
  }

  return {plans, skippedPairs};
}

async function applyPlans(tournamentId, plans) {
  const teamsRef = db.collection(artifactsTeamsPath(projectId));
  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));

  let batch = db.batch();
  let ops = 0;
  let pairs = 0;
  let solos = 0;

  async function flush() {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  }

  for (const plan of plans) {
    if (plan.kind === "pair") {
      const teamRef = teamsRef.doc();
      const regRef = inscriptionsRef.doc();
      const uniform1 = defaultUniformForCategory(plan.category, plan.player1Data);
      const uniform2 = defaultUniformForCategory(plan.category, plan.player2Data);

      batch.set(teamRef, {
        player1Id: plan.player1Id,
        player2Id: plan.player2Id,
        createdAt: FieldValue.serverTimestamp(),
      });
      ops += 1;

      batch.set(regRef, {
        teamId: teamRef.id,
        tournamentId,
        categoryId: plan.categoryId,
        participantUids: [plan.player1Id, plan.player2Id],
        isPaid: false,
        paidAmount: 0,
        paymentChannel: "directOrganizer",
        sharePaidUids: [plan.player1Id, plan.player2Id],
        createdAt: FieldValue.serverTimestamp(),
        ...(plan.waitlist ? {waitlist: true} : {}),
        ...registrationUniformPlayer1(uniform1),
        ...registrationUniformPlayer2(uniform2),
      });
      ops += 1;
      pairs += 1;
    } else {
      const regRef = inscriptionsRef.doc();
      const uniform1 = defaultUniformForCategory(plan.category, plan.player1Data);

      batch.set(regRef, {
        tournamentId,
        categoryId: plan.categoryId,
        player1Id: plan.player1Id,
        participantUids: [plan.player1Id],
        partnerPending: true,
        isPaid: false,
        paidAmount: 0,
        paymentChannel: "directOrganizer",
        sharePaidUids: [plan.player1Id],
        createdAt: FieldValue.serverTimestamp(),
        ...(plan.waitlist ? {waitlist: true} : {}),
        ...registrationUniformPlayer1(uniform1),
      });
      ops += 1;
      solos += 1;
    }

    if (ops >= 450) await flush();
  }

  await flush();
  return {pairs, solos};
}

async function loadAthleteUsers() {
  const out = [];
  const snap = await db.collection("users").get();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isAthleteUser(data)) continue;
    out.push({uid: doc.id, data});
    if (LIMIT > 0 && out.length >= LIMIT) break;
  }
  return out;
}

async function run() {
  console.log(`Projeto: ${projectId}`);
  console.log(`Modo: ${APPLY ? "APLICAR (--yes)" : "DRY-RUN (use --yes para gravar)"}`);
  console.log(`Liga: "${LEAGUE_NAME}" | Etapa: "${TOURNAMENT_NAME}"`);

  const league = await findLeagueByName(LEAGUE_NAME);
  if (!league) {
    console.error(`Liga não encontrada: "${LEAGUE_NAME}"`);
    process.exit(1);
  }

  const tournamentIds = stageTournamentIds(league.data);
  if (tournamentIds.length === 0) {
    console.error("Nenhuma etapa definida com tournamentIds na liga.");
    process.exit(1);
  }

  const tournament = await findTournamentForStage(
    tournamentIds,
    TOURNAMENT_NAME,
  );
  if (!tournament) {
    console.error(
      `Torneio-etapa não encontrado ou inaceitável: "${TOURNAMENT_NAME}"`,
    );
    process.exit(1);
  }

  const categories = tournamentCategories(tournament.data);
  console.log(`\nLiga: ${league.id}`);
  console.log(`Torneio: ${tournament.id} — ${tournament.data.name}`);
  console.log(`paymentMode: ${tournament.data.paymentMode}`);
  console.log(`Categorias (${categories.length}):`);
  for (const c of categories) {
    const id = categoryInscriptionId(c);
    const name = categoryDisplayName(c);
    const gender = genderTypeDisplayLabel(c.genderType) ?? "?";
    const level = String(c.level ?? "open");
    console.log(`  - ${id} — ${name} (${gender}, ${level})`);
  }

  const {enrolledUids, byCategory} = await loadTournamentRegistrationIndex(
    tournament.id,
    tournament.data,
  );
  console.log(`\nInscrições existentes no torneio: ${enrolledUids.size} atletas`);

  const users = await loadAthleteUsers();
  console.log(
    `Atletas carregados: ${users.length}${LIMIT > 0 ? ` (limit ${LIMIT})` : ""}`,
  );

  const skipCounts = {
    profile_incomplete: 0,
    already_enrolled: 0,
    no_category: 0,
    missing_gender: 0,
  };
  const warnings = [];
  const athletes = [];

  for (const {uid, data} of users) {
    if (!isTournamentProfileReady(data)) {
      skipCounts.profile_incomplete += 1;
      continue;
    }
    if (enrolledUids.has(uid)) {
      skipCounts.already_enrolled += 1;
      continue;
    }

    const resolved = resolveCategoryForAthlete(tournament.data, data);
    if (!resolved) {
      const gender = athleteGenderLabel(data);
      const needsGender = categories.some((c) => {
        const g = genderTypeDisplayLabel(c.genderType);
        return g && g !== "Misto";
      });
      if (!gender && needsGender) {
        skipCounts.missing_gender += 1;
      } else {
        skipCounts.no_category += 1;
      }
      continue;
    }

    if (resolved.warning) {
      warnings.push(`${uid}: ${resolved.warning}`);
    }

    athletes.push({
      uid,
      userData: data,
      categoryId: resolved.categoryId,
      category: resolved.category,
      warning: resolved.warning,
    });
  }

  const {plans, skippedPairs} = await buildEnrollmentPlans({
    tournament: tournament.data,
    tournamentId: tournament.id,
    athletes,
    byCategory,
  });

  const pairPlans = plans.filter((p) => p.kind === "pair").length;
  const soloPlans = plans.filter((p) => p.kind === "solo").length;

  console.log("\n── Resumo ──");
  console.log(`Elegíveis para inscrição: ${athletes.length}`);
  console.log(`Planos de dupla: ${pairPlans}`);
  console.log(`Planos solo (ímpar): ${soloPlans}`);
  console.log(`Pares ignorados (conflito): ${skippedPairs}`);
  console.log("Pulados:");
  for (const [reason, count] of Object.entries(skipCounts)) {
    if (count > 0) console.log(`  ${reason}: ${count}`);
  }
  if (warnings.length > 0) {
    console.log(`\nAvisos (${warnings.length}, primeiros 10):`);
    for (const w of warnings.slice(0, 10)) console.log(`  ${w}`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: nada foi alterado. Rode com --yes para aplicar.");
    return;
  }

  if (plans.length === 0) {
    console.log("\nNada a gravar.");
    return;
  }

  console.log("\nGravando inscrições...");
  const result = await applyPlans(tournament.id, plans);
  console.log(
    `OK: ${result.pairs} duplas + ${result.solos} solos gravadas em ${projectId}.`,
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    if (isCredentialsError(err)) {
      printCredentialsHelp();
    } else {
      console.error("Falha no bulk-enroll:", err);
    }
    process.exit(1);
  });

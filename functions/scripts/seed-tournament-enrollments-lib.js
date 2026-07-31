/* eslint-disable */
/**
 * Lógica compartilhada dos seeds de torneio com inscrições pagas.
 */

const fs = require("fs");
const admin = require("firebase-admin");
const {genderTypeDisplayLabel} = require("../lib/category-display-labels");
const {
  computeTournamentCollectedCents,
} = require("../lib/tournament-collected-stats");
const {
  ORGANIZER_DIRECT_PAYMENT_METHOD,
  organizerDirectConfirmPaidAmount,
} = require("../lib/organizer-category-ops-payments");
const {resolveCategoryEntryFee} = require("../lib/tournament-registration-guards");

const EVENT_TIME_ZONE = "America/Sao_Paulo";

/** Escada de 5 níveis do vôlei — espelho de `category-level-eligibility.ts`. */
const LEVELS = [
  {code: "iniciante_1", label: "Iniciante 1"},
  {code: "iniciante_2", label: "Iniciante 2"},
  {code: "intermediario_1", label: "Intermediário 1"},
  {code: "intermediario_2", label: "Intermediário 2"},
  {code: "open", label: "Open"},
];
const GENDERS = [
  {type: "male", label: "Masculino", suffix: "masc"},
  {type: "female", label: "Feminino", suffix: "fem"},
];

/** Legados da escada de 3 níveis → degrau inferior do split (vôlei). */
function resolveVolleyballLevelCode(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const code = raw.trim().toLowerCase();
  if (LEVELS.some((level) => level.code === code)) return code;
  switch (code) {
    case "iniciante":
    case "basico":
      return "iniciante_1";
    case "intermediario":
      return "intermediario_1";
    case "open":
    case "livre":
      return "open";
    default:
      return null;
  }
}

const DEFAULT_ENTRY_FEE_CENTS = 18000;
const MAX_TEAMS_PER_CATEGORY = 16;
const COURTS_COUNT = 4;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function parseSeedArgs(defaultTournamentName) {
  const APPLY = process.argv.includes("--yes");
  const projectId =
    argValue("--project") ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;
  const MANAGER_UID = (argValue("--manager-uid") || "").trim();
  const TOURNAMENT_NAME = argValue("--tournament-name") || defaultTournamentName;
  const CREDENTIALS_PATH = (
    argValue("--credentials") ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    ""
  ).trim();

  if (!projectId) {
    console.error("Informe o projeto: --project <projectId>");
    process.exit(1);
  }
  if (!MANAGER_UID) {
    console.error("Informe o organizador: --manager-uid <uid>");
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
  } else if (!admin.apps.length) {
    admin.initializeApp({projectId});
  }

  return {APPLY, projectId, MANAGER_UID, TOURNAMENT_NAME};
}

function dayKeyInSaoPaulo(date = new Date()) {
  return date.toLocaleDateString("en-CA", {timeZone: EVENT_TIME_ZONE});
}

function eventInstantFromDayKeyAndTime(dayKey, hour, minute) {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${dayKey}T${hh}:${mm}:00-03:00`);
}

function artifactsTeamsPath(pid) {
  return `artifacts/${pid}/public/data/teams`;
}

function artifactsInscriptionsPath(pid) {
  return `artifacts/${pid}/public/data/inscriptions`;
}

function defaultCourts(count) {
  return Array.from({length: count}, (_, i) => ({
    id: `Q${i + 1}`,
    name: `Quadra ${i + 1}`,
    order: i,
  }));
}

function buildCategories() {
  const categories = [];
  for (const level of LEVELS) {
    for (const gender of GENDERS) {
      const id = `${level.code}-${gender.suffix}`;
      categories.push({
        id,
        categoryName: `${level.label} ${gender.label}`,
        genderType: gender.type,
        disputeType: "dupla",
        ageBand: "open",
        ageRestriction: {mode: "none", reference: "tournamentStart"},
        level: level.label,
        maxTeams: MAX_TEAMS_PER_CATEGORY,
        spotsTotal: MAX_TEAMS_PER_CATEGORY,
        spotsLeft: MAX_TEAMS_PER_CATEGORY,
        entryFee: DEFAULT_ENTRY_FEE_CENTS / 100,
        entryFeeCents: DEFAULT_ENTRY_FEE_CENTS,
        useDefaultPrice: true,
        bracketFormat: "groups_knockout",
        teamsPerGroup: 4,
        qualifiersPerGroup: 2,
        bestOf: "bestOf3",
        finalBestOf5: true,
        maxRegistrationsPerAthlete: 2,
        registrationClosed: false,
        isCompleted: false,
        prizes: [],
        uniformType: "none",
      });
    }
  }
  return categories;
}

function buildMatchOps(activeDayKey = "") {
  return {
    activeDayKey,
    dayStart: "07:00",
    dayEnd: "24:00",
    defaultMatchDurationMin: 30,
    minRestBetweenMatchesMin: 30,
    checkInToleranceMin: 15,
    autoScheduleRules: {
      avoidAthleteConflict: true,
      respectBracketDeps: true,
      seedOnPrimeCourt: false,
    },
  };
}

/** Torneio com início daqui a [offsetDays] (comportamento original). */
function buildTournamentDocFuture(categories, tournamentName, offsetDays = 14) {
  const now = new Date();
  const startAt = new Date(now);
  startAt.setDate(startAt.getDate() + offsetDays);
  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 1);

  const capacity = categories.reduce((sum, c) => sum + c.maxTeams * 2, 0);
  const {FieldValue, Timestamp} = admin.firestore;

  return {
    name: tournamentName,
    sport: "beachVolleyball",
    description: "Torneio gerado por seed-tournament-with-enrollments.js",
    city: "Goiânia",
    state: "GO",
    locationName: "Arena seed nexaGO",
    location: "Arena seed nexaGO",
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
    dateLabel: `${startAt.getDate().toString().padStart(2, "0")}/${(startAt.getMonth() + 1).toString().padStart(2, "0")}`,
    courtsCount: COURTS_COUNT,
    courts: defaultCourts(COURTS_COUNT),
    format: "dupla",
    capacity,
    enrolledCount: 0,
    collectedCents: 0,
    listingStatus: "open",
    status: "open",
    visibility: "publicListing",
    featured: false,
    liveMatchesNow: 0,
    managerId: "",
    categories,
    defaultEntryFeeCents: DEFAULT_ENTRY_FEE_CENTS,
    paymentMode: "directWithOrganizer",
    organizerPix: {
      key: "seed@nexago.test",
      keyType: "EMAIL",
      recipientName: "Organizador seed",
      city: "Goiânia",
    },
    waitlistEnabled: true,
    inviteConfirmEnabled: false,
    cashPrizesEnabled: false,
    rankingEnabled: false,
    uniformRequired: false,
    seedTestTournament: true,
    matchOps: buildMatchOps(""),
    keywords: ["torneio", "seed", "nexago", "goiania"],
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };
}

/** Torneio no dia atual (calendário America/Sao_Paulo). */
function buildTournamentDocToday(categories, tournamentName) {
  const dayKey = dayKeyInSaoPaulo();
  const startAt = eventInstantFromDayKeyAndTime(dayKey, 8, 0);
  const endAt = eventInstantFromDayKeyAndTime(dayKey, 20, 0);
  const [y, m, d] = dayKey.split("-").map(Number);

  const capacity = categories.reduce((sum, c) => sum + c.maxTeams * 2, 0);
  const {FieldValue, Timestamp} = admin.firestore;

  return {
    name: tournamentName,
    sport: "beachVolleyball",
    description: "Torneio gerado por seed-tournament-today-with-enrollments.js",
    city: "Goiânia",
    state: "GO",
    locationName: "Arena seed nexaGO",
    location: "Arena seed nexaGO",
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
    dateLabel: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`,
    courtsCount: COURTS_COUNT,
    courts: defaultCourts(COURTS_COUNT),
    format: "dupla",
    capacity,
    enrolledCount: 0,
    collectedCents: 0,
    listingStatus: "open",
    status: "open",
    visibility: "publicListing",
    featured: false,
    liveMatchesNow: 0,
    managerId: "",
    categories,
    defaultEntryFeeCents: DEFAULT_ENTRY_FEE_CENTS,
    paymentMode: "directWithOrganizer",
    organizerPix: {
      key: "seed@nexago.test",
      keyType: "EMAIL",
      recipientName: "Organizador seed",
      city: "Goiânia",
    },
    waitlistEnabled: true,
    inviteConfirmEnabled: false,
    cashPrizesEnabled: false,
    rankingEnabled: false,
    uniformRequired: false,
    seedTestTournament: true,
    matchOps: buildMatchOps(dayKey),
    keywords: ["torneio", "seed", "nexago", "goiania", "hoje"],
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };
}

function normalizeText(raw) {
  return String(raw ?? "")
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

async function findTournamentByName(db, name) {
  const snap = await db.collection("tournaments").get();
  for (const doc of snap.docs) {
    const tournamentName = String(doc.data().name ?? "").trim();
    if (namesMatch(tournamentName, name)) {
      return {id: doc.id, data: doc.data()};
    }
  }
  return null;
}

function athleteLevelCode(userData) {
  const sportOnboarding = userData.sportOnboarding;
  if (sportOnboarding && typeof sportOnboarding === "object") {
    const levelsBySport = sportOnboarding.levelsBySport;
    if (levelsBySport && typeof levelsBySport === "object") {
      const code = levelsBySport.VOLEI_PRAIA;
      const resolved = resolveVolleyballLevelCode(code);
      if (resolved) return resolved;
    }
  }

  const bySport = userData.levelsBySportFirestore;
  if (bySport && typeof bySport === "object") {
    const code = bySport.VOLEI_PRAIA;
    const resolved = resolveVolleyballLevelCode(code);
    if (resolved) return resolved;
  }

  const sportProfile = userData.sportProfile;
  if (sportProfile && typeof sportProfile.level === "string") {
    const resolved = resolveVolleyballLevelCode(sportProfile.level);
    if (resolved) return resolved;
  }

  const level = userData.level;
  if (typeof level === "string") {
    return resolveVolleyballLevelCode(normalizeText(level));
  }
  return null;
}

function athleteGenderLabel(userData) {
  const g = userData.gender;
  return typeof g === "string" && g.trim() ? g.trim() : null;
}

function categoryIdForAthlete(userData) {
  const level = athleteLevelCode(userData);
  const gender = athleteGenderLabel(userData);
  if (!level || !gender) return null;

  const levelEntry = LEVELS.find((l) => l.code === level);
  if (!levelEntry) return null;

  const genderEntry = GENDERS.find((g) => g.label === gender);
  if (!genderEntry) return null;

  return `${levelEntry.code}-${genderEntry.suffix}`;
}

function isSeedAthlete(userData) {
  if (userData.seedTestAthlete === true) return true;
  const email = String(userData.email ?? "").trim().toLowerCase();
  return email.endsWith("@nexago.test") && email.startsWith("seed-");
}

async function loadSeedAthletesByCategory(db) {
  const byCategory = new Map();
  for (const level of LEVELS) {
    for (const gender of GENDERS) {
      byCategory.set(`${level.code}-${gender.suffix}`, []);
    }
  }

  const snap = await db.collection("users").get();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isSeedAthlete(data)) continue;
    const categoryId = categoryIdForAthlete(data);
    if (!categoryId || !byCategory.has(categoryId)) continue;
    byCategory.get(categoryId).push({uid: doc.id, data});
  }

  for (const [categoryId, athletes] of byCategory.entries()) {
    athletes.sort((a, b) => {
      const ea = String(a.data.email ?? "");
      const eb = String(b.data.email ?? "");
      return ea.localeCompare(eb);
    });
    byCategory.set(categoryId, athletes);
  }

  return byCategory;
}

async function loadEnrolledUids(db, projectId, tournamentId) {
  const enrolled = new Set();
  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const participants = Array.isArray(data.participantUids)
      ? data.participantUids
      : [];
    for (const uid of participants) {
      if (uid) enrolled.add(String(uid).trim());
    }
    const p1 = String(data.player1Id ?? "").trim();
    if (p1) enrolled.add(p1);
  }
  return enrolled;
}

function buildPairPlans(tournament, athletesByCategory, enrolledUids) {
  const plans = [];
  for (const [categoryId, athletes] of athletesByCategory.entries()) {
    const available = athletes.filter((a) => !enrolledUids.has(a.uid));
    const category = (tournament.categories || []).find(
      (c) => String(c.id ?? "").trim() === categoryId,
    );
    if (!category) continue;

    const maxTeams = Number(category.maxTeams) || MAX_TEAMS_PER_CATEGORY;
    const maxAthletes = maxTeams * 2;
    const pool = available.slice(0, maxAthletes);

    for (let i = 0; i + 1 < pool.length; i += 2) {
      plans.push({
        categoryId,
        category,
        player1: pool[i],
        player2: pool[i + 1],
      });
    }
  }
  return plans;
}

async function applyPaidPlans(db, projectId, tournamentId, tournament, plans) {
  const {FieldValue} = admin.firestore;
  const teamsRef = db.collection(artifactsTeamsPath(projectId));
  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));

  let batch = db.batch();
  let ops = 0;
  let pairs = 0;

  async function flush() {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  }

  for (const plan of plans) {
    const entryFee = resolveCategoryEntryFee(tournament, plan.categoryId);
    const paidAmount = organizerDirectConfirmPaidAmount(entryFee);
    const teamRef = teamsRef.doc();
    const regRef = inscriptionsRef.doc();

    batch.set(teamRef, {
      player1Id: plan.player1.uid,
      player2Id: plan.player2.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    ops += 1;

    batch.set(regRef, {
      teamId: teamRef.id,
      tournamentId,
      categoryId: plan.categoryId,
      participantUids: [plan.player1.uid, plan.player2.uid],
      isPaid: true,
      waitlist: false,
      paidAmount: paidAmount ?? entryFee,
      paymentMethod: ORGANIZER_DIRECT_PAYMENT_METHOD,
      paymentChannel: "directOrganizer",
      sharePaidUids: [plan.player1.uid, plan.player2.uid],
      paidAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    ops += 1;
    pairs += 1;

    if (ops >= 450) await flush();
  }

  await flush();
  return pairs;
}

async function refreshTournamentStats(db, projectId, tournamentId, tournament) {
  const {FieldValue} = admin.firestore;
  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();

  const inscriptions = snap.docs.map((d) => d.data());
  const paidRegs = inscriptions.filter(
    (i) => i.isPaid === true && i.waitlist !== true,
  );
  const enrolledCount = paidRegs.length;
  const collectedCents = computeTournamentCollectedCents(tournament, inscriptions);

  await db.doc(`tournaments/${tournamentId}`).set(
    {enrolledCount, collectedCents, updatedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );

  return {enrolledCount, collectedCents};
}

/**
 * @param {object} options
 * @param {object} [options.args] Args já resolvidos pelo chamador
 *   (`{APPLY, projectId, MANAGER_UID, TOURNAMENT_NAME}`). Quando ausente,
 *   lê de `process.argv` via `parseSeedArgs` — comportamento dos wrappers
 *   de linha de comando. Injetar permite ao `seed-test-data.js` reusar o
 *   admin já inicializado e o uid do organizador que ele mesmo criou.
 */
async function runTournamentEnrollmentSeed({
  defaultTournamentName,
  buildTournamentDoc,
  extraLogLines = () => [],
  args,
}) {
  const {APPLY, projectId, MANAGER_UID, TOURNAMENT_NAME} =
    args || parseSeedArgs(defaultTournamentName);
  const db = admin.firestore();

  console.log(`Projeto: ${projectId}`);
  console.log(`Modo: ${APPLY ? "APLICAR (--yes)" : "DRY-RUN"}`);
  console.log(`Torneio: "${TOURNAMENT_NAME}"`);
  console.log(`Organizador: ${MANAGER_UID}`);
  for (const line of extraLogLines()) {
    console.log(line);
  }

  const categories = buildCategories();
  let tournament = await findTournamentByName(db, TOURNAMENT_NAME);
  let tournamentId;

  if (tournament) {
    tournamentId = tournament.id;
    console.log(`\nTorneio existente reutilizado: ${tournamentId}`);
  } else {
    tournamentId = db.collection("tournaments").doc().id;
    const doc = buildTournamentDoc(categories, TOURNAMENT_NAME);
    doc.managerId = MANAGER_UID;
    console.log(`\nNovo torneio: ${tournamentId}`);
    console.log(`Categorias (${categories.length}):`);
    for (const c of categories) {
      console.log(
        `  - ${c.id} — ${c.categoryName} (${genderTypeDisplayLabel(c.genderType)}, ${c.level})`,
      );
    }
    if (!APPLY) {
      console.log("\nDRY-RUN: torneio não criado. Rode com --yes para aplicar.");
      return;
    }
    await db.doc(`tournaments/${tournamentId}`).set(doc);
    tournament = {id: tournamentId, data: doc};
    console.log("Torneio criado.");
  }

  const athletesByCategory = await loadSeedAthletesByCategory(db);
  const enrolledUids = await loadEnrolledUids(db, projectId, tournamentId);

  console.log("\nAtletas seed por categoria:");
  for (const [categoryId, athletes] of athletesByCategory.entries()) {
    const available = athletes.filter((a) => !enrolledUids.has(a.uid)).length;
    console.log(`  ${categoryId}: ${athletes.length} total, ${available} disponíveis`);
  }

  const plans = buildPairPlans(
    tournament.data,
    athletesByCategory,
    enrolledUids,
  );
  console.log(`\nPlanos de dupla pagas: ${plans.length}`);

  if (plans.length === 0) {
    console.log("Nada a inscrever. Rode seed-athletes.js antes ou todos já estão inscritos.");
    return;
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: inscrições não gravadas. Rode com --yes para aplicar.");
    return;
  }

  const pairs = await applyPaidPlans(
    db,
    projectId,
    tournamentId,
    tournament.data,
    plans,
  );
  const stats = await refreshTournamentStats(
    db,
    projectId,
    tournamentId,
    tournament.data,
  );

  console.log(`\nOK: ${pairs} duplas inscritas e pagas.`);
  console.log(`enrolledCount=${stats.enrolledCount} collectedCents=${stats.collectedCents}`);
  console.log(`Torneio: tournaments/${tournamentId}`);
}

module.exports = {
  LEVELS,
  GENDERS,
  dayKeyInSaoPaulo,
  buildCategories,
  buildTournamentDocFuture,
  buildTournamentDocToday,
  runTournamentEnrollmentSeed,
};

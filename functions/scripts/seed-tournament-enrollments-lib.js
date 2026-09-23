/* eslint-disable */
/**
 * Lógica compartilhada dos seeds de torneio com inscrições pagas.
 */

const fs = require("fs");
const admin = require("firebase-admin");
const {genderTypeDisplayLabel} = require("../lib/category-display-labels");
const {
  computeTournamentCollectedStats,
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
/** 10 = 5 níveis × 2 gêneros — o GRID de categorias de duelo que
 *  `buildCategories()` gera. A categoria King of the Court é somada por fora
 *  (ver [KOC_CATEGORY_ID]), para `maxCategories` continuar significando
 *  "as N primeiras da ordem nível×gênero". */
const TOTAL_CATEGORIES = LEVELS.length * GENDERS.length;

/** Categoria King of the Court do seed. Existe para o torneio de teste ter os
 *  DOIS formatos, que é o cenário real: a rodada KOTC divide a coleção
 *  `matches` com partidas de duelo do mesmo torneio, e é isso que a blindagem
 *  do formato protege. Seed sem ela testa só metade. */
const KOC_CATEGORY_ID = "koc-open-masc";
/** Pool de atletas que alimenta a categoria KOTC.
 *
 *  Reaproveita o pool de Open Masculino de propósito: o seed cria 32 atletas
 *  por nível×gênero, exatamente as 16 duplas da categoria de duelo, e não
 *  sobra ninguém. Como `enrolledUids` não é mutado durante o planejamento, o
 *  mesmo atleta entra nas duas categorias — o que a categoria permite
 *  (`maxRegistrationsPerAthlete: 2`) e o que acontece numa etapa real. */
const KOC_SOURCE_CATEGORY_ID = "open-masc";
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

/** Lista de recorte -> Set; ausente ou vazia vira `null` (sem recorte). */
function toFilterSet(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return new Set(values);
}

/**
 * Categorias do torneio seed, na ordem `LEVELS` × `GENDERS`.
 *
 * @param {object} [options]
 * @param {number} [options.maxCategories] Mantém só as N primeiras dessa
 *   ordem. Sem o corte saem as 10 (5 níveis × 2 gêneros) — o default.
 * @param {number} [options.maxTeamsPerCategory=16] Vagas por categoria. É
 *   também o teto de duplas inscritas: `buildPairPlans` lê `maxTeams` do
 *   próprio doc da categoria para dimensionar o pool de atletas.
 * @param {string[]} [options.levels] Recorta por código de nível
 *   (`LEVELS[].code`); ausente, valem todos. Existe porque `maxCategories`
 *   só sabe cortar as PRIMEIRAS da ordem: um torneio só de Open era
 *   inalcançável sem também criar as oito categorias abaixo dele.
 * @param {string[]} [options.genders] Recorta por gênero (`GENDERS[].type`,
 *   `male`/`female`); ausente, valem todos.
 */
function buildCategories({
  maxCategories,
  maxTeamsPerCategory,
  levels,
  genders,
  kingOfCourt = true,
} = {}) {
  const maxTeams =
    Number.isInteger(maxTeamsPerCategory) && maxTeamsPerCategory > 0 ?
      maxTeamsPerCategory :
      MAX_TEAMS_PER_CATEGORY;
  const levelFilter = toFilterSet(levels);
  const genderFilter = toFilterSet(genders);
  const categories = [];
  for (const level of LEVELS) {
    if (levelFilter && !levelFilter.has(level.code)) continue;
    for (const gender of GENDERS) {
      if (genderFilter && !genderFilter.has(gender.type)) continue;
      const id = `${level.code}-${gender.suffix}`;
      categories.push({
        id,
        categoryName: `${level.label} ${gender.label}`,
        genderType: gender.type,
        disputeType: "dupla",
        ageBand: "open",
        ageRestriction: {mode: "none", reference: "tournamentStart"},
        level: level.label,
        maxTeams,
        spotsTotal: maxTeams,
        spotsLeft: maxTeams,
        entryFee: DEFAULT_ENTRY_FEE_CENTS / 100,
        entryFeeCents: DEFAULT_ENTRY_FEE_CENTS,
        useDefaultPrice: true,
        bracketFormat: "groups_knockout",
        teamsPerGroup: 4,
        qualifiersPerGroup: 2,
        bestOf: "singleSet",
        finalBestOf5: false,
        maxRegistrationsPerAthlete: 2,
        registrationClosed: false,
        isCompleted: false,
        prizes: [],
        uniformType: "none",
      });
    }
  }
  const grid =
    Number.isInteger(maxCategories) && maxCategories > 0 ?
      categories.slice(0, Math.min(maxCategories, categories.length)) :
      categories;

  // A KOTC entra DEPOIS do corte: `maxCategories` corta o grid nível×gênero, e
  // somá-la antes faria um seed enxuto (`--categories 1`) nunca incluir o
  // formato novo — justamente o que se quer testar.
  if (!kingOfCourt) return grid;
  return [...grid, buildKingOfCourtCategory(maxTeams)];
}

/** Categoria King of the Court, com a config que `resolveKocConfig` lê no
 *  backend (`teamsPerCourt`/`qualifiersPerRound`/`roundDurationSec`).
 *
 *  16 duplas em quadras de 4 fecham exato: 4 rodadas → 2 semifinais → final,
 *  que é o desenho da 1ª etapa em `docs/product/king-of-court-plan.md`. */
function buildKingOfCourtCategory(maxTeams) {
  return {
    id: KOC_CATEGORY_ID,
    categoryName: "King of the Court Open Masculino",
    genderType: "male",
    disputeType: "dupla",
    ageBand: "open",
    ageRestriction: {mode: "none", reference: "tournamentStart"},
    level: "Open",
    maxTeams,
    spotsTotal: maxTeams,
    spotsLeft: maxTeams,
    entryFee: DEFAULT_ENTRY_FEE_CENTS / 100,
    entryFeeCents: DEFAULT_ENTRY_FEE_CENTS,
    useDefaultPrice: true,
    bracketFormat: "king_of_court",
    // Grid de grupos não se aplica, mas os campos existem no shape da
    // categoria — ficam no padrão para não virar `undefined` no doc.
    teamsPerGroup: 4,
    qualifiersPerGroup: 2,
    teamsPerCourt: 4,
    // Duas rodadas por chave: cada uma classifica UMA dupla, e a vencedora sai.
    // O seed existe pra exercitar o produto, e este campo só aparece no formato
    // da chave — com 1 o seed geraria 7 rodadas, indistinguíveis de uma
    // categoria sem a configuração. Com 2 são 11 (8 → 2 → 1), que é a forma que
    // o gerador e o sorteio ao vivo precisam provar que produzem.
    roundsPerBracket: 2,
    qualifiersPerRound: 2,
    roundDurationSec: 900,
    // A rodada tem cronômetro, não sets — `bestOf` fica no padrão e é ignorado
    // pelo gerador KOTC.
    bestOf: "singleSet",
    finalBestOf5: false,
    maxRegistrationsPerAthlete: 2,
    registrationClosed: false,
    isCompleted: false,
    prizes: [],
    uniformType: "none",
  };
}

/**
 * Campos de CONFIGURAÇÃO da categoria — os que decidem a forma da chave.
 *
 * Deliberadamente NÃO inclui vagas (`maxTeams`/`spotsTotal`/`spotsLeft`),
 * inscrições nem prêmios: num torneio reutilizado essas coisas já refletem o
 * que foi inscrito, e sobrescrevê-las desalinharia os contadores.
 */
const CATEGORY_CONFIG_FIELDS = [
  "bracketFormat",
  "teamsPerGroup",
  "qualifiersPerGroup",
  "teamsPerCourt",
  "roundsPerBracket",
  "qualifiersPerRound",
  "roundDurationSec",
  "bestOf",
  "finalBestOf5",
];

/**
 * Atualiza a CONFIG das categorias já gravadas com a do seed atual, casando
 * por `id`. Categoria que só existe num dos lados fica como está.
 *
 * Existe porque as categorias só são gravadas na criação do torneio, e o seed
 * evolui: quando `roundsPerBracket` entrou na categoria KOTC, todo torneio
 * seed já criado continuou sem o campo. Quem re-rodava o seed no mesmo
 * `--tournament-name` via a chave sair com a forma antiga e não tinha como
 * saber que a config nunca havia chegado no doc.
 *
 * @returns {{categories: object[], changes: string[]}} As categorias
 *   atualizadas e a lista legível do que mudou (vazia = nada a fazer).
 */
function refreshCategoryConfig(existingCategories, seedCategories) {
  const bySeedId = new Map(seedCategories.map((c) => [c.id, c]));
  const changes = [];
  const categories = (existingCategories || []).map((current) => {
    const seed = bySeedId.get(current.id);
    if (!seed) return current;
    const next = {...current};
    for (const field of CATEGORY_CONFIG_FIELDS) {
      if (!(field in seed)) continue;
      if (current[field] === seed[field]) continue;
      changes.push(
        `${current.id}.${field}: ${JSON.stringify(current[field])} -> ` +
        `${JSON.stringify(seed[field])}`,
      );
      next[field] = seed[field];
    }
    return next;
  });
  return {categories, changes};
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

/**
 * ATENÇÃO: casa por substring nos DOIS sentidos — "Copa" casa com
 * "Copa Goiás" e vice-versa. É deliberadamente frouxo para o operador não
 * precisar digitar o nome exato, mas é o motivo de existir
 * `requireSeedFlagOnReuse` em `runTournamentEnrollmentSeed`.
 */
function namesMatch(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  // Nome vazio: `"".includes(...)` / `x.includes("")` é true em JS e faria
  // qualquer --tournament-name casar com um torneio sem name (ex.: lHRK4…).
  if (!na || !nb) return false;
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

  // Pool da categoria King of the Court.
  //
  // `buildPairPlans` casa BUCKET com id de categoria: sem um bucket próprio, a
  // categoria KOTC nasceria vazia e o seed não testaria nada do formato.
  //
  // Reaproveita o pool de Open Masculino INVERTIDO: o seed cria 32 atletas por
  // nível×gênero, exatamente as 16 duplas da categoria de duelo, então não há
  // pool livre. Inverter forma duplas DIFERENTES com os mesmos atletas, o que é
  // mais próximo de uma etapa real do que repetir as mesmas duplas.
  const kocSource = byCategory.get(KOC_SOURCE_CATEGORY_ID);
  if (kocSource) {
    byCategory.set(KOC_CATEGORY_ID, [...kocSource].reverse());
  }

  return byCategory;
}

/**
 * Uma leitura só das inscrições do torneio, com as DUAS coisas que o
 * planejamento precisa: quem já está inscrito (para não inscrever de novo) e
 * quantas duplas cada categoria já tem (para não estourar `maxTeams` numa
 * segunda execução — o filtro por uid sozinho só enxerga o pool de atletas).
 */
async function loadEnrollmentState(db, projectId, tournamentId) {
  const enrolledUids = new Set();
  const teamsByCategory = new Map();
  // Equipes que já têm inscrição NESTE torneio: `resolveSeedPairTeams` não
  // reusa nenhuma delas, para o par poder entrar numa segunda categoria.
  const teamIdsInTournament = new Set();
  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const participants = Array.isArray(data.participantUids) ?
      data.participantUids :
      [];
    for (const uid of participants) {
      if (uid) enrolledUids.add(String(uid).trim());
    }
    const p1 = String(data.player1Id ?? "").trim();
    if (p1) enrolledUids.add(p1);

    const teamId = String(data.teamId ?? "").trim();
    if (teamId) teamIdsInTournament.add(teamId);

    if (data.waitlist === true) continue;
    const categoryId = String(data.categoryId ?? "").trim();
    if (!categoryId) continue;
    teamsByCategory.set(categoryId, (teamsByCategory.get(categoryId) ?? 0) + 1);
  }
  return {enrolledUids, teamsByCategory, teamIdsInTournament};
}

function buildPairPlans(
  tournament,
  athletesByCategory,
  enrolledUids,
  teamsByCategory = new Map(),
) {
  const plans = [];
  for (const [categoryId, athletes] of athletesByCategory.entries()) {
    const available = athletes.filter((a) => !enrolledUids.has(a.uid));
    const category = (tournament.categories || []).find(
      (c) => String(c.id ?? "").trim() === categoryId,
    );
    if (!category) continue;

    const maxTeams = Number(category.maxTeams) || MAX_TEAMS_PER_CATEGORY;
    // O teto é sobre as duplas da CATEGORIA, não sobre o pool de atletas: numa
    // segunda execução sobram atletas não inscritos e, sem descontar as duplas
    // que já existem, a categoria passaria de `maxTeams`.
    const remainingTeams = Math.max(
      0,
      maxTeams - (teamsByCategory.get(categoryId) ?? 0),
    );
    const pool = available.slice(0, remainingTeams * 2);

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

/** Cópia declarada de `buildPairKey` (functions/src/tournament-pair-uniqueness.ts:20). */
function buildPairKey(uidA, uidB) {
  const a = String(uidA ?? "").trim();
  const b = String(uidB ?? "").trim();
  if (!a || !b || a === b) return "";
  return [a, b].sort().join(":");
}

/** Cópia declarada de `pickPairTeamId` (functions/src/tournament-pair-team.ts:63). */
function pickPairTeamId(candidates) {
  let best = null;
  for (const candidate of candidates) {
    if (!candidate.id) continue;
    if (
      best == null ||
      candidate.createdAtMs < best.createdAtMs ||
      (candidate.createdAtMs === best.createdAtMs && candidate.id < best.id)
    ) {
      best = candidate;
    }
  }
  return best?.id ?? "";
}

/**
 * Índice `pairKey -> candidatos` das equipes de dupla que já existem.
 *
 * Só enxerga doc COM `pairKey` gravado — é o mesmo limite de
 * `resolvePairTeamTx`, e por isso `backfill-team-pair-key.js` vem antes de
 * qualquer coisa que dependa desta leitura.
 */
async function loadPairTeamIndex(db, projectId, plans) {
  const keys = [...new Set(
    plans.map((p) => buildPairKey(p.player1?.uid, p.player2?.uid)).filter(Boolean),
  )];
  const index = new Map();
  const teamsRef = db.collection(artifactsTeamsPath(projectId));
  // `in` aceita 30 valores por consulta.
  for (let i = 0; i < keys.length; i += 30) {
    const snap = await teamsRef.where("pairKey", "in", keys.slice(i, i + 30)).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      // `pairKey` é índice, não prova: a identidade vale pelos player ids do
      // próprio doc (mesma revalidação que o servidor faz).
      const key = buildPairKey(data.player1Id, data.player2Id);
      if (!key || key !== String(data.pairKey ?? "").trim()) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({
        id: doc.id,
        createdAtMs: data.createdAt?.toMillis?.() ?? 0,
      });
    }
  }
  return index;
}

/**
 * Decide, para cada plano, se a dupla reusa a equipe que já tem ou ganha doc
 * novo — espelho de `resolvePairTeamTx` (functions/src/tournament-pair-team.ts).
 *
 * O seed não passa por Cloud Function, então sem isto ele volta a criar uma
 * identidade nova a cada torneio semeado e a dupla aparece duas vezes no
 * ranking, com metade da história em cada entrada.
 *
 * `teamIdsInTournament` carrega a exceção deliberada: equipe já inscrita NESTE
 * torneio não é reusada, porque o par pode entrar em duas categorias e os
 * leitores de campanha assumem "um teamId = uma chave". O Set é mutado ao
 * longo do laço para que o segundo plano do MESMO par, no mesmo lote, também
 * caia nessa regra.
 */
function resolveSeedPairTeams(plans, pairTeamIndex, teamIdsInTournament) {
  const taken = new Set(teamIdsInTournament);
  return plans.map((plan) => {
    const pairKey = buildPairKey(plan.player1?.uid, plan.player2?.uid);
    if (!pairKey) return {...plan, pairKey: "", reuseTeamId: null};

    const chosen = pickPairTeamId(
      (pairTeamIndex.get(pairKey) ?? []).filter((c) => !taken.has(c.id)),
    );
    if (chosen) taken.add(chosen);
    return {...plan, pairKey, reuseTeamId: chosen || null};
  });
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
    const teamRef = plan.reuseTeamId ?
      teamsRef.doc(plan.reuseTeamId) :
      teamsRef.doc();
    const regRef = inscriptionsRef.doc();

    if (!plan.reuseTeamId) {
      batch.set(teamRef, {
        player1Id: plan.player1.uid,
        player2Id: plan.player2.uid,
        // Sem a chave, a equipe nascida aqui fica invisível para
        // `resolvePairTeamTx` e a próxima inscrição da dupla cria OUTRO doc.
        ...(plan.pairKey ? {pairKey: plan.pairKey} : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
      ops += 1;
    }

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
  // Os quatro campos saem juntos, como no trigger
  // `onTournamentInscriptionWriteSyncCollectedCents`: `collectedCents` é o
  // total e os outros três são o recorte por canal. Gravar só o total deixaria
  // o painel do organizador com uma divisão viaApp/viaOrganizer de outra época.
  const stats = computeTournamentCollectedStats(tournament, inscriptions);

  await db.doc(`tournaments/${tournamentId}`).set(
    {
      enrolledCount,
      collectedCents: stats.totalCents,
      collectedViaAppCents: stats.viaAppCents,
      collectedViaOrganizerCents: stats.viaOrganizerCents,
      collectedToVerifyCents: stats.toVerifyCents,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  return {enrolledCount, collectedCents: stats.totalCents};
}

/** Erro de aborto deliberado — o chamador imprime só a mensagem. */
function seedAbort(message) {
  return Object.assign(new Error(message), {seedAbort: true});
}

function reuseAbortError(searchedName, existing) {
  return seedAbort(
    `ABORTADO: o nome "${searchedName}" casou com um torneio que NÃO é seed.\n` +
    `  id ...: ${existing.id}\n` +
    `  nome .: "${String(existing.data.name ?? "").trim()}"\n` +
    "\n" +
    "A busca casa por substring nos dois sentidos, então nomes curtos pegam\n" +
    "torneios reais. Prosseguir gravaria inscrições e duplas de teste dentro\n" +
    "dele e sobrescreveria enrolledCount/collectedCents — e a limpeza não\n" +
    "desfaria nada, porque o doc não tem seedTestTournament: true.\n" +
    "\n" +
    "Rode de novo com --tournament-name <nome que não case com nenhum torneio real>.",
  );
}

/**
 * Aborta se `tournamentName` casar com um torneio sem `seedTestTournament`.
 *
 * Existe separada de `runTournamentEnrollmentSeed` para poder ser chamada
 * ANTES de qualquer escrita: no `seed-test-data.js`, quando o fluxo chega ao
 * torneio, o organizador e os 320 atletas já foram gravados — e "abortou"
 * precisa significar "não escreveu nada". A checagem lá dentro continua
 * existindo como rede de segurança para quem chamar a lib direto.
 */
async function assertReusableSeedTournament(db, tournamentName) {
  const existing = await findTournamentByName(db, tournamentName);
  if (existing && existing.data.seedTestTournament !== true) {
    throw reuseAbortError(tournamentName, existing);
  }
  return existing;
}

/**
 * @param {object} options
 * @param {object} [options.args] Args já resolvidos pelo chamador
 *   (`{APPLY, projectId, MANAGER_UID, TOURNAMENT_NAME}`). Quando ausente,
 *   lê de `process.argv` via `parseSeedArgs` — comportamento dos wrappers
 *   de linha de comando. Injetar permite ao `seed-test-data.js` reusar o
 *   admin já inicializado e o uid do organizador que ele mesmo criou.
 * @param {boolean} [options.requireSeedFlagOnReuse=false] Quando `true`,
 *   reutilizar um torneio existente exige `seedTestTournament === true` nele;
 *   se o nome casar com um torneio sem a flag, aborta sem gravar nada.
 *
 *   O default é `false` — o comportamento antigo — de propósito: os wrappers
 *   `seed-tournament-with-enrollments.js` e
 *   `seed-tournament-today-with-enrollments.js` são pré-existentes e a
 *   restrição desta branch é que nenhum comando existente mude de
 *   comportamento. Um operador pode legitimamente estar usando um deles para
 *   despejar inscrições de teste num torneio que ele mesmo criou pelo painel
 *   (sem a flag) — quebrar isso seria regressão. Quem opta pela guarda é o
 *   `seed-test-data.js`, que nasceu nesta branch com a limpeza simétrica como
 *   contrato: lá, reutilizar torneio sem a flag produz sujeira que
 *   `delete-test-data.js` nunca reencontra.
 */
async function runTournamentEnrollmentSeed({
  defaultTournamentName,
  buildTournamentDoc,
  extraLogLines = () => [],
  args,
  requireSeedFlagOnReuse = false,
  categoryOptions,
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

  const categories = buildCategories(categoryOptions);
  let tournament = await findTournamentByName(db, TOURNAMENT_NAME);
  let tournamentId;

  if (tournament) {
    tournamentId = tournament.id;
    if (requireSeedFlagOnReuse && tournament.data.seedTestTournament !== true) {
      // Rede de segurança: nada foi gravado por ESTA função neste ponto.
      throw reuseAbortError(TOURNAMENT_NAME, tournament);
    }
    console.log(`\nTorneio existente reutilizado: ${tournamentId}`);
    if (categoryOptions) {
      // As categorias só são gravadas na CRIAÇÃO; num torneio reutilizado
      // valem as que já estão no doc. Silenciar isso faria o operador achar
      // que o corte pegou quando o volume real veio do torneio antigo.
      console.log(
        "  AVISO: limites de categoria/vagas NÃO se aplicam a torneio reutilizado —" +
        " valem as categorias já gravadas nele. Use --tournament-name novo.",
      );
    }
    // A CONFIG das categorias, porém, precisa acompanhar o seed: é ela que
    // decide a forma da chave, e um torneio criado antes de um campo existir
    // ficaria para sempre com a forma antiga, em silêncio.
    const {categories: refreshed, changes} = refreshCategoryConfig(
      tournament.data.categories,
      categories,
    );
    if (changes.length > 0) {
      console.log("  Config de categoria desatualizada — atualizando:");
      for (const line of changes) console.log(`    ${line}`);
      if (APPLY) {
        await db.doc(`tournaments/${tournamentId}`).update({categories: refreshed});
        tournament = {...tournament, data: {...tournament.data, categories: refreshed}};
        console.log("  Config atualizada. Gere a chave de novo para a nova forma valer.");
      } else {
        console.log("  DRY-RUN: config não gravada.");
      }
    }
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
  const {enrolledUids, teamsByCategory, teamIdsInTournament} =
    await loadEnrollmentState(db, projectId, tournamentId);

  console.log("\nAtletas seed por categoria:");
  for (const [categoryId, athletes] of athletesByCategory.entries()) {
    const available = athletes.filter((a) => !enrolledUids.has(a.uid)).length;
    console.log(`  ${categoryId}: ${athletes.length} total, ${available} disponíveis`);
  }

  const plans = buildPairPlans(
    tournament.data,
    athletesByCategory,
    enrolledUids,
    teamsByCategory,
  );
  console.log(`\nPlanos de dupla pagas: ${plans.length}`);

  if (plans.length === 0) {
    console.log("Nada a inscrever. Rode seed-athletes.js antes ou todos já estão inscritos.");
    // Sem duplas novas os contadores ainda podem estar defasados — é o estado
    // que sobra de uma execução interrompida DEPOIS de gravar as inscrições.
    // Recalcular aqui é o que deixa a rodada seguinte consertar isso sozinha.
    if (APPLY) {
      const stats = await refreshTournamentStats(
        db,
        projectId,
        tournamentId,
        tournament.data,
      );
      console.log(
        `enrolledCount=${stats.enrolledCount} collectedCents=${stats.collectedCents}`,
      );
    }
    return;
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: inscrições não gravadas. Rode com --yes para aplicar.");
    return;
  }

  const resolvedPlans = resolveSeedPairTeams(
    plans,
    await loadPairTeamIndex(db, projectId, plans),
    teamIdsInTournament,
  );
  const reused = resolvedPlans.filter((p) => p.reuseTeamId).length;
  if (reused > 0) {
    console.log(`Equipes reaproveitadas (dupla que já existe): ${reused}`);
  }

  const pairs = await applyPaidPlans(
    db,
    projectId,
    tournamentId,
    tournament.data,
    resolvedPlans,
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
  CATEGORY_CONFIG_FIELDS,
  refreshCategoryConfig,
  LEVELS,
  GENDERS,
  TOTAL_CATEGORIES,
  MAX_TEAMS_PER_CATEGORY,
  KOC_CATEGORY_ID,
  KOC_SOURCE_CATEGORY_ID,
  dayKeyInSaoPaulo,
  buildCategories,
  buildTournamentDocFuture,
  buildTournamentDocToday,
  assertReusableSeedTournament,
  runTournamentEnrollmentSeed,
  resolveSeedPairTeams,
  loadPairTeamIndex,
  applyPaidPlans,
};

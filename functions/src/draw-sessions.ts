import {randomInt} from "node:crypto";
import {FieldPath, getFirestore, type Firestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {BRACKET_DEFINITIONS} from "./bracket-definitions/bracket-definitions";
import {tournamentSportToLevelSportCode} from "./category-level-eligibility";
import {
  artifactsDrawSessionsPath,
  artifactsInscriptionsPath,
  artifactsMatchesPath,
  artifactsTeamsPath,
  getFirebaseProjectId,
} from "./firebase-paths";
import {isBoxedDraw, type DrawFormat} from "./draw-engine";
import {
  KOC_DEFAULT_ROUND_DURATION_SEC,
  KOC_DEFAULT_TEAMS_PER_COURT,
  KOC_MIN_TEAMS_PER_ROUND,
  kocClampMaxPerRound,
  kocResolvePlan,
  KocBracketError,
  type KocPhaseSpec,
} from "./koc-bracket-builders";
import {groupCapacities} from "./draw-plan";
import {athleteRatingsPath} from "./rating-engine";
import {buildEntrants, type EntrantHistoryMatch, type EntrantSource} from "./draw-entrants";
import {byeSeeds, winnersRoundOnePairings} from "./draw-de-placement";
import {genesisHash} from "./draw-log";
import {resequenceSession, validateSeedOrder} from "./draw-resequence";
import {computeNextReveal} from "./draw-next-reveal";
import {phraseContextsFor, pickPhrase} from "./draw-phrases";
import {rankTeamsByStrength, teamStrength, type AthleteRatingLite} from "./draw-pots";
import {
  rebuildEngineState,
  type DrawSessionConfig,
  type DrawSessionDoc,
} from "./draw-session-model";
import {parseKocPhases, runGenerateCategoryBracket} from "./organizer-category-ops";
import {assertCanManageTournament} from "./tournament-acl";
import {findCategory, resolveCategoryLabel} from "./tournament-registration-guards";
import {registrationAthleteUids} from "./tournament-registration-pix-helpers";
import {chunkList} from "./test-data-cleanup";
import {CLIENT_FACING_REGIONS} from "./function-regions";

/**
 * Sorteio ao Vivo — as callables da sessão.
 *
 * Toda a decisão mora nos módulos puros (`draw-engine`, `draw-constraints`,
 * `draw-pots`, `draw-de-placement`, `draw-phrases`); aqui fica só o I/O, a
 * transação e a fonte de aleatoriedade. O cliente NUNCA sorteia: o console só
 * pede "próxima", e o resultado nasce no servidor com CSPRNG.
 *
 * Não existe desfazer. Existe `voidDrawSession`, que anula a sessão inteira com
 * motivo escrito e mantém o comprovante público — é isso que impede sortear até
 * dar certo em silêncio.
 */

const MAX_IN_CLAUSE = 30;
const MIN_TEAMS = 2;

const sessionsCol = (db: Firestore) => db.collection(artifactsDrawSessionsPath(getFirebaseProjectId()));

/** `crypto.randomInt` — aleatoriedade criptográfica, nunca `Math.random`. */
const cryptoIndex = (max: number): number => (max <= 1 ? 0 : randomInt(max));

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function assertSessionId(raw: unknown): string {
  const id = str(raw);
  if (!id) throw new HttpsError("invalid-argument", "sessionId obrigatório");
  return id;
}

async function loadSession(
  db: Firestore,
  sessionId: string,
): Promise<{ref: FirebaseFirestore.DocumentReference; doc: DrawSessionDoc}> {
  const ref = sessionsCol(db).doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Sessão de sorteio não encontrada");
  return {ref, doc: snap.data() as DrawSessionDoc};
}

/** Duplas aptas à chave — MESMA regra de `generateCategoryBracket`. */
async function paidTeamIdsOf(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<Map<string, Record<string, unknown>>> {
  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const out = new Map<string, Record<string, unknown>>();
  for (const doc of snap.docs) {
    const data = doc.data();
    const teamId = str(data.teamId);
    if (teamId && data.isPaid === true && data.waitlist !== true && data.partnerPending !== true) {
      out.set(teamId, data);
    }
  }
  return out;
}

async function fetchByIds(
  db: Firestore,
  path: string,
  ids: readonly string[],
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  for (const chunk of chunkList(unique, MAX_IN_CLAUSE)) {
    const snap = await db
      .collection(path)
      .where(FieldPath.documentId(), "in", chunk)
      .get();
    for (const doc of snap.docs) out.set(doc.id, doc.data());
  }
  return out;
}

const isFinalMatchType = (matchType: string): boolean => {
  const t = matchType.trim().toLowerCase();
  return (
    t.includes("final") && !t.includes("semi") && !t.includes("quarter") && !t.includes("third")
  );
};

/**
 * Histórico concluído de cada dupla, mais recente primeiro. Duas rodadas de
 * consultas em lote (`teamAId in`, `teamBId in`) em vez de uma por dupla —
 * 32 duplas viram ~4 idas ao Firestore.
 */
async function fetchHistories(
  db: Firestore,
  projectId: string,
  teamIds: readonly string[],
): Promise<Map<string, EntrantHistoryMatch[]>> {
  const out = new Map<string, EntrantHistoryMatch[]>(teamIds.map((id) => [id, []]));
  const col = db.collection(artifactsMatchesPath(projectId));

  for (const field of ["teamAId", "teamBId"] as const) {
    for (const chunk of chunkList([...teamIds], MAX_IN_CLAUSE)) {
      const snap = await col.where(field, "in", chunk).get();
      for (const doc of snap.docs) {
        const m = doc.data();
        const winnerId = str(m.winnerId);
        if (!winnerId) continue; // só partidas decididas entram no cartel
        const teamId = str(m[field]);
        const list = out.get(teamId);
        if (!list) continue;
        list.push({
          won: winnerId === teamId,
          isFinal: isFinalMatchType(str(m.matchType)),
          tournamentId: str(m.tournamentId),
        });
      }
    }
  }
  return out;
}

interface CategoryMeta {
  name: string;
  teamsPerGroup: number;
  /** Duplas por quadra na KOTC — o tamanho da rodada da classificatória. */
  teamsPerCourt: number;
  /** Rodadas que cada CHAVE joga na classificatória. Muda quantas chaves o
   *  campo tem, então o sorteio precisa saber: as caixas que ele sorteia SÃO as
   *  chaves, e a geração recusa a chave se as contas não baterem. */
  roundsPerBracket: number;
  qualifiersPerGroup: number;
  bracketFormat: string | null;
  /** Plano explícito de fases da categoria; ausente ⇒ regras antigas. */
  kocPhases: KocPhaseSpec[] | undefined;
  /** Teto de duplas numa bateria nesta categoria. */
  kocMaxTeamsPerRound: number;
}

function categoryMetaOf(tournament: Record<string, unknown>, categoryId: string): CategoryMeta {
  // Mesma resolução de rótulo do resto do produto — `categoryName`/`label`, não só `name`.
  const found = findCategory(tournament, categoryId);
  const num = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return {
    name: resolveCategoryLabel(tournament, categoryId) || "Categoria",
    teamsPerGroup: num(found?.teamsPerGroup, 4),
    // Duplas por quadra da KOTC: o tamanho da rodada da classificatória.
    teamsPerCourt: num(found?.teamsPerCourt, KOC_DEFAULT_TEAMS_PER_COURT),
    roundsPerBracket: Math.max(1, Math.floor(num(found?.roundsPerBracket, 1))),
    qualifiersPerGroup: num(found?.qualifiersPerGroup, 2),
    bracketFormat: str(found?.bracketFormat) || null,
    kocPhases: parseKocPhases(found?.kocPhases ?? found?.phases),
    kocMaxTeamsPerRound: kocClampMaxPerRound(found?.kocMaxTeamsPerRound ?? found?.maxTeamsPerRound),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createDrawSession
// ─────────────────────────────────────────────────────────────────────────────

export const createDrawSession = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = str(request.data?.tournamentId);
  const categoryId = str(request.data?.categoryId);
  if (!tournamentId || !categoryId) {
    throw new HttpsError("invalid-argument", "tournamentId e categoryId obrigatórios");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const tournament = await assertCanManageTournament(db, uid, tournamentId);
  const category = categoryMetaOf(tournament, categoryId);

  const rawFormat = str(request.data?.format) || category.bracketFormat || "groups_knockout";
  if (
    rawFormat !== "groups_knockout" &&
    rawFormat !== "double_elimination" &&
    rawFormat !== "king_of_court"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "O sorteio ao vivo cobre fase de grupos, dupla eliminatória e King of the Court.",
      {reason: "format_unsupported", format: rawFormat},
    );
  }
  const format = rawFormat as DrawFormat;

  const registrations = await paidTeamIdsOf(db, projectId, tournamentId, categoryId);
  const teamIds = [...registrations.keys()];
  if (teamIds.length < MIN_TEAMS) {
    throw new HttpsError(
      "failed-precondition",
      "É necessário ao menos 2 duplas confirmadas para sortear.",
      {reason: "not_enough_teams", teamCount: teamIds.length},
    );
  }
  if (format === "king_of_court" && teamIds.length < KOC_MIN_TEAMS_PER_ROUND) {
    throw new HttpsError(
      "failed-precondition",
      `King of the Court precisa de ao menos ${KOC_MIN_TEAMS_PER_ROUND} duplas ` +
        "confirmadas para sortear.",
      {reason: "koc_not_enough_teams", teamCount: teamIds.length},
    );
  }
  // Recusa AQUI, não no publish. O sorteio ao vivo acontece na frente do
  // público: descobrir que a configuração não fecha depois de revelar as duplas
  // obrigaria a anular a sessão inteira com todo mundo olhando.
  let kocPlan: KocPhaseSpec[] = [];
  if (format === "king_of_court") {
    try {
      kocPlan = kocResolvePlan(teamIds.length, {
        teamsPerCourt: category.teamsPerCourt,
        qualifiersPerRound: category.qualifiersPerGroup,
        roundsPerBracket: category.roundsPerBracket,
        roundDurationSec: KOC_DEFAULT_ROUND_DURATION_SEC,
        maxTeamsPerRound: category.kocMaxTeamsPerRound,
        ...(category.kocPhases ? {phases: category.kocPhases} : {}),
      });
    } catch (e) {
      if (e instanceof KocBracketError) {
        throw new HttpsError("failed-precondition", e.message, {reason: e.reason});
      }
      throw e;
    }
    // O sorteio guarda só o ALVO da caixa (`teamsPerBox`, mais abaixo) e
    // reconstrói as caixas com `groupCapacities` — a MESMA função que monta o
    // elenco revelado. Comparar só a CONTAGEM de caixas não basta: um plano
    // EXPLÍCITO pode ter a contagem certa e a FORMA errada. `[6,6,4,3]` para 19
    // duplas tem `ceil(19/6) = 4` caixas — a contagem bate — mas
    // `groupCapacities(19, 6)` monta `[5,5,5,4]`, forma que não bate. Nem
    // `assertPlan` (plano explícito) nem `kocLegacyPlan` (plano derivado)
    // garantem essa forma canônica; só a geração exige forma exata, e só
    // descobre no publish, com as duplas já reveladas. Por isso a comparação é
    // elemento a elemento, não só o tamanho do array.
    const kocTarget = Math.max(...kocPlan[0]!.bracketSizes);
    const kocPlanSizes = kocPlan[0]!.bracketSizes;
    const kocDrawnBoxes = groupCapacities(teamIds.length, kocTarget).map((g) => g.capacity);
    const kocShapeMatches = kocDrawnBoxes.length === kocPlanSizes.length &&
      kocDrawnBoxes.every((capacity, i) => capacity === kocPlanSizes[i]);
    if (!kocShapeMatches) {
      const hint = category.kocPhases ?
        "as chaves da fase 1 no plano" :
        '"Duplas por quadra"';
      throw new HttpsError(
        "failed-precondition",
        `A fase 1 do plano pede as chaves [${kocPlanSizes.join(", ")}], mas com ` +
          `caixas de até ${kocTarget} duplas o sorteio monta ` +
          `[${kocDrawnBoxes.join(", ")}] para ${teamIds.length} duplas — as formas ` +
          `não batem. Ajuste ${hint} antes de sortear.`,
        {
          reason: "koc_bracket_count_not_roundtrippable",
          teamCount: teamIds.length,
          planBracketSizes: kocPlanSizes,
          drawBracketSizes: kocDrawnBoxes,
        },
      );
    }
  }
  if (format === "double_elimination" && !BRACKET_DEFINITIONS[teamIds.length]) {
    throw new HttpsError(
      "failed-precondition",
      `Não há planta de dupla eliminação para ${teamIds.length} duplas.`,
      {reason: "de_unsupported_team_count", teamCount: teamIds.length},
    );
  }

  // Tamanho da caixa do sorteio. Na KOTC a caixa é uma CHAVE, e quem decide o
  // tamanho é o PLANO — não uma conta refeita aqui. O elenco sorteado vira o
  // elenco da fase 1, e a geração recusa quando o número de caixas não bate.
  // `groupCapacities` reconstrói por `ceil(duplas / alvo)`, que é a mesma
  // distribuição de `kocRoundSizes`: o maior tamanho do plano é o alvo.
  const teamsPerBox = format === "king_of_court" ?
    Math.max(...kocPlan[0]!.bracketSizes) :
    category.teamsPerGroup;

  const sportCode = tournamentSportToLevelSportCode(tournament.sportId);
  const teams = await fetchByIds(db, artifactsTeamsPath(projectId), teamIds);

  const uidsByTeam = new Map<string, string[]>(
    teamIds.map((teamId) => [
      teamId,
      registrationAthleteUids(registrations.get(teamId) ?? {}, teams.get(teamId)),
    ]),
  );
  const allUids = [...new Set([...uidsByTeam.values()].flat())];

  const [profiles, ratingDocs, histories] = await Promise.all([
    fetchByIds(db, "public_profiles", allUids),
    fetchByIds(
      db,
      athleteRatingsPath(projectId),
      sportCode ? allUids.map((u) => `${u}_${sportCode}`) : [],
    ),
    fetchHistories(db, projectId, teamIds),
  ]);

  const ratingOf = (athleteUid: string): AthleteRatingLite | null => {
    const data = ratingDocs.get(`${athleteUid}_${sportCode}`);
    const rating = data?.rating;
    if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
    const rated = data?.ratedMatches;
    return {rating, ratedMatches: typeof rated === "number" ? rated : 0};
  };

  const sources: EntrantSource[] = teamIds.map((teamId) => {
    const uids = uidsByTeam.get(teamId) ?? [];
    return {
      teamId,
      teamName: str(teams.get(teamId)?.teamName) || null,
      profiles: uids.map((athleteUid) => {
        const p = profiles.get(athleteUid) ?? {};
        const onboarding = (p.sportOnboarding ?? {}) as Record<string, unknown>;
        const bySport = (onboarding.levelsBySport ?? {}) as Record<string, string>;
        return {
          displayName:
            str(p.nickname) || str(p.fullName) || str(p.displayName) || str(p.name) || "Atleta",
          photoUrl:
            str(p.profilePhotoUrl) || str(p.avatarUrl) || str(p.photoURL) || str(p.photoUrl) || null,
          city: str(p.city) || null,
          levelsBySport: bySport,
          legacyLevel: str(p.level) || str(p.nivel) || null,
        };
      }),
      ratings: uids.map(ratingOf),
      history: histories.get(teamId) ?? [],
    };
  });

  // Ordena por força pra montar potes/cabeças — a mesma regra que a tela de
  // Cabeças de chave usa pra sugerir a ordem.
  const strengths = sources.map((s) => ({
    teamId: s.teamId,
    ...teamStrength(
      s.profiles.map((p) => ({levelsBySport: p.levelsBySport, legacyLevel: p.legacyLevel})),
      sportCode,
      s.ratings,
    ),
  }));
  const ranked = rankTeamsByStrength(strengths);

  const lockedSeedCount =
    format === "double_elimination" ?
      Math.min(Math.max(0, Number(request.data?.lockedSeedCount ?? 4) || 0), teamIds.length) :
      0;

  // Potes e cabeças saem de `resequenceSession`, a MESMA função que a
  // reordenação manual usa. Duas regras de montagem seriam duas chaves
  // diferentes para a mesma ordem.
  const baseEntrants = buildEntrants(sources, sportCode, [], []);
  const seeded = resequenceSession(
    {
      format,
      config: {
        lockedSeedCount,
        teamsPerGroup: teamsPerBox,
      },
      entrants: baseEntrants,
    } as unknown as DrawSessionDoc,
    ranked,
  );
  const pots = seeded.pots;
  const entrants = seeded.entrants;

  const definition = BRACKET_DEFINITIONS[teamIds.length];
  const doc: DrawSessionDoc = {
    tournamentId,
    categoryId,
    tournamentName: str(tournament.name) || "Torneio",
    categoryName: category.name,
    sportCode,
    format,
    status: "draft",
    scheduledAt: typeof request.data?.scheduledAt === "number" ? request.data.scheduledAt : null,
    startedAt: null,
    publishedAt: null,
    voidedAt: null,
    voidReason: null,
    config: {
      mode: "hybrid",
      intervalMs: 6000,
      phrasesEnabled: true,
      lockedSeedCount,
      teamsPerGroup: teamsPerBox,
      qualifiersPerGroup: category.qualifiersPerGroup,
      constraints: {
        seedsApart: isBoxedDraw(format),
        potsPerGroup: isBoxedDraw(format),
        avoidSameCity: false,
        // As cabeças abrem o sorteio com lugar já definido — 1ª do ranking no
        // grupo A, 2ª no B. Na dupla eliminatória isso já era assim por
        // `lockedSeedCount`; aqui a fase de grupos passa a fazer igual.
        seedsPreassigned: isBoxedDraw(format),
      },
    },
    pots,
    entrants,
    reveals: [],
    genesisHash: "",
    totalReveals: seeded.totalReveals,
    spotlightClearedIndex: 0,
    bracketOutline:
      format === "double_elimination" && definition ?
        {pairings: winnersRoundOnePairings(definition), byeSeeds: byeSeeds(definition)} :
        null,
    createdBy: uid,
    createdAt: Date.now(),
  };

  const ref = sessionsCol(db).doc();
  doc.genesisHash = genesisHash(ref.id);
  await ref.set(doc);

  logger.info("createDrawSession: sessão criada", {
    sessionId: ref.id,
    tournamentId,
    categoryId,
    format,
    teamCount: teamIds.length,
  });
  return {sessionId: ref.id, totalReveals: doc.totalReveals, teamCount: teamIds.length};
});

// ─────────────────────────────────────────────────────────────────────────────
// updateDrawSessionConfig · startDrawSession
// ─────────────────────────────────────────────────────────────────────────────

export const updateDrawSessionConfig = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");
  const sessionId = assertSessionId(request.data?.sessionId);

  const db = getFirestore();
  const {ref, doc} = await loadSession(db, sessionId);
  await assertCanManageTournament(db, uid, doc.tournamentId);

  if (doc.status !== "draft" && doc.status !== "scheduled") {
    throw new HttpsError(
      "failed-precondition",
      "A configuração só muda antes de a sessão ir ao ar.",
      {reason: "session_not_editable", status: doc.status},
    );
  }

  const patch = (request.data?.config ?? {}) as Partial<DrawSessionConfig>;
  const config: DrawSessionConfig = {
    ...doc.config,
    ...(patch.mode ? {mode: patch.mode} : {}),
    ...(typeof patch.intervalMs === "number" ?
      {intervalMs: Math.min(Math.max(patch.intervalMs, 2000), 15000)} :
      {}),
    ...(typeof patch.phrasesEnabled === "boolean" ? {phrasesEnabled: patch.phrasesEnabled} : {}),
    ...(patch.constraints ? {constraints: {...doc.config.constraints, ...patch.constraints}} : {}),
  };

  const scheduledAt =
    typeof request.data?.scheduledAt === "number" ? request.data.scheduledAt : doc.scheduledAt;

  await ref.update({
    config,
    scheduledAt: scheduledAt ?? null,
    status: scheduledAt ? "scheduled" : doc.status,
  });
  return {ok: true};
});

export const startDrawSession = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");
  const sessionId = assertSessionId(request.data?.sessionId);

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  const {ref, doc} = await loadSession(db, sessionId);
  await assertCanManageTournament(db, uid, doc.tournamentId);

  if (doc.status === "live") return {ok: true, alreadyLive: true};
  if (doc.status !== "draft" && doc.status !== "scheduled") {
    throw new HttpsError("failed-precondition", "Esta sessão já foi encerrada.", {
      reason: "session_closed",
      status: doc.status,
    });
  }

  // O snapshot de duplas foi congelado na criação e o mundo se mexe: dupla
  // substituída, removida ou paga depois. Recusar aqui é melhor que sortear com
  // uma lista velha na frente de todo mundo.
  const paid = await paidTeamIdsOf(db, projectId, doc.tournamentId, doc.categoryId);
  const snapshotIds = new Set(doc.entrants.map((e) => e.teamId));
  const diverged =
    paid.size !== snapshotIds.size || [...paid.keys()].some((id) => !snapshotIds.has(id));
  if (diverged) {
    throw new HttpsError(
      "failed-precondition",
      "As inscrições confirmadas mudaram desde que a sessão foi criada. " +
        "Crie a sessão de novo para sortear com a lista atual.",
      {reason: "entrants_stale", snapshot: snapshotIds.size, current: paid.size},
    );
  }

  await ref.update({status: "live", startedAt: Date.now()});
  return {ok: true};
});

// ─────────────────────────────────────────────────────────────────────────────
// drawNextReveal — o sorteio
// ─────────────────────────────────────────────────────────────────────────────

export const drawNextReveal = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");
  const sessionId = assertSessionId(request.data?.sessionId);
  const expectedIndex = Number(request.data?.expectedIndex);
  if (!Number.isInteger(expectedIndex) || expectedIndex < 0) {
    throw new HttpsError("invalid-argument", "expectedIndex obrigatório");
  }

  const db = getFirestore();
  const {ref, doc: preload} = await loadSession(db, sessionId);
  await assertCanManageTournament(db, uid, preload.tournamentId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const doc = snap.data() as DrawSessionDoc;

    if (doc.status !== "live") {
      throw new HttpsError("failed-precondition", "A sessão não está no ar.", {
        reason: "session_not_live",
        status: doc.status,
      });
    }

    const outcome = computeNextReveal(doc, expectedIndex, cryptoIndex, Date.now());
    if (outcome.kind === "done") {
      return {applied: false, currentIndex: doc.reveals.length, done: true};
    }
    if (outcome.kind === "stale") {
      return {applied: false, currentIndex: outcome.currentIndex};
    }
    if (outcome.kind === "blocked") {
      logger.error("drawNextReveal: dupla sem destino viável", {sessionId, teamId: outcome.teamId});
      throw new HttpsError(
        "failed-precondition",
        "O sorteio travou: não há destino possível para a próxima dupla. " +
          "Revise as restrições da sessão.",
        {reason: "draw_blocked", teamId: outcome.teamId},
      );
    }

    const stored = outcome.reveal;
    tx.update(ref, {reveals: [...doc.reveals, stored], currentIndex: stored.index});
    return {applied: true, currentIndex: stored.index, reveal: stored};
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// replaceRevealPhrase · publishDrawSession · voidDrawSession
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reordena as cabeças de chave da sessão.
 *
 * A ordem automática vem do nível declarado, mas o organizador conhece o
 * torneio dele — campeã da etapa anterior, dupla que subiu de categoria. Esta
 * é a porta para ele mandar, e ela reusa a MESMA regra de montagem de potes da
 * criação (`resequenceSession`), então ordem automática e manual não podem
 * divergir.
 *
 * Só antes de ir ao ar: com revelações gravadas, mudar os potes reescreveria a
 * história que o log já provou.
 */
export const updateDrawSessionSeeds = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");
  const sessionId = assertSessionId(request.data?.sessionId);
  const rawOrder = Array.isArray(request.data?.seedOrder) ? request.data.seedOrder : [];
  const order = rawOrder.filter((id: unknown): id is string => typeof id === "string");

  const db = getFirestore();
  const {ref, doc} = await loadSession(db, sessionId);
  await assertCanManageTournament(db, uid, doc.tournamentId);

  if (doc.status !== "draft" && doc.status !== "scheduled") {
    throw new HttpsError(
      "failed-precondition",
      "As cabeças só mudam antes de a sessão ir ao ar.",
      {reason: "session_not_editable", status: doc.status},
    );
  }

  const verdict = validateSeedOrder(doc, order);
  if (!verdict.ok) {
    throw new HttpsError(
      "invalid-argument",
      verdict.reason === "unknown_team" ?
        "A ordem inclui uma dupla que não está nesta sessão." :
        "A ordem tem uma dupla repetida.",
      {reason: verdict.reason},
    );
  }

  const lockedSeedCount =
    doc.format === "double_elimination" && typeof request.data?.lockedSeedCount === "number" ?
      Math.min(Math.max(0, Math.floor(request.data.lockedSeedCount)), doc.entrants.length) :
      doc.config.lockedSeedCount;

  const next = resequenceSession(
    {...doc, config: {...doc.config, lockedSeedCount}},
    verdict.order,
  );

  await ref.update({
    pots: next.pots,
    entrants: next.entrants,
    totalReveals: next.totalReveals,
    "config.lockedSeedCount": lockedSeedCount,
  });
  return {ok: true, totalReveals: next.totalReveals};
});

/**
 * Libera a revelação que está no ar para a tabela.
 *
 * Só faz sentido no modo manual, onde o spotlight fica parado até o organizador
 * mandar seguir. Passa pelo servidor porque o telão é outro cliente: não há
 * outro canal por onde ele saiba que o organizador apertou o botão.
 *
 * `Math.max` em vez de atribuição direta: um clique atrasado chegando depois da
 * revelação seguinte não pode voltar o spotlight de uma dupla que já saiu.
 */
export const clearRevealSpotlight = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");
  const sessionId = assertSessionId(request.data?.sessionId);
  const index = Number(request.data?.index);
  if (!Number.isInteger(index) || index < 1) {
    throw new HttpsError("invalid-argument", "index da revelação obrigatório");
  }

  const db = getFirestore();
  const {ref, doc} = await loadSession(db, sessionId);
  await assertCanManageTournament(db, uid, doc.tournamentId);

  const cleared = Math.max(doc.spotlightClearedIndex ?? 0, index);
  await ref.update({spotlightClearedIndex: cleared});
  return {spotlightClearedIndex: cleared};
});

export const replaceRevealPhrase = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");
  const sessionId = assertSessionId(request.data?.sessionId);
  const index = Number(request.data?.index);
  const clear = request.data?.clear === true;

  const db = getFirestore();
  const {ref, doc} = await loadSession(db, sessionId);
  await assertCanManageTournament(db, uid, doc.tournamentId);

  const position = doc.reveals.findIndex((r) => r.index === index);
  if (position < 0) throw new HttpsError("not-found", "Revelação não encontrada");

  const current = doc.reveals[position]!;
  const used = new Set(
    doc.reveals.map((r) => r.phrase?.id).filter((id): id is string => !!id),
  );
  const entrant = doc.entrants.find((e) => e.teamId === current.teamId);
  const next = clear ?
    null :
    pickPhrase(
      phraseContextsFor({
        format: doc.format,
        potIndex: entrant?.potIndex ?? 1,
        totalPots: doc.pots.length,
        isSeed: (entrant?.potIndex ?? 0) === 1 || entrant?.lockedSeed != null,
        sameCityInGroup: false,
        isStrongestGroup: false,
        meetsSeedOnDebut: current.dePlacement?.meetsSeed?.winsNeeded === 0,
      }),
      used,
      cryptoIndex,
      entrant?.label ?? "",
    );

  // A frase NÃO entra no hash: ela é editorial, o log prova o sorteio. Trocar a
  // frase não pode invalidar o comprovante.
  const reveals = [...doc.reveals];
  reveals[position] = {...current, phrase: next};
  await ref.update({reveals});
  return {phrase: next};
});

export const publishDrawSession = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");
  const sessionId = assertSessionId(request.data?.sessionId);

  const db = getFirestore();
  const {ref, doc} = await loadSession(db, sessionId);
  await assertCanManageTournament(db, uid, doc.tournamentId);

  if (doc.status === "published") return {alreadyPublished: true};
  if (doc.status !== "live") {
    throw new HttpsError("failed-precondition", "Só uma sessão no ar pode ser publicada.", {
      reason: "session_not_live",
      status: doc.status,
    });
  }
  if (doc.reveals.length < doc.totalReveals) {
    throw new HttpsError(
      "failed-precondition",
      `Faltam ${doc.totalReveals - doc.reveals.length} revelações para publicar.`,
      {reason: "draw_incomplete", done: doc.reveals.length, total: doc.totalReveals},
    );
  }

  const state = rebuildEngineState(doc);
  const seeds =
    doc.format === "double_elimination" ?
      state.seedOrder.filter((id): id is string => !!id) :
      doc.entrants.map((e) => e.teamId);

  // A chave nasce pelo MESMO caminho da tela de Gerar chave — byes, plantas,
  // `bestOf` e crossover têm uma implementação só.
  const result = await runGenerateCategoryBracket(uid, {
    tournamentId: doc.tournamentId,
    categoryId: doc.categoryId,
    format: doc.format,
    seeds,
    ...(isBoxedDraw(doc.format) ?
      {
        // Na KOTC cada "grupo" é uma RODADA da classificatória: o elenco sai
        // daqui em vez da semeadura em serpentina.
        groupsPreview: state.groups.map((g) => ({id: g.groupId, teamIds: g.teamIds})),
        ...(doc.format === "groups_knockout" ?
          {bracketConfig: {qualifiersPerGroup: doc.config.qualifiersPerGroup}} :
          {}),
      } :
      {}),
    force: request.data?.force === true,
  });

  await ref.update({status: "published", publishedAt: Date.now()});
  logger.info("publishDrawSession: chave publicada", {
    sessionId,
    matchCount: result.matchCount,
  });
  return result;
});

export const voidDrawSession = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");
  const sessionId = assertSessionId(request.data?.sessionId);
  const reason = str(request.data?.reason);
  if (reason.length < 5) {
    throw new HttpsError(
      "invalid-argument",
      "Escreva o motivo da anulação — ele fica no comprovante público.",
      {reason: "void_reason_required"},
    );
  }

  const db = getFirestore();
  const {ref, doc} = await loadSession(db, sessionId);
  await assertCanManageTournament(db, uid, doc.tournamentId);

  if (doc.status === "published") {
    throw new HttpsError(
      "failed-precondition",
      "A chave já foi publicada. Anular a sessão não desfaz a chave.",
      {reason: "already_published"},
    );
  }

  await ref.update({status: "voided", voidedAt: Date.now(), voidReason: reason});
  logger.warn("voidDrawSession: sessão anulada", {sessionId, uid, reason});
  return {ok: true};
});

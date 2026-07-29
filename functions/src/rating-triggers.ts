import {FieldValue, Timestamp, getFirestore} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import type {UserRecord} from "firebase-admin/auth";
import {
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {callerIsSuperAdmin} from "./auth-roles";
import {
  ATHLETE_SPORT_CODES,
  DEFAULT_LEVEL_CODE,
  levelCodeForRank,
  levelRank,
} from "./category-level-eligibility";
import {inflateRd} from "./glicko";
import {artifactsMatchesPath, getFirebaseProjectId} from "./firebase-paths";
import {MatchStatus} from "./match-status";
import {
  RATED_SPORT_CODES,
  loadRatingLadderConfig,
  resolveLadderLevel,
} from "./rating-config";
import {
  applyLadderActions,
  evaluateLadderTransition,
  ratingStateFromDoc,
  ratingStateToDoc,
  type AthleteRatingState,
} from "./rating-ladder";
import {
  applyMatchRatingUpdate,
  athleteRatingDocId,
  athleteRatingsPath,
  replayAthleteLedger,
  seedRatingState,
  shouldProcessRatingUpdate,
} from "./rating-engine";
import {tryAwardGlobalRankingForMatch} from "./tournament-ranking";

export {RATED_SPORT_CODES} from "./rating-config";

const WEEK_MS = 7 * 86_400_000;

/**
 * Rating engine: trigger desacoplado no path de matches, coexistindo com o
 * advance de chave, o XP e o points writer (cada um decide sozinho se age).
 */
export const onTournamentMatchCompletedUpdateRatings = onDocumentUpdated(
  "artifacts/{appId}/public/data/matches/{matchId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!shouldProcessRatingUpdate(before, after) || !after) return;

    try {
      const result = await applyMatchRatingUpdate(
        getFirestore(),
        event.params.appId,
        {matchId: event.params.matchId, match: after},
      );
      if (result.processed) {
        logger.info(
          `rating: partida ${event.params.matchId} processada` +
            (result.walkover ? " (W.O., sem rating)" : "") +
            (result.replayedAthleteIds
              ? ` (correção, replay de ${result.replayedAthleteIds.length} atleta(s))`
              : ""),
        );
      }
    } catch (error) {
      logger.error(`rating: falha na partida ${event.params.matchId}`, error);
    }
  },
);

async function superAdminOrThrow(uid: string | undefined): Promise<string> {
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");
  const {getAuth} = await import("firebase-admin/auth");
  const caller: UserRecord = await getAuth().getUser(uid);
  if (!callerIsSuperAdmin(caller)) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o super administrador pode executar esta operação.",
    );
  }
  return uid;
}

function levelsBySportOf(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const onboarding = data?.["sportOnboarding"];
  if (onboarding != null && typeof onboarding === "object") {
    const bySport = (onboarding as Record<string, unknown>)["levelsBySport"];
    if (bySport != null && typeof bySport === "object") {
      return bySport as Record<string, unknown>;
    }
  }
  return {};
}

/**
 * Self-upgrade: o atleta ainda pode SUBIR o próprio nível pelo app. Este
 * trigger detecta a subida em `sportOnboarding.levelsBySport`, audita em
 * `levelHistory` e re-seeda o rating para `max(atual, initialRating do novo
 * nível)` com RD resetado + proteção — o guard anti-flap contra a escada.
 *
 * Escritas da própria engine/migração são ignoradas: promoção grava
 * `athleteRatings.levelCode` na mesma leva (igualdade → skip) e a migração
 * mapeia para o mesmo rank (rank não sobe → skip).
 */
export const onUserWrittenTrackLevelChanges = onDocumentWritten(
  "users/{userId}",
  async (event) => {
    const before = event.data?.before?.data() as Record<string, unknown> | undefined;
    const after = event.data?.after?.data() as Record<string, unknown> | undefined;
    if (!after) return;

    const beforeLevels = levelsBySportOf(before);
    const afterLevels = levelsBySportOf(after);
    const userId = event.params.userId;
    const db = getFirestore();
    const projectId = getFirebaseProjectId();

    for (const sportCode of RATED_SPORT_CODES) {
      const rawBefore = String(beforeLevels[sportCode] ?? "").trim();
      const rawAfter = String(afterLevels[sportCode] ?? "").trim();
      if (!rawAfter || rawAfter === rawBefore) continue;

      const beforeRank = levelRank(rawBefore);
      const afterRank = levelRank(rawAfter);
      if (afterRank == null) continue;
      // Rename de migração (mesmo rank) ou rebaixamento da engine: não é
      // self-upgrade.
      if (beforeRank != null && afterRank <= beforeRank) continue;

      try {
        const config = await loadRatingLadderConfig(db, sportCode);
        if (!config.flags.ratingEnabled) continue;
        const newLevel = resolveLadderLevel(config, rawAfter);

        const ratingRef = db
          .collection(athleteRatingsPath(projectId))
          .doc(athleteRatingDocId(userId, sportCode));
        const snap = await ratingRef.get();
        const current = snap.exists
          ? ratingStateFromDoc(userId, sportCode, snap.data() as Record<string, unknown>)
          : null;

        // Promoção da própria engine: levelCode já está no novo nível.
        if (current && current.levelCode === newLevel.code) continue;

        const base =
          current ?? seedRatingState(userId, sportCode, config, rawAfter);
        const now = new Date();
        const upgraded: AthleteRatingState = {
          ...base,
          rating: Math.max(base.rating, newLevel.initialRating),
          rd: config.glicko.initialRd,
          levelCode: newLevel.code,
          levelRank: newLevel.rank,
          zone: "stable",
          ladderState: "stable",
          observationStartedAt: null,
          observationMatches: 0,
          notifiedAt: null,
          protectedUntil: new Date(
            now.getTime() + config.ladder.promotionProtectionDays * 86_400_000,
          ),
        };
        await ratingRef.set(ratingStateToDoc(upgraded));
        await db.collection(`users/${userId}/levelHistory`).add({
          sportCode,
          fromLevel: rawBefore || null,
          toLevel: newLevel.code,
          reason: "self_upgrade",
          rating: Math.round(upgraded.rating),
          rd: Math.round(upgraded.rd),
          ratedMatches: upgraded.ratedMatches,
          actor: userId,
          createdAt: FieldValue.serverTimestamp(),
        });
        logger.info(
          `rating: self-upgrade de ${userId} em ${sportCode} → ${newLevel.code}`,
        );
      } catch (error) {
        logger.error(
          `rating: falha ao processar self-upgrade de ${userId} em ${sportCode}`,
          error,
        );
      }
    }
  },
);

/**
 * Passe diário (06:00 America/Sao_Paulo): expira janelas de observação e
 * infla RD por inatividade (o que bloqueia decisões via `maxRdForDecision` —
 * inatividade NUNCA rebaixa).
 */
export const evaluateRatingLadderDaily = onSchedule(
  {schedule: "0 6 * * *", timeZone: "America/Sao_Paulo", timeoutSeconds: 540},
  async () => {
    const db = getFirestore();
    const projectId = getFirebaseProjectId();
    const now = new Date();

    for (const sportCode of RATED_SPORT_CODES) {
      const config = await loadRatingLadderConfig(db, sportCode);
      if (!config.flags.ratingEnabled) continue;

      let processed = 0;
      let changed = 0;
      let lastId: string | undefined;
      for (;;) {
        let query = db
          .collection(athleteRatingsPath(projectId))
          .where("sportCode", "==", sportCode)
          .orderBy("__name__")
          .limit(400);
        if (lastId) query = query.startAfter(lastId);
        const snap = await query.get();
        if (snap.docs.length === 0) break;

        for (const doc of snap.docs) {
          processed++;
          lastId = doc.id;
          const raw = doc.data() as Record<string, unknown>;
          let state = ratingStateFromDoc(
            String(raw.athleteId ?? doc.id.split("_")[0] ?? ""),
            sportCode,
            raw,
          );

          // Inflação de RD por semana COMPLETA de inatividade, ancorada em
          // `lastRdInflationAt` para não compor a cada passe diário.
          const anchorRaw = raw["lastRdInflationAt"];
          const anchor =
            anchorRaw && typeof anchorRaw === "object" && "toDate" in anchorRaw
              ? (anchorRaw as Timestamp).toDate()
              : state.lastMatchAt;
          let inflationFields: Record<string, unknown> = {};
          if (anchor) {
            const weeks = Math.floor((now.getTime() - anchor.getTime()) / WEEK_MS);
            if (weeks >= 1) {
              const inflated = inflateRd(
                state.rd,
                weeks,
                config.glicko.inactivityRdPerWeek,
                config.glicko.maxRd,
              );
              if (inflated !== state.rd) {
                state = {...state, rd: inflated};
              }
              inflationFields = {
                lastRdInflationAt: Timestamp.fromDate(
                  new Date(anchor.getTime() + weeks * WEEK_MS),
                ),
              };
            }
          }

          const evaluation = evaluateLadderTransition(state, config, now, "daily");
          const hasActions = evaluation.actions.length > 0;
          const inflated = Object.keys(inflationFields).length > 0;
          const stateChanged =
            evaluation.next.ladderState !== state.ladderState ||
            evaluation.next.zone !== state.zone ||
            evaluation.next.observationStartedAt?.getTime() !==
              state.observationStartedAt?.getTime();

          if (!hasActions && !stateChanged && !inflated) continue;

          const final = hasActions
            ? await applyLadderActions(db, evaluation, config, now)
            : evaluation.next;
          await doc.ref.set(
            {...ratingStateToDoc(final), ...inflationFields},
            {merge: true},
          );
          changed++;
        }
        if (snap.docs.length < 400) break;
      }
      logger.info(
        `rating-daily ${sportCode}: ${processed} doc(s), ${changed} atualizado(s)`,
      );
    }
  },
);

/** Replay administrativo do ledger de um atleta (ou lista). */
export const recomputeAthleteRating = onCall(async (request) => {
  await superAdminOrThrow(request.auth?.uid);

  const sportCode = String(request.data?.sportCode ?? "").trim();
  if (!(RATED_SPORT_CODES as readonly string[]).includes(sportCode)) {
    throw new HttpsError("invalid-argument", "sportCode inválido.");
  }
  const rawIds: unknown = request.data?.athleteIds ?? request.data?.athleteId;
  const athleteIds = (Array.isArray(rawIds) ? rawIds : [rawIds])
    .map((id) => String(id ?? "").trim())
    .filter((id) => id.length > 0);
  if (athleteIds.length === 0) {
    throw new HttpsError("invalid-argument", "athleteId(s) obrigatório(s).");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();
  let recomputed = 0;
  for (const athleteId of athleteIds) {
    const result = await replayAthleteLedger(db, projectId, athleteId, sportCode);
    if (result) recomputed++;
  }
  return {success: true, recomputed};
});

/**
 * Backfill de histórico (padrão `backfillSearchKeywords`): processa partidas
 * `Completed` em ordem de `matchEndedAt`, aplicando rating + pontos globais.
 * O ledger torna re-runs seguros. Repetir com `startAfterEndedAtMillis` do
 * retorno até `done`.
 */
export const backfillRatingsAndResults = onCall(
  {timeoutSeconds: 540},
  async (request) => {
    await superAdminOrThrow(request.auth?.uid);

    const db = getFirestore();
    const projectId = getFirebaseProjectId();
    const pageSize =
      typeof request.data?.pageSize === "number" && request.data.pageSize > 0
        ? Math.min(request.data.pageSize, 500)
        : 300;
    const startAfterMillis =
      typeof request.data?.startAfterEndedAtMillis === "number"
        ? request.data.startAfterEndedAtMillis
        : undefined;

    let query = db
      .collection(artifactsMatchesPath(projectId))
      .where("status", "==", MatchStatus.completed)
      .orderBy("matchEndedAt")
      .limit(pageSize);
    if (startAfterMillis != null) {
      query = query.startAfter(Timestamp.fromMillis(startAfterMillis));
    }
    const snap = await query.get();

    let ratingApplied = 0;
    let pointsAwarded = 0;
    let lastEndedAtMillis: number | null = null;
    for (const doc of snap.docs) {
      const match: Record<string, unknown> = {...doc.data(), id: doc.id};
      const ended = match["matchEndedAt"];
      if (ended && typeof ended === "object" && "toMillis" in ended) {
        lastEndedAtMillis = (ended as Timestamp).toMillis();
      }
      try {
        const rating = await applyMatchRatingUpdate(db, projectId, {
          matchId: doc.id,
          match,
        });
        if (rating.processed) ratingApplied++;
        const points = await tryAwardGlobalRankingForMatch(db, projectId, match);
        if (points.awarded) pointsAwarded++;
      } catch (error) {
        logger.error(`backfillRatings: falha na partida ${doc.id}`, error);
      }
    }

    const done = snap.docs.length < pageSize;
    logger.info(
      `backfillRatings: ${snap.docs.length} partida(s), rating=${ratingApplied}, pontos=${pointsAwarded}, done=${done}`,
    );
    return {
      success: true,
      processed: snap.docs.length,
      ratingApplied,
      pointsAwarded,
      nextCursor: lastEndedAtMillis,
      done,
    };
  },
);

/** Esportes inscritos no perfil (primário + secundários válidos). */
function enrolledSportsOf(
  data: Record<string, unknown>,
): {primary: string | null; secondaries: string[]} {
  const onboarding = data["sportOnboarding"];
  if (onboarding == null || typeof onboarding !== "object") {
    return {primary: null, secondaries: []};
  }
  const record = onboarding as Record<string, unknown>;
  const validCodes = ATHLETE_SPORT_CODES as readonly string[];
  const primaryRaw = String(record["primarySportId"] ?? "").trim();
  const primary = validCodes.includes(primaryRaw) ? primaryRaw : null;
  const secondariesRaw = record["secondarySportIds"];
  const secondaries = (Array.isArray(secondariesRaw) ? secondariesRaw : [])
    .map((id) => String(id ?? "").trim())
    .filter((id) => validCodes.includes(id) && id !== primary);
  return {primary, secondaries};
}

/**
 * Uma página do backfill de níveis. Por usuário:
 *
 * 1. NORMALIZA todo valor já presente em `sportOnboarding.levelsBySport`
 *    (qualquer esporte, qualquer formato legado — código 3 níveis, label,
 *    caixa alta) para o código canônico do MESMO rank via
 *    [levelRank]+[levelCodeForRank] — rank-neutro, nunca dispara
 *    self-upgrade. Valores desconhecidos ficam intocados.
 * 2. SEMEIA entradas ausentes dos esportes inscritos: primário ← `level`
 *    global (senão `sportProfile.level`, senão iniciante_1); secundários ←
 *    iniciante_1 (não propagar o global — inflaria rank de esporte nunca
 *    declarado). Seed de esporte rateado com rank > 0 dispara o trigger de
 *    self-upgrade (re-seed do rating) — aceito: é o mesmo que a 1ª partida
 *    rateada faria, e nunca rebaixa ninguém.
 *
 * Campos legados (`level`, `sportProfile.level`, `nivel`) ficam intocados no
 * doc (fallback de leitura de clientes antigos). Idempotente: re-run não
 * escreve nada. Audita cada chave alterada em `levelHistory`
 * (`reason: "migration"`).
 */
export async function runAthleteLevelsMigrationPage(
  db: Firestore,
  params: {
    pageSize: number;
    startAfterId?: string;
    dryRun: boolean;
    callerUid: string;
  },
): Promise<{
  processed: number;
  migrated: number;
  normalized: number;
  seeded: number;
  lastId: string | null;
  done: boolean;
  dryRun: boolean;
}> {
  const {pageSize, startAfterId, dryRun, callerUid} = params;

  let query = db.collection("users").orderBy("__name__").limit(pageSize);
  if (startAfterId) query = query.startAfter(startAfterId);
  const snap = await query.get();

  let migrated = 0;
  let normalized = 0;
  let seeded = 0;
  let lastId: string | undefined;
  for (const doc of snap.docs) {
    lastId = doc.id;
    const data = doc.data() as Record<string, unknown>;
    const bySport = levelsBySportOf(data);
    const updates: Record<string, string> = {};

    for (const [sportCode, rawValue] of Object.entries(bySport)) {
      const raw = String(rawValue ?? "").trim();
      if (!raw) continue;
      const rank = levelRank(raw);
      if (rank == null) continue;
      const canonical = levelCodeForRank(rank);
      if (canonical !== raw) {
        updates[sportCode] = canonical;
        normalized++;
      }
    }

    const {primary, secondaries} = enrolledSportsOf(data);
    const hasLevel = (sportCode: string) =>
      String(bySport[sportCode] ?? "").trim().length > 0 ||
      sportCode in updates;
    if (primary && !hasLevel(primary)) {
      const globalRank =
        levelRank(data["level"]) ??
        levelRank(
          (data["sportProfile"] as Record<string, unknown> | undefined)?.[
            "level"
          ],
        );
      updates[primary] =
        globalRank != null ? levelCodeForRank(globalRank) : DEFAULT_LEVEL_CODE;
      seeded++;
    }
    for (const sportCode of secondaries) {
      if (hasLevel(sportCode)) continue;
      updates[sportCode] = DEFAULT_LEVEL_CODE;
      seeded++;
    }

    if (Object.keys(updates).length === 0) continue;

    migrated++;
    if (dryRun) continue;

    await doc.ref.set(
      {sportOnboarding: {levelsBySport: updates}},
      {merge: true},
    );
    for (const [sportCode, toLevel] of Object.entries(updates)) {
      const fromRaw = String(bySport[sportCode] ?? "").trim();
      await db.collection(`users/${doc.id}/levelHistory`).add({
        sportCode,
        fromLevel: fromRaw || null,
        toLevel,
        reason: "migration",
        actor: callerUid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  return {
    processed: snap.docs.length,
    migrated,
    normalized,
    seeded,
    lastId: lastId ?? null,
    done: snap.docs.length < pageSize,
    dryRun,
  };
}

/**
 * Unificação do nível declarado: normaliza `sportOnboarding.levelsBySport`
 * para os 5 códigos canônicos em TODOS os esportes e semeia os esportes
 * inscritos que ainda não têm entrada (ver [runAthleteLevelsMigrationPage]).
 * Repetir com `startAfterId` do retorno até `done`; `dryRun` só conta.
 */
export const migrateAthleteLevels = onCall(
  {timeoutSeconds: 540},
  async (request) => {
    const callerUid = await superAdminOrThrow(request.auth?.uid);

    const pageSize =
      typeof request.data?.pageSize === "number" && request.data.pageSize > 0
        ? Math.min(request.data.pageSize, 500)
        : 300;
    const startAfterId =
      typeof request.data?.startAfterId === "string"
        ? request.data.startAfterId
        : undefined;
    const dryRun = request.data?.dryRun === true;

    const result = await runAthleteLevelsMigrationPage(getFirestore(), {
      pageSize,
      startAfterId,
      dryRun,
      callerUid,
    });
    logger.info(
      `migrateAthleteLevels: ${result.processed} usuário(s), ` +
        `${result.migrated} migrado(s) (${result.normalized} normalizado(s), ` +
        `${result.seeded} semeado(s)), dryRun=${dryRun}, done=${result.done}`,
    );
    return {success: true, ...result};
  },
);


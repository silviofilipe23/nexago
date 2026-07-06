import {FieldValue, Timestamp, getFirestore} from "firebase-admin/firestore";
import type {UserRecord} from "firebase-admin/auth";
import {
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {callerIsSuperAdmin} from "./auth-roles";
import {levelRank} from "./category-level-eligibility";
import {inflateRd} from "./glicko";
import {artifactsMatchesPath, getFirebaseProjectId} from "./firebase-paths";
import {MatchStatus} from "./match-status";
import {
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

/** Esportes com escada de rating no v1 (BT adiado — sem torneios de BT ainda). */
export const RATED_SPORT_CODES = ["VOLEI_PRAIA", "VOLEI_QUADRA"] as const;

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

const LEGACY_LEVEL_MIGRATION: Record<string, string> = {
  iniciante: "iniciante_1",
  basico: "iniciante_1",
  básico: "iniciante_1",
  intermediario: "intermediario_1",
  livre: "open",
};

/**
 * Migra `sportOnboarding.levelsBySport` do vôlei para a escada de 5 níveis
 * (degrau INFERIOR do split: ninguém fica trancado fora de categorias; a
 * promoção sobe os fortes em ~10 partidas). Nível global `level` e demais
 * esportes ficam intocados. Rodar antes do shadow; repetir com `startAfterId`
 * até `done`.
 */
export const migrateAthleteLevels = onCall(
  {timeoutSeconds: 540},
  async (request) => {
    const callerUid = await superAdminOrThrow(request.auth?.uid);

    const db = getFirestore();
    const pageSize =
      typeof request.data?.pageSize === "number" && request.data.pageSize > 0
        ? Math.min(request.data.pageSize, 500)
        : 300;
    const startAfterId =
      typeof request.data?.startAfterId === "string"
        ? request.data.startAfterId
        : undefined;
    const dryRun = request.data?.dryRun === true;

    let query = db.collection("users").orderBy("__name__").limit(pageSize);
    if (startAfterId) query = query.startAfter(startAfterId);
    const snap = await query.get();

    let migrated = 0;
    let lastId: string | undefined;
    for (const doc of snap.docs) {
      lastId = doc.id;
      const bySport = levelsBySportOf(doc.data() as Record<string, unknown>);
      const updates: Record<string, string> = {};
      for (const sportCode of RATED_SPORT_CODES) {
        const raw = String(bySport[sportCode] ?? "").trim().toLowerCase();
        const mapped = LEGACY_LEVEL_MIGRATION[raw];
        if (mapped && mapped !== raw) updates[sportCode] = mapped;
      }
      if (Object.keys(updates).length === 0) continue;

      migrated++;
      if (dryRun) continue;

      await doc.ref.set(
        {sportOnboarding: {levelsBySport: updates}},
        {merge: true},
      );
      for (const [sportCode, toLevel] of Object.entries(updates)) {
        await db.collection(`users/${doc.id}/levelHistory`).add({
          sportCode,
          fromLevel: String(bySport[sportCode] ?? ""),
          toLevel,
          reason: "migration",
          actor: callerUid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    const done = snap.docs.length < pageSize;
    logger.info(
      `migrateAthleteLevels: ${snap.docs.length} usuário(s), ${migrated} migrado(s), dryRun=${dryRun}, done=${done}`,
    );
    return {
      success: true,
      processed: snap.docs.length,
      migrated,
      lastId: lastId ?? null,
      done,
      dryRun,
    };
  },
);


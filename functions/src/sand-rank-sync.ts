import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth, type UserRecord} from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {hasRoleInClaims} from "./auth-roles";
import {deliverNotificationToUser} from "./notification-delivery";
import {
  rankPromotionEventId,
  rewardsForTrackIndex,
  sandRankLabel,
  sandRankStepFromXp,
  SAND_RANK_TRACK,
  shieldsPerMonthForTrackIndex,
} from "./sand-rank-engine";

/**
 * Materialização do elo ("sand rank") — único ponto de escrita do sistema.
 *
 * O elo é derivado do XP; este módulo observa o summary de gamificação,
 * persiste os campos de elo, concede recompensas idempotentes (via
 * `gamification_events/rank_track_{i}`) e espelha o elo em `users/{uid}`
 * (o sync de public_profiles propaga a partir de lá).
 */

const SEASON_ALL_TIME = "all_time";
export const RANK_PROMOTION_EVENT_TYPE = "RANK_PROMOTION";

function currentMonthKey(now: Date = new Date()): string {
  const y = now.getFullYear().toString().padStart(4, "0");
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

function asInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value ?? Number.NaN);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export interface SyncSandRankResult {
  trackIndex: number;
  promoted: boolean;
  grantedRewardIds: string[];
}

type PromotionNotifier = typeof deliverNotificationToUser;

export async function syncSandRankForUser(
  db: Firestore,
  userId: string,
  opts: {skipPush?: boolean; notifier?: PromotionNotifier} = {},
): Promise<SyncSandRankResult> {
  const uid = userId.trim();
  if (!uid) return {trackIndex: 0, promoted: false, grantedRewardIds: []};

  const summaryRef = db.doc(`users/${uid}/gamification/summary`);
  const summarySnap = await summaryRef.get();
  const summary = summarySnap.data() ?? {};

  const xp = asInt(summary["xp"], 0);
  const target = sandRankStepFromXp(xp);
  const storedTrack = asInt(summary["sandRankTrackIndex"], -1);
  const storedHighest = asInt(summary["highestSandRankTrackIndex"], -1);

  // Elo nunca desce, mesmo que o xp seja corrigido para baixo.
  const nextTrack = Math.max(target.trackIndex, storedTrack);
  const nextHighest = Math.max(nextTrack, storedHighest);

  // No-op (guard anti-loop do trigger): nada pendente e espelho em dia.
  if (storedTrack === nextTrack && storedHighest === nextHighest) {
    return {trackIndex: nextTrack, promoted: false, grantedRewardIds: []};
  }

  // Concede recompensas de todos os degraus pendentes (idempotente).
  const grantedRewardIds: string[] = [];
  const grantedSteps: number[] = [];
  let lastGrantedFrameId: string | null = null;
  let lastGrantedTitleId: string | null = null;

  for (let i = storedHighest + 1; i <= nextHighest; i++) {
    const step = SAND_RANK_TRACK[i];
    if (!step) break;
    const eventRef = db.doc(
      `users/${uid}/gamification_events/${rankPromotionEventId(i)}`,
    );

    const granted = await db.runTransaction(async (tx) => {
      const eventSnap = await tx.get(eventRef);
      if (eventSnap.exists) return false;

      tx.set(eventRef, {
        type: RANK_PROMOTION_EVENT_TYPE,
        trackIndex: i,
        rankCode: step.rankCode,
        division: step.division,
        xpAtPromotion: xp,
        createdAt: FieldValue.serverTimestamp(),
      });

      for (const reward of rewardsForTrackIndex(i)) {
        tx.set(
          db.doc(`users/${uid}/gamification_rewards/${reward.id}`),
          {
            rewardId: reward.id,
            type: reward.type,
            rankCode: step.rankCode,
            trackIndex: i,
            seasonId: SEASON_ALL_TIME,
            source: RANK_PROMOTION_EVENT_TYPE,
            grantedAt: FieldValue.serverTimestamp(),
            seenAt: null,
          },
          {merge: true},
        );
      }
      return true;
    });

    if (granted) {
      grantedSteps.push(i);
      for (const reward of rewardsForTrackIndex(i)) {
        grantedRewardIds.push(reward.id);
        if (reward.type === "avatarFrame" && !reward.id.endsWith("_GOLD")) {
          lastGrantedFrameId = reward.id;
        }
        if (reward.type === "title") {
          lastGrantedTitleId = reward.id;
        }
      }
    }
  }

  const currentStep = SAND_RANK_TRACK[nextTrack] ?? target;

  // Escudos do perk: ao cruzar um marco, credita imediatamente.
  const shieldFields: Record<string, unknown> = {};
  const shieldsForHighest = shieldsPerMonthForTrackIndex(nextHighest);
  const storedShields = asInt(summary["streakShieldsAvailable"], 0);
  if (shieldsForHighest > 0 && shieldsForHighest > storedShields) {
    const crossedMilestone =
      shieldsPerMonthForTrackIndex(storedHighest) < shieldsForHighest;
    if (crossedMilestone) {
      shieldFields["streakShieldsAvailable"] = shieldsForHighest;
      shieldFields["streakShieldMonthKey"] = currentMonthKey();
    }
  }

  await summaryRef.set(
    {
      sandRankCode: currentStep.rankCode,
      sandRankDivision: currentStep.division,
      sandRankTrackIndex: nextTrack,
      highestSandRankTrackIndex: nextHighest,
      sandRankSeasonId: SEASON_ALL_TIME,
      sandRankUpdatedAt: FieldValue.serverTimestamp(),
      ...shieldFields,
    },
    {merge: true},
  );

  // Espelho no doc do usuário (public_profiles sincroniza a partir dele).
  const userFields: Record<string, unknown> = {
    sandRank: {
      code: currentStep.rankCode,
      division: currentStep.division,
      trackIndex: nextTrack,
    },
  };
  const cosmetics: Record<string, unknown> = {};
  if (lastGrantedFrameId) cosmetics["frameId"] = lastGrantedFrameId;
  if (lastGrantedTitleId) cosmetics["titleId"] = lastGrantedTitleId;
  if (Object.keys(cosmetics).length > 0) {
    userFields["sandRankCosmetics"] = cosmetics;
  }
  await db.doc(`users/${uid}`).set(userFields, {merge: true});

  // Promoção real (degrau > 0 concedido agora) gera uma única push.
  const promoted = grantedSteps.some((i) => i > 0);
  if (promoted && !opts.skipPush) {
    const notify = opts.notifier ?? deliverNotificationToUser;
    try {
      await notify({
        userId: uid,
        title: "🏆 Você subiu de elo!",
        body:
          `Bem-vindo ao ${sandRankLabel(currentStep)}. ` +
          "Novas recompensas te esperam na sua trilha!",
        type: "rank_promotion",
        data: {
          rankCode: currentStep.rankCode,
          division: String(currentStep.division),
          trackIndex: String(nextTrack),
        },
      });
    } catch (error) {
      logger.error("syncSandRank: falha ao notificar promoção", {
        uid,
        error,
      });
    }
  }

  return {trackIndex: nextTrack, promoted, grantedRewardIds};
}

export const onGamificationSummaryWrittenSyncSandRank = onDocumentWritten(
  "users/{userId}/gamification/summary",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const data = after.data() ?? {};

    // Early-return barato: espelho já consistente com o xp atual
    // (cobre o eco da própria escrita deste módulo).
    const xp = asInt(data["xp"], 0);
    const target = sandRankStepFromXp(xp);
    const storedTrack = asInt(data["sandRankTrackIndex"], -1);
    const storedHighest = asInt(data["highestSandRankTrackIndex"], -1);
    if (storedTrack >= target.trackIndex && storedHighest >= storedTrack) {
      return;
    }

    try {
      await syncSandRankForUser(getFirestore(), event.params.userId);
    } catch (error) {
      logger.error("onGamificationSummaryWrittenSyncSandRank: falha", {
        userId: event.params.userId,
        error,
      });
    }
  },
);

/**
 * Backfill paginado do elo (super admin). Chame com `{ pageSize: 200 }` e
 * repita com `startAfterId` do último doc até `hasMore` ser false.
 * Não envia push (concessões retroativas aparecem na celebração in-app).
 */
export const backfillSandRanks = onCall(
  {timeoutSeconds: 540},
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado");
    }
    const caller: UserRecord = await getAuth().getUser(callerUid);
    const claims = caller.customClaims ?? {};
    if (claims["superAdmin"] !== true && !hasRoleInClaims(claims, "admin")) {
      throw new HttpsError(
        "permission-denied",
        "Apenas administradores podem executar o backfill.",
      );
    }

    const pageSize =
      typeof request.data?.pageSize === "number" && request.data.pageSize > 0 ?
        Math.min(request.data.pageSize, 500) :
        200;
    const startAfterId =
      typeof request.data?.startAfterId === "string" ?
        request.data.startAfterId :
        undefined;

    const db = getFirestore();
    let query = db.collection("users").orderBy("__name__").limit(pageSize);
    if (startAfterId) {
      query = query.startAfter(startAfterId);
    }

    const snap = await query.get();
    let lastId: string | undefined;
    let promotions = 0;
    for (const doc of snap.docs) {
      lastId = doc.id;
      const result = await syncSandRankForUser(db, doc.id, {skipPush: true});
      if (result.promoted) promotions++;
    }

    logger.info(
      `backfillSandRanks: processed=${snap.size} promotions=${promotions} ` +
      `lastId=${lastId ?? ""}`,
    );
    return {
      success: true,
      processed: snap.size,
      promotions,
      lastId,
      hasMore: snap.size >= pageSize,
    };
  },
);

/** Troca a moldura/título equipados. `null` explícito desequipa. */
export const equipSandRankCosmetic = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Login necessário.");
  }

  const db = getFirestore();
  const updates: Record<string, unknown> = {};

  const validate = async (
    rewardId: unknown,
    expectedType: "avatarFrame" | "title",
    field: "frameId" | "titleId",
  ) => {
    if (rewardId === undefined) return;
    if (rewardId === null) {
      updates[field] = FieldValue.delete();
      return;
    }
    if (typeof rewardId !== "string" || !rewardId.trim()) {
      throw new HttpsError("invalid-argument", "Recompensa inválida.");
    }
    const snap = await db
      .collection("users")
      .doc(uid)
      .collection("gamification_rewards")
      .doc(rewardId.trim())
      .get();
    if (!snap.exists || snap.data()?.["type"] !== expectedType) {
      throw new HttpsError(
        "failed-precondition",
        "Você ainda não desbloqueou essa recompensa.",
      );
    }
    updates[field] = rewardId.trim();
  };

  await validate(request.data?.frameId, "avatarFrame", "frameId");
  await validate(request.data?.titleId, "title", "titleId");

  if (Object.keys(updates).length === 0) {
    throw new HttpsError("invalid-argument", "Nada para equipar.");
  }

  await db
    .collection("users")
    .doc(uid)
    .set({sandRankCosmetics: updates}, {merge: true});
  return {success: true};
});

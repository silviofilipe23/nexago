import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {
  FieldValue,
  type Firestore,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {
  type ProfileCompletionStepId,
  PROFILE_STEPS,
  STEP_XP,
  STEP_XP_REASON,
  profileStepEventId,
  achievementEventId,
  computeProfileRewardContext,
} from "./profile-completion-shared";
import {syncAchievementsForUser} from "./achievement-engine";

export {
  type ProfileCompletionStepId,
  profileStepEventId,
  achievementEventId,
  computeProfileRewardContext,
};

async function awardProfileStepXp(
  db: Firestore,
  userId: string,
  stepId: ProfileCompletionStepId,
): Promise<number> {
  const amount = STEP_XP[stepId];
  if (amount <= 0) return 0;

  const eventId = profileStepEventId(stepId);
  const eventRef = db
    .collection("users")
    .doc(userId)
    .collection("gamification_events")
    .doc(eventId);
  const summaryRef = db
    .collection("users")
    .doc(userId)
    .collection("gamification")
    .doc("summary");

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) return 0;

    const summarySnap = await tx.get(summaryRef);
    const summaryData = summarySnap.data() ?? {};
    const currentXp =
      typeof summaryData["xp"] === "number"
        ? summaryData["xp"]
        : Number(summaryData["xp"] ?? 0);
    const nextXp = (Number.isFinite(currentXp) ? currentXp : 0) + amount;

    tx.set(
      summaryRef,
      {
        xp: nextXp,
        level: Math.floor(nextXp / 100),
        updatedAt: FieldValue.serverTimestamp(),
        lastXpReason: STEP_XP_REASON[stepId],
      },
      {merge: true},
    );
    tx.set(eventRef, {
      type: STEP_XP_REASON[stepId],
      stepId,
      xp: amount,
      createdAt: FieldValue.serverTimestamp(),
    });
    return amount;
  });
}

export type ProfileCompletionSyncResult = {
  totalXpGained: number;
  newlyAwardedStepIds: string[];
  profileMarkedComplete: boolean;
  unlockedProfileBadge: boolean;
};

export async function syncProfileCompletionRewardsForUser(
  db: Firestore,
  userId: string,
): Promise<ProfileCompletionSyncResult> {
  const uid = userId.trim();
  if (!uid) {
    return {
      totalXpGained: 0,
      newlyAwardedStepIds: [],
      profileMarkedComplete: false,
      unlockedProfileBadge: false,
    };
  }

  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    return {
      totalXpGained: 0,
      newlyAwardedStepIds: [],
      profileMarkedComplete: false,
      unlockedProfileBadge: false,
    };
  }

  const userData = userSnap.data() ?? {};
  const ctx = computeProfileRewardContext(userData);

  let totalXp = 0;
  const newlyAwarded: string[] = [];
  for (const stepId of PROFILE_STEPS) {
    if (!ctx.stepDone[stepId]) continue;
    const gained = await awardProfileStepXp(db, uid, stepId);
    if (gained > 0) {
      totalXp += gained;
      newlyAwarded.push(stepId);
    }
  }

  let profileMarkedComplete = false;
  if (ctx.allStepsComplete) {
    await db.collection("users").doc(uid).set(
      {
        isProfileComplete: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    profileMarkedComplete = true;
  }

  const unlockedIds = await syncAchievementsForUser(db, uid);
  const unlockedProfileBadge =
    unlockedIds.includes("PROFILE_COMPLETE") ||
    unlockedIds.includes("profile_complete");

  return {
    totalXpGained: totalXp,
    newlyAwardedStepIds: newlyAwarded,
    profileMarkedComplete,
    unlockedProfileBadge,
  };
}

export const syncProfileCompletionRewards = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Login necessário.");
  }

  try {
    return await syncProfileCompletionRewardsForUser(getFirestore(), uid);
  } catch (error) {
    logger.error("syncProfileCompletionRewards: falha", {uid, error});
    throw new HttpsError(
      "internal",
      "Não foi possível sincronizar recompensas do perfil.",
    );
  }
});

const PROFILE_GAMIFICATION_FIELDS = [
  "fullName",
  "profilePhotoUrl",
  "avatarUrl",
  "sport",
  "level",
  "city",
  "state",
  "phoneNumber",
  "sportOnboarding",
  "sportProfile",
  "goals",
  "gameObjective",
  "sports",
  "onboardingCompleted",
] as const;

export function profileGamificationFieldsChanged(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): boolean {
  for (const field of PROFILE_GAMIFICATION_FIELDS) {
    if (JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after[field] ?? null)) {
      return true;
    }
  }
  return false;
}

/** Credita XP/badges de perfil após gravação em `users/{uid}` (sem escrita no cliente). */
export const onUserProfileUpdatedSyncGamification = onDocumentUpdated(
  "users/{userId}",
  async (event) => {
    const userId = event.params.userId?.trim() ?? "";
    if (!userId) return;

    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!after) return;
    if (!profileGamificationFieldsChanged(before, after)) return;

    try {
      await syncProfileCompletionRewardsForUser(getFirestore(), userId);
    } catch (error) {
      logger.error("onUserProfileUpdatedSyncGamification: falha", {userId, error});
    }
  },
);

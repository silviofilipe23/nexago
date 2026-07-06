import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export type ProfileCompletionStepId =
  | "photo"
  | "sport_level"
  | "city"
  | "whatsapp"
  | "goals";

const PROFILE_STEPS: ProfileCompletionStepId[] = [
  "photo",
  "sport_level",
  "city",
  "whatsapp",
  "goals",
];

const STEP_XP: Record<ProfileCompletionStepId, number> = {
  photo: 30,
  sport_level: 30,
  city: 20,
  whatsapp: 30,
  goals: 40,
};

const STEP_XP_REASON: Record<ProfileCompletionStepId, string> = {
  photo: "PROFILE_STEP_PHOTO",
  sport_level: "PROFILE_STEP_SPORT_LEVEL",
  city: "PROFILE_STEP_CITY",
  whatsapp: "PROFILE_STEP_WHATSAPP",
  goals: "PROFILE_STEP_GOALS",
};

type AchievementDef = {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  isEligible: (ctx: ProfileRewardContext) => boolean;
};

const PROFILE_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "WELCOME",
    title: "Bem-vindo",
    description: "Complete o onboarding.",
    xpReward: 20,
    isEligible: (ctx) => ctx.onboardingCompleted,
  },
  {
    id: "IDENTITY",
    title: "Identidade",
    description: "Foto + esporte no perfil.",
    xpReward: 40,
    isEligible: (ctx) => ctx.stepDone.photo && ctx.stepDone.sport_level,
  },
  {
    id: "PROFILE_COMPLETE",
    title: "Perfil completo",
    description: "Todos os passos do perfil.",
    xpReward: 80,
    isEligible: (ctx) => ctx.allStepsComplete,
  },
];

export type ProfileRewardContext = {
  onboardingCompleted: boolean;
  allStepsComplete: boolean;
  stepDone: Record<ProfileCompletionStepId, boolean>;
};

export function profileStepEventId(stepId: ProfileCompletionStepId): string {
  return `profile_step_${stepId}`;
}

export function achievementEventId(achievementId: string): string {
  return `achievement_${achievementId.trim()}`;
}

function stringField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringField(item))
    .filter((item) => item.length > 0);
}

function isValidWhatsApp(raw: unknown): boolean {
  const digits = stringField(raw).replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 11) return true;
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith("55")) {
    return true;
  }
  return false;
}

function parseLegacyLocation(raw: string): {city: string; state: string} {
  const trimmed = raw.trim();
  if (!trimmed) return {city: "", state: ""};

  const dotParts = trimmed.split("·");
  if (dotParts.length >= 2) {
    const city = dotParts[0]?.trim() ?? "";
    const state = (dotParts[dotParts.length - 1] ?? "").trim().toUpperCase();
    if (state.length === 2) return {city, state};
  }

  const commaParts = trimmed.split(",");
  if (commaParts.length >= 2) {
    const city = commaParts[0]?.trim() ?? "";
    const state = (commaParts[commaParts.length - 1] ?? "").trim().toUpperCase();
    if (state.length === 2) return {city, state};
  }

  return {city: trimmed, state: ""};
}

function isCityStepDone(data: Record<string, unknown>): boolean {
  const city = stringField(data["city"]);
  if (!city) return false;
  const state = stringField(data["state"]);
  if (state) return true;
  return parseLegacyLocation(city).state.length === 2;
}

function isSportLevelStepDone(data: Record<string, unknown>): boolean {
  const primarySport = stringField(data["primarySportFirestoreId"]);
  if (primarySport) return true;

  const levelsBySport = data["levelsBySport"];
  if (levelsBySport && typeof levelsBySport === "object") {
    if (Object.keys(levelsBySport as Record<string, unknown>).length > 0) {
      return true;
    }
  }

  const sports = stringList(data["sports"]);
  if (sports.length > 0) return true;

  const sport = stringField(data["sport"]);
  const level = stringField(data["level"]);
  if (sport && level) return true;
  return sport.length > 0;
}

export function computeProfileRewardContext(
  data: Record<string, unknown>,
): ProfileRewardContext {
  const stepDone: Record<ProfileCompletionStepId, boolean> = {
    photo: stringField(data["avatarUrl"]).length > 0,
    sport_level: isSportLevelStepDone(data),
    city: isCityStepDone(data),
    whatsapp: isValidWhatsApp(data["phoneNumber"]),
    goals:
      stringList(data["goals"]).length > 0 ||
      stringField(data["gameObjective"]).length > 0,
  };

  const allStepsComplete = PROFILE_STEPS.every((step) => stepDone[step]);
  const onboardingCompleted =
    data["onboardingCompleted"] === true || allStepsComplete;

  return {
    onboardingCompleted,
    allStepsComplete,
    stepDone,
  };
}

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

async function syncProfileAchievements(
  db: Firestore,
  userId: string,
  ctx: ProfileRewardContext,
): Promise<string[]> {
  const eligible = PROFILE_ACHIEVEMENTS.filter((def) => def.isEligible(ctx));
  if (eligible.length === 0) return [];

  const summaryRef = db
    .collection("users")
    .doc(userId)
    .collection("gamification")
    .doc("summary");

  return db.runTransaction(async (tx) => {
    const summarySnap = await tx.get(summaryRef);
    const summaryData = summarySnap.data() ?? {};
    let xp =
      typeof summaryData["xp"] === "number"
        ? summaryData["xp"]
        : Number(summaryData["xp"] ?? 0);
    const initialXp = Number.isFinite(xp) ? xp : 0;
    xp = initialXp;

    const badgeSnaps: Record<string, DocumentSnapshot> = {};
    const eventSnaps: Record<string, DocumentSnapshot> = {};
    for (const def of eligible) {
      const badgeRef = db
        .collection("users")
        .doc(userId)
        .collection("gamification_badges")
        .doc(def.id);
      const eventRef = db
        .collection("users")
        .doc(userId)
        .collection("gamification_events")
        .doc(achievementEventId(def.id));
      badgeSnaps[def.id] = await tx.get(badgeRef);
      eventSnaps[def.id] = await tx.get(eventRef);
    }

    const unlockedNow: string[] = [];
    for (const def of eligible) {
      if (badgeSnaps[def.id]?.exists) continue;

      const eventRef = db
        .collection("users")
        .doc(userId)
        .collection("gamification_events")
        .doc(achievementEventId(def.id));
      const eventSnap = eventSnaps[def.id];
      if (!eventSnap?.exists && def.xpReward > 0) {
        xp += def.xpReward;
        tx.set(eventRef, {
          type: "ACHIEVEMENT_UNLOCK",
          achievementId: def.id,
          xp: def.xpReward,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      tx.set(
        db
          .collection("users")
          .doc(userId)
          .collection("gamification_badges")
          .doc(def.id),
        {
          badgeId: def.id,
          title: def.title,
          description: def.description,
          xpReward: def.xpReward,
          unlockedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      unlockedNow.push(def.id);
    }

    if (xp !== initialXp) {
      tx.set(
        summaryRef,
        {
          xp,
          level: Math.floor(xp / 100),
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }

    return unlockedNow;
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

  const unlockedIds = await syncProfileAchievements(db, uid, ctx);
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

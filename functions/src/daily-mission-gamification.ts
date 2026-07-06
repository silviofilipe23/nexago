import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, type Firestore, getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {parseGamificationSummary, buildStreakActivityFields} from "./tournament-match-gamification";
import {syncAchievementsForUser} from "./achievement-engine";

/** Porte 1:1 de DailyMissionCatalog (daily_mission_catalog.dart) — mesmos ids/xpReward. */
interface DailyMissionDef {
  id: string;
  xpReward: number;
}

const DAILY_MISSION_CATALOG: DailyMissionDef[] = [
  {id: "PLAY_TODAY", xpReward: 40},
  {id: "RESERVE_TODAY", xpReward: 35},
  {id: "FAVORITE_ARENA", xpReward: 15},
  {id: "EXPLORE_TOURNAMENT", xpReward: 20},
  {id: "SHARE_PROFILE", xpReward: 20},
];

const STREAK_MISSION_IDS = new Set(["PLAY_TODAY", "RESERVE_TODAY"]);

export function dailyMissionById(rawId: string): DailyMissionDef | undefined {
  const id = rawId.trim().toUpperCase();
  return DAILY_MISSION_CATALOG.find((m) => m.id === id);
}

function dayKey(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dailyMissionEventId(day: string, missionId: string): string {
  return `daily_${day}_${missionId}`;
}

export interface DailyMissionFeedback {
  xpGained: number;
  streakIncreased: boolean;
  newStreak: number;
  completedMissionIds: string[];
  unlockedAchievementIds: string[];
}

/**
 * Marca missão diária e concede XP (idempotente por dia).
 * Porte de GamificationService.completeDailyMission (gamification_service.dart).
 */
export async function completeDailyMissionForUser(
  db: Firestore,
  userId: string,
  missionId: string,
  now: Date = new Date(),
): Promise<DailyMissionFeedback | null> {
  const uid = userId.trim();
  const def = dailyMissionById(missionId);
  if (!uid || !def || def.xpReward <= 0) return null;

  const day = dayKey(now);
  const eventId = dailyMissionEventId(day, def.id);
  const eventRef = db.collection("users").doc(uid).collection("gamification_events").doc(eventId);
  const missionRef = db.collection("users").doc(uid).collection("gamification_daily_missions").doc(day);
  const summaryRef = db.collection("users").doc(uid).collection("gamification").doc("summary");

  const feedback = await db.runTransaction<Omit<DailyMissionFeedback, "unlockedAchievementIds"> | null>(
    async (tx) => {
      const missionSnap = await tx.get(missionRef);
      const missionData = missionSnap.data() ?? {};
      const missionMap = (missionData["missions"] as Record<string, unknown> | undefined) ?? {};
      if (missionMap[def.id] === true) return null;

      const eventSnap = await tx.get(eventRef);
      if (eventSnap.exists) {
        tx.set(
          missionRef,
          {
            date: day,
            updatedAt: FieldValue.serverTimestamp(),
            missions: {[def.id]: true},
          },
          {merge: true},
        );
        return null;
      }

      const summarySnap = await tx.get(summaryRef);
      const current = parseGamificationSummary(summarySnap.data());
      const nextXp = current.xp + def.xpReward;
      const countsForStreak = STREAK_MISSION_IDS.has(def.id);
      const streakFields = countsForStreak ? buildStreakActivityFields(current, now) : {};
      const nextStreak = countsForStreak ? (streakFields["streak"] as number) : current.streak;
      const streakIncreased = countsForStreak && nextStreak > current.streak;

      tx.set(
        missionRef,
        {
          date: day,
          updatedAt: FieldValue.serverTimestamp(),
          missions: {[def.id]: true},
        },
        {merge: true},
      );

      tx.set(eventRef, {
        type: "DAILY_MISSION",
        missionId: def.id,
        xp: def.xpReward,
        dayKey: day,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.set(
        summaryRef,
        {
          xp: nextXp,
          level: Math.floor(nextXp / 100),
          totalGames: current.totalGames,
          updatedAt: FieldValue.serverTimestamp(),
          lastXpReason: `DAILY_MISSION_${def.id}`,
          ...(countsForStreak ? streakFields : {streak: current.streak}),
        },
        {merge: true},
      );

      return {
        xpGained: def.xpReward,
        streakIncreased,
        newStreak: nextStreak,
        completedMissionIds: [def.id],
      };
    },
  );

  if (!feedback || feedback.xpGained <= 0) return null;

  const unlockedAchievementIds = await syncAchievementsForUser(db, uid);
  return {...feedback, unlockedAchievementIds};
}

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface ProfileSharedFeedback {
  xpGained: number;
  completedMissionIds: string[];
  unlockedAchievementIds: string[];
}

/** Porte de GamificationService.onProfileShared (gamification_service.dart). */
export async function recordProfileSharedForUser(
  db: Firestore,
  userId: string,
  now: Date = new Date(),
): Promise<ProfileSharedFeedback> {
  const uid = userId.trim();
  if (!uid) return {xpGained: 0, completedMissionIds: [], unlockedAchievementIds: []};

  const summaryRef = db.collection("users").doc(uid).collection("gamification").doc("summary");
  await db.runTransaction(async (tx) => {
    const summarySnap = await tx.get(summaryRef);
    const data = summarySnap.data() ?? {};
    const shares = numberField(data, "profileSharesCount");
    tx.set(
      summaryRef,
      {
        profileSharesCount: shares + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });

  const missionFeedback = await completeDailyMissionForUser(db, uid, "SHARE_PROFILE", now);
  if (missionFeedback) {
    return {
      xpGained: missionFeedback.xpGained,
      completedMissionIds: missionFeedback.completedMissionIds,
      unlockedAchievementIds: missionFeedback.unlockedAchievementIds,
    };
  }

  const unlockedAchievementIds = await syncAchievementsForUser(db, uid);
  return {xpGained: 0, completedMissionIds: [], unlockedAchievementIds};
}

export const recordProfileShare = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Login necessário.");
  }

  try {
    return await recordProfileSharedForUser(getFirestore(), uid);
  } catch (error) {
    logger.error("recordProfileShare: falha", {uid, error});
    throw new HttpsError("internal", "Não foi possível registrar o compartilhamento.");
  }
});

export const completeDailyMission = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Login necessário.");
  }

  const missionId = typeof request.data?.missionId === "string" ? request.data.missionId : "";
  if (!missionId) {
    throw new HttpsError("invalid-argument", "missionId é obrigatório.");
  }

  try {
    const feedback = await completeDailyMissionForUser(getFirestore(), uid, missionId);
    return feedback ?? {
      xpGained: 0,
      streakIncreased: false,
      newStreak: 0,
      completedMissionIds: [],
      unlockedAchievementIds: [],
    };
  } catch (error) {
    logger.error("completeDailyMission: falha", {uid, missionId, error});
    throw new HttpsError("internal", "Não foi possível concluir a missão.");
  }
});

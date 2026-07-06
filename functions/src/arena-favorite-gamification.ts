import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {
  FieldValue,
  type Firestore,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export const XP_FAVORITE_ARENA = 10;
export const XP_DAILY_MISSION_FAVORITE_ARENA = 15;
export const FAVORITE_ARENA_EVENT_TYPE = "FAVORITE_ARENA";

export function favoriteArenaEventId(arenaId: string): string {
  return `favorite_arena_${arenaId.trim()}`;
}

export function dailyMissionEventId(dayKey: string, missionId: string): string {
  return `daily_${dayKey}_${missionId}`;
}

function dayKey(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function awardArenaFavoriteGamification(
  db: Firestore,
  params: {userId: string; arenaId: string; now?: Date},
): Promise<boolean> {
  const userId = params.userId.trim();
  const arenaId = params.arenaId.trim();
  if (!userId || !arenaId) return false;

  const now = params.now ?? new Date();
  const eventId = favoriteArenaEventId(arenaId);
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

  const favoriteAwarded = await db.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) return false;

    const summarySnap = await tx.get(summaryRef);
    const data = summarySnap.data() ?? {};
    const favorites =
      typeof data["favoriteArenasCount"] === "number"
        ? data["favoriteArenasCount"]
        : Number(data["favoriteArenasCount"] ?? 0);
    const xp =
      typeof data["xp"] === "number" ? data["xp"] : Number(data["xp"] ?? 0);
    const nextXp = (Number.isFinite(xp) ? xp : 0) + XP_FAVORITE_ARENA;

    tx.set(
      summaryRef,
      {
        favoriteArenasCount:
          (Number.isFinite(favorites) ? favorites : 0) + 1,
        xp: nextXp,
        level: Math.floor(nextXp / 100),
        updatedAt: FieldValue.serverTimestamp(),
        lastXpReason: FAVORITE_ARENA_EVENT_TYPE,
      },
      {merge: true},
    );
    tx.set(eventRef, {
      type: FAVORITE_ARENA_EVENT_TYPE,
      arenaId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!favoriteAwarded) return false;

  const today = dayKey(now);
  const missionId = "FAVORITE_ARENA";
  const missionEventId = dailyMissionEventId(today, missionId);
  const missionEventRef = db
    .collection("users")
    .doc(userId)
    .collection("gamification_events")
    .doc(missionEventId);
  const missionRef = db
    .collection("users")
    .doc(userId)
    .collection("gamification_daily_missions")
    .doc(today);

  await db.runTransaction(async (tx) => {
    const missionSnap = await tx.get(missionRef);
    const missionData = missionSnap.data() ?? {};
    const missionMap =
      (missionData["missions"] as Record<string, unknown> | undefined) ?? {};
    if (missionMap[missionId] === true) return;

    const missionEventSnap = await tx.get(missionEventRef);
    if (missionEventSnap.exists) {
      tx.set(
        missionRef,
        {
          date: today,
          updatedAt: FieldValue.serverTimestamp(),
          missions: {[missionId]: true},
        },
        {merge: true},
      );
      return;
    }

    const summarySnap = await tx.get(summaryRef);
    const data = summarySnap.data() ?? {};
    const xp =
      typeof data["xp"] === "number" ? data["xp"] : Number(data["xp"] ?? 0);
    const nextXp =
      (Number.isFinite(xp) ? xp : 0) + XP_DAILY_MISSION_FAVORITE_ARENA;

    tx.set(
      missionRef,
      {
        date: today,
        updatedAt: FieldValue.serverTimestamp(),
        missions: {[missionId]: true},
      },
      {merge: true},
    );
    tx.set(missionEventRef, {
      type: "DAILY_MISSION",
      missionId,
      xp: XP_DAILY_MISSION_FAVORITE_ARENA,
      dayKey: today,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      summaryRef,
      {
        xp: nextXp,
        level: Math.floor(nextXp / 100),
        updatedAt: FieldValue.serverTimestamp(),
        lastXpReason: `DAILY_MISSION_${missionId}`,
      },
      {merge: true},
    );
  });

  return true;
}

export const onArenaFavoriteCreatedAwardXp = onDocumentCreated(
  "users/{userId}/favorites/{arenaId}",
  async (event) => {
    const userId = event.params.userId?.trim() ?? "";
    const arenaId = event.params.arenaId?.trim() ?? "";
    if (!userId || !arenaId) return;

    try {
      const awarded = await awardArenaFavoriteGamification(getFirestore(), {
        userId,
        arenaId,
      });
      if (awarded) {
        logger.info(
          `arenaFavoriteXp: +${XP_FAVORITE_ARENA} XP para ${userId} arena ${arenaId}`,
        );
      }
    } catch (error) {
      logger.error(
        `arenaFavoriteXp: falha ao creditar favorito ${arenaId} para ${userId}`,
        error,
      );
    }
  },
);

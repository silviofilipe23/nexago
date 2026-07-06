import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  FieldValue,
  Timestamp,
  type Firestore,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {parseGamificationSummary, buildStreakActivityFields} from "./tournament-match-gamification";
import {syncAchievementsForUser} from "./achievement-engine";

export const XP_GAME_COMPLETED = 50;
const PLAY_TODAY_GRACE_MS = 5 * 60 * 1000;

export function completedGameEventId(bookingId: string): string {
  return `completed_game_${bookingId.trim()}`;
}

function isBookingCanceled(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s === "canceled" || s === "cancelled";
}

function parseDateOnly(raw: unknown): Date | null {
  if (raw instanceof Timestamp) {
    const d = raw.toDate();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  if (typeof raw === "string" && raw.length >= 10) {
    // Evita `new Date(string)`: strings ISO "YYYY-MM-DD" são interpretadas como
    // meia-noite UTC pelo JS (diferente de Dart, que interpreta como local),
    // o que deslocaria o dia em fusos com offset negativo. Construímos a data
    // local diretamente a partir dos componentes.
    const [y, m, d] = raw.substring(0, 10).split("-").map((part) => Number.parseInt(part, 10));
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d);
    }
  }
  return null;
}

function parseTimeOfDay(raw: unknown): {h: number; m: number} | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const parts = raw.trim().split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10) || 0;
  const m = parts.length > 1 ? Number.parseInt(parts[1] ?? "0", 10) || 0 : 0;
  return {h, m};
}

/** Reservas eligíveis para "jogo concluído" — porte de isEligibleForPlayToday (booking_played_today.dart). */
export function isBookingEligibleForCompletion(
  booking: Record<string, unknown>,
  now: Date,
): boolean {
  if (isBookingCanceled(booking["status"])) return false;

  const day = parseDateOnly(booking["date"]);
  const start = parseTimeOfDay(booking["startTime"]);
  const end = parseTimeOfDay(booking["endTime"]);
  if (!day || !start || !end) return false;

  const startAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.h, start.m);
  let endAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), end.h, end.m);
  if (!(endAt.getTime() > startAt.getTime())) {
    endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today.getTime() !== day.getTime()) return false;

  return now.getTime() > endAt.getTime() + PLAY_TODAY_GRACE_MS;
}

export interface GameCompletedFeedback {
  xpGained: number;
  streakIncreased: boolean;
  newStreak: number;
  unlockedAchievementIds: string[];
}

/** Porte de GamificationService.processCompletedGame (gamification_service.dart). */
export async function processCompletedGameForUser(
  db: Firestore,
  userId: string,
  bookingId: string,
  now: Date = new Date(),
): Promise<GameCompletedFeedback | null> {
  const uid = userId.trim();
  const bid = bookingId.trim();
  if (!uid || !bid) return null;

  const bookingSnap = await db.collection("arenaBookings").doc(bid).get();
  if (!bookingSnap.exists) return null;
  const booking = bookingSnap.data() ?? {};
  const owner = (
    (booking["athleteId"] as string | undefined) ??
    (booking["bookingAthleteId"] as string | undefined) ??
    ""
  ).trim();
  if (owner !== uid) return null;
  if (!isBookingEligibleForCompletion(booking, now)) return null;

  const eventRef = db.collection("users").doc(uid).collection("gamification_events").doc(
    completedGameEventId(bid),
  );
  const summaryRef = db.collection("users").doc(uid).collection("gamification").doc("summary");

  const feedback = await db.runTransaction<Omit<GameCompletedFeedback, "unlockedAchievementIds"> | null>(
    async (tx) => {
      const eventSnap = await tx.get(eventRef);
      if (eventSnap.exists) return null;

      const summarySnap = await tx.get(summaryRef);
      const current = parseGamificationSummary(summarySnap.data());
      const streakFields = buildStreakActivityFields(current, now);
      const nextStreak = streakFields["streak"] as number;
      const streakIncreased = nextStreak > current.streak;
      const nextTotalGames = current.totalGames + 1;
      const nextXp = current.xp + XP_GAME_COMPLETED;

      tx.set(
        summaryRef,
        {
          xp: nextXp,
          level: Math.floor(nextXp / 100),
          totalGames: nextTotalGames,
          updatedAt: FieldValue.serverTimestamp(),
          lastXpReason: "GAME_COMPLETED",
          ...streakFields,
        },
        {merge: true},
      );

      tx.set(eventRef, {
        type: "GAME_COMPLETED",
        bookingId: bid,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        xpGained: XP_GAME_COMPLETED,
        streakIncreased,
        newStreak: nextStreak,
      };
    },
  );

  if (!feedback || feedback.xpGained <= 0) return null;

  const unlockedAchievementIds = await syncAchievementsForUser(db, uid);
  return {...feedback, unlockedAchievementIds};
}

export const processCompletedGame = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Login necessário.");
  }

  const bookingId = typeof request.data?.bookingId === "string" ? request.data.bookingId : "";
  if (!bookingId) {
    throw new HttpsError("invalid-argument", "bookingId é obrigatório.");
  }

  try {
    const feedback = await processCompletedGameForUser(getFirestore(), uid, bookingId);
    return feedback ?? {
      xpGained: 0,
      streakIncreased: false,
      newStreak: 0,
      unlockedAchievementIds: [],
    };
  } catch (error) {
    logger.error("processCompletedGame: falha", {uid, bookingId, error});
    throw new HttpsError("internal", "Não foi possível processar o jogo concluído.");
  }
});

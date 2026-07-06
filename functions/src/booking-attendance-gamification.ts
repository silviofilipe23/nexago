import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {
  FieldValue,
  Timestamp,
  type Firestore,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {syncAchievementsForUser} from "./achievement-engine";

export const XP_ATTENDANCE_CONFIRMED = 5;

export function attendanceConfirmedEventId(bookingId: string): string {
  return `attendance_confirmed_${bookingId.trim()}`;
}

export function bookingCheckInEventId(bookingId: string): string {
  return `checkin_${bookingId.trim()}`;
}

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Porte da lógica de streak de confirmação de presença (antes embutida em BookingService.confirmAttendance). */
export function nextAttendanceStreak(
  currentStreak: number,
  lastConfirmationAt: Date | null,
  now: Date,
): number {
  if (!lastConfirmationAt) return 1;
  const last = new Date(
    lastConfirmationAt.getFullYear(),
    lastConfirmationAt.getMonth(),
    lastConfirmationAt.getDate(),
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.abs(Math.round((last.getTime() - today.getTime()) / 86_400_000));
  return diffDays <= 1 ? currentStreak + 1 : 1;
}

/**
 * Credita XP + atualiza streak/total de confirmações de presença.
 * Porte da parte de gamificação que existia dentro da transação de
 * BookingService.confirmAttendance (booking_service.dart) — removida de lá porque
 * as rules bloqueiam escrita client-side em `gamification*`, o que derrubava a
 * transação inteira (a confirmação de presença em si nunca era salva).
 * O desbloqueio dos badges ATTENDANCE_STREAK_5/ATTENDANCE_TOTAL_10 fica a cargo do
 * catálogo genérico de conquistas (achievement-engine.ts), não é feito aqui.
 */
export async function awardAttendanceConfirmedXp(
  db: Firestore,
  userId: string,
  bookingId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const uid = userId.trim();
  const bid = bookingId.trim();
  if (!uid || !bid) return false;

  const eventRef = db
    .collection("users")
    .doc(uid)
    .collection("gamification_events")
    .doc(attendanceConfirmedEventId(bid));
  const summaryRef = db.collection("users").doc(uid).collection("gamification").doc("summary");

  const awarded = await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return false;

    const summarySnap = await tx.get(summaryRef);
    const data = summarySnap.data() ?? {};
    const totalConfirmed = numberField(data, "attendanceConfirmationsTotal");
    const streak = numberField(data, "attendanceConfirmationStreak");
    const lastTs = data["lastAttendanceConfirmationAt"];
    const last = lastTs instanceof Timestamp ? lastTs.toDate() : null;
    const nextStreak = nextAttendanceStreak(streak, last, now);
    const nextTotal = totalConfirmed + 1;
    const xp = numberField(data, "xp");
    const nextXp = xp + XP_ATTENDANCE_CONFIRMED;

    tx.set(
      summaryRef,
      {
        attendanceConfirmationsTotal: nextTotal,
        attendanceConfirmationStreak: nextStreak,
        lastAttendanceConfirmationAt: FieldValue.serverTimestamp(),
        xp: nextXp,
        level: Math.floor(nextXp / 100),
        updatedAt: FieldValue.serverTimestamp(),
        lastXpReason: "attendance_confirmed",
      },
      {merge: true},
    );

    tx.set(eventRef, {
      type: "ATTENDANCE_CONFIRMED",
      bookingId: bid,
      xp: XP_ATTENDANCE_CONFIRMED,
      createdAt: FieldValue.serverTimestamp(),
    });

    return true;
  });

  if (!awarded) return false;
  await syncAchievementsForUser(db, uid);
  return true;
}

/** Porte da parte de gamificação que existia dentro de BookingService.checkIn. */
export async function awardCheckIn(
  db: Firestore,
  userId: string,
  bookingId: string,
): Promise<boolean> {
  const uid = userId.trim();
  const bid = bookingId.trim();
  if (!uid || !bid) return false;

  const eventRef = db
    .collection("users")
    .doc(uid)
    .collection("gamification_events")
    .doc(bookingCheckInEventId(bid));
  const summaryRef = db.collection("users").doc(uid).collection("gamification").doc("summary");

  const awarded = await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return false;

    const summarySnap = await tx.get(summaryRef);
    const data = summarySnap.data() ?? {};
    const checkIns = numberField(data, "checkInsCount");

    tx.set(
      summaryRef,
      {
        checkInsCount: checkIns + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(eventRef, {
      type: "CHECK_IN",
      bookingId: bid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return true;
  });

  if (!awarded) return false;
  await syncAchievementsForUser(db, uid);
  return true;
}

/**
 * Reage a confirmação de presença / check-in em `arenaBookings/{bookingId}` para
 * creditar gamificação server-side (Admin SDK, sem bloqueio de rules).
 */
export const onArenaBookingAttendanceWrittenSyncGamification = onDocumentUpdated(
  "arenaBookings/{bookingId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!after) return;

    const ownerId = (
      (after["athleteId"] as string | undefined) ??
      (after["bookingAthleteId"] as string | undefined) ??
      ""
    ).trim();
    if (!ownerId) return;

    const bookingId = event.params.bookingId;
    const db = getFirestore();

    const attendanceJustConfirmed =
      after["attendanceConfirmed"] === true && before?.["attendanceConfirmed"] !== true;
    const checkInJustHappened =
      after["attendanceStatus"] === "checked_in" && before?.["attendanceStatus"] !== "checked_in";

    try {
      if (attendanceJustConfirmed) {
        await awardAttendanceConfirmedXp(db, ownerId, bookingId);
      }
      if (checkInJustHappened) {
        await awardCheckIn(db, ownerId, bookingId);
      }
    } catch (error) {
      logger.error(`bookingAttendanceGamification: falha na reserva ${bookingId}`, error);
    }
  },
);

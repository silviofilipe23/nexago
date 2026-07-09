import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {
  FieldValue,
  Timestamp,
  type Firestore,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {shieldsPerMonthForTrackIndex} from "./sand-rank-engine";

export const XP_GAME_COMPLETED = 50;
export const TOURNAMENT_MATCH_WON_EVENT_TYPE = "TOURNAMENT_MATCH_WON";

export function tournamentMatchXpEventId(matchId: string): string {
  return `tournament_match_${matchId.trim()}`;
}

export function isTournamentMatchCompleted(status: unknown): boolean {
  if (typeof status !== "string") return false;
  return status.trim().toLowerCase() === "completed";
}

export function stringField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Processa XP quando a partida fica concluída com vencedor (ou o vencedor é definido depois). */
export function shouldProcessTournamentMatchXp(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!after) return false;
  if (!isTournamentMatchCompleted(after["status"])) return false;
  const winnerId = stringField(after["winnerId"]);
  if (!winnerId) return false;

  if (!before || !isTournamentMatchCompleted(before["status"])) {
    return true;
  }

  return stringField(before["winnerId"]) !== winnerId;
}

export function collectWinnerAthleteIds(
  teamData: Record<string, unknown> | undefined,
): string[] {
  if (!teamData) return [];
  const ids = new Set<string>();
  for (const key of ["player1Id", "player2Id"] as const) {
    const id = stringField(teamData[key]);
    if (id) ids.add(id);
  }
  return [...ids];
}

export function parseMatchPlayedAt(
  match: Record<string, unknown>,
  fallback: Date = new Date(),
): Date {
  const ended = parseFirestoreDate(match["matchEndedAt"]);
  if (ended) return ended;
  const started = parseFirestoreDate(match["matchStartedAt"]);
  if (started) return started;
  const scheduled = parseFirestoreDate(match["scheduleTime"]);
  if (scheduled) return scheduled;
  return fallback;
}

function parseFirestoreDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value) {
    const date = (value as Timestamp).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function dayKey(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthKey(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

export function updateStreak(
  currentStreak: number,
  lastGameDate: Date | null,
  now: Date,
): number {
  if (!lastGameDate) return 1;

  const last = new Date(
    lastGameDate.getFullYear(),
    lastGameDate.getMonth(),
    lastGameDate.getDate(),
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((today.getTime() - last.getTime()) / 86_400_000);

  if (days <= 0) return Math.min(Math.max(currentStreak, 1), 100_000);
  if (days === 1) {
    const base = currentStreak <= 0 ? 0 : currentStreak;
    return base + 1;
  }
  return 1;
}

/**
 * Streak com Protetor de Sequência (perk da trilha de elos): exatamente um
 * dia perdido consome 1 escudo e mantém a sequência; 2+ dias resetam.
 */
export function updateStreakWithShield(
  currentStreak: number,
  lastGameDate: Date | null,
  now: Date,
  shieldsAvailable: number,
): {streak: number; shieldConsumed: boolean} {
  if (lastGameDate && shieldsAvailable > 0 && currentStreak > 0) {
    const last = new Date(
      lastGameDate.getFullYear(),
      lastGameDate.getMonth(),
      lastGameDate.getDate(),
    );
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.floor((today.getTime() - last.getTime()) / 86_400_000);
    if (days === 2) {
      return {streak: currentStreak + 1, shieldConsumed: true};
    }
  }
  return {
    streak: updateStreak(currentStreak, lastGameDate, now),
    shieldConsumed: false,
  };
}

export function appendGameCompletionDay(
  current: string[],
  now: Date,
  maxEntries = 120,
): string[] {
  const key = dayKey(now);
  const next = [...current, key];
  if (next.length <= maxEntries) return next;
  return next.slice(next.length - maxEntries);
}

export function countGameDaysInWindow(dayKeys: string[], days: number): number {
  if (dayKeys.length === 0) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  let count = 0;
  for (const key of dayKeys) {
    const trimmed = key.trim();
    const parsed = new Date(
      trimmed.length >= 10 ? trimmed.substring(0, 10) : trimmed,
    );
    if (!Number.isNaN(parsed.getTime()) && parsed >= cutoff) {
      count++;
    }
  }
  return count;
}

export function parseGameDayKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => (entry == null ? "" : String(entry).trim()))
    .filter((entry) => entry.length >= 8);
}

interface GamificationSummaryState {
  xp: number;
  level: number;
  streak: number;
  totalGames: number;
  lastGameDate: Date | null;
  gameCompletionDays: string[];
  streakShieldsAvailable: number;
  streakShieldMonthKey: string;
  highestSandRankTrackIndex: number;
}

export function parseGamificationSummary(
  data: Record<string, unknown> | undefined,
): GamificationSummaryState {
  if (!data) {
    return {
      xp: 0,
      level: 0,
      streak: 0,
      totalGames: 0,
      lastGameDate: null,
      gameCompletionDays: [],
      streakShieldsAvailable: 0,
      streakShieldMonthKey: "",
      highestSandRankTrackIndex: 0,
    };
  }

  const xp = typeof data["xp"] === "number" ? data["xp"] : Number(data["xp"] ?? 0);
  const level =
    typeof data["level"] === "number" ? data["level"] : Number(data["level"] ?? 0);

  return {
    xp: Number.isFinite(xp) ? xp : 0,
    level: Number.isFinite(level) ? level : 0,
    streak: Number(data["streak"] ?? 0) || 0,
    totalGames: Number(data["totalGames"] ?? 0) || 0,
    lastGameDate: parseFirestoreDate(data["lastGameDate"]),
    gameCompletionDays: parseGameDayKeys(data["gameCompletionDays"]),
    streakShieldsAvailable: Number(data["streakShieldsAvailable"] ?? 0) || 0,
    streakShieldMonthKey:
      typeof data["streakShieldMonthKey"] === "string" ?
        data["streakShieldMonthKey"] :
        "",
    highestSandRankTrackIndex:
      Number(data["highestSandRankTrackIndex"] ?? 0) || 0,
  };
}

export function buildStreakActivityFields(
  current: GamificationSummaryState,
  now: Date,
): Record<string, unknown> {
  // Replenish lazy mensal dos escudos (perk da trilha de elos).
  const nowMonth = monthKey(now);
  const shieldsAvailable =
    current.streakShieldMonthKey === nowMonth ?
      current.streakShieldsAvailable :
      shieldsPerMonthForTrackIndex(current.highestSandRankTrackIndex);

  const {streak: nextStreak, shieldConsumed} = updateStreakWithShield(
    current.streak,
    current.lastGameDate,
    now,
    shieldsAvailable,
  );
  const gameDays = appendGameCompletionDay(current.gameCompletionDays, now);
  const fields: Record<string, unknown> = {
    streak: nextStreak,
    lastGameDate: Timestamp.fromDate(now),
    gameCompletionDays: gameDays,
    gamesLast7Days: countGameDaysInWindow(gameDays, 7),
    gamesLast30Days: countGameDaysInWindow(gameDays, 30),
    streakShieldsAvailable: shieldConsumed ?
      shieldsAvailable - 1 :
      shieldsAvailable,
    streakShieldMonthKey: nowMonth,
  };
  if (shieldConsumed) {
    fields["streakShieldUsedAt"] = Timestamp.fromDate(now);
  }
  return fields;
}

export async function awardTournamentMatchWinXpToUser(
  db: Firestore,
  params: {
    userId: string;
    matchId: string;
    tournamentId: string;
    playedAt: Date;
  },
): Promise<boolean> {
  const userId = params.userId.trim();
  const matchId = params.matchId.trim();
  if (!userId || !matchId) return false;

  const eventId = tournamentMatchXpEventId(matchId);
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
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return false;

    const summarySnap = await tx.get(summaryRef);
    const current = parseGamificationSummary(summarySnap.data());
    const streakFields = buildStreakActivityFields(current, params.playedAt);
    const nextXp = current.xp + XP_GAME_COMPLETED;
    const nextLevel = Math.floor(nextXp / 100);
    const nextTotalGames = current.totalGames + 1;

    tx.set(
      summaryRef,
      {
        xp: nextXp,
        level: nextLevel,
        totalGames: nextTotalGames,
        updatedAt: FieldValue.serverTimestamp(),
        lastXpReason: TOURNAMENT_MATCH_WON_EVENT_TYPE,
        ...streakFields,
      },
      {merge: true},
    );

    tx.set(
      eventRef,
      {
        type: TOURNAMENT_MATCH_WON_EVENT_TYPE,
        matchId,
        tournamentId: params.tournamentId.trim(),
        xp: XP_GAME_COMPLETED,
        createdAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    return true;
  });
}

export async function processTournamentMatchXpAwards(params: {
  db: Firestore;
  projectId: string;
  matchId: string;
  match: Record<string, unknown>;
}): Promise<void> {
  const winnerTeamId = stringField(params.match["winnerId"]);
  if (!winnerTeamId) return;

  const teamSnap = await params.db
    .doc(`artifacts/${params.projectId}/public/data/teams/${winnerTeamId}`)
    .get();
  const athleteIds = collectWinnerAthleteIds(teamSnap.data());
  if (athleteIds.length === 0) {
    logger.warn(
      `tournamentMatchXp: match ${params.matchId} sem atletas no time vencedor ${winnerTeamId}`,
    );
    return;
  }

  const tournamentId = stringField(params.match["tournamentId"]);
  const playedAt = parseMatchPlayedAt(params.match);

  const results = await Promise.all(
    athleteIds.map(async (userId) => {
      try {
        const awarded = await awardTournamentMatchWinXpToUser(params.db, {
          userId,
          matchId: params.matchId,
          tournamentId,
          playedAt,
        });
        return {userId, awarded};
      } catch (error) {
        logger.error(
          `tournamentMatchXp: falha ao creditar match ${params.matchId} para ${userId}`,
          error,
        );
        return {userId, awarded: false};
      }
    }),
  );

  const credited = results.filter((result) => result.awarded).length;
  if (credited > 0) {
    logger.info(
      `tournamentMatchXp: +${XP_GAME_COMPLETED} XP para ${credited} atleta(s) na partida ${params.matchId}`,
    );
  }
}

export const onTournamentMatchCompletedAwardXp = onDocumentUpdated(
  "artifacts/{appId}/public/data/matches/{matchId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;

    if (!shouldProcessTournamentMatchXp(before, after) || !after) {
      return;
    }

    await processTournamentMatchXpAwards({
      db: getFirestore(),
      projectId: event.params.appId,
      matchId: event.params.matchId,
      match: after,
    });
  },
);

import {FieldValue, type Firestore} from "firebase-admin/firestore";
import type {QualifierSlot} from "./category-bracket-builders";
import {isMatchCompleted} from "./match-status";

export interface GroupPreview {
  id: string;
  teamIds: string[];
}

export interface GroupMatchData {
  poolId?: string;
  teamAId?: string;
  teamBId?: string;
  winnerId?: string;
  status?: unknown;
  isGroupMatch?: boolean;
  matchType?: string;
  resultA?: string;
  resultB?: string;
}

interface TeamStats {
  teamId: string;
  wins: number;
  setsWon: number;
  setsLost: number;
}

function parseSetCount(raw: unknown): number {
  const text = String(raw ?? "").trim();
  if (!text) return 0;
  const asNumber = Number(text);
  if (!Number.isNaN(asNumber)) return Math.max(0, asNumber);
  return text.split(",").filter((part) => part.trim().length > 0).length;
}

export function isGroupStageMatch(match: GroupMatchData): boolean {
  const matchType = String(match.matchType ?? "")
    .trim()
    .toLowerCase();
  return (
    match.isGroupMatch === true ||
    matchType === "group" ||
    matchType === "groups"
  );
}

function expectedGroupMatchCount(teamCount: number): number {
  if (teamCount < 2) return 0;
  return (teamCount * (teamCount - 1)) / 2;
}

export function isPoolRoundRobinComplete(
  poolId: string,
  teamIds: string[],
  matches: GroupMatchData[],
): boolean {
  const expected = expectedGroupMatchCount(teamIds.length);
  if (expected === 0) return teamIds.length > 0;

  const completed = matches.filter((match) => {
    if (!isGroupStageMatch(match)) return false;
    if ((match.poolId ?? "").trim() !== poolId) return false;
    return isMatchCompleted(match.status) && Boolean(match.winnerId?.trim());
  });

  return completed.length >= expected;
}

export function computePoolStandings(
  poolId: string,
  teamIds: string[],
  matches: GroupMatchData[],
): string[] {
  const ids = teamIds.map((id) => id.trim()).filter((id) => id.length > 0);
  if (ids.length === 0) return [];

  const stats = new Map<string, TeamStats>();
  for (const teamId of ids) {
    stats.set(teamId, {teamId, wins: 0, setsWon: 0, setsLost: 0});
  }

  for (const match of matches) {
    if (!isGroupStageMatch(match)) continue;
    if ((match.poolId ?? "").trim() !== poolId) continue;
    if (!isMatchCompleted(match.status)) continue;

    const winnerId = (match.winnerId ?? "").trim();
    const teamAId = (match.teamAId ?? "").trim();
    const teamBId = (match.teamBId ?? "").trim();
    if (!winnerId || !teamAId || !teamBId) continue;

    const loserId = winnerId === teamAId ? teamBId : teamAId;
    const winnerStats = stats.get(winnerId);
    const loserStats = stats.get(loserId);
    if (!winnerStats || !loserStats) continue;

    winnerStats.wins++;
    loserStats.wins += 0;

    const setsA = parseSetCount(match.resultA);
    const setsB = parseSetCount(match.resultB);
    winnerStats.setsWon += winnerId === teamAId ? setsA : setsB;
    winnerStats.setsLost += winnerId === teamAId ? setsB : setsA;
    loserStats.setsWon += loserId === teamAId ? setsA : setsB;
    loserStats.setsLost += loserId === teamAId ? setsB : setsA;
  }

  return [...stats.values()]
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      const diffA = a.setsWon - a.setsLost;
      const diffB = b.setsWon - b.setsLost;
      if (diffB !== diffA) return diffB - diffA;
      return a.teamId.localeCompare(b.teamId);
    })
    .map((entry) => entry.teamId);
}

function parseQualifierSlot(raw: unknown): QualifierSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const slot = raw as Record<string, unknown>;
  const poolId = String(slot.poolId ?? "").trim();
  const place = slot.place;
  if (!poolId || typeof place !== "number" || place < 1) return null;
  return {poolId, place};
}

function teamIdForQualifier(
  slot: QualifierSlot,
  standingsByPool: Map<string, string[]>,
): string | null {
  const ranked = standingsByPool.get(slot.poolId) ?? [];
  return ranked[slot.place - 1]?.trim() || null;
}

export interface FillKnockoutResult {
  filled: boolean;
  slotsFilled: number;
}

/** Preenche slots do mata-mata quando todos os grupos terminam a fase classificatória. */
export async function tryFillKnockoutFromGroupStandings(
  db: Firestore,
  matchesPath: string,
  tournamentId: string,
  categoryId: string,
  groups: GroupPreview[],
): Promise<FillKnockoutResult> {
  if (groups.length === 0) {
    return {filled: false, slotsFilled: 0};
  }

  const snap = await db
    .collection(matchesPath)
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const matches = snap.docs.map((doc) => doc.data() as GroupMatchData);
  const groupMatches = matches.filter(isGroupStageMatch);

  for (const group of groups) {
    if (!isPoolRoundRobinComplete(group.id, group.teamIds, groupMatches)) {
      return {filled: false, slotsFilled: 0};
    }
  }

  const standingsByPool = new Map<string, string[]>();
  for (const group of groups) {
    standingsByPool.set(
      group.id,
      computePoolStandings(group.id, group.teamIds, groupMatches),
    );
  }

  let slotsFilled = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.isGroupMatch === true) continue;
    if ((data.round as number) < 1) continue;

    const patch: Record<string, unknown> = {};
    const teamAQualifier = parseQualifierSlot(data.teamAQualifier);
    const teamBQualifier = parseQualifierSlot(data.teamBQualifier);

    if (teamAQualifier && !(data.teamAId as string | undefined)?.trim()) {
      const teamId = teamIdForQualifier(teamAQualifier, standingsByPool);
      if (teamId) {
        patch.teamAId = teamId;
        slotsFilled++;
      }
    }
    if (teamBQualifier && !(data.teamBId as string | undefined)?.trim()) {
      const teamId = teamIdForQualifier(teamBQualifier, standingsByPool);
      if (teamId) {
        patch.teamBId = teamId;
        slotsFilled++;
      }
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = FieldValue.serverTimestamp();
      await doc.ref.update(patch);
    }
  }

  return {filled: slotsFilled > 0, slotsFilled};
}

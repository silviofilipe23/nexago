import {FieldValue, type Firestore} from "firebase-admin/firestore";
import type {BracketAdvanceSlot} from "./category-bracket-builders";

export interface BracketAdvanceResult {
  advanced: boolean;
  slotsFilled: number;
  nextMatchIds: string[];
}

function parseAdvanceSlot(raw: unknown): BracketAdvanceSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const slot = raw as Record<string, unknown>;
  const matchNumber = slot.matchNumber;
  const teamSlot = slot.teamSlot;
  if (typeof matchNumber !== "number" || Number.isNaN(matchNumber)) return null;
  if (teamSlot !== "teamAId" && teamSlot !== "teamBId") return null;
  return {matchNumber, teamSlot};
}

function loserTeamId(match: Record<string, unknown>): string | null {
  const winnerId = (match.winnerId as string | undefined)?.trim();
  if (!winnerId) return null;
  const teamAId = (match.teamAId as string | undefined)?.trim() ?? "";
  const teamBId = (match.teamBId as string | undefined)?.trim() ?? "";
  const loserId = winnerId === teamAId ? teamBId : teamAId;
  return loserId || null;
}

async function findMatchByNumber(
  db: Firestore,
  matchesPath: string,
  tournamentId: string,
  categoryId: string,
  matchNumber: number,
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const snap = await db
    .collection(matchesPath)
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .where("matchNumber", "==", matchNumber)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0];
}

/** Aplica `winnerAdvance` / `loserAdvance` gravados na partida (chave DE). */
export async function applyBracketAdvances(
  db: Firestore,
  matchesPath: string,
  match: Record<string, unknown>,
): Promise<BracketAdvanceResult> {
  const tournamentId = (match.tournamentId as string | undefined)?.trim();
  const categoryId = (match.categoryId as string | undefined)?.trim();
  const winnerId = (match.winnerId as string | undefined)?.trim();
  if (!tournamentId || !categoryId || !winnerId) {
    return {advanced: false, slotsFilled: 0, nextMatchIds: []};
  }

  const winnerAdvance = parseAdvanceSlot(match.winnerAdvance);
  const loserAdvance = parseAdvanceSlot(match.loserAdvance);
  if (!winnerAdvance && !loserAdvance) {
    return {advanced: false, slotsFilled: 0, nextMatchIds: []};
  }

  const loserId = loserTeamId(match);
  const updates: Array<{
    advance: BracketAdvanceSlot;
    teamId: string;
    description?: string;
  }> = [];

  if (winnerAdvance) {
    updates.push({
      advance: winnerAdvance,
      teamId: winnerId,
      description: winnerDescription(match, winnerId),
    });
  }
  if (loserAdvance && loserId) {
    updates.push({
      advance: loserAdvance,
      teamId: loserId,
      description: loserDescription(match, loserId),
    });
  }

  const nextMatchIds: string[] = [];
  let slotsFilled = 0;

  for (const update of updates) {
    const target = await findMatchByNumber(
      db,
      matchesPath,
      tournamentId,
      categoryId,
      update.advance.matchNumber,
    );
    if (!target) continue;

    const patch: Record<string, unknown> = {
      [update.advance.teamSlot]: update.teamId,
      updatedAt: FieldValue.serverTimestamp(),
    };
    const descSlot =
      update.advance.teamSlot === "teamAId" ?
        "teamADescription" :
        "teamBDescription";
    if (update.description) patch[descSlot] = update.description;

    await target.ref.update(patch);
    slotsFilled++;
    nextMatchIds.push(target.id);
  }

  return {
    advanced: slotsFilled > 0,
    slotsFilled,
    nextMatchIds,
  };
}

function winnerDescription(
  match: Record<string, unknown>,
  winnerId: string,
): string | undefined {
  const teamAId = (match.teamAId as string | undefined)?.trim();
  if (winnerId === teamAId) {
    return (match.teamADescription as string | undefined)?.trim() || undefined;
  }
  return (match.teamBDescription as string | undefined)?.trim() || undefined;
}

function loserDescription(
  match: Record<string, unknown>,
  loserId: string,
): string | undefined {
  const teamAId = (match.teamAId as string | undefined)?.trim();
  if (loserId === teamAId) {
    return (match.teamADescription as string | undefined)?.trim() || undefined;
  }
  return (match.teamBDescription as string | undefined)?.trim() || undefined;
}

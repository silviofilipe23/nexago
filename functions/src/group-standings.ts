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
  /** Placar por set (games): [{a, b}, …]. Quando ausente, usa resultA/resultB. */
  sets?: Array<{a?: unknown; b?: unknown}>;
}

interface TeamStats {
  teamId: string;
  wins: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  /** Confronto direto contra empatados em vitórias (preenchido depois). */
  h2hWins: number;
  h2hSetDiff: number;
  h2hGameDiff: number;
}

interface MatchScore {
  setsA: number;
  setsB: number;
  gamesA: number;
  gamesB: number;
}

/**
 * Extrai sets e games de uma partida de grupo concluída. Prefere o array `sets`
 * (placar real por set); cai para `resultA`/`resultB` (contagem de sets) e, em
 * último caso (ex.: "W.O."), deduz 1×0 pelo vencedor. Games ficam 0 quando não
 * há placar detalhado.
 */
function parseMatchScore(match: GroupMatchData): MatchScore | null {
  const teamAId = (match.teamAId ?? "").trim();
  const teamBId = (match.teamBId ?? "").trim();
  const winnerId = (match.winnerId ?? "").trim();

  if (Array.isArray(match.sets) && match.sets.length > 0) {
    let setsA = 0;
    let setsB = 0;
    let gamesA = 0;
    let gamesB = 0;
    for (const set of match.sets) {
      const a = Number(set?.a);
      const b = Number(set?.b);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      gamesA += Math.max(0, a);
      gamesB += Math.max(0, b);
      if (a > b) setsA++;
      else if (b > a) setsB++;
    }
    if (setsA > 0 || setsB > 0 || gamesA > 0 || gamesB > 0) {
      return {setsA, setsB, gamesA, gamesB};
    }
  }

  const ra = Number(String(match.resultA ?? "").trim());
  const rb = Number(String(match.resultB ?? "").trim());
  if (Number.isInteger(ra) && Number.isInteger(rb) && (ra > 0 || rb > 0)) {
    return {setsA: Math.max(0, ra), setsB: Math.max(0, rb), gamesA: 0, gamesB: 0};
  }

  // W.O. / sem placar: deduz 1×0 pelo vencedor.
  if (winnerId && winnerId === teamAId) {
    return {setsA: 1, setsB: 0, gamesA: 0, gamesB: 0};
  }
  if (winnerId && winnerId === teamBId) {
    return {setsA: 0, setsB: 1, gamesA: 0, gamesB: 0};
  }
  return null;
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

/**
 * Classifica as duplas de um grupo aplicando, em ordem:
 *   1. vitórias;
 *   2. confronto direto entre as EMPATADAS (vitórias → saldo de sets → saldo de
 *      games só nos jogos entre elas);
 *   3. saldo de sets geral;
 *   4. saldo de games geral;
 *   5. sets vencidos no total;
 *   6. ordem de entrada (seed) — desempate determinístico final.
 *
 * O confronto direto só é calculado DENTRO de cada grupo de empatadas em
 * vitórias (onde ele faz sentido) — assim 2 duplas empatadas são separadas por
 * quem venceu o jogo entre elas, e empates triplos caem para saldos.
 */
export function computePoolStandings(
  poolId: string,
  teamIds: string[],
  matches: GroupMatchData[],
): string[] {
  const ids = teamIds.map((id) => id.trim()).filter((id) => id.length > 0);
  if (ids.length === 0) return [];
  const seedIndex = new Map(ids.map((id, index) => [id, index]));

  const stats = new Map<string, TeamStats>();
  for (const teamId of ids) {
    stats.set(teamId, {
      teamId,
      wins: 0,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 0,
      gamesLost: 0,
      h2hWins: 0,
      h2hSetDiff: 0,
      h2hGameDiff: 0,
    });
  }

  // Partidas concluídas e válidas do grupo, já com placar parseado.
  const played: Array<{
    winnerId: string;
    loserId: string;
    teamAId: string;
    teamBId: string;
    score: MatchScore;
  }> = [];

  for (const match of matches) {
    if (!isGroupStageMatch(match)) continue;
    if ((match.poolId ?? "").trim() !== poolId) continue;
    if (!isMatchCompleted(match.status)) continue;

    const winnerId = (match.winnerId ?? "").trim();
    const teamAId = (match.teamAId ?? "").trim();
    const teamBId = (match.teamBId ?? "").trim();
    if (!winnerId || !teamAId || !teamBId) continue;
    if (!stats.has(teamAId) || !stats.has(teamBId)) continue;

    const score = parseMatchScore(match);
    if (!score) continue;

    const loserId = winnerId === teamAId ? teamBId : teamAId;
    const winnerStats = stats.get(winnerId)!;
    winnerStats.wins++;

    const aStats = stats.get(teamAId)!;
    const bStats = stats.get(teamBId)!;
    aStats.setsWon += score.setsA;
    aStats.setsLost += score.setsB;
    aStats.gamesWon += score.gamesA;
    aStats.gamesLost += score.gamesB;
    bStats.setsWon += score.setsB;
    bStats.setsLost += score.setsA;
    bStats.gamesWon += score.gamesB;
    bStats.gamesLost += score.gamesA;

    played.push({winnerId, loserId, teamAId, teamBId, score});
  }

  // Confronto direto: só conta jogos entre duplas com o MESMO nº de vitórias.
  const winsOf = (id: string): number => stats.get(id)?.wins ?? 0;
  for (const game of played) {
    if (winsOf(game.teamAId) !== winsOf(game.teamBId)) continue;
    const aStats = stats.get(game.teamAId)!;
    const bStats = stats.get(game.teamBId)!;
    if (game.winnerId === game.teamAId) aStats.h2hWins++;
    else bStats.h2hWins++;
    const setDiff = game.score.setsA - game.score.setsB;
    const gameDiff = game.score.gamesA - game.score.gamesB;
    aStats.h2hSetDiff += setDiff;
    bStats.h2hSetDiff -= setDiff;
    aStats.h2hGameDiff += gameDiff;
    bStats.h2hGameDiff -= gameDiff;
  }

  return [...stats.values()]
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.h2hWins !== a.h2hWins) return b.h2hWins - a.h2hWins;
      if (b.h2hSetDiff !== a.h2hSetDiff) return b.h2hSetDiff - a.h2hSetDiff;
      if (b.h2hGameDiff !== a.h2hGameDiff) return b.h2hGameDiff - a.h2hGameDiff;
      const setDiffA = a.setsWon - a.setsLost;
      const setDiffB = b.setsWon - b.setsLost;
      if (setDiffB !== setDiffA) return setDiffB - setDiffA;
      const gameDiffA = a.gamesWon - a.gamesLost;
      const gameDiffB = b.gamesWon - b.gamesLost;
      if (gameDiffB !== gameDiffA) return gameDiffB - gameDiffA;
      if (b.setsWon !== a.setsWon) return b.setsWon - a.setsWon;
      return (seedIndex.get(a.teamId) ?? 0) - (seedIndex.get(b.teamId) ?? 0);
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

import { collection, doc, documentId, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';

/** Espelha `TournamentTeam`/`TournamentTeamsRepository` (Flutter) — `teams/{teamId}` só existe
 *  como efeito colateral de inscrição em torneio (`acceptTournamentPartnerInvite` cria o doc);
 *  não há "criar equipe" isolado do fluxo de inscrição. Path real:
 *  `artifacts/{projectId}/public/data/teams/{teamId}` (ver `firestore.rules`). */

export interface ArenaTeam {
  id: string;
  player1Id: string;
  player2Id: string;
  teamName: string | null;
  gender: string | null;
  createdAt: Date | null;
}

function teamsCol(db: Firestore, projectId: string) {
  return collection(db, 'artifacts', projectId, 'public', 'data', 'teams');
}

function teamFromDoc(id: string, data: Record<string, unknown>): ArenaTeam {
  const createdAtRaw = data['createdAt'] as { toDate?: () => Date } | undefined;
  return {
    id,
    player1Id: typeof data['player1Id'] === 'string' ? data['player1Id'] : '',
    player2Id: typeof data['player2Id'] === 'string' ? data['player2Id'] : '',
    teamName: typeof data['teamName'] === 'string' && data['teamName'].trim() ? data['teamName'].trim() : null,
    gender: typeof data['gender'] === 'string' && data['gender'].trim() ? data['gender'].trim() : null,
    createdAt: typeof createdAtRaw?.toDate === 'function' ? createdAtRaw.toDate() : null,
  };
}

export function teamIsLookingForPartner(team: Pick<ArenaTeam, 'player1Id' | 'player2Id'>): boolean {
  return team.player1Id === team.player2Id;
}

export async function fetchTeam(db: Firestore, projectId: string, teamId: string): Promise<ArenaTeam | null> {
  const snap = await getDoc(doc(teamsCol(db, projectId), teamId));
  if (!snap.exists()) return null;
  return teamFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

/** Times onde o atleta é player1 OU player2 — 2 queries paralelas de campo único (mesmo padrão
 *  de índice-avoidance usado em `arenaBookings`/`matches` no resto do repo), mescladas por id. */
export async function fetchTeamsForAthlete(db: Firestore, projectId: string, uid: string): Promise<ArenaTeam[]> {
  const col = teamsCol(db, projectId);
  const [byPlayer1, byPlayer2] = await Promise.all([
    getDocs(query(col, where('player1Id', '==', uid))),
    getDocs(query(col, where('player2Id', '==', uid))),
  ]);
  const byId = new Map<string, ArenaTeam>();
  for (const d of [...byPlayer1.docs, ...byPlayer2.docs]) {
    byId.set(d.id, teamFromDoc(d.id, d.data() as Record<string, unknown>));
  }
  return [...byId.values()].filter((t) => !teamIsLookingForPartner(t));
}

export async function fetchTeamsByIds(db: Firestore, projectId: string, ids: readonly string[]): Promise<Map<string, ArenaTeam>> {
  const unique = [...new Set(ids.filter((id) => id.trim().length > 0))];
  const result = new Map<string, ArenaTeam>();
  if (unique.length === 0) return result;

  const col = teamsCol(db, projectId);
  const chunkPromises: Promise<void>[] = [];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    chunkPromises.push(
      getDocs(query(col, where(documentId(), 'in', chunk))).then((snap) => {
        for (const d of snap.docs) result.set(d.id, teamFromDoc(d.id, d.data() as Record<string, unknown>));
      }),
    );
  }
  await Promise.all(chunkPromises);
  return result;
}

export interface ArenaMatch {
  id: string;
  tournamentId: string;
  categoryId: string;
  matchType: string;
  status: string;
  winnerId: string | null;
  teamAId: string;
  teamBId: string;
  teamADescription: string | null;
  teamBDescription: string | null;
  resultA: string | null;
  resultB: string | null;
  scheduleTime: Date | null;
  matchEndedAt: Date | null;
  courtName: string | null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function matchFromDoc(id: string, data: Record<string, unknown>): ArenaMatch {
  return {
    id,
    tournamentId: typeof data['tournamentId'] === 'string' ? data['tournamentId'] : '',
    categoryId: typeof data['categoryId'] === 'string' ? data['categoryId'] : '',
    matchType: typeof data['matchType'] === 'string' ? data['matchType'] : '',
    status: typeof data['status'] === 'string' ? data['status'] : '',
    winnerId: optionalStr(data['winnerId']),
    teamAId: typeof data['teamAId'] === 'string' ? data['teamAId'] : '',
    teamBId: typeof data['teamBId'] === 'string' ? data['teamBId'] : '',
    teamADescription: optionalStr(data['teamADescription']),
    teamBDescription: optionalStr(data['teamBDescription']),
    resultA: optionalStr(data['resultA']),
    resultB: optionalStr(data['resultB']),
    scheduleTime: toDate(data['scheduleTime']),
    matchEndedAt: toDate(data['matchEndedAt']),
    courtName: optionalStr(data['courtName']),
  };
}

export function matchIsCompleted(match: Pick<ArenaMatch, 'status'>): boolean {
  return match.status.trim().toLowerCase() === 'completed';
}

/** Histórico de partidas de um time — 2 queries paralelas (`teamAId`/`teamBId`), mescladas. */
export async function fetchMatchesForTeam(db: Firestore, projectId: string, teamId: string): Promise<ArenaMatch[]> {
  const col = collection(db, 'artifacts', projectId, 'public', 'data', 'matches');
  const [byA, byB] = await Promise.all([getDocs(query(col, where('teamAId', '==', teamId))), getDocs(query(col, where('teamBId', '==', teamId)))]);
  const byId = new Map<string, ArenaMatch>();
  for (const d of [...byA.docs, ...byB.docs]) {
    byId.set(d.id, matchFromDoc(d.id, d.data() as Record<string, unknown>));
  }
  return [...byId.values()].sort((a, b) => (b.matchEndedAt?.getTime() ?? 0) - (a.matchEndedAt?.getTime() ?? 0));
}

/** Rótulo de rodada abreviado (F/SF/QF/O16/R32) a partir do `matchType`/round — usado pra
 *  "melhor campanha" quando o time não venceu a final. Aproximação simples (não tenta
 *  reproduzir o layout de bracket inteiro, só a rotulagem de fase). */
export function roundShortLabel(matchType: string): string {
  const t = matchType.trim().toLowerCase();
  if (t.includes('final') && !t.includes('semi') && !t.includes('quarter')) return 'F';
  if (t.includes('third') || t.includes('3')) return '3º';
  if (t.includes('semi')) return 'SF';
  if (t.includes('quarter')) return 'QF';
  if (t.includes('16')) return 'O16';
  if (t.includes('32')) return 'R32';
  return t.toUpperCase() || '—';
}

function isFinalMatchType(matchType: string): boolean {
  const t = matchType.trim().toLowerCase();
  return t.includes('final') && !t.includes('semi') && !t.includes('quarter') && !t.includes('third');
}

/** Torneios em que o time venceu a final — "títulos" derivado de `matches`, sem depender de
 *  um campo "titles" que não existe no schema. */
export function titleTournamentIds(matches: readonly ArenaMatch[], teamId: string): string[] {
  return [...new Set(matches.filter((m) => matchIsCompleted(m) && isFinalMatchType(m.matchType) && m.winnerId === teamId).map((m) => m.tournamentId))].filter(
    (id) => id,
  );
}

/** Sequência de vitórias em andamento (partidas concluídas mais recentes primeiro). */
export function currentWinStreak(completedMatchesDesc: readonly ArenaMatch[], teamId: string): number {
  let streak = 0;
  for (const m of completedMatchesDesc) {
    if (m.winnerId !== teamId) break;
    streak++;
  }
  return streak;
}

/** "<1 mês" / "3 meses" / "1 ano" / "1 ano e 4 meses" — espelha `formatTeamTogetherLabel`. */
export function formatTeamTogetherLabel(createdAt: Date | null, now = new Date()): string {
  if (!createdAt) return '—';
  let months = (now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth());
  if (now.getDate() < createdAt.getDate()) months--;
  if (months < 1) return '<1 mês';
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  if (remMonths === 0) return `${years} ${years === 1 ? 'ano' : 'anos'}`;
  return `${years} ${years === 1 ? 'ano' : 'anos'} e ${remMonths} ${remMonths === 1 ? 'mês' : 'meses'}`;
}

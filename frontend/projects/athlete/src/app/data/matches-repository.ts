import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';

/** `artifacts/{projectId}/public/data/matches` — espelha `TournamentMatchMapper` +
 *  `TournamentMatchesLogic` (Flutter). A árvore da chave NUNCA vem de ponteiros salvos
 *  (`winnerAdvance`/`loserAdvance` existem no doc mas só o Cloud Function server-side os lê,
 *  pra preencher a próxima partida quando um resultado é lançado) — o client deriva tudo de
 *  `round`+`matchType`+`matchNumber`, olhando só a POSIÇÃO dos jogos numa coluna. */

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export interface MatchSet {
  a: number;
  b: number;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  categoryId: string;
  round: number;
  matchType: string;
  poolId: string;
  teamAId: string;
  teamBId: string;
  teamADescription: string | null;
  teamBDescription: string | null;
  status: string;
  resultA: string | null;
  resultB: string | null;
  sets: MatchSet[];
  winnerId: string | null;
  isGroupMatch: boolean;
  matchNumber: number;
  scheduleTime: Date | null;
  courtName: string | null;
}

function setsFromRaw(raw: unknown): MatchSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const o = s as Record<string, unknown>;
      const a = typeof o['a'] === 'number' ? o['a'] : null;
      const b = typeof o['b'] === 'number' ? o['b'] : null;
      return a == null || b == null ? null : { a, b };
    })
    .filter((s): s is MatchSet => s != null);
}

function matchFromDoc(id: string, data: Record<string, unknown>): TournamentMatch {
  return {
    id,
    tournamentId: optionalStr(data['tournamentId']) ?? '',
    categoryId: optionalStr(data['categoryId']) ?? '',
    round: typeof data['round'] === 'number' ? data['round'] : 0,
    matchType: optionalStr(data['matchType']) ?? '',
    poolId: optionalStr(data['poolId']) ?? '',
    teamAId: optionalStr(data['teamAId']) ?? '',
    teamBId: optionalStr(data['teamBId']) ?? '',
    teamADescription: optionalStr(data['teamADescription']),
    teamBDescription: optionalStr(data['teamBDescription']),
    status: optionalStr(data['status']) ?? 'Scheduled',
    resultA: optionalStr(data['resultA']),
    resultB: optionalStr(data['resultB']),
    sets: setsFromRaw(data['sets']),
    winnerId: optionalStr(data['winnerId']),
    isGroupMatch: data['isGroupMatch'] === true,
    matchNumber: typeof data['matchNumber'] === 'number' ? data['matchNumber'] : 0,
    scheduleTime: toDate(data['scheduleTime']),
    courtName: optionalStr(data['courtName']),
  };
}

export async function fetchMatchesForCategory(db: Firestore, projectId: string, tournamentId: string, categoryId: string): Promise<TournamentMatch[]> {
  const snap = await getDocs(
    query(collection(db, 'artifacts', projectId, 'public', 'data', 'matches'), where('tournamentId', '==', tournamentId), where('categoryId', '==', categoryId)),
  );
  return snap.docs.map((d) => matchFromDoc(d.id, d.data() as Record<string, unknown>));
}

export async function fetchMatchesForTournament(db: Firestore, projectId: string, tournamentId: string): Promise<TournamentMatch[]> {
  const snap = await getDocs(query(collection(db, 'artifacts', projectId, 'public', 'data', 'matches'), where('tournamentId', '==', tournamentId)));
  return snap.docs.map((d) => matchFromDoc(d.id, d.data() as Record<string, unknown>));
}

export function matchIsCompleted(m: Pick<TournamentMatch, 'status'>): boolean {
  return m.status.trim().toLowerCase() === 'completed';
}

function isBracketMatch(m: TournamentMatch): boolean {
  return !m.isGroupMatch && m.matchType.trim().toLowerCase() !== 'group' && m.poolId.trim() === '';
}

function bracketGroupKey(m: TournamentMatch): string {
  const t = m.matchType.trim();
  const tLower = t.toLowerCase();
  if (tLower === 'wb' || tLower === 'lb') return `${t.toUpperCase()}:${m.round}`;
  if (tLower === 'knockout') return `knockout:${m.round}`;
  if (t) return t;
  return `round:${m.round}`;
}

function bracketGroupSortOrder(m: TournamentMatch): number {
  const tLower = m.matchType.trim().toLowerCase();
  if (tLower === 'wb') return m.round * 10;
  if (tLower === 'lb') return m.round * 10 + 5;
  if (tLower === 'knockout') return 200 + m.round;
  if (tLower === 'third place' || tLower === 'third_place') return 8900;
  if (tLower === 'final') return 9000;
  if (tLower === 'grand final' || tLower === 'grand_final') return 9100;
  const named: Record<string, number> = {
    'round of 32': 10,
    'round of 16': 20,
    'quarter-final': 30,
    'quarterfinal': 30,
    'semi-final': 40,
    'semifinal': 40,
    elimination: 50,
    other: 55,
  };
  const base = named[tLower];
  if (base != null) return base * 10 + m.round;
  return 60 * 10 + m.round;
}

function knockoutPhaseLabel(matchCount: number): string {
  if (matchCount >= 16) return '32avos';
  if (matchCount === 8) return 'Oitavas';
  if (matchCount === 4) return 'Quartas';
  if (matchCount === 2) return 'Semifinais';
  return 'Eliminatórias';
}

function bracketColumnHeaderLabel(matches: readonly TournamentMatch[]): string {
  const first = matches[0];
  if (!first) return '';
  const tLower = first.matchType.trim().toLowerCase();
  if (tLower === 'wb') return `WB · RODADA ${first.round}`;
  if (tLower === 'lb') return `LB · RODADA ${first.round}`;
  if (tLower === 'final') return 'FINAL';
  if (tLower === 'grand final' || tLower === 'grand_final') return 'GRAND FINAL';
  if (tLower === 'third place' || tLower === 'third_place') return '3º LUGAR';
  if (tLower === 'knockout') return knockoutPhaseLabel(matches.length).toUpperCase();
  return first.matchType.toUpperCase() || `RODADA ${first.round}`;
}

export interface BracketColumn {
  key: string;
  label: string;
  matches: TournamentMatch[];
}

/** Agrupa partidas de mata-mata em colunas ordenadas — espelha
 *  `double_elimination_bracket_layout.dart`/`tournament_matches_logic.dart`, sem a geometria de
 *  conectores (renderiza como colunas simples, não como árvore com linhas). */
export function buildBracketColumns(matches: readonly TournamentMatch[]): BracketColumn[] {
  const bracketMatches = matches.filter(isBracketMatch);
  const byKey = new Map<string, TournamentMatch[]>();
  for (const m of bracketMatches) {
    const key = bracketGroupKey(m);
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(m);
  }
  const keys = [...byKey.keys()].sort((a, b) => bracketGroupSortOrder(byKey.get(a)![0]!) - bracketGroupSortOrder(byKey.get(b)![0]!));
  return keys.map((key) => {
    const columnMatches = byKey.get(key)!.sort((a, b) => a.matchNumber - b.matchNumber);
    return { key, label: bracketColumnHeaderLabel(columnMatches), matches: columnMatches };
  });
}

export interface GroupStanding {
  teamId: string;
  wins: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
}

function parseLegacyResult(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

/** Classificação de grupo (round-robin) — espelha `tournament_group_standings_logic.dart`,
 *  simplificado: desempate por vitórias → saldo de sets → saldo de games (sem head-to-head
 *  detalhado, que exigiria reconstruir todos os confrontos par a par). */
export function buildGroupStandings(matches: readonly TournamentMatch[], poolId: string): GroupStanding[] {
  const poolMatches = matches.filter((m) => m.poolId === poolId && matchIsCompleted(m) && m.winnerId);
  const byTeam = new Map<string, GroupStanding>();
  const ensure = (id: string) => byTeam.get(id) ?? byTeam.set(id, { teamId: id, wins: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 0 }).get(id)!;

  for (const m of poolMatches) {
    const a = ensure(m.teamAId);
    const b = ensure(m.teamBId);
    if (m.winnerId === m.teamAId) a.wins++;
    else if (m.winnerId === m.teamBId) b.wins++;

    const sets = m.sets.length > 0 ? m.sets : parseLegacyResult(m.resultA).map((ga, i) => ({ a: ga, b: parseLegacyResult(m.resultB)[i] ?? 0 }));
    for (const s of sets) {
      if (s.a > s.b) {
        a.setsWon++;
        b.setsLost++;
      } else if (s.b > s.a) {
        b.setsWon++;
        a.setsLost++;
      }
      a.gamesWon += s.a;
      a.gamesLost += s.b;
      b.gamesWon += s.b;
      b.gamesLost += s.a;
    }
  }

  const rows = [...byTeam.values()];
  for (const r of rows) r.points = r.wins * 2;
  rows.sort((x, y) => y.wins - x.wins || y.setsWon - y.setsLost - (x.setsWon - x.setsLost) || y.gamesWon - y.gamesLost - (x.gamesWon - x.gamesLost));
  return rows;
}

export function distinctPoolIds(matches: readonly TournamentMatch[]): string[] {
  return [...new Set(matches.filter((m) => m.poolId).map((m) => m.poolId))].sort();
}

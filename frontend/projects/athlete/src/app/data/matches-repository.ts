import { collection, doc, getDoc, getDocs, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';

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

/** Placar parcial gravado por `updateLiveMatchScore` (mesário/staff) — o set em andamento
 *  vive aqui, não em `sets`, que só recebe os sets já fechados. */
export interface MatchLiveScore {
  setsA: number;
  setsB: number;
  currentGamesA: number;
  currentGamesB: number;
}

/** `'present' | 'wo' | ...` — gravado por `callMatchToCourt`/`declareMatchWalkover`. */
export type MatchCheckInStatus = string;

export interface MatchCheckIn {
  teamA: MatchCheckInStatus | null;
  teamB: MatchCheckInStatus | null;
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
  /** Campos da operação ao vivo (`organizer-match-ops.ts`). */
  liveScore: MatchLiveScore | null;
  matchStartedAt: Date | null;
  checkIn: MatchCheckIn;
  queueStatus: string | null;
  /** Melhor de N sets; ausente em partidas antigas — a UI cai em `DEFAULT_BEST_OF`. */
  bestOf: number | null;
}

export const DEFAULT_BEST_OF = 3;

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

function intOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
}

function liveScoreFromRaw(raw: unknown): MatchLiveScore | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const setsA = intOf(o['setsA']);
  const setsB = intOf(o['setsB']);
  const currentGamesA = intOf(o['currentGamesA']);
  const currentGamesB = intOf(o['currentGamesB']);
  if (setsA == null || setsB == null || currentGamesA == null || currentGamesB == null) return null;
  return { setsA, setsB, currentGamesA, currentGamesB };
}

/** `checkIn: { teamA: { status }, teamB: { status } }` — só o `status` interessa ao atleta. */
function checkInFromRaw(raw: unknown): MatchCheckIn {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const sideStatus = (side: unknown): string | null => {
    if (!side || typeof side !== 'object') return null;
    return optionalStr((side as Record<string, unknown>)['status']);
  };
  return { teamA: sideStatus(o['teamA']), teamB: sideStatus(o['teamB']) };
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
    liveScore: liveScoreFromRaw(data['liveScore']),
    matchStartedAt: toDate(data['matchStartedAt']),
    checkIn: checkInFromRaw(data['checkIn']),
    queueStatus: optionalStr(data['queueStatus']),
    bestOf: intOf(data['bestOf']),
  };
}

function matchesCol(db: Firestore, projectId: string) {
  return collection(db, 'artifacts', projectId, 'public', 'data', 'matches');
}

export async function fetchMatchesForCategory(db: Firestore, projectId: string, tournamentId: string, categoryId: string): Promise<TournamentMatch[]> {
  const snap = await getDocs(query(matchesCol(db, projectId), where('tournamentId', '==', tournamentId), where('categoryId', '==', categoryId)));
  return snap.docs.map((d) => matchFromDoc(d.id, d.data() as Record<string, unknown>));
}

export async function fetchMatchesForTournament(db: Firestore, projectId: string, tournamentId: string): Promise<TournamentMatch[]> {
  const snap = await getDocs(query(matchesCol(db, projectId), where('tournamentId', '==', tournamentId)));
  return snap.docs.map((d) => matchFromDoc(d.id, d.data() as Record<string, unknown>));
}

/** Versão ao vivo de `fetchMatchesForTournament`. Só as telas que mostram placar em tempo real
 *  (aba Hoje e detalhe da partida) abrem esse listener — as demais seguem com o one-shot, pra
 *  não pagar a leitura da chave inteira em toda navegação. */
export function watchMatchesForTournament(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  onChange: (matches: TournamentMatch[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    query(matchesCol(db, projectId), where('tournamentId', '==', tournamentId)),
    (snap) => onChange(snap.docs.map((d) => matchFromDoc(d.id, d.data() as Record<string, unknown>))),
    (err) => onError?.(err),
  );
}

export async function fetchMatch(db: Firestore, projectId: string, matchId: string): Promise<TournamentMatch | null> {
  const snap = await getDoc(doc(matchesCol(db, projectId), matchId));
  if (!snap.exists()) return null;
  return matchFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

export function matchIsCompleted(m: Pick<TournamentMatch, 'status'>): boolean {
  return m.status.trim().toLowerCase() === 'completed';
}

export function matchIsLive(m: Pick<TournamentMatch, 'status'>): boolean {
  return m.status.trim().toLowerCase() === 'in progress';
}

export function matchIsCanceled(m: Pick<TournamentMatch, 'status'>): boolean {
  return m.status.trim().toLowerCase() === 'canceled';
}

export function matchBestOf(m: Pick<TournamentMatch, 'bestOf'>): number {
  return m.bestOf && m.bestOf > 0 ? m.bestOf : DEFAULT_BEST_OF;
}

/** Sets ganhos por lado, unificando as três formas em que o placar aparece no doc:
 *  `sets[]` (canônico), `resultA/resultB` (legado, "21,19,10") e `liveScore` (set em andamento). */
export function matchSetWins(m: Pick<TournamentMatch, 'sets' | 'resultA' | 'resultB' | 'liveScore'>): [number, number] {
  if (m.sets.length > 0) {
    return [m.sets.filter((s) => s.a > s.b).length, m.sets.filter((s) => s.b > s.a).length];
  }
  const legacy = legacySets(m.resultA, m.resultB);
  if (legacy.length > 0) {
    return [legacy.filter((s) => s.a > s.b).length, legacy.filter((s) => s.b > s.a).length];
  }
  return m.liveScore ? [m.liveScore.setsA, m.liveScore.setsB] : [0, 0];
}

/** Sets fechados, já normalizados: usa `sets[]` e cai no formato legado quando ele não existe. */
export function matchClosedSets(m: Pick<TournamentMatch, 'sets' | 'resultA' | 'resultB'>): MatchSet[] {
  return m.sets.length > 0 ? m.sets : legacySets(m.resultA, m.resultB);
}

function legacySets(resultA: string | null, resultB: string | null): MatchSet[] {
  const a = parseLegacyResult(resultA);
  const b = parseLegacyResult(resultB);
  const len = Math.max(a.length, b.length);
  const out: MatchSet[] = [];
  for (let i = 0; i < len; i++) out.push({ a: a[i] ?? 0, b: b[i] ?? 0 });
  return out;
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

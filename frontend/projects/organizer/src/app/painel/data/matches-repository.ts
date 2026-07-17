import { collection, getDocs, query, where } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from './firestore';
import { fetchTeamNames } from './teams-repository';

/** `artifacts/{projectId}/public/data/matches` — mesma coleção que o athlete lê em
 *  `matches-repository.ts`, achatada pro contrato do painel do organizador: `round` vira um
 *  rótulo de fase (a árvore de mata-mata inteira não é reconstruída aqui, só a rotulagem —
 *  ver `bracketColumnHeaderLabel` no athlete pra a versão completa) e `sets`/`resultA`/
 *  `resultB` viram um placar formatado em texto único.
 *
 *  `teamADescription`/`teamBDescription` só existem quando o slot vem de WINNER/LOSER de outro
 *  jogo (`sourceDescription` em `category-bracket-builders.ts`) — partidas de rodada 1 (SEED
 *  direto) só gravam `teamAId`/`teamBId` crus, então o nome precisa vir de `teams` (mesmo join
 *  que `inscriptions-repository.ts` já fazia, ver `teams-repository.ts`). */

/** Status normalizado — espelha `MatchStatus` (`functions/src/match-status.ts`: "Scheduled"/
 *  "In Progress"/"Completed"/"Canceled") em snake_case pro template Angular. */
export type MatchDisplayStatus = 'scheduled' | 'in_progress' | 'completed' | 'canceled';

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  categoryId: string | null;
  round: string | null; // rótulo da fase/rodada se houver
  team1Label: string;
  team2Label: string;
  score: string | null; // placar formatado (sets) ou null se não jogado
  winnerSide: 1 | 2 | null;
  scheduledAt: Date | null;
  court: string | null;
  status: MatchDisplayStatus;
  /** Campos crus pra operação (placar/agendamento — Tasks O6/O8): ids das duplas (vazio =
   *  slot ainda não decidido), sets numéricos, quadra por id e fim do slot agendado. */
  teamAId: string;
  teamBId: string;
  sets: Array<{ a: number; b: number }>;
  courtId: string;
  scheduleEndAt: Date | null;
  /** 1 (set único) ou 3 (MD3) — mesmo parse tolerante do app (`_bestOf`). */
  bestOf: 1 | 3;
  /** Campos crus (Task O6) usados só pra reconstruir a árvore de mata-mata — ver
   *  `bracket-tree.ts`. `matchType` cru ("WB"/"LB"/"Final"/"Third Place"/"knockout"/"group",
   *  case-sensitive como gravado por `category-bracket-builders.ts`), `roundNumber`/
   *  `matchNumber` numéricos, e os ponteiros de avanço (só a dupla eliminação os grava —
   *  eliminatória simples resolve avanço por posição em runtime, sem ponteiro salvo). */
  matchType: string;
  roundNumber: number;
  matchNumber: number;
  winnerAdvanceMatchNumber: number | null;
  /** Slot que o vencedor ocupa na partida destino ('A' | 'B') — define quem fica em cima na
   *  árvore (slot A acima do B), seguindo a fiação da planta (`bracket-definitions`). */
  winnerAdvanceSlot: 'A' | 'B' | null;
  loserAdvanceMatchNumber: number | null;
}

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const t = v as { toDate?: () => Date; seconds?: number; _seconds?: number };
  if (typeof t.toDate === 'function') {
    const d = t.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  const seconds = typeof t.seconds === 'number' ? t.seconds : typeof t._seconds === 'number' ? t._seconds : null;
  if (seconds != null) {
    const d = new Date(seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

interface RawSet {
  a: number;
  b: number;
}

function setsFromRaw(raw: unknown): RawSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const o = s as Record<string, unknown>;
      const a = typeof o['a'] === 'number' ? o['a'] : null;
      const b = typeof o['b'] === 'number' ? o['b'] : null;
      return a == null || b == null ? null : { a, b };
    })
    .filter((s): s is RawSet => s != null);
}

function scoreOf(sets: RawSet[], resultA: string | null, resultB: string | null): string | null {
  if (sets.length > 0) return sets.map((s) => `${s.a}-${s.b}`).join(', ');
  if (resultA && resultB) {
    const a = resultA.split(',').map((n) => n.trim());
    const b = resultB.split(',').map((n) => n.trim());
    const pairs: string[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) pairs.push(`${a[i] ?? '0'}-${b[i] ?? '0'}`);
    return pairs.join(', ');
  }
  return null;
}

/** Espelha (versão simplificada) `bracketColumnHeaderLabel`/`bracketGroupKey` do athlete —
 *  aqui só o rótulo de texto, sem agrupar partidas em colunas. */
function roundLabelOf(matchType: string, round: number, poolId: string): string | null {
  if (poolId) return `Grupo ${poolId}`;
  const t = matchType.trim().toLowerCase();
  if (t === 'wb') return `WB · Rodada ${round}`;
  if (t === 'lb') return `LB · Rodada ${round}`;
  if (t === 'final') return 'Final';
  if (t === 'grand final' || t === 'grand_final') return 'Grand Final';
  if (t === 'third place' || t === 'third_place') return '3º Lugar';
  if (t === 'knockout') return `Rodada ${round}`;
  if (matchType.trim()) return matchType.trim();
  return round > 0 ? `Rodada ${round}` : null;
}

function advanceMatchNumberOf(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const n = (raw as Record<string, unknown>)['matchNumber'];
  return typeof n === 'number' ? n : null;
}

function advanceSlotOf(raw: unknown): 'A' | 'B' | null {
  if (!raw || typeof raw !== 'object') return null;
  const slot = (raw as Record<string, unknown>)['teamSlot'];
  if (slot === 'teamAId') return 'A';
  if (slot === 'teamBId') return 'B';
  return null;
}

function statusOf(raw: unknown): MatchDisplayStatus {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
  if (v === 'in progress') return 'in_progress';
  if (v === 'completed') return 'completed';
  if (v === 'canceled' || v === 'cancelled') return 'canceled';
  return 'scheduled';
}

interface RawMatch {
  id: string;
  tournamentId: string;
  categoryId: string | null;
  round: string | null;
  teamAId: string | null;
  teamBId: string | null;
  teamADescription: string | null;
  teamBDescription: string | null;
  score: string | null;
  winnerSide: 1 | 2 | null;
  scheduledAt: Date | null;
  court: string | null;
  status: MatchDisplayStatus;
  matchType: string;
  roundNumber: number;
  matchNumber: number;
  winnerAdvanceMatchNumber: number | null;
  winnerAdvanceSlot: 'A' | 'B' | null;
  loserAdvanceMatchNumber: number | null;
  sets: RawSet[];
  courtId: string;
  scheduleEndAt: Date | null;
  bestOf: 1 | 3;
}

function rawMatchFromDoc(id: string, data: Record<string, unknown>): RawMatch {
  const matchType = optionalStr(data['matchType']) ?? '';
  const poolId = optionalStr(data['poolId']) ?? '';
  const round = typeof data['round'] === 'number' ? data['round'] : 0;
  const sets = setsFromRaw(data['sets']);
  const resultA = optionalStr(data['resultA']);
  const resultB = optionalStr(data['resultB']);
  const teamAId = optionalStr(data['teamAId']);
  const teamBId = optionalStr(data['teamBId']);
  const winnerId = optionalStr(data['winnerId']);
  const winnerSide: 1 | 2 | null = winnerId && teamAId && winnerId === teamAId ? 1 : winnerId && teamBId && winnerId === teamBId ? 2 : null;

  return {
    id,
    tournamentId: optionalStr(data['tournamentId']) ?? '',
    categoryId: optionalStr(data['categoryId']),
    round: roundLabelOf(matchType, round, poolId),
    teamAId,
    teamBId,
    teamADescription: optionalStr(data['teamADescription']),
    teamBDescription: optionalStr(data['teamBDescription']),
    score: scoreOf(sets, resultA, resultB),
    winnerSide,
    scheduledAt: toDate(data['scheduleTime']),
    court: optionalStr(data['courtName']),
    status: statusOf(data['status']),
    matchType,
    roundNumber: round,
    matchNumber: typeof data['matchNumber'] === 'number' ? data['matchNumber'] : 0,
    winnerAdvanceMatchNumber: advanceMatchNumberOf(data['winnerAdvance']),
    winnerAdvanceSlot: advanceSlotOf(data['winnerAdvance']),
    loserAdvanceMatchNumber: advanceMatchNumberOf(data['loserAdvance']),
    sets,
    courtId: optionalStr(data['courtId']) ?? '',
    scheduleEndAt: toDate(data['scheduleEndTime']),
    bestOf: data['bestOf'] === 1 ? 1 : 3,
  };
}

// ── Colunas de mata-mata (porta fiel de `buildBracketColumns` do athlete) ─────

function isBracketMatch(m: TournamentMatch): boolean {
  return m.matchType.trim().toLowerCase() !== 'group' && !m.round?.startsWith('Grupo ');
}

function bracketGroupKey(m: TournamentMatch): string {
  const t = m.matchType.trim();
  const tLower = t.toLowerCase();
  if (tLower === 'wb' || tLower === 'lb') return `${t.toUpperCase()}:${m.roundNumber}`;
  if (tLower === 'knockout') return `knockout:${m.roundNumber}`;
  if (t) return t;
  return `round:${m.roundNumber}`;
}

function bracketGroupSortOrder(m: TournamentMatch): number {
  const tLower = m.matchType.trim().toLowerCase();
  if (tLower === 'wb') return m.roundNumber * 10;
  if (tLower === 'lb') return m.roundNumber * 10 + 5;
  if (tLower === 'knockout') return 200 + m.roundNumber;
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
  if (base != null) return base * 10 + m.roundNumber;
  return 60 * 10 + m.roundNumber;
}

/** Nome da fase pelo nº de jogos da coluna — só vale pra mata-mata balanceado (SE/crossover
 *  de grupos, onde byes existem como partidas na chave); DE usa rótulo por rodada. */
function knockoutPhaseLabel(matchCount: number): string {
  if (matchCount >= 16) return '32-avos';
  if (matchCount === 8) return 'Oitavas';
  if (matchCount === 4) return 'Quartas';
  if (matchCount === 2) return 'Semifinais';
  return 'Eliminatórias';
}

function bracketColumnHeaderLabel(matches: readonly TournamentMatch[]): string {
  const first = matches[0];
  if (!first) return '';
  const tLower = first.matchType.trim().toLowerCase();
  if (tLower === 'wb') return `WB · Rodada ${first.roundNumber}`;
  if (tLower === 'lb') return `LB · Rodada ${first.roundNumber}`;
  if (tLower === 'final') return 'Final';
  if (tLower === 'grand final' || tLower === 'grand_final') return 'Grand Final';
  if (tLower === 'third place' || tLower === 'third_place') return '3º Lugar';
  if (tLower === 'knockout') return knockoutPhaseLabel(matches.length);
  return first.matchType.trim() || `Rodada ${first.roundNumber}`;
}

export interface BracketColumn {
  key: string;
  label: string;
  matches: TournamentMatch[];
}

/** Agrupa partidas de mata-mata em colunas ordenadas — mesma chave/ordem/rótulo do athlete
 *  (`buildBracketColumns` em `projects/athlete/.../matches-repository.ts`), que espelha o
 *  Flutter. É a fonte de verdade tanto do bracket genérico quanto dos rótulos da árvore DE. */
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

// ── Classificação de grupo (porta fiel de `buildGroupStandings` do athlete) ───

export interface GroupStanding {
  teamId: string;
  teamLabel: string;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
}

/** Classificação round-robin — espelha `tournament_group_standings_logic.dart` via a porta do
 *  athlete: desempate por vitórias → saldo de sets → saldo de games (sem head-to-head, que é
 *  regra do servidor). Só conta partida concluída com vencedor. */
export function buildGroupStandings(groupMatches: readonly TournamentMatch[]): GroupStanding[] {
  const done = groupMatches.filter((m) => m.status === 'completed' && m.winnerSide != null && m.teamAId && m.teamBId);
  const byTeam = new Map<string, GroupStanding>();
  const labelOf = new Map<string, string>();
  for (const m of groupMatches) {
    if (m.teamAId) labelOf.set(m.teamAId, m.team1Label);
    if (m.teamBId) labelOf.set(m.teamBId, m.team2Label);
  }
  const ensure = (id: string): GroupStanding =>
    byTeam.get(id) ??
    byTeam
      .set(id, { teamId: id, teamLabel: labelOf.get(id) ?? id, wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 0 })
      .get(id)!;

  // Garante linha até pra quem ainda não jogou (aparece zerado, como no app).
  for (const m of groupMatches) {
    if (m.teamAId) ensure(m.teamAId);
    if (m.teamBId) ensure(m.teamBId);
  }

  for (const m of done) {
    const a = ensure(m.teamAId);
    const b = ensure(m.teamBId);
    if (m.winnerSide === 1) {
      a.wins++;
      b.losses++;
    } else {
      b.wins++;
      a.losses++;
    }
    for (const s of m.sets) {
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

export async function listMatches(tournamentId: string): Promise<TournamentMatch[]> {
  const db = organizerFirestore();
  const projectId = environment.firebase.projectId;
  if (!projectId) return [];
  const snap = await getDocs(query(collection(db, 'artifacts', projectId, 'public', 'data', 'matches'), where('tournamentId', '==', tournamentId)));
  const rows = snap.docs.map((d) => rawMatchFromDoc(d.id, d.data() as Record<string, unknown>));

  const teamIds = rows.flatMap((r) => [r.teamAId, r.teamBId]).filter((id): id is string => id != null);
  const teamNames = await fetchTeamNames(db, projectId, teamIds);
  // Prioridade igual à do app (`_teamViewModel`): equipe resolvida PRIMEIRO; a descrição
  // placeholder ("Vencedor Jogo #1", "1º Grupo A") só aparece enquanto o slot não tem equipe
  // definida — senão a partida seguiria rotulada de placeholder mesmo depois do avanço.
  const labelOf = (description: string | null, teamId: string | null): string => (teamId ? teamNames.get(teamId) : null) ?? description ?? 'A definir';

  return rows.map((r) => ({
    id: r.id,
    tournamentId: r.tournamentId,
    categoryId: r.categoryId,
    round: r.round,
    team1Label: labelOf(r.teamADescription, r.teamAId),
    team2Label: labelOf(r.teamBDescription, r.teamBId),
    score: r.score,
    winnerSide: r.winnerSide,
    scheduledAt: r.scheduledAt,
    court: r.court,
    status: r.status,
    matchType: r.matchType,
    roundNumber: r.roundNumber,
    matchNumber: r.matchNumber,
    winnerAdvanceMatchNumber: r.winnerAdvanceMatchNumber,
    winnerAdvanceSlot: r.winnerAdvanceSlot,
    loserAdvanceMatchNumber: r.loserAdvanceMatchNumber,
    teamAId: r.teamAId ?? '',
    teamBId: r.teamBId ?? '',
    sets: r.sets,
    courtId: r.courtId,
    scheduleEndAt: r.scheduleEndAt,
    bestOf: r.bestOf,
  }));
}

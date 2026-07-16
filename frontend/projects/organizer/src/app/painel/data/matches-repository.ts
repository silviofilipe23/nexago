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
  loserAdvanceMatchNumber: number | null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
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
    loserAdvanceMatchNumber: advanceMatchNumberOf(data['loserAdvance']),
    sets,
    courtId: optionalStr(data['courtId']) ?? '',
    scheduleEndAt: toDate(data['scheduleEndTime']),
    bestOf: data['bestOf'] === 1 ? 1 : 3,
  };
}

export async function listMatches(tournamentId: string): Promise<TournamentMatch[]> {
  const db = organizerFirestore();
  const projectId = environment.firebase.projectId;
  if (!projectId) return [];
  const snap = await getDocs(query(collection(db, 'artifacts', projectId, 'public', 'data', 'matches'), where('tournamentId', '==', tournamentId)));
  const rows = snap.docs.map((d) => rawMatchFromDoc(d.id, d.data() as Record<string, unknown>));

  const teamIds = rows.flatMap((r) => [r.teamAId, r.teamBId]).filter((id): id is string => id != null);
  const teamNames = await fetchTeamNames(db, projectId, teamIds);
  const labelOf = (description: string | null, teamId: string | null): string => description ?? (teamId ? teamNames.get(teamId) : null) ?? 'A definir';

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
    loserAdvanceMatchNumber: r.loserAdvanceMatchNumber,
    teamAId: r.teamAId ?? '',
    teamBId: r.teamBId ?? '',
    sets: r.sets,
    courtId: r.courtId,
    scheduleEndAt: r.scheduleEndAt,
    bestOf: r.bestOf,
  }));
}

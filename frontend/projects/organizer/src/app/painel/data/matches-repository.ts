import { collection, getDocs, query, where } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { organizerFirestore } from './firestore';

/** `artifacts/{projectId}/public/data/matches` — mesma coleção que o athlete lê em
 *  `matches-repository.ts`, achatada pro contrato do painel do organizador: `round` vira um
 *  rótulo de fase (a árvore de mata-mata inteira não é reconstruída aqui, só a rotulagem —
 *  ver `bracketColumnHeaderLabel` no athlete pra a versão completa) e `sets`/`resultA`/
 *  `resultB` viram um placar formatado em texto único. */

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
  if (matchType.trim()) return matchType.trim();
  return round > 0 ? `Rodada ${round}` : null;
}

function matchFromDoc(id: string, data: Record<string, unknown>): TournamentMatch {
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
    team1Label: optionalStr(data['teamADescription']) ?? 'A definir',
    team2Label: optionalStr(data['teamBDescription']) ?? 'A definir',
    score: scoreOf(sets, resultA, resultB),
    winnerSide,
    scheduledAt: toDate(data['scheduleTime']),
    court: optionalStr(data['courtName']),
  };
}

export async function listMatches(tournamentId: string): Promise<TournamentMatch[]> {
  const db = organizerFirestore();
  const projectId = environment.firebase.projectId;
  if (!projectId) return [];
  const snap = await getDocs(query(collection(db, 'artifacts', projectId, 'public', 'data', 'matches'), where('tournamentId', '==', tournamentId)));
  return snap.docs.map((d) => matchFromDoc(d.id, d.data() as Record<string, unknown>));
}

import { collection, documentId, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { chunkIds } from '../data/chunk-ids';
import type { ArenaTournament } from './tournament.model';
import type { ArenaLeagueSummary } from './league.model';

/** `leagues/{id}` não tem campo de arena (só as etapas, que são torneios reais com `arenaId`
 *  próprio) — a única forma de achar "ligas com etapa nesta arena" é olhar pros torneios já
 *  filtrados por `arenaId` e juntar os `leagueId` distintos, igual o Flutter faz. */

const SPORT_LABELS: Record<string, string> = {
  beachVolleyball: 'Vôlei de praia',
  indoorVolleyball: 'Vôlei de quadra',
  footvolley: 'Futevôlei',
};

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function sportLabelOf(raw: unknown): string {
  const v = optionalStr(raw);
  if (!v) return 'Esporte';
  return SPORT_LABELS[v] ?? v;
}

/** Quantas etapas de cada liga acontecem nesta arena — contagem sobre os torneios JÁ filtrados
 *  por `arenaId`, que é a única pista de "liga com etapa aqui" que existe. */
export function countStagesByLeague(arenaTournaments: readonly ArenaTournament[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of arenaTournaments) {
    if (!t.leagueId) continue;
    counts.set(t.leagueId, (counts.get(t.leagueId) ?? 0) + 1);
  }
  return counts;
}

export function leagueSummaryFromDoc(id: string, data: Record<string, unknown>, stagesHereCount: number): ArenaLeagueSummary {
  const stages = Array.isArray(data['stages']) ? data['stages'] : [];
  return {
    id,
    name: optionalStr(data['name']) ?? 'Liga',
    sport: sportLabelOf(data['sport']),
    city: optionalStr(data['city']) ?? '',
    seasonLabel: optionalStr(data['seasonLabel']),
    stagesHereCount,
    stagesTotalCount: stages.length,
  };
}

export async function fetchArenaLeagues(db: Firestore, arenaTournaments: readonly ArenaTournament[]): Promise<ArenaLeagueSummary[]> {
  const stagesHereCount = countStagesByLeague(arenaTournaments);
  const chunks = chunkIds([...stagesHereCount.keys()]);
  if (chunks.length === 0) return [];

  // Os lotes saem juntos: são independentes, e com `await` dentro do laço cada lote de 10 ligas
  // só partia depois do anterior voltar — latência enfileirada à toa.
  const col = collection(db, 'leagues');
  const snaps = await Promise.all(chunks.map((chunk) => getDocs(query(col, where(documentId(), 'in', chunk)))));

  const result: ArenaLeagueSummary[] = [];
  for (const snap of snaps) {
    for (const d of snap.docs) {
      result.push(leagueSummaryFromDoc(d.id, d.data() as Record<string, unknown>, stagesHereCount.get(d.id) ?? 0));
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

import { collection, documentId, getDocs, query, where, type Firestore } from 'firebase/firestore';
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

export async function fetchArenaLeagues(db: Firestore, arenaTournaments: readonly ArenaTournament[]): Promise<ArenaLeagueSummary[]> {
  const stagesHereCount = new Map<string, number>();
  for (const t of arenaTournaments) {
    if (!t.leagueId) continue;
    stagesHereCount.set(t.leagueId, (stagesHereCount.get(t.leagueId) ?? 0) + 1);
  }
  const leagueIds = [...stagesHereCount.keys()];
  if (leagueIds.length === 0) return [];

  const result: ArenaLeagueSummary[] = [];
  for (let i = 0; i < leagueIds.length; i += 10) {
    const chunk = leagueIds.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, 'leagues'), where(documentId(), 'in', chunk)));
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const stages = Array.isArray(data['stages']) ? data['stages'] : [];
      result.push({
        id: d.id,
        name: optionalStr(data['name']) ?? 'Liga',
        sport: sportLabelOf(data['sport']),
        city: optionalStr(data['city']) ?? '',
        seasonLabel: optionalStr(data['seasonLabel']),
        stagesHereCount: stagesHereCount.get(d.id) ?? 0,
        stagesTotalCount: stages.length,
      });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

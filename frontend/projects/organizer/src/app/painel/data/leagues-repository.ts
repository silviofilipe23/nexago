import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { organizerFirestore } from './firestore';
import type { OrganizerLeague, OrganizerLeagueStage } from './league.model';

/** `leagues/{id}` (top-level, leitura pública, espelha `LeagueCreateMapper`/
 *  `league_stage_tournament_factory.dart`) filtrado por `managerId == uid` — mesmo campo que
 *  `OrganizerLeaguesRepository.watchManagedLeagues` (Flutter) usa. Sem paginação, ordena em
 *  memória por `seasonStartAt` desc (equivalente ao `startAt` de torneio nas ligas). */

/** Mesmo mapa de `tournaments-repository.ts` — ligas gravam `sport` com os mesmos valores de
 *  `TournamentSport` (`league_create_mapper.dart`: `'sport': draft.sport.name`). */
const SPORT_LABELS: Record<string, string> = {
  beachVolleyball: 'Vôlei de praia',
  indoorVolleyball: 'Vôlei de quadra',
  footvolley: 'Futevôlei',
};

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof v === 'string') {
    const parsed = new Date(v);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function sportLabelOf(raw: unknown): string {
  const v = optionalStr(raw);
  if (!v) return 'Esporte';
  return SPORT_LABELS[v] ?? v;
}

function stageFromRaw(raw: unknown): OrganizerLeagueStage | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = optionalStr(o['id']);
  if (!id) return null;
  const tournamentIds = Array.isArray(o['tournamentIds']) ? o['tournamentIds'].filter((x): x is string => typeof x === 'string') : [];
  return {
    id,
    name: optionalStr(o['name']) ?? id,
    tournamentId: tournamentIds[0] ?? null,
    startAt: toDate(o['startAt']),
  };
}

function leagueFromDoc(id: string, data: Record<string, unknown>): OrganizerLeague {
  const stagesRaw = Array.isArray(data['stages']) ? data['stages'] : [];
  return {
    id,
    name: optionalStr(data['name']) ?? 'Liga',
    sportLabel: sportLabelOf(data['sport']),
    seasonLabel: optionalStr(data['seasonLabel']),
    city: optionalStr(data['city']),
    // Mesmo fallback do app (`league_document_mapper.dart`): coverUrl ?? imageUrl.
    coverUrl: optionalStr(data['coverUrl']) ?? optionalStr(data['imageUrl']),
    stages: stagesRaw.map(stageFromRaw).filter((s): s is OrganizerLeagueStage => s != null),
  };
}

export async function listMyLeagues(uid: string): Promise<OrganizerLeague[]> {
  const db = organizerFirestore();
  const snap = await getDocs(query(collection(db, 'leagues'), where('managerId', '==', uid)));
  const rows = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return { league: leagueFromDoc(d.id, data), seasonStartAt: toDate(data['seasonStartAt']) };
  });
  rows.sort((a, b) => (b.seasonStartAt?.getTime() ?? 0) - (a.seasonStartAt?.getTime() ?? 0));
  return rows.map((r) => r.league);
}

export async function getLeague(id: string): Promise<OrganizerLeague | null> {
  const db = organizerFirestore();
  const snap = await getDoc(doc(db, 'leagues', id));
  if (!snap.exists()) return null;
  return leagueFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { organizerFirestore } from './firestore';
import type { OrganizerTournament, OrganizerTournamentCategory, OrganizerTournamentStatus } from './tournament.model';

/** `tournaments/{id}` (top-level, leitura pública, espelha `TournamentDocumentMapper`/
 *  `tournament_create_mapper.dart` + `league_stage_tournament_factory.dart`) filtrado por
 *  `managerId == uid` — mesmo campo que `OrganizerTournamentsRepository.watchManagedTournaments`
 *  (Flutter) usa. Sem paginação, ordena em memória por `startAt` desc. */

/** Rótulos dos 3 esportes que o wizard do organizador grava (`TournamentSport` no Dart) —
 *  mesmo mapa usado em `frontend/projects/arena/.../tournaments-repository.ts`. */
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

function numberOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function sportLabelOf(raw: unknown): string {
  const v = optionalStr(raw);
  if (!v) return 'Esporte';
  return SPORT_LABELS[v] ?? v;
}

/** Colapsa `listingStatus`/`status` (draft/open/closed/completed/cancelled, + variantes
 *  legadas em português — ver `tournament-completion.ts`) pros 4 estados do painel. */
function statusFromRaw(raw: string): OrganizerTournamentStatus {
  const v = raw.toLowerCase().trim();
  if (v.includes('cancel')) return 'cancelado';
  if (v.includes('complet') || v.includes('conclu')) return 'concluido';
  if (v === 'closed' || v.includes('andamento') || v.includes('progress') || v === 'live') return 'andamento';
  return 'inscricoes'; // 'open', 'draft' ou desconhecido
}

function categoryFromRaw(raw: unknown): OrganizerTournamentCategory | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = optionalStr(o['id']) ?? optionalStr(o['categoryId']);
  if (!id) return null;
  return {
    id,
    name: optionalStr(o['categoryName']) ?? optionalStr(o['name']) ?? id,
    maxTeams: numberOf(o['maxTeams']) ?? numberOf(o['spotsTotal']),
  };
}

function tournamentFromDoc(id: string, data: Record<string, unknown>): OrganizerTournament {
  const categories = Array.isArray(data['categories'])
    ? data['categories'].map(categoryFromRaw).filter((c): c is OrganizerTournamentCategory => c != null)
    : [];
  const capacityFallback = categories.reduce((sum, c) => sum + (c.maxTeams ?? 0), 0);
  const statusRaw = optionalStr(data['listingStatus']) ?? optionalStr(data['status']) ?? '';
  return {
    id,
    name: optionalStr(data['name']) ?? 'Torneio',
    sportLabel: sportLabelOf(data['sport']),
    status: statusFromRaw(statusRaw),
    startAt: toDate(data['startAt']),
    endAt: toDate(data['endAt']),
    city: optionalStr(data['city']),
    location: optionalStr(data['locationName']) ?? optionalStr(data['location']),
    categories,
    capacity: numberOf(data['capacity']) ?? (capacityFallback > 0 ? capacityFallback : null),
    leagueId: optionalStr(data['leagueId']),
  };
}

export async function listMyTournaments(uid: string): Promise<OrganizerTournament[]> {
  const db = organizerFirestore();
  const snap = await getDocs(query(collection(db, 'tournaments'), where('managerId', '==', uid)));
  const tournaments = snap.docs.map((d) => tournamentFromDoc(d.id, d.data() as Record<string, unknown>));
  return tournaments.sort((a, b) => (b.startAt?.getTime() ?? 0) - (a.startAt?.getTime() ?? 0));
}

export async function getTournament(id: string): Promise<OrganizerTournament | null> {
  const db = organizerFirestore();
  const snap = await getDoc(doc(db, 'tournaments', id));
  if (!snap.exists()) return null;
  return tournamentFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

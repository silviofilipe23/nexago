import { collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where, type Unsubscribe } from 'firebase/firestore';
import { organizerFirestore } from './firestore';
import type { OrganizerMatchOpsConfig, OrganizerTournament, OrganizerTournamentCategory, OrganizerTournamentStatus, TelaoConfig } from './tournament.model';

/** `tournaments/{id}` (top-level, leitura pública, espelha `TournamentDocumentMapper`/
 *  `tournament_create_mapper.dart` + `league_stage_tournament_factory.dart`) filtrado por
 *  `managerId == uid` — mesmo campo que `OrganizerTournamentsRepository.watchManagedTournaments`
 *  (Flutter) usa — mais os torneios em que o uid é gestor da equipe (espelho
 *  `users/{uid}/tournamentStaff`). Sem paginação, ordena em memória por `startAt` desc. */

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
    bracketFormat: optionalStr(o['bracketFormat']),
    teamsPerGroup: numberOf(o['teamsPerGroup']) ?? 4,
    qualifiersPerGroup: numberOf(o['qualifiersPerGroup']) ?? 2,
    bestOf: optionalStr(o['bestOf']),
  };
}

function matchOpsFromRaw(raw: unknown): OrganizerMatchOpsConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    dayStart: optionalStr(o['dayStart']) ?? '07:00',
    dayEnd: optionalStr(o['dayEnd']) ?? '24:00',
    defaultMatchDurationMin: numberOf(o['defaultMatchDurationMin']) ?? 30,
    minRestBetweenMatchesMin: numberOf(o['minRestBetweenMatchesMin']) ?? 30,
  };
}

function courtsFromRaw(raw: unknown, courtsCount: number): { id: string; name: string; order: number }[] {
  const parsed = Array.isArray(raw)
    ? raw
        .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
        .map((o) => ({ id: optionalStr(o['id']) ?? '', name: optionalStr(o['name']) ?? '', order: numberOf(o['order']) ?? 0 }))
        .filter((c) => c.id)
        .sort((a, b) => a.order - b.order)
    : [];
  if (parsed.length === courtsCount) return parsed;
  // Mesma regra do app (`resolveTournamentCourts`): courtsCount manda; senão gera Q1..Qn.
  const n = Math.max(courtsCount, 1);
  return Array.from({ length: n }, (_, i) => ({ id: `Q${i + 1}`, name: `Quadra ${i + 1}`, order: i + 1 }));
}

function telaoConfigFromRaw(raw: unknown): TelaoConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    courtIds: Array.isArray(o['courtIds']) ? o['courtIds'].filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [],
    showUpcoming: o['showUpcoming'] !== false,
    showCall: o['showCall'] !== false,
    showAvatars: o['showAvatars'] !== false,
    autoRotate: o['autoRotate'] !== false,
    showStreak: o['showStreak'] !== false,
    showFinalMode: o['showFinalMode'] !== false,
  };
}

/** Capa do torneio — mesmos fallbacks de chave do app (`TournamentDocumentMapper._imageUrl`). */
function coverUrlOf(data: Record<string, unknown>): string | null {
  for (const key of ['coverUrl', 'imageUrl', 'coverImageUrl', 'posterUrl', 'thumbnailUrl']) {
    const v = optionalStr(data[key]);
    if (v) return v;
  }
  return null;
}

function tournamentFromDoc(id: string, data: Record<string, unknown>): OrganizerTournament {
  const categories = Array.isArray(data['categories'])
    ? data['categories'].map(categoryFromRaw).filter((c): c is OrganizerTournamentCategory => c != null)
    : [];
  const capacityFallback = categories.reduce((sum, c) => sum + (c.maxTeams ?? 0), 0);
  const statusRaw = optionalStr(data['listingStatus']) ?? optionalStr(data['status']) ?? '';
  const courtsCount = numberOf(data['courtsCount']) ?? 4;
  return {
    id,
    name: optionalStr(data['name']) ?? 'Torneio',
    managerId: optionalStr(data['managerId']) ?? '',
    sportLabel: sportLabelOf(data['sport']),
    sportId: optionalStr(data['sport']),
    coverUrl: coverUrlOf(data),
    status: statusFromRaw(statusRaw),
    // Estrito de propósito: o site só publica `visibility === 'publicListing'`, então doc antigo
    // SEM o campo não tem página pública (404). Tratar a ausência como `linkOnly` é o que faz o
    // link compartilhado apontar pra um lugar que existe. O wizard, esse sim, assume público
    // quando cria (`tournament-create-mapper.ts`).
    visibility: data['visibility'] === 'publicListing' ? 'publicListing' : 'linkOnly',
    startAt: toDate(data['startAt']),
    endAt: toDate(data['endAt']),
    city: optionalStr(data['city']),
    location: optionalStr(data['locationName']) ?? optionalStr(data['location']),
    categories,
    capacity: numberOf(data['capacity']) ?? (capacityFallback > 0 ? capacityFallback : null),
    leagueId: optionalStr(data['leagueId']),
    courts: courtsFromRaw(data['courts'], courtsCount),
    courtsCount,
    matchOps: matchOpsFromRaw(data['matchOps']),
    bigScreen: telaoConfigFromRaw(data['bigScreen']),
  };
}

/** Config efetiva do telão: defaults com tudo ligado e todas as quadras; `courtIds` filtrado
 *  pelas quadras que existem HOJE no torneio (quadra removida some da seleção; seleção que
 *  ficou vazia volta a todas — a TV nunca fica preta por config órfã). */
export function effectiveTelaoConfig(t: OrganizerTournament): TelaoConfig {
  const allCourtIds = t.courts.map((c) => c.id);
  const cfg = t.bigScreen;
  if (!cfg) {
    return { courtIds: allCourtIds, showUpcoming: true, showCall: true, showAvatars: true, autoRotate: true, showStreak: true, showFinalMode: true };
  }
  const courtIds = cfg.courtIds.filter((id) => allCourtIds.includes(id));
  return { ...cfg, courtIds: courtIds.length > 0 ? courtIds : allCourtIds };
}

/** Ids de torneios em que o uid é gestor ativo — espelho `users/{uid}/tournamentStaff`
 *  mantido por Cloud Function, mesma fonte do `myTournamentStaffEntriesProvider` (Flutter).
 *  Mesário fica de fora: sem a role `organizer`, ele nem loga neste portal. Falha aqui não
 *  pode derrubar a lista de torneios próprios (ex.: rules antigas sem a regra do espelho). */
async function listStaffManagerTournamentIds(uid: string): Promise<string[]> {
  try {
    const db = organizerFirestore();
    const snap = await getDocs(collection(db, 'users', uid, 'tournamentStaff'));
    return snap.docs
      .filter((d) => {
        const data = d.data() as Record<string, unknown>;
        return data['role'] !== 'scorer' && (data['status'] ?? 'active') === 'active';
      })
      .map((d) => d.id);
  } catch {
    return [];
  }
}

/** Torneios próprios (`managerId == uid`) + torneios em que o uid é gestor da equipe. */
export async function listMyTournaments(uid: string): Promise<OrganizerTournament[]> {
  const db = organizerFirestore();
  const [ownedSnap, staffIds] = await Promise.all([
    getDocs(query(collection(db, 'tournaments'), where('managerId', '==', uid))),
    listStaffManagerTournamentIds(uid),
  ]);
  const tournaments = ownedSnap.docs.map((d) => tournamentFromDoc(d.id, d.data() as Record<string, unknown>));
  const ownedIds = new Set(tournaments.map((t) => t.id));
  const staffSnaps = await Promise.all(staffIds.filter((id) => !ownedIds.has(id)).map((id) => getDoc(doc(db, 'tournaments', id))));
  for (const snap of staffSnaps) {
    if (snap.exists()) tournaments.push(tournamentFromDoc(snap.id, snap.data() as Record<string, unknown>));
  }
  return tournaments.sort((a, b) => (b.startAt?.getTime() ?? 0) - (a.startAt?.getTime() ?? 0));
}

/** Torneios das etapas de uma liga (`leagueId == id`) — uma query só, em vez de um `get` por
 *  etapa. Cada etapa do doc da liga referencia no máximo um torneio destes. */
export async function listTournamentsByLeague(leagueId: string): Promise<OrganizerTournament[]> {
  const db = organizerFirestore();
  const snap = await getDocs(query(collection(db, 'tournaments'), where('leagueId', '==', leagueId)));
  return snap.docs.map((d) => tournamentFromDoc(d.id, d.data() as Record<string, unknown>));
}

export async function getTournament(id: string): Promise<OrganizerTournament | null> {
  const db = organizerFirestore();
  const snap = await getDoc(doc(db, 'tournaments', id));
  if (!snap.exists()) return null;
  return tournamentFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

/** Versão ao vivo de `getTournament` — o telão escuta o doc pra reagir a mudança de config
 *  (`bigScreen`) e de quadras sem recarregar a página da TV. */
export function watchTournament(id: string, onChange: (t: OrganizerTournament | null) => void, onError?: (error: unknown) => void): Unsubscribe {
  return onSnapshot(
    doc(organizerFirestore(), 'tournaments', id),
    (snap) => onChange(snap.exists() ? tournamentFromDoc(snap.id, snap.data() as Record<string, unknown>) : null),
    (err) => onError?.(err),
  );
}

/** Grava a config do telão direto no doc (rules: update permitido ao `managerId`/staff
 *  manager). Exceção consciente à convenção "toda escrita via callable": é preferência de
 *  exibição, não regra de negócio. */
export function saveTelaoConfig(tournamentId: string, config: TelaoConfig): Promise<void> {
  return updateDoc(doc(organizerFirestore(), 'tournaments', tournamentId), { bigScreen: { ...config, courtIds: [...config.courtIds] } });
}

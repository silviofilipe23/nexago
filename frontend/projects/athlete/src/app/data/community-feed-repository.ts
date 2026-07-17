import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

/** `communityFeed/{id}` — itens automáticos gravados por Cloud Function
 *  (`functions/src/community-feed.ts`) quando torneios abrem inscrições
 *  (`open_{tournamentId}`) ou terminam com campeões (`champions_{tournamentId}`).
 *  Sem UGC; leitura liberada pra qualquer autenticado (firestore.rules). */
export type CommunityFeedType = 'tournament_open' | 'tournament_champions';

export interface CommunityChampionPlayer {
  uid: string;
  name: string;
  photoUrl: string | null;
}

export interface CommunityChampion {
  categoryId: string;
  categoryName: string;
  players: CommunityChampionPlayer[];
}

export interface CommunityFeedItem {
  id: string;
  type: CommunityFeedType;
  tournamentId: string;
  tournamentName: string;
  city: string | null;
  locationName: string | null;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date | null;
  categoriesCount: number | null;
  champions: CommunityChampion[];
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function championsOf(raw: unknown): CommunityChampion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object')
    .map((c) => ({
      categoryId: str(c['categoryId']) ?? '',
      categoryName: str(c['categoryName']) ?? 'Categoria',
      players: Array.isArray(c['players'])
        ? (c['players'] as unknown[])
            .filter((p): p is Record<string, unknown> => p != null && typeof p === 'object')
            .map((p) => ({ uid: str(p['uid']) ?? '', name: str(p['name']) ?? 'Atleta', photoUrl: str(p['photoUrl']) }))
        : [],
    }));
}

function fromDoc(snap: QueryDocumentSnapshot<DocumentData>): CommunityFeedItem | null {
  const data = snap.data();
  const type = str(data['type']);
  if (type !== 'tournament_open' && type !== 'tournament_champions') return null;
  return {
    id: snap.id,
    type,
    tournamentId: str(data['tournamentId']) ?? '',
    tournamentName: str(data['tournamentName']) ?? 'Torneio',
    city: str(data['city']),
    locationName: str(data['locationName']),
    startAt: toDate(data['startAt']),
    endAt: toDate(data['endAt']),
    createdAt: toDate(data['createdAt']),
    categoriesCount: typeof data['categoriesCount'] === 'number' ? data['categoriesCount'] : null,
    champions: championsOf(data['champions']),
  };
}

export function watchCommunityFeed(
  db: Firestore,
  onChange: (items: CommunityFeedItem[]) => void,
  onError?: () => void,
  max = 30,
): Unsubscribe {
  const q = query(collection(db, 'communityFeed'), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map(fromDoc).filter((i): i is CommunityFeedItem => i != null)),
    () => onError?.(),
  );
}

import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Dados ao vivo das seções automáticas do mini-site (`/s/{slug}`). Tudo aqui é
 * leitura pública sem auth: `arenas/{id}/courts` (horários), `tournaments` com
 * `arenaId` (sede; filtro de visibilidade é client-side, como no restante do
 * site), `arena_reputation/{id}` (agregados mantidos por function) e
 * `arena_reviews` (texto público; o autor fica anônimo porque `public_profiles`
 * exige auth). Falha vira vazio/null — a página esconde a seção sem dado.
 */

// ── Dados públicos do cadastro da arena ──────────────────

/** Mesmas chaves do `ArenaAmenities` do lib arena-discovery (Angular — não
 *  importável aqui, então a lista é espelhada). */
export const AMENITY_KEYS = [
  'parking', 'lockerRoom', 'coveredCourt', 'bar',
  'racketRental', 'hasAccessibleCourt', 'hasAccessibleBathroom', 'hasPcdParking',
] as const;
export type AmenityKey = (typeof AMENITY_KEYS)[number];

export interface ArenaPublicInfo {
  name: string;
  address: string;
  city: string;
  state: string;
  amenities: AmenityKey[];
  courtsCount: number;
  courtTypes: string[];
  lat: number | null;
  lng: number | null;
}

/** Cadastro público da arena: amenidades (seção Estrutura), endereço/coords
 *  (mapa e "como chegar") e nº de quadras (badge do hero). */
export async function getArenaPublicInfo(arenaId: string): Promise<ArenaPublicInfo | null> {
  try {
    const [snap, courtsCount] = await Promise.all([
      getDoc(doc(db, 'arenas', arenaId)),
      getCountFromServer(collection(db, 'arenas', arenaId, 'courts')).then(
        (c) => c.data().count,
        () => 0,
      ),
    ]);
    if (!snap.exists()) return null;
    const data = snap.data() as DocumentData;
    const amenitiesRaw = (data.amenities ?? {}) as DocumentData;

    let lat: number | null = null;
    let lng: number | null = null;
    if (typeof data.lat === 'number' && typeof data.lng === 'number') {
      lat = data.lat;
      lng = data.lng;
    } else {
      const geo = data.geo ?? data.coordinates;
      if (geo && typeof geo === 'object' && typeof geo.lat === 'number' && typeof geo.lng === 'number') {
        lat = geo.lat;
        lng = geo.lng;
      }
    }

    return {
      name: str(data.name) || 'Arena',
      address: str(data.address),
      city: str(data.city),
      state: str(data.state),
      amenities: AMENITY_KEYS.filter((k) => amenitiesRaw[k] === true),
      courtsCount,
      courtTypes: (Array.isArray(data.courtTypes) ? data.courtTypes : []).filter(
        (t: unknown): t is string => typeof t === 'string' && t.trim().length > 0,
      ),
      lat,
      lng,
    };
  } catch {
    return null;
  }
}

// ── Horários ─────────────────────────────────────────────

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface DaySchedule {
  closed: boolean;
  open: string;
  close: string;
}

export type WeekSchedule = Record<Weekday, DaySchedule>;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Mesma tolerância do parser do painel: `start|from|open` / `end|to|close`,
 *  objeto único ou array (só a 1ª faixa), `'closed'`/`false`/array vazio = fechado. */
function parseDay(value: unknown): DaySchedule {
  if (value === false || value === 'closed') return { closed: true, open: '', close: '' };
  const range = Array.isArray(value) ? value[0] : value;
  if (!range || typeof range !== 'object') return { closed: true, open: '', close: '' };
  const r = range as DocumentData;
  if (r.closed === true) return { closed: true, open: '', close: '' };
  const open = str(r.start) || str(r.from) || str(r.open);
  const close = str(r.end) || str(r.to) || str(r.close);
  if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close)) {
    return { closed: true, open: '', close: '' };
  }
  return { closed: false, open, close };
}

/** Horário semanal da arena — a agenda é aplicada em lote a todas as quadras,
 *  então a primeira quadra representa a arena. `null` sem quadra ou tudo fechado. */
export async function getArenaWeekSchedule(arenaId: string): Promise<WeekSchedule | null> {
  try {
    const snap = await getDocs(query(collection(db, 'arenas', arenaId, 'courts'), limit(1)));
    const court = snap.docs[0]?.data();
    const raw = court?.availabilitySchedule;
    if (!raw || typeof raw !== 'object') return null;

    const week = Object.fromEntries(
      WEEKDAYS.map((day) => [day, parseDay((raw as DocumentData)[day])]),
    ) as WeekSchedule;

    return WEEKDAYS.some((day) => !week[day].closed) ? week : null;
  } catch {
    return null;
  }
}

// ── Torneios sediados na arena ───────────────────────────

export interface ArenaSiteTournament {
  id: string;
  name: string;
  sport: string;
  dateLabel: string;
  startAt: Date | null;
  listingStatus: string;
}

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

/** Próximos torneios com a arena como sede. Sem `orderBy` na query (evita exigir
 *  índice composto novo) — ordena em memória, igual ao painel arena. */
export async function getArenaUpcomingTournaments(arenaId: string, max = 4): Promise<ArenaSiteTournament[]> {
  try {
    const snap = await getDocs(query(collection(db, 'tournaments'), where('arenaId', '==', arenaId), limit(40)));
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: str(data.name),
          sport: str(data.sport),
          dateLabel: str(data.dateLabel),
          startAt: toDate(data.startAt) ?? toDate(data.firstMatchAt),
          listingStatus: str(data.listingStatus),
          visibility: str(data.visibility),
          endAt: toDate(data.endAt),
        };
      })
      .filter((t) => t.name && t.visibility === 'publicListing')
      .filter((t) => t.listingStatus === 'open' || t.listingStatus === 'closed')
      .filter((t) => {
        const reference = t.endAt ?? t.startAt;
        return reference ? reference.getTime() >= cutoff : false;
      })
      .sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0))
      .slice(0, max)
      .map(({ id, name, sport, dateLabel, startAt, listingStatus }) => ({
        id, name, sport, dateLabel, startAt, listingStatus,
      }));
  } catch {
    return [];
  }
}

// ── Avaliações ───────────────────────────────────────────

export interface ArenaSiteReviews {
  ratingAverage: number;
  reviewsCount: number;
  comments: { rating: number; comment: string }[];
}

/** Agregados de `arena_reputation/{id}` + até 3 comentários mais curtidos.
 *  `null` quando ainda não há avaliação. */
export async function getArenaReviews(arenaId: string): Promise<ArenaSiteReviews | null> {
  try {
    const [repSnap, reviewsSnap] = await Promise.all([
      getDoc(doc(db, 'arena_reputation', arenaId)),
      getDocs(query(collection(db, 'arena_reviews'), where('arenaId', '==', arenaId), limit(30))),
    ]);

    const rep = repSnap.exists() ? repSnap.data() : null;
    const ratingAverage = typeof rep?.ratingAverage === 'number' ? rep.ratingAverage : 0;
    const reviewsCount = typeof rep?.reviewsCount === 'number' ? rep.reviewsCount : 0;
    if (reviewsCount === 0) return null;

    const comments = reviewsSnap.docs
      .map((d) => d.data())
      .filter((r) => typeof r.comment === 'string' && r.comment.trim() && r.reported !== true)
      .map((r) => ({
        rating: typeof r.rating === 'number' ? r.rating : 0,
        comment: (r.comment as string).trim().slice(0, 280),
        likes: typeof r.likesCount === 'number' ? r.likesCount : 0,
        at: toDate(r.createdAt)?.getTime() ?? 0,
      }))
      .sort((a, b) => b.likes - a.likes || b.at - a.at)
      .slice(0, 3)
      .map(({ rating, comment }) => ({ rating, comment }));

    return { ratingAverage, reviewsCount, comments };
  } catch {
    return null;
  }
}

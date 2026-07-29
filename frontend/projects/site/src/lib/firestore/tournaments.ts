import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  TournamentCategory,
  TournamentDetail,
  TournamentListingStatus,
  TournamentSummary,
} from './types';

function toDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function toListingStatus(value: unknown): TournamentListingStatus {
  const v = String(value ?? '');
  if (v === 'live' || v === 'almost_full' || v === 'ended') return v;
  return 'open';
}

function isPublic(data: DocumentData): boolean {
  return data.visibility === 'publicListing';
}

function mapSummary(id: string, d: DocumentData): TournamentSummary {
  const categories = Array.isArray(d.categories) ? d.categories : [];
  return {
    id,
    name: String(d.name ?? 'Torneio'),
    sport: String(d.sport ?? ''),
    city: d.city ?? null,
    state: d.state ?? null,
    locationName: d.locationName ?? null,
    dateLabel: d.dateLabel ?? null,
    startAt: toDate(d.startAt),
    endAt: toDate(d.endAt),
    listingStatus: toListingStatus(d.listingStatus),
    featured: Boolean(d.featured),
    enrolledCount: Number(d.enrolledCount ?? 0),
    capacity: typeof d.capacity === 'number' ? d.capacity : null,
    liveMatchesNow: Number(d.liveMatchesNow ?? 0),
    categoriesCount: categories.length,
    leagueId: d.leagueId ?? null,
    leagueStageName: d.leagueStageName ?? null,
    coverUrl: d.coverUrl ?? d.imageUrl ?? null,
  };
}

function mapCategory(c: DocumentData): TournamentCategory {
  return {
    categoryName: typeof c.categoryName === 'string' ? c.categoryName : c.name,
    genderType: c.genderType,
    level: c.level,
    entryFeeCents: typeof c.entryFeeCents === 'number' ? c.entryFeeCents : undefined,
    spotsTotal: typeof c.spotsTotal === 'number' ? c.spotsTotal : undefined,
    bracketFormat: c.bracketFormat,
  };
}

/** Lista torneios públicos, ordenados por data de início (mais recentes primeiro). */
export async function getPublicTournaments(max = 48): Promise<TournamentSummary[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'tournaments'), orderBy('startAt', 'desc'), limit(max * 2)),
    );
    return snap.docs
      .filter((doc) => isPublic(doc.data()))
      .slice(0, max)
      .map((doc) => mapSummary(doc.id, doc.data()));
  } catch (err) {
    console.error('[tournaments] getPublicTournaments failed:', err);
    return [];
  }
}

export async function getTournamentById(id: string): Promise<TournamentDetail | null> {
  try {
    const snap = await getDoc(doc(db, 'tournaments', id));
    if (!snap.exists()) return null;
    const d = snap.data();
    if (!isPublic(d)) return null;
    const categories = Array.isArray(d.categories) ? d.categories.map(mapCategory) : [];
    return {
      ...mapSummary(snap.id, d),
      description: d.description ?? null,
      location: d.location ?? null,
      locationAddress: d.locationAddress ?? null,
      registrationOpensAt: toDate(d.registrationOpensAt),
      registrationClosesAt: toDate(d.registrationClosesAt),
      defaultEntryFeeCents: typeof d.defaultEntryFeeCents === 'number' ? d.defaultEntryFeeCents : null,
      cashPrizesEnabled: Boolean(d.cashPrizesEnabled),
      categories,
    };
  } catch (err) {
    console.error('[tournaments] getTournamentById failed:', err);
    return null;
  }
}

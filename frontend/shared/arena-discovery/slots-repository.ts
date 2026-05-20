import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type Firestore,
  type QuerySnapshot,
} from 'firebase/firestore';

import { arenaPromotionFromFirestore, type ArenaPromotion } from './arena-promotion';
import {
  arenaSlotFromFirestore,
  sameCalendarDay,
  type ArenaSlot,
} from './arena-slot';
import { readArenaFallbackPricePerHour, type SlotsQuery } from './slots-query';
import { buildVirtualSlots, mergeSlots } from './virtual-slot-generator';
import { fetchCourts, type ArenaCourtDoc } from './arenas-repository';

function courtMatches(docCourtId: string, queryCourtId: string): boolean {
  return docCourtId.trim().toLowerCase() === queryCourtId.trim().toLowerCase();
}

function extractPersisted(
  snap: QuerySnapshot,
  q: SlotsQuery,
  day: Date,
): ArenaSlot[] {
  const list: ArenaSlot[] = [];
  for (const docSnap of snap.docs) {
    const slot = arenaSlotFromFirestore(docSnap);
    if (!slot) {
      continue;
    }
    if (!sameCalendarDay(slot.date, day)) {
      continue;
    }
    if (!courtMatches(slot.courtId, q.courtId)) {
      continue;
    }
    list.push(slot);
  }
  list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return list;
}

async function fetchActivePromotions(db: Firestore, arenaId: string): Promise<ArenaPromotion[]> {
  const snap = await getDocs(
    query(collection(db, 'arenas', arenaId, 'promotions'), where('active', '==', true)),
  );
  return snap.docs.map((d) => arenaPromotionFromFirestore(d));
}

async function fetchArenaSlotsByArenaId(db: Firestore, arenaId: string) {
  return getDocs(query(collection(db, 'arenaSlots'), where('arenaId', '==', arenaId)));
}

/** Slots de um dia para uma quadra (persistidos ∪ virtuais). */
export async function fetchCourtDaySlots(db: Firestore, q: SlotsQuery): Promise<ArenaSlot[]> {
  const day = new Date(q.date.getFullYear(), q.date.getMonth(), q.date.getDate());

  const [slotSnap, courtSnap, arenaSnap, promotions] = await Promise.all([
    fetchArenaSlotsByArenaId(db, q.arenaId),
    getDoc(doc(db, 'arenas', q.arenaId, 'courts', q.courtId)),
    getDoc(doc(db, 'arenas', q.arenaId)),
    fetchActivePromotions(db, q.arenaId),
  ]);

  const arenaData = arenaSnap.exists() ? (arenaSnap.data() as Record<string, unknown>) : null;
  const arenaFallback =
    readArenaFallbackPricePerHour(arenaData) ?? q.arenaFallbackPricePerHourReais ?? null;
  const effectiveQuery: SlotsQuery = { ...q, arenaFallbackPricePerHourReais: arenaFallback };

  const persisted = extractPersisted(slotSnap, effectiveQuery, day);
  const courtData = courtSnap.exists() ? (courtSnap.data() as Record<string, unknown>) : null;
  const virtual = buildVirtualSlots({
    query: effectiveQuery,
    courtData,
    date: day,
    promotions,
  });
  return mergeSlots(persisted, virtual);
}

/** Todos os slots do dia da arena (todas as quadras). */
export async function fetchArenaDaySlotsMerged(
  db: Firestore,
  arenaId: string,
  date: Date,
): Promise<ArenaSlot[]> {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const courts = await fetchCourts(db, arenaId);
  if (courts.length === 0) {
    return [];
  }

  const [slotSnap, arenaSnap, promotions] = await Promise.all([
    fetchArenaSlotsByArenaId(db, arenaId),
    getDoc(doc(db, 'arenas', arenaId)),
    fetchActivePromotions(db, arenaId),
  ]);

  const arenaFallback = readArenaFallbackPricePerHour(
    arenaSnap.exists() ? (arenaSnap.data() as Record<string, unknown>) : null,
  );

  const merged: ArenaSlot[] = [];
  for (const court of courts) {
    const q: SlotsQuery = {
      arenaId,
      courtId: court.id,
      date: day,
      arenaFallbackPricePerHourReais: arenaFallback,
    };
    const persisted = extractPersisted(slotSnap, q, day);
    const virtual = buildVirtualSlots({
      query: q,
      courtData: court.data,
      date: day,
      promotions,
    });
    merged.push(...mergeSlots(persisted, virtual));
  }

  merged.sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId),
  );
  return merged;
}

export type { ArenaCourtDoc };

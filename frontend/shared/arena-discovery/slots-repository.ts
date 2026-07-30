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
import { readArenaFallbackPricePerHour, slotsQueryDateKey, type SlotsQuery } from './slots-query';
import { buildVirtualSlots, mergeSlots } from './virtual-slot-generator';
import { fetchCourts, type ArenaCourtDoc } from './arenas-repository';

function normalizedCourtId(courtId: string): string {
  return courtId.trim().toLowerCase();
}

function courtMatches(docCourtId: string, queryCourtId: string): boolean {
  return normalizedCourtId(docCourtId) === normalizedCourtId(queryCourtId);
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

function persistedIndexKey(dateKey: string, courtId: string): string {
  return `${dateKey}|${normalizedCourtId(courtId)}`;
}

/** Indexa os slots persistidos da arena por dia e quadra, em uma passada só.
 *  Evita varrer o snapshot inteiro uma vez por dia da faixa. */
export function groupPersistedSlotsByDayAndCourt(snap: QuerySnapshot): Map<string, ArenaSlot[]> {
  const index = new Map<string, ArenaSlot[]>();
  for (const docSnap of snap.docs) {
    const slot = arenaSlotFromFirestore(docSnap);
    if (!slot) {
      continue;
    }
    const key = persistedIndexKey(slotsQueryDateKey(slot.date), slot.courtId);
    const list = index.get(key);
    if (list) {
      list.push(slot);
    } else {
      index.set(key, [slot]);
    }
  }
  for (const list of index.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return index;
}

/** Slots (persistidos ∪ virtuais) de todas as quadras da arena, para uma faixa de dias.
 *
 *  Lê Firestore uma vez só para a faixa inteira: `arenaSlots` já vem sem filtro de data,
 *  então cobrir 36 dias custa as mesmas 4 idas que cobrir 1. O resto é cálculo local.
 *
 *  `days` é a quantidade de dias a partir de `startDate` (inclusive). O mapa retornado
 *  sempre tem uma chave por dia da faixa, com `[]` quando não há slot. */
export async function fetchArenaRangeSlotsMerged(
  db: Firestore,
  arenaId: string,
  startDate: Date,
  days: number,
): Promise<Record<string, ArenaSlot[]>> {
  const first = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const total = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 1;

  const rangeDays: Date[] = [];
  for (let i = 0; i < total; i++) {
    const day = new Date(first);
    day.setDate(day.getDate() + i);
    rangeDays.push(day);
  }

  const result: Record<string, ArenaSlot[]> = {};

  const courts = await fetchCourts(db, arenaId);
  if (courts.length === 0) {
    for (const day of rangeDays) {
      result[slotsQueryDateKey(day)] = [];
    }
    return result;
  }

  const [slotSnap, arenaSnap, promotions] = await Promise.all([
    fetchArenaSlotsByArenaId(db, arenaId),
    getDoc(doc(db, 'arenas', arenaId)),
    fetchActivePromotions(db, arenaId),
  ]);

  const arenaFallback = readArenaFallbackPricePerHour(
    arenaSnap.exists() ? (arenaSnap.data() as Record<string, unknown>) : null,
  );
  const persistedIndex = groupPersistedSlotsByDayAndCourt(slotSnap);

  for (const day of rangeDays) {
    const dateKey = slotsQueryDateKey(day);
    const merged: ArenaSlot[] = [];

    for (const court of courts) {
      const q: SlotsQuery = {
        arenaId,
        courtId: court.id,
        date: day,
        arenaFallbackPricePerHourReais: arenaFallback,
      };
      const persisted = persistedIndex.get(persistedIndexKey(dateKey, court.id)) ?? [];
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
    result[dateKey] = merged;
  }

  return result;
}

/** Slots de um dia para todas as quadras da arena (persistidos ∪ virtuais). */
export async function fetchArenaDaySlotsMerged(
  db: Firestore,
  arenaId: string,
  date: Date,
): Promise<ArenaSlot[]> {
  const range = await fetchArenaRangeSlotsMerged(db, arenaId, date, 1);
  return range[slotsQueryDateKey(date)] ?? [];
}

export type { ArenaCourtDoc };

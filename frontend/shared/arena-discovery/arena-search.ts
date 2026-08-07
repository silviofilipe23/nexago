import type { Firestore } from 'firebase/firestore';

import type { ArenaListItem } from './arena-list-item';
import { fetchArenasIncludingUnclaimed, fetchCourts } from './arenas-repository';
import { minHourlyPriceAmongCourtDocs } from './court-pricing';
import { fetchCourtDaySlots } from './slots-repository';
import { arenaSlotIsAvailable, timeToMinutes, type ArenaSlot } from './arena-slot';

export interface ArenaSearchFilters {
  /** Apenas calendário (hora vem em `requestedTime`). */
  date: Date;
  /** `HH:mm` */
  requestedTime: string;
}

export interface ArenaSearchResult {
  arena: ArenaListItem;
  selectedSlot: ArenaSlot | null;
  courtName: string | null;
  isExactMatch: boolean;
  minutesDistance: number | null;
  displayPricePerHourReais: number;
  showStartingFrom: boolean;
  hasAvailability: boolean;
  courtCount: number;
}

export function requestedMinutesFromTime(requestedTime: string): number {
  return timeToMinutes(requestedTime);
}

export function isPastSlot(selectedDate: Date, startTime: string, now = new Date()): boolean {
  const day = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (day > today) {
    return false;
  }
  if (day < today) {
    return true;
  }
  const minutes = timeToMinutes(startTime);
  const startAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
  return startAt < now;
}

function preferSignedDelta(candidate: number, current: number | null): boolean {
  if (current == null) {
    return true;
  }
  if (candidate >= 0 && current < 0) {
    return true;
  }
  return false;
}

/** Pré-cadastrada nunca disputa lugar com parceira: não dá para reservar nela. */
function searchRank(r: ArenaSearchResult): number {
  if (r.arena.isUnclaimed) {
    return 3;
  }
  return r.isExactMatch ? 0 : r.hasAvailability ? 1 : 2;
}

export function compareSearchResults(a: ArenaSearchResult, b: ArenaSearchResult): number {
  const aRank = searchRank(a);
  const bRank = searchRank(b);
  if (aRank !== bRank) {
    return aRank - bRank;
  }
  const aDist = a.minutesDistance ?? 99999;
  const bDist = b.minutesDistance ?? 99999;
  if (aDist !== bDist) {
    return aDist - bDist;
  }
  return a.arena.name.localeCompare(b.arena.name, 'pt-BR', { sensitivity: 'base' });
}

async function buildArenaSearchResult(
  db: Firestore,
  filters: ArenaSearchFilters,
  arena: ArenaListItem,
): Promise<ArenaSearchResult> {
  const dateOnly = new Date(filters.date.getFullYear(), filters.date.getMonth(), filters.date.getDate());

  // Pré-cadastrada não tem quadra nem slot: buscar seria uma leitura por arena
  // à toa em cada busca. Sai como resultado sem disponibilidade e sem preço.
  if (arena.isUnclaimed) {
    return emptyResult(arena, 0, false, 0);
  }

  const courts = await fetchCourts(db, arena.id);
  const minCourtPrice = minHourlyPriceAmongCourtDocs(courts);
  const displayPrice = minCourtPrice ?? arena.pricePerHourReais;
  const showStartingFrom = minCourtPrice != null;

  if (courts.length === 0) {
    return emptyResult(arena, displayPrice, showStartingFrom, 0);
  }

  const allSlots: { slot: ArenaSlot; courtName: string }[] = [];
  for (const court of courts) {
    const slots = await fetchCourtDaySlots(db, {
      arenaId: arena.id,
      courtId: court.id,
      date: dateOnly,
      arenaFallbackPricePerHourReais: arena.pricePerHourReais,
    });
    for (const slot of slots) {
      if (!arenaSlotIsAvailable(slot)) {
        continue;
      }
      if (isPastSlot(dateOnly, slot.startTime)) {
        continue;
      }
      allSlots.push({ slot, courtName: court.name });
    }
  }

  if (allSlots.length === 0) {
    return emptyResult(arena, displayPrice, showStartingFrom, courts.length);
  }

  const requested = requestedMinutesFromTime(filters.requestedTime);
  let exact: { slot: ArenaSlot; courtName: string } | null = null;
  let nearest: { slot: ArenaSlot; courtName: string } | null = null;
  let nearestDistance: number | null = null;
  let nearestSignedDelta: number | null = null;

  for (const entry of allSlots) {
    const startMinutes = timeToMinutes(entry.slot.startTime);
    if (startMinutes === requested) {
      exact = entry;
      break;
    }
    const signedDelta = startMinutes - requested;
    const distance = Math.abs(signedDelta);
    const replace =
      nearestDistance == null ||
      distance < nearestDistance ||
      (distance === nearestDistance && preferSignedDelta(signedDelta, nearestSignedDelta));
    if (replace) {
      nearest = entry;
      nearestDistance = distance;
      nearestSignedDelta = signedDelta;
    }
  }

  const picked = exact ?? nearest;
  return {
    arena,
    selectedSlot: picked?.slot ?? null,
    courtName: picked?.courtName ?? null,
    isExactMatch: exact != null,
    minutesDistance: exact != null ? 0 : nearestDistance,
    displayPricePerHourReais: displayPrice,
    showStartingFrom,
    hasAvailability: picked != null,
    courtCount: courts.length,
  };
}

function emptyResult(
  arena: ArenaListItem,
  displayPrice: number,
  showStartingFrom: boolean,
  courtCount: number,
): ArenaSearchResult {
  return {
    arena,
    selectedSlot: null,
    courtName: null,
    isExactMatch: false,
    minutesDistance: null,
    displayPricePerHourReais: displayPrice,
    showStartingFrom,
    hasAvailability: false,
    courtCount,
  };
}

/** Busca de arenas com slot sugerido para data/hora — paridade com `arenaSearchResultsProvider` (Flutter). */
export async function searchArenas(
  db: Firestore,
  filters: ArenaSearchFilters,
): Promise<ArenaSearchResult[]> {
  const arenas = await fetchArenasIncludingUnclaimed(db);
  const results = await Promise.all(
    arenas.map((arena) => buildArenaSearchResult(db, filters, arena)),
  );
  results.sort(compareSearchResults);
  return results;
}

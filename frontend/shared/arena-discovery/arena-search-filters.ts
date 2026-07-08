import { ARENA_AMENITIES_EMPTY, amenitiesMatchesRequirements, type ArenaAmenities } from './arena-amenities';
import type { ArenaListItem } from './arena-list-item';
import type { ArenaSearchResult } from './arena-search';
import { compareSearchResults } from './arena-search';
import { kmFromUserToArena, type UserCoords } from './geo-distance';
import { arenaMatchesSportChip, type ArenaSportChip } from './sport-chip';

export type ArenaPriceBand = 'any' | 'upTo60' | 'band60_100' | 'band100_150' | 'plus150';
export type ArenaPaymentFilter = 'pix' | 'onsite' | 'card';
export type ArenaSearchSortBy = 'distance' | 'price' | 'rating' | 'score';

export const ARENA_PRICE_BAND_OPTIONS: readonly { band: ArenaPriceBand; label: string }[] = [
  { band: 'upTo60', label: 'até R$ 60' },
  { band: 'band60_100', label: 'R$ 60-100' },
  { band: 'band100_150', label: 'R$ 100-150' },
  { band: 'plus150', label: '150+' },
];

export const ARENA_PAYMENT_FILTER_OPTIONS: readonly { method: ArenaPaymentFilter; label: string }[] = [
  { method: 'onsite', label: 'Pagar na arena' },
  { method: 'pix', label: 'PIX' },
  { method: 'card', label: 'Cartão' },
];

export const ARENA_SORT_BY_OPTIONS: readonly { sortBy: ArenaSearchSortBy; label: string }[] = [
  { sortBy: 'distance', label: 'Distância' },
  { sortBy: 'price', label: 'Menor preço' },
  { sortBy: 'rating', label: 'Melhor avaliação' },
  { sortBy: 'score', label: 'Score nexaGO' },
];

export const DEFAULT_RADIUS_KM = 30;
export const MAX_RADIUS_KM = 30;
/** Acima disso, o filtro de distância não é aplicado. */
export const UNLIMITED_RADIUS_KM = 9999;

export interface ArenaSearchQueryFilters {
  query: string;
  sportChip: ArenaSportChip;
  radiusKm: number;
  priceBand: ArenaPriceBand;
  surfaces: Set<string>;
  amenities: ArenaAmenities;
  paymentMethods: Set<ArenaPaymentFilter>;
  minReputationScore: number;
  sortBy: ArenaSearchSortBy;
  showOnlyFavorites: boolean;
}

export function defaultArenaSearchQueryFilters(sportChip: ArenaSportChip = 'beachVolleyball'): ArenaSearchQueryFilters {
  return {
    query: '',
    sportChip,
    radiusKm: DEFAULT_RADIUS_KM,
    priceBand: 'any',
    surfaces: new Set(),
    amenities: ARENA_AMENITIES_EMPTY,
    paymentMethods: new Set(),
    minReputationScore: 0,
    sortBy: 'distance',
    showOnlyFavorites: false,
  };
}

export function usesRadiusLimit(filters: ArenaSearchQueryFilters): boolean {
  return filters.radiusKm <= MAX_RADIUS_KM;
}

export interface FilteredArenaSearchResult {
  result: ArenaSearchResult;
  kmDistance: number | null;
}

export function arenaMatchesQuery(arena: ArenaListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const haystack = [arena.name, arena.locationLabel, arena.city ?? '', arena.state ?? '']
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function arenaMatchesSurface(arena: ArenaListItem, surfaces: ReadonlySet<string>): boolean {
  if (surfaces.size === 0) {
    return true;
  }
  const labels = arena.surfaces.length > 0 ? arena.surfaces : arena.courtTypes;
  const types = labels.map((t) => t.toLowerCase());
  for (const surface of surfaces) {
    const key = surface.toLowerCase();
    const match = types.some((t) => {
      if (key === 'areia') return t.includes('areia') || t.includes('praia') || t.includes('sand');
      if (key === 'sintética' || key === 'sintetica') {
        return t.includes('sintét') || t.includes('sintet') || t.includes('synthetic');
      }
      if (key === 'saibro') return t.includes('saibro') || t.includes('clay');
      if (key === 'grama') return t.includes('grama') || t.includes('grass') || t.includes('natural');
      if (key === 'concreto') return t.includes('concreto') || t.includes('cimento') || t.includes('hard');
      return t.includes(key);
    });
    if (match) {
      return true;
    }
  }
  return false;
}

export function arenaMatchesPriceBand(price: number, band: ArenaPriceBand): boolean {
  switch (band) {
    case 'any':
      return true;
    case 'upTo60':
      return price <= 60;
    case 'band60_100':
      return price > 60 && price <= 100;
    case 'band100_150':
      return price > 100 && price <= 150;
    case 'plus150':
      return price > 150;
  }
}

function arenaMatchesPayment(arena: ArenaListItem, payment: ArenaPaymentFilter): boolean {
  switch (payment) {
    case 'pix':
      return arena.onlinePaymentEnabled;
    case 'onsite':
      return arena.onsitePaymentEnabled;
    case 'card':
      return arena.onlinePaymentEnabled;
  }
}

export function arenaMatchesPaymentMethods(
  arena: ArenaListItem,
  methods: ReadonlySet<ArenaPaymentFilter>,
): boolean {
  if (methods.size === 0) {
    return true;
  }
  for (const method of methods) {
    if (arenaMatchesPayment(arena, method)) {
      return true;
    }
  }
  return false;
}

export function filterAndSortArenaResults(params: {
  results: readonly ArenaSearchResult[];
  filters: ArenaSearchQueryFilters;
  userCoords: UserCoords | null;
  favoriteIds: ReadonlySet<string>;
}): FilteredArenaSearchResult[] {
  const { results, filters, userCoords, favoriteIds } = params;
  const filtered: FilteredArenaSearchResult[] = [];

  for (const result of results) {
    const arena = result.arena;
    if (filters.showOnlyFavorites && !favoriteIds.has(arena.id)) {
      continue;
    }
    if (!arenaMatchesQuery(arena, filters.query)) continue;
    if (!arenaMatchesSportChip(arena, filters.sportChip)) continue;
    if (!arenaMatchesSurface(arena, filters.surfaces)) continue;
    if (!arenaMatchesPriceBand(result.displayPricePerHourReais, filters.priceBand)) continue;
    if (!amenitiesMatchesRequirements(arena.amenities, filters.amenities)) continue;
    if (!arenaMatchesPaymentMethods(arena, filters.paymentMethods)) continue;
    if (arena.reputationScore < filters.minReputationScore) continue;

    const km = kmFromUserToArena(arena, userCoords);
    if (usesRadiusLimit(filters) && km != null && km > filters.radiusKm) {
      continue;
    }

    filtered.push({ result, kmDistance: km });
  }

  filtered.sort((a, b) => compareFiltered(a, b, filters.sortBy));
  return filtered;
}

function compareFiltered(
  a: FilteredArenaSearchResult,
  b: FilteredArenaSearchResult,
  sortBy: ArenaSearchSortBy,
): number {
  switch (sortBy) {
    case 'distance':
      return compareNullableNumber(a.kmDistance, b.kmDistance, () => compareSearchResults(a.result, b.result));
    case 'price':
      return a.result.displayPricePerHourReais - b.result.displayPricePerHourReais;
    case 'rating':
      return b.result.arena.ratingAverage - a.result.arena.ratingAverage;
    case 'score':
      return b.result.arena.reputationScore - a.result.arena.reputationScore;
  }
}

function compareNullableNumber(a: number | null, b: number | null, fallback: () => number): number {
  if (a == null && b == null) return fallback();
  if (a == null) return 1;
  if (b == null) return -1;
  const c = a - b;
  return c !== 0 ? c : fallback();
}

/** Conta filtros avançados ativos (fora do padrão) — usado no badge do botão "Mais filtros". */
export function countActiveSearchFilters(
  filters: ArenaSearchQueryFilters,
  defaultSportChip: ArenaSportChip,
): number {
  let n = 0;
  if (usesRadiusLimit(filters) && filters.radiusKm !== DEFAULT_RADIUS_KM) n++;
  if (filters.priceBand !== 'any') n++;
  if (filters.surfaces.size > 0) n++;
  if (Object.values(filters.amenities).some(Boolean)) n++;
  if (filters.paymentMethods.size > 0) n++;
  if (filters.minReputationScore > 0) n++;
  if (filters.sportChip !== 'all' && filters.sportChip !== defaultSportChip) n++;
  return n;
}

/** Arenas com o menor `displayPricePerHourReais` entre as que têm disponibilidade (empates incluídos). */
export function bestPriceArenaIds(results: readonly ArenaSearchResult[]): Set<string> {
  const withSlot = results.filter((r) => r.hasAvailability);
  if (withSlot.length === 0) {
    return new Set();
  }
  let minPrice = withSlot[0]!.displayPricePerHourReais;
  for (const r of withSlot) {
    if (r.displayPricePerHourReais < minPrice) {
      minPrice = r.displayPricePerHourReais;
    }
  }
  return new Set(
    withSlot.filter((r) => r.displayPricePerHourReais === minPrice).map((r) => r.arena.id),
  );
}

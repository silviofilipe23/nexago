export type { ArenaListItem } from './arena-list-item';
export { arenaListItemFromFirestore, arenaListItemImageUrl } from './arena-list-item';

export type { ArenaAmenities } from './arena-amenities';
export {
  ARENA_AMENITIES_EMPTY,
  amenitiesFromFirestore,
  amenitiesHasAny,
  amenitiesMatchesRequirements,
} from './arena-amenities';

export type { ArenaSlot } from './arena-slot';
export {
  arenaSlotFromFirestore,
  arenaSlotIsAvailable,
  arenaSlotIsBooked,
  arenaSlotIsBlocked,
  sameCalendarDay,
  timeToMinutes,
} from './arena-slot';

export type { SlotsQuery } from './slots-query';
export { slotsQueryDateKey, readArenaFallbackPricePerHour } from './slots-query';

export { fetchAllArenas, fetchArenaById, fetchCourts, type ArenaCourtDoc } from './arenas-repository';
export {
  fetchCourtDaySlots,
  fetchArenaDaySlotsMerged,
  fetchArenaRangeSlotsMerged,
  groupPersistedSlotsByDayAndCourt,
} from './slots-repository';
export {
  searchArenas,
  type ArenaSearchFilters,
  type ArenaSearchResult,
  compareSearchResults,
  isPastSlot,
} from './arena-search';

export type { ArenaSportChip } from './sport-chip';
export {
  ARENA_SPORT_CHIP_OPTIONS,
  arenaHasIndexedSportMetadata,
  arenaMatchesSportChip,
  defaultSportChipFromProfile,
  sportFirestoreIdFromChip,
} from './sport-chip';

export type {
  ArenaPaymentFilter,
  ArenaPriceBand,
  ArenaSearchQueryFilters,
  ArenaSearchSortBy,
  FilteredArenaSearchResult,
} from './arena-search-filters';
export {
  ARENA_PAYMENT_FILTER_OPTIONS,
  ARENA_PRICE_BAND_OPTIONS,
  ARENA_SORT_BY_OPTIONS,
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  UNLIMITED_RADIUS_KM,
  arenaMatchesPaymentMethods,
  arenaMatchesPriceBand,
  arenaMatchesQuery,
  arenaMatchesSurface,
  bestPriceArenaIds,
  countActiveSearchFilters,
  defaultArenaSearchQueryFilters,
  filterAndSortArenaResults,
  usesRadiusLimit,
} from './arena-search-filters';

export type { UserCoords } from './geo-distance';
export { haversineDistanceKm, kmFromUserToArena } from './geo-distance';

export { toggleFavoriteArena, watchFavoriteArenaIds } from './favorites-repository';

export type { ArenaPromotion } from './arena-promotion';
export { arenaPromotionFromFirestore, promotionMatches, promotionApplyToSlot } from './arena-promotion';

export type { ArenaPeakRule, PeakSelectionCheck } from './arena-peak-rule';
export {
  arenaPeakRuleFromFirestore,
  fetchActivePeakRules,
  minimumChainContaining,
  peakBadgeMinSlots,
  peakCheckForSelection,
  peakRuleMatches,
} from './arena-peak-rule';

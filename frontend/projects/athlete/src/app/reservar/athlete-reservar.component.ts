import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import {
  ARENA_PAYMENT_FILTER_OPTIONS,
  ARENA_PRICE_BAND_OPTIONS,
  ARENA_SORT_BY_OPTIONS,
  ARENA_SPORT_CHIP_OPTIONS,
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  UNLIMITED_RADIUS_KM,
  arenaListItemImageUrl,
  bestPriceArenaIds,
  countActiveSearchFilters,
  defaultArenaSearchQueryFilters,
  defaultSportChipFromProfile,
  filterAndSortArenaResults,
  sameCalendarDay,
  searchArenas,
  toggleFavoriteArena,
  watchFavoriteArenaIds,
  type ArenaAmenities,
  type ArenaListItem,
  type ArenaPaymentFilter,
  type ArenaPriceBand,
  type ArenaSearchQueryFilters,
  type ArenaSearchResult,
  type ArenaSearchSortBy,
  type ArenaSportChip,
  type UserCoords,
} from '@nexago/arena-discovery';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';

const WEEKDAY_ABBR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
const MONTH_ABBR = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
] as const;
const SURFACE_OPTIONS = ['Areia', 'Saibro', 'Sintética', 'Grama', 'Concreto'] as const;
const AMENITY_OPTIONS: readonly { key: keyof ArenaAmenities; label: string }[] = [
  { key: 'coveredCourt', label: 'Coberta' },
  { key: 'parking', label: 'Estacion.' },
  { key: 'lockerRoom', label: 'Vestiário' },
  { key: 'bar', label: 'Bar' },
  { key: 'racketRental', label: 'Aluguel raquetes' },
];

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function defaultTimeHHmm(now = new Date()): string {
  const minute = now.getMinutes() >= 30 ? 30 : 0;
  return `${String(now.getHours()).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateChipLabel(d: Date): string {
  return `${WEEKDAY_ABBR[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${MONTH_ABBR[d.getMonth()]}`;
}

function formatPriceWhole(reais: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(reais);
}

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  return local ? titleCase(local) : 'Atleta';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'AT';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

function courtCountLabel(count: number): string {
  return count <= 1 ? '1 QUADRA' : `${count} QUADRAS`;
}

function distanceLabel(km: number | null): string {
  return km == null ? '—' : `${km.toFixed(1)} km`;
}

function ratingLabel(ratingAverage: number): string {
  return ratingAverage > 0 ? ratingAverage.toFixed(1) : '—';
}

function reviewsLabel(reviewsCount: number): string {
  return reviewsCount === 0 ? '(sem av.)' : `(${reviewsCount} av.)`;
}

function courtLineLabel(result: ArenaSearchResult): string {
  if (!result.courtName) {
    return 'Sem horário no dia';
  }
  const suffix = result.minutesDistance != null && result.minutesDistance > 0 ? ` · em ${result.minutesDistance} min` : '';
  return `${result.courtName}${suffix}`;
}

function hashHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360;
  }
  return hash < 0 ? hash + 360 : hash;
}

function heroGradient(id: string): string {
  const hue = hashHue(id);
  return `linear-gradient(135deg, hsl(${hue} 62% 30%), hsl(${(hue + 42) % 360} 62% 15%))`;
}

@Component({
  selector: 'app-athlete-reservar',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './athlete-reservar.component.html',
  styleUrl: './athlete-reservar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteReservarComponent {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  private readonly route = inject(ActivatedRoute);

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) {
      return liveUser.displayName.trim();
    }
    if (liveUser?.email?.trim()) {
      return nameFromEmail(liveUser.email);
    }
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });
  protected readonly headerInitials = computed(() => initialsOf(this.accountLabel()));

  protected readonly searchDate = signal<Date>(dateOnly(new Date()));
  protected readonly searchTime = signal<string>(defaultTimeHHmm());
  protected readonly dateInputValue = computed(() => toDateInputValue(this.searchDate()));
  protected readonly dateChipLabel = computed(() => formatDateChipLabel(this.searchDate()));
  protected readonly isToday = computed(() => sameCalendarDay(this.searchDate(), new Date()));

  protected readonly searchResults = signal<ArenaSearchResult[]>([]);
  protected readonly loadingResults = signal(true);
  protected readonly searchError = signal<string | null>(null);

  protected readonly queryInput = signal('');
  protected readonly defaultSportChip = signal<ArenaSportChip>('beachVolleyball');
  protected readonly filters = signal<ArenaSearchQueryFilters>(defaultArenaSearchQueryFilters());
  protected readonly showMoreFilters = signal(false);

  protected readonly userCoords = signal<UserCoords | null>(null);

  protected readonly favoriteIds = signal<ReadonlySet<string>>(new Set());
  protected readonly pendingFavoriteId = signal<string | null>(null);
  protected readonly favoriteNotice = signal<string | null>(null);

  protected readonly confirmResult = signal<ArenaSearchResult | null>(null);

  protected readonly loadedImageIds = signal<ReadonlySet<string>>(new Set());
  protected readonly failedImageIds = signal<ReadonlySet<string>>(new Set());
  protected readonly failedLogoIds = signal<ReadonlySet<string>>(new Set());

  protected readonly sportChipOptions = ARENA_SPORT_CHIP_OPTIONS;
  protected readonly priceBandOptions = ARENA_PRICE_BAND_OPTIONS;
  protected readonly paymentOptions = ARENA_PAYMENT_FILTER_OPTIONS;
  protected readonly sortByOptions = ARENA_SORT_BY_OPTIONS;
  protected readonly surfaceOptions = SURFACE_OPTIONS;
  protected readonly amenityOptions = AMENITY_OPTIONS;
  protected readonly maxRadiusKm = MAX_RADIUS_KM;

  protected readonly filteredResults = computed(() =>
    filterAndSortArenaResults({
      results: this.searchResults(),
      filters: this.filters(),
      userCoords: this.userCoords(),
      favoriteIds: this.favoriteIds(),
    }),
  );
  protected readonly bestPriceIds = computed(() =>
    bestPriceArenaIds(this.filteredResults().map((f) => f.result)),
  );
  protected readonly activeFilterCount = computed(() =>
    countActiveSearchFilters(this.filters(), this.defaultSportChip()),
  );
  protected readonly availableCount = computed(
    () => this.filteredResults().filter((f) => f.result.hasAvailability).length,
  );
  protected readonly headerSubtitle = computed(() => {
    const n = this.availableCount();
    return `${n} arena${n === 1 ? '' : 's'} com horário livre perto de você`;
  });
  protected readonly rawCount = computed(() => this.searchResults().length);
  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.rawCount() - this.filteredResults().length),
  );
  protected readonly isRadiusUnlimited = computed(() => this.filters().radiusKm >= UNLIMITED_RADIUS_KM);

  private fetchGeneration = 0;
  private queryDebounceHandle: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const initialQuery = this.route.snapshot.queryParamMap.get('q')?.trim();
    if (initialQuery) {
      this.queryInput.set(initialQuery);
      this.filters.update((f) => ({ ...f, query: initialQuery }));
    }

    effect(() => {
      const date = this.searchDate();
      const time = this.searchTime();
      this.runSearch(date, time);
    });

    effect((onCleanup) => {
      const user = this.auth.user();
      const db = this.firestore;
      if (!user || !db) {
        this.favoriteIds.set(new Set());
        return;
      }
      const unsubscribe = watchFavoriteArenaIds(db, user.uid, (ids) => this.favoriteIds.set(new Set(ids)));
      onCleanup(() => unsubscribe());
    });

    effect(() => {
      const user = this.auth.user();
      if (!user || !this.firestore) {
        return;
      }
      getDoc(doc(this.firestore, 'athlete_profiles', user.uid))
        .then((snap) => {
          const data = snap.exists() ? snap.data() : null;
          const primarySport = typeof data?.['primarySport'] === 'string' ? data['primarySport'] : null;
          const chip = defaultSportChipFromProfile({ primarySport });
          this.defaultSportChip.set(chip);
          this.filters.update((f) => ({ ...f, sportChip: chip }));
        })
        .catch(() => {});
    });

    this.requestUserLocation();

    this.destroyRef.onDestroy(() => clearTimeout(this.queryDebounceHandle));
  }

  private runSearch(date: Date, time: string): void {
    const db = this.firestore;
    if (!db) {
      this.searchError.set('Firebase não configurado para buscar arenas.');
      this.loadingResults.set(false);
      return;
    }
    const generation = ++this.fetchGeneration;
    this.loadingResults.set(true);
    this.searchError.set(null);
    searchArenas(db, { date, requestedTime: time })
      .then((results) => {
        if (generation !== this.fetchGeneration) return;
        this.searchResults.set(results);
        this.loadingResults.set(false);
      })
      .catch(() => {
        if (generation !== this.fetchGeneration) return;
        this.searchError.set('Não foi possível carregar horários agora.');
        this.loadingResults.set(false);
      });
  }

  private requestUserLocation(): void {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => this.userCoords.set({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {},
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }

  protected retrySearch(): void {
    this.runSearch(this.searchDate(), this.searchTime());
  }

  protected onDateInput(value: string): void {
    if (!value) return;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return;
    this.searchDate.set(new Date(y, m - 1, d));
  }

  protected onTimeInput(value: string): void {
    if (!value) return;
    this.searchTime.set(value);
  }

  protected onQueryInput(value: string): void {
    this.queryInput.set(value);
    clearTimeout(this.queryDebounceHandle);
    this.queryDebounceHandle = setTimeout(() => {
      this.filters.update((f) => ({ ...f, query: value }));
    }, 300);
  }

  protected toggleMoreFilters(): void {
    this.showMoreFilters.update((v) => !v);
  }

  protected setSportChip(chip: ArenaSportChip): void {
    this.filters.update((f) => ({ ...f, sportChip: chip }));
  }

  protected setRadiusKm(km: number): void {
    this.filters.update((f) => ({ ...f, radiusKm: km }));
  }

  protected setUnlimitedRadius(unlimited: boolean): void {
    this.filters.update((f) => ({ ...f, radiusKm: unlimited ? UNLIMITED_RADIUS_KM : DEFAULT_RADIUS_KM }));
  }

  protected setPriceBand(band: ArenaPriceBand): void {
    this.filters.update((f) => ({ ...f, priceBand: f.priceBand === band ? 'any' : band }));
  }

  protected toggleSurface(surface: string): void {
    this.filters.update((f) => {
      const next = new Set(f.surfaces);
      if (next.has(surface)) next.delete(surface);
      else next.add(surface);
      return { ...f, surfaces: next };
    });
  }

  protected toggleAmenity(key: keyof ArenaAmenities): void {
    this.filters.update((f) => ({ ...f, amenities: { ...f.amenities, [key]: !f.amenities[key] } }));
  }

  protected togglePayment(method: ArenaPaymentFilter): void {
    this.filters.update((f) => {
      const next = new Set(f.paymentMethods);
      if (next.has(method)) next.delete(method);
      else next.add(method);
      return { ...f, paymentMethods: next };
    });
  }

  protected setMinScore(score: number): void {
    this.filters.update((f) => ({ ...f, minReputationScore: score }));
  }

  protected setSortBy(sortBy: ArenaSearchSortBy): void {
    this.filters.update((f) => ({ ...f, sortBy }));
  }

  protected toggleShowOnlyFavorites(): void {
    this.filters.update((f) => ({ ...f, showOnlyFavorites: !f.showOnlyFavorites }));
  }

  protected resetFilters(): void {
    this.filters.set(defaultArenaSearchQueryFilters(this.defaultSportChip()));
    this.queryInput.set('');
  }

  protected showAllArenas(): void {
    this.filters.set({ ...defaultArenaSearchQueryFilters('all'), query: this.filters().query });
  }

  protected async toggleFavorite(arenaId: string): Promise<void> {
    const user = this.auth.user();
    const db = this.firestore;
    if (!user || !db) {
      this.notifyFavorite('Faça login para seguir arenas.');
      return;
    }
    const isFavorite = this.favoriteIds().has(arenaId);
    this.pendingFavoriteId.set(arenaId);
    this.favoriteIds.update((ids) => {
      const next = new Set(ids);
      if (isFavorite) next.delete(arenaId);
      else next.add(arenaId);
      return next;
    });
    try {
      await toggleFavoriteArena(db, { userId: user.uid, arenaId, isFavorite });
    } catch {
      this.favoriteIds.update((ids) => {
        const next = new Set(ids);
        if (isFavorite) next.add(arenaId);
        else next.delete(arenaId);
        return next;
      });
      this.notifyFavorite('Não foi possível atualizar seguidores agora.');
    } finally {
      this.pendingFavoriteId.set(null);
    }
  }

  private notifyFavorite(message: string): void {
    this.favoriteNotice.set(message);
    setTimeout(() => this.favoriteNotice.set(null), 4000);
  }

  protected openConfirm(result: ArenaSearchResult): void {
    if (!result.hasAvailability) return;
    this.confirmResult.set(result);
  }

  protected closeConfirm(): void {
    this.confirmResult.set(null);
  }

  protected isFavorite(arenaId: string): boolean {
    return this.favoriteIds().has(arenaId);
  }

  protected isBestPrice(arenaId: string): boolean {
    return this.bestPriceIds().has(arenaId);
  }

  protected arenaImageUrl(arena: ArenaListItem): string {
    return arenaListItemImageUrl(arena);
  }

  protected isImageLoaded(arenaId: string): boolean {
    return this.loadedImageIds().has(arenaId);
  }

  protected isImageFailed(arenaId: string): boolean {
    return this.failedImageIds().has(arenaId);
  }

  protected onImageLoad(arenaId: string): void {
    this.loadedImageIds.update((ids) => new Set(ids).add(arenaId));
  }

  protected onImageError(arenaId: string): void {
    this.failedImageIds.update((ids) => new Set(ids).add(arenaId));
  }

  protected isLogoFailed(arenaId: string): boolean {
    return this.failedLogoIds().has(arenaId);
  }

  protected onLogoError(arenaId: string): void {
    this.failedLogoIds.update((ids) => new Set(ids).add(arenaId));
  }

  protected readonly arenaInitials = initialsOf;

  protected trackByArenaId(_index: number, item: { result: ArenaSearchResult }): string {
    return item.result.arena.id;
  }

  protected readonly courtCountLabel = courtCountLabel;
  protected readonly distanceLabel = distanceLabel;
  protected readonly ratingLabel = ratingLabel;
  protected readonly reviewsLabel = reviewsLabel;
  protected readonly courtLineLabel = courtLineLabel;
  protected readonly heroGradient = heroGradient;
  protected readonly formatPriceWhole = formatPriceWhole;
}

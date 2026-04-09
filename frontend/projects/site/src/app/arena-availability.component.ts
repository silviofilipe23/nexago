import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  runInInjectionContext,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import 'leaflet.heat';

import { MOCK_ARENAS, type ArenaPreview } from './landing/data/arenas.mock';
import {
  BR_CITIES_FOR_SEARCH,
  NEAR_ME_LOCATION_LABEL,
  type CityListEntry,
} from './landing/data/cities.mock';
import { MotionService } from './motion/motion.service';
import { SharedTransitionService } from './core/shared-transition.service';
import { ArenaDiscoveryStore, type ArenaMapBounds } from './core/arena-discovery.store';
import { GalleryOverlayService } from './core/gallery-overlay.service';
import { ArenaFavoritesStore } from './core/arena-favorites.store';
import { prefersReducedMotion } from './landing/animations/gsap-setup';
import gsap from 'gsap';

type ArenaType = 'all' | 'indoor' | 'beach' | 'hybrid';

interface CitySuggestionRow {
  id: string;
  label: string;
  boldBefore: string;
  normalMatch: string;
  boldAfter: string;
}

interface CalendarCell {
  iso: string;
  label: number;
  inMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
}

function todayIso(): string {
  const d = new Date();
  return toIsoDate(d);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseRouteDateIso(param: string | null): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    return param;
  }
  return todayIso();
}

@Component({
  selector: 'app-arena-availability',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './arena-availability.component.html',
  styleUrls: ['./arena-availability.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArenaAvailabilityComponent {
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly motion = inject(MotionService);
  private readonly sharedTransition = inject(SharedTransitionService);
  readonly discovery = inject(ArenaDiscoveryStore);
  readonly galleryOverlay = inject(GalleryOverlayService);
  readonly favorites = inject(ArenaFavoritesStore);
  /** Mesma ref de `ArenaDiscoveryStore.selectedArenaId` — uso no template. */
  readonly selectedArenaId = this.discovery.selectedArenaId;
  private readonly mapRef = viewChild<ElementRef<HTMLElement>>('mapContainer');
  private readonly arenaListRef = viewChild<ElementRef<HTMLElement>>('arenaList');

  readonly location = signal(
    this.route.snapshot.queryParamMap.get('location') ?? NEAR_ME_LOCATION_LABEL,
  );
  /** Data em formato ISO (yyyy-mm-dd) — calendário e query param. */
  readonly selectedDateIso = signal(parseRouteDateIso(this.route.snapshot.queryParamMap.get('date')));
  readonly selectedTime = signal(this.route.snapshot.queryParamMap.get('time') ?? '18:00');
  readonly locationDraft = signal(this.location());
  readonly openSearchSection = signal<'location' | 'date' | 'time' | null>(null);
  readonly showMapMobile = signal(false);
  /** Bottom sheet estilo Airbnb após toque no pin (mobile). */
  readonly mobileMapPeekOpen = signal(false);
  readonly isFiltersModalOpen = signal(false);

  readonly onlyAvailable = signal(true);
  readonly sortBy = signal<'distance' | 'price' | 'rating'>('distance');
  readonly selectedArenaType = signal<ArenaType>('all');
  readonly maxPriceFilter = signal(220);
  readonly maxDistanceFilter = signal(12);
  readonly minRatingFilter = signal(4.0);
  readonly includeParkingFilter = signal(false);
  readonly includeLockerRoomFilter = signal(false);
  readonly includeNightLightingFilter = signal(false);
  /** Lista restrita às arenas salvas como favoritas. */
  readonly showOnlyFavorites = signal(false);
  /** Camada de calor (demanda simulada). */
  readonly showHeatmap = signal(false);

  readonly arenas = signal<ArenaPreview[]>(MOCK_ARENAS);
  readonly quickTimes = ['07:00', '09:00', '18:00', '20:00', '21:00'];
  readonly calendarMonth = signal(
    (() => {
      const iso = parseRouteDateIso(this.route.snapshot.queryParamMap.get('date'));
      const [y, m] = iso.split('-').map(Number);
      return new Date(y, m - 1, 1);
    })(),
  );
  readonly calendarWeekdayLabels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  private readonly locationInputRef = viewChild<ElementRef<HTMLInputElement>>('locationQuery');
  private readonly markers = new Map<string, L.Marker>();
  private map: L.Map | null = null;
  private heatLayer: L.Layer | null = null;
  private arenaListStaggerApplied = false;

  /** Barra de busca sempre no modo compacto (logo + linha única em sm+) enquanto nenhum dropdown está aberto. */
  readonly isSearchNavbarCompact = computed(() => this.openSearchSection() === null);

  readonly dateDisplayLabel = computed(() => this.formatDatePtBr(this.selectedDateIso()));

  readonly filteredCitySuggestions = computed((): CitySuggestionRow[] => {
    const draft = this.locationDraft().trim();
    const nDraft = this.normalizeForSearch(draft);
    const limit = 8;
    const rows: CitySuggestionRow[] = [];

    const includeNear =
      !nDraft || this.normalizeForSearch(NEAR_ME_LOCATION_LABEL).includes(nDraft);

    if (includeNear) {
      rows.push(this.toCitySuggestionRow('near-me', NEAR_ME_LOCATION_LABEL, draft));
    }

    let pool: CityListEntry[] = BR_CITIES_FOR_SEARCH;
    if (nDraft) {
      pool = BR_CITIES_FOR_SEARCH.filter((c) => this.normalizeForSearch(c.label).includes(nDraft));
    }

    const take = limit - rows.length;
    for (const entry of pool.slice(0, take)) {
      rows.push(this.toCitySuggestionRow(entry.id, entry.label, draft));
    }

    return rows;
  });

  readonly calendarCells = computed(() => this.buildCalendarCells(this.calendarMonth(), this.selectedDateIso()));

  readonly calendarMonthLabel = computed(() =>
    new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(this.calendarMonth()),
  );

  /** Filtros da busca (sem recorte do mapa) — usado nos pins e nos badges globais. */
  readonly discoveryFilteredArenas = computed(() => {
    let list = [...this.arenas()];
    if (this.onlyAvailable()) {
      list = list.filter((a) => a.available);
    }
    list = list.filter((a) => a.pricePerHourReais <= this.maxPriceFilter());
    list = list.filter((a) => a.distanceKm <= this.maxDistanceFilter());
    list = list.filter((a) => a.rating >= this.minRatingFilter());
    const typeFilter = this.selectedArenaType();
    if (typeFilter !== 'all') {
      list = list.filter((a) => this.resolveArenaType(a) === typeFilter);
    }
    if (this.includeParkingFilter()) {
      list = list.filter((a) => this.hasAmenity(a, 'parking'));
    }
    if (this.includeLockerRoomFilter()) {
      list = list.filter((a) => this.hasAmenity(a, 'locker_room'));
    }
    if (this.includeNightLightingFilter()) {
      list = list.filter((a) => this.hasAmenity(a, 'night_lighting'));
    }

    if (this.showOnlyFavorites()) {
      list = list.filter((a) => this.favorites.has(a.id));
    }

    const sort = this.sortBy();
    const favIds = this.favorites.ids();
    list.sort((a, b) => {
      const af = favIds.has(a.id) ? 0 : 1;
      const bf = favIds.has(b.id) ? 0 : 1;
      if (af !== bf) {
        return af - bf;
      }
      if (sort === 'price') {
        return a.pricePerHourReais - b.pricePerHourReais;
      }
      if (sort === 'rating') {
        return b.rating - a.rating;
      }
      return a.distanceKm - b.distanceKm;
    });
    return list;
  });

  /** Lista sincronizada com o viewport do mapa (padrão Airbnb). */
  readonly listedArenas = computed(() => {
    let list = [...this.discoveryFilteredArenas()];
    const b = this.discovery.mapBounds();
    if (b) {
      list = list.filter((a) => this.isArenaInMapBounds(a, b));
    }
    return list;
  });

  readonly peekArena = computed((): ArenaPreview | null => {
    const id = this.discovery.selectedArenaId();
    if (!id) {
      return null;
    }
    return (
      this.discoveryFilteredArenas().find((a) => a.id === id) ??
      MOCK_ARENAS.find((a) => a.id === id) ??
      null
    );
  });

  readonly nearestArenaId = computed(() => {
    const list = this.discoveryFilteredArenas();
    if (list.length === 0) {
      return null;
    }
    return [...list].sort((a, b) => a.distanceKm - b.distanceKm)[0].id;
  });
  readonly cheapestArenaId = computed(() => {
    const list = this.discoveryFilteredArenas();
    if (list.length === 0) {
      return null;
    }
    return [...list].sort((a, b) => a.pricePerHourReais - b.pricePerHourReais)[0].id;
  });
  readonly topRatedArenaId = computed(() => {
    const list = this.discoveryFilteredArenas();
    if (list.length === 0) {
      return null;
    }
    return [...list].sort((a, b) => b.rating - a.rating)[0].id;
  });

  constructor() {
    const qp = this.route.queryParamMap.subscribe((params) => {
      const loc = params.get('location');
      if (loc) {
        this.location.set(loc);
      }
      const date = params.get('date');
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        this.selectedDateIso.set(date);
      }
      const time = params.get('time');
      if (time) {
        this.selectedTime.set(time);
      }
    });
    this.destroyRef.onDestroy(() => {
      qp.unsubscribe();
      this.discovery.hoverArena(null);
    });

    afterNextRender(() => {
      this.initMap();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.map?.invalidateSize());
      });
      this.applyReturnFromDetail();

      runInInjectionContext(this.injector, () => {
        const markerSync = effect(() => {
          this.discoveryFilteredArenas();
          this.rebuildMarkers();
        });
        const sync = effect(() => {
          const selectedId = this.discovery.selectedArenaId();
          if (!selectedId || !this.map) {
            return;
          }
          const arena = this.discoveryFilteredArenas().find((a) => a.id === selectedId);
          const marker = arena ? this.markers.get(selectedId) : undefined;
          if (!arena || !marker) {
            return;
          }
          requestAnimationFrame(() => this.scheduleMapFocusToSelectedArena(selectedId));
        });
        const markerLook = effect(() => {
          this.discovery.selectedArenaId();
          this.discovery.hoveredArenaId();
          this.favorites.ids();
          this.syncMarkerDomClasses();
        });

        const heatSync = effect(() => {
          this.showHeatmap();
          this.discoveryFilteredArenas();
          queueMicrotask(() => this.syncHeatmapLayer());
        });

        const listStagger = effect(() => {
          this.listedArenas();
          if (this.arenaListStaggerApplied) {
            return;
          }
          queueMicrotask(() => {
            const host = this.arenaListRef()?.nativeElement;
            if (!host) {
              return;
            }
            const articles = Array.from(host.querySelectorAll<HTMLElement>(':scope > article'));
            if (articles.length === 0) {
              return;
            }
            this.motion.staggerFadeSlide(articles);
            this.arenaListStaggerApplied = true;
          });
        });

        this.destroyRef.onDestroy(() => {
          markerSync.destroy();
          sync.destroy();
          markerLook.destroy();
          heatSync.destroy();
          listStagger.destroy();
          this.map?.remove();
        });
      });
    });
  }

  setSortBy(v: 'distance' | 'price' | 'rating'): void {
    this.sortBy.set(v);
  }

  toggleOnlyAvailable(): void {
    this.onlyAvailable.update((v) => !v);
  }

  toggleHeatmap(): void {
    this.showHeatmap.update((v) => !v);
  }

  toggleFavoritesOnlyFilter(): void {
    this.showOnlyFavorites.update((v) => !v);
  }

  toggleFavoriteCard(arenaId: string, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.favorites.toggle(arenaId);
    const btn = ev.currentTarget as HTMLElement | undefined;
    if (btn && !prefersReducedMotion()) {
      gsap.fromTo(
        btn,
        { scale: 0.84 },
        { scale: 1.16, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' },
      );
    }
  }

  selectArena(id: string): void {
    this.discovery.selectArena(id);
  }

  hoverArena(id: string): void {
    this.discovery.hoverArena(id);
  }

  clearArenaHover(): void {
    this.discovery.hoverArena(null);
  }

  closeMapPeek(): void {
    this.mobileMapPeekOpen.set(false);
  }

  private onMarkerActivated(arenaId: string): void {
    this.scrollToCard(arenaId);
    if (
      typeof globalThis !== 'undefined' &&
      globalThis.matchMedia?.('(max-width: 1023px)').matches
    ) {
      this.showMapMobile.set(true);
      this.mobileMapPeekOpen.set(true);
    }
  }

  scrollToCard(arenaId: string): void {
    if (typeof document === 'undefined') {
      return;
    }
    document
      .querySelector<HTMLElement>(`[data-shared-arena-id="${CSS.escape(arenaId)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  openArenaDetail(cardEl: HTMLElement, arena: ArenaPreview): void {
    this.mobileMapPeekOpen.set(false);
    this.selectArena(arena.id);
    if (typeof document !== 'undefined') {
      this.sharedTransition.captureFromCard(cardEl, arena.id);
    }
    void this.router.navigate(['/arena', arena.id], {
      queryParams: { date: this.selectedDateIso(), time: this.selectedTime() },
    });
  }

  /** Após reverse transition do detalhe: scroll da lista + opcional stagger GSAP. */
  private applyReturnFromDetail(): void {
    const payload = this.sharedTransition.consumeReturnToList();
    if (!payload) {
      return;
    }

    requestAnimationFrame(() => {
      globalThis.scrollTo(0, Math.max(0, payload.restoreScrollY));
      if (payload.focusArenaId) {
        this.selectArena(payload.focusArenaId);
      }
      if (payload.focusArenaId && typeof document !== 'undefined') {
        document
          .querySelector<HTMLElement>(
            `[data-shared-arena-id="${CSS.escape(payload.focusArenaId)}"]`,
          )
          ?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    });

    if (!payload.runListReveal || prefersReducedMotion()) {
      return;
    }

    this.arenaListStaggerApplied = true;
    queueMicrotask(() => {
      const host = this.arenaListRef()?.nativeElement;
      if (!host) {
        return;
      }
      const articles = Array.from(host.querySelectorAll<HTMLElement>(':scope > article'));
      if (articles.length === 0) {
        return;
      }
      gsap.from(articles, {
        opacity: 0,
        y: 20,
        stagger: 0.05,
        duration: 0.3,
        ease: 'power3.out',
      });
    });
  }

  toggleMapMobile(): void {
    this.showMapMobile.update((v) => !v);
    if (this.showMapMobile()) {
      queueMicrotask(() => this.map?.invalidateSize());
    }
  }

  private isArenaInMapBounds(a: ArenaPreview, b: ArenaMapBounds): boolean {
    if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) {
      return false;
    }
    return (
      a.lat >= b.south && a.lat <= b.north && a.lng >= b.west && a.lng <= b.east
    );
  }

  urgencyLabel(arena: ArenaPreview): string {
    const seed = Number.parseInt(arena.id, 10);
    const left = Number.isFinite(seed) ? (seed % 3) + 1 : 2;
    return `Restam ${left} horários`;
  }

  badgeLabel(arena: ArenaPreview): string | null {
    if (arena.badge === 'popular') {
      return '🔥 Mais reservada';
    }
    if (arena.id === this.topRatedArenaId()) {
      return '⭐ Melhor avaliada';
    }
    if (arena.id === this.cheapestArenaId()) {
      return '💰 Melhor preço';
    }
    if (arena.id === this.nearestArenaId()) {
      return '📍 Mais próxima';
    }
    if (arena.badge === 'rating') {
      return '⭐ Alto desempenho';
    }
    return null;
  }

  toggleSearchSection(section: 'location' | 'date' | 'time'): void {
    this.isFiltersModalOpen.set(false);
    if (this.openSearchSection() === 'location') {
      const v = this.locationDraft().trim();
      if (v) {
        this.location.set(v);
      }
    }
    this.openSearchSection.update((current) => {
      const next = current === section ? null : section;
      if (next === 'location') {
        this.locationDraft.set(this.location());
        queueMicrotask(() => this.locationInputRef()?.nativeElement?.focus());
      }
      if (next === 'date') {
        const iso = this.selectedDateIso();
        const [y, m] = iso.split('-').map(Number);
        this.calendarMonth.set(new Date(y, m - 1, 1));
      }
      return next;
    });
  }

  closeSearchSection(): void {
    if (this.openSearchSection() === 'location') {
      const v = this.locationDraft().trim();
      if (v) {
        this.location.set(v);
      }
    }
    this.openSearchSection.set(null);
  }

  chooseLocation(locationValue: string): void {
    this.location.set(locationValue);
    this.locationDraft.set(locationValue);
    this.closeSearchSection();
    this.openDateSectionAfterLocationChoice();
  }

  setLocationDraft(value: string): void {
    this.locationDraft.set(value);
  }

  clearLocationDraft(): void {
    this.locationDraft.set('');
    queueMicrotask(() => this.locationInputRef()?.nativeElement?.focus());
  }

  commitLocationDraft(): void {
    const v = this.locationDraft().trim();
    if (v) {
      this.location.set(v);
    }
    this.closeSearchSection();
    if (v) {
      this.openDateSectionAfterLocationChoice();
    }
  }

  selectCalendarDay(iso: string): void {
    if (!iso) {
      return;
    }
    this.selectedDateIso.set(iso);
    this.closeSearchSection();
    this.openTimeSectionAfterDateChoice();
  }

  setDateToday(): void {
    const iso = todayIso();
    this.selectedDateIso.set(iso);
    const [y, m] = iso.split('-').map(Number);
    this.calendarMonth.set(new Date(y, m - 1, 1));
    this.closeSearchSection();
    this.openTimeSectionAfterDateChoice();
  }

  setDateTomorrow(): void {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const iso = toIsoDate(d);
    this.selectedDateIso.set(iso);
    const [y, m] = iso.split('-').map(Number);
    this.calendarMonth.set(new Date(y, m - 1, 1));
    this.closeSearchSection();
    this.openTimeSectionAfterDateChoice();
  }

  calendarPrevMonth(): void {
    const d = this.calendarMonth();
    this.calendarMonth.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  calendarNextMonth(): void {
    const d = this.calendarMonth();
    this.calendarMonth.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  chooseTime(time: string): void {
    this.selectedTime.set(time);
    this.closeSearchSection();
  }

  openFiltersModal(): void {
    if (this.openSearchSection() === 'location') {
      const v = this.locationDraft().trim();
      if (v) {
        this.location.set(v);
      }
    }
    this.openSearchSection.set(null);
    this.isFiltersModalOpen.set(true);
  }

  applySearchToRoute(): void {
    if (this.openSearchSection() === 'location') {
      const v = this.locationDraft().trim();
      if (v) {
        this.location.set(v);
      }
    }
    // this.openSearchSection.set(null);
    // void this.router.navigate([], {
    //   relativeTo: this.route,
    //   queryParams: {
    //     location: this.location(),
    //     date: this.selectedDateIso(),
    //     time: this.selectedTime(),
    //   },
    //   queryParamsHandling: 'merge',
    //   replaceUrl: true,
    // });
    queueMicrotask(() => this.map?.invalidateSize());
  }

  closeFiltersModal(): void {
    this.isFiltersModalOpen.set(false);
  }

  setArenaTypeFilter(type: ArenaType): void {
    this.selectedArenaType.set(type);
  }

  setMaxPriceFilter(value: string): void {
    this.maxPriceFilter.set(Number(value));
  }

  setMaxDistanceFilter(value: string): void {
    this.maxDistanceFilter.set(Number(value));
  }

  setMinRatingFilter(value: string): void {
    this.minRatingFilter.set(Number(value));
  }

  resetAdvancedFilters(): void {
    this.selectedArenaType.set('all');
    this.maxPriceFilter.set(220);
    this.maxDistanceFilter.set(12);
    this.minRatingFilter.set(4.0);
    this.includeParkingFilter.set(false);
    this.includeLockerRoomFilter.set(false);
    this.includeNightLightingFilter.set(false);
    this.onlyAvailable.set(true);
    this.showOnlyFavorites.set(false);
  }

  /** Após escolher destino (lista ou Enter com texto), abre o passo da data. */
  private openDateSectionAfterLocationChoice(): void {
    queueMicrotask(() => {
      if (this.isFiltersModalOpen()) {
        return;
      }
      this.openSearchSection.set('date');
      const iso = this.selectedDateIso();
      const [y, m] = iso.split('-').map(Number);
      this.calendarMonth.set(new Date(y, m - 1, 1));
    });
  }

  /** Após escolher o dia (calendário, Hoje ou Amanhã), abre o passo do horário. */
  private openTimeSectionAfterDateChoice(): void {
    queueMicrotask(() => {
      if (this.isFiltersModalOpen()) {
        return;
      }
      this.openSearchSection.set('time');
    });
  }

  private resolveArenaType(arena: ArenaPreview): ArenaType {
    const seed = Number.parseInt(arena.id, 10);
    if (seed % 3 === 0) {
      return 'hybrid';
    }
    if (seed % 2 === 0) {
      return 'indoor';
    }
    return 'beach';
  }

  private toCitySuggestionRow(id: string, label: string, draft: string): CitySuggestionRow {
    const { boldBefore, normalMatch, boldAfter } = this.splitLabelHighlight(label, draft);
    return { id, label, boldBefore, normalMatch, boldAfter };
  }

  private splitLabelHighlight(
    label: string,
    query: string,
  ): { boldBefore: string; normalMatch: string; boldAfter: string } {
    const q = query.trim();
    if (!q) {
      return { boldBefore: '', normalMatch: label, boldAfter: '' };
    }
    const lo = label.toLocaleLowerCase('pt-BR');
    const qlo = q.toLocaleLowerCase('pt-BR');
    const plainIdx = lo.indexOf(qlo);
    if (plainIdx >= 0) {
      return {
        boldBefore: label.slice(0, plainIdx),
        normalMatch: label.slice(plainIdx, plainIdx + q.length),
        boldAfter: label.slice(plainIdx + q.length),
      };
    }
    const nLab = this.normalizeForSearch(label);
    const nQ = this.normalizeForSearch(q);
    const nIdx = nLab.indexOf(nQ);
    if (nIdx < 0) {
      return { boldBefore: '', normalMatch: label, boldAfter: '' };
    }
    const span = this.mapNormalizedMatchToOriginal(label, nIdx, nQ.length);
    if (!span) {
      return { boldBefore: '', normalMatch: label, boldAfter: '' };
    }
    return {
      boldBefore: label.slice(0, span.start),
      normalMatch: label.slice(span.start, span.end),
      boldAfter: label.slice(span.end),
    };
  }

  private normalizeForSearch(s: string): string {
    return s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase('pt-BR');
  }

  private mapNormalizedMatchToOriginal(
    label: string,
    nStart: number,
    nLen: number,
  ): { start: number; end: number } | null {
    let nIdx = 0;
    let startOrig: number | null = null;
    let endOrig: number | null = null;
    const nEnd = nStart + nLen;

    for (let i = 0; i < label.length; i++) {
      const piece = this.normalizeForSearch(label[i]);
      const next = nIdx + piece.length;

      if (startOrig === null && next > nStart) {
        startOrig = i;
      }
      if (startOrig !== null && next >= nEnd) {
        endOrig = i + 1;
        break;
      }
      nIdx = next;
    }

    if (startOrig === null || endOrig === null) {
      return null;
    }
    return { start: startOrig, end: endOrig };
  }

  private formatDatePtBr(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) {
      return iso;
    }
    const dt = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(dt);
  }

  private buildCalendarCells(viewMonth: Date, selectedIso: string): CalendarCell[] {
    const y = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const first = new Date(y, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, month + 1, 0).getDate();
    const today = todayIso();
    const cells: CalendarCell[] = [];

    const prevMonthLastDate = new Date(y, month, 0);
    const prevMonthDays = prevMonthLastDate.getDate();

    for (let i = 0; i < startPad; i++) {
      const dayNum = prevMonthDays - startPad + i + 1;
      const d = new Date(y, month - 1, dayNum);
      const iso = toIsoDate(d);
      cells.push({
        iso,
        label: dayNum,
        inMonth: false,
        isSelected: iso === selectedIso,
        isToday: iso === today,
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, month, day);
      const iso = toIsoDate(d);
      cells.push({
        iso,
        label: day,
        inMonth: true,
        isSelected: iso === selectedIso,
        isToday: iso === today,
      });
    }

    let pad = 1;
    while (cells.length % 7 !== 0) {
      const d = new Date(y, month + 1, pad);
      const iso = toIsoDate(d);
      cells.push({
        iso,
        label: pad,
        inMonth: false,
        isSelected: iso === selectedIso,
        isToday: iso === today,
      });
      pad += 1;
    }

    return cells;
  }

  private hasAmenity(arena: ArenaPreview, amenity: 'parking' | 'locker_room' | 'night_lighting'): boolean {
    const seed = Number.parseInt(arena.id, 10);
    if (amenity === 'parking') {
      return seed % 2 === 1;
    }
    if (amenity === 'locker_room') {
      return seed % 3 !== 0;
    }
    return seed % 4 !== 0;
  }

  private initMap(): void {
    const container = this.mapRef()?.nativeElement;
    if (!container || this.map) {
      return;
    }
    this.map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
    }).setView([-16.686882, -49.26479], 9);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(this.map);

    const pushBounds = (): void => {
      if (!this.map) {
        return;
      }
      this.discovery.setMapBounds(this.map.getBounds());
    };
    this.map.on('moveend', pushBounds);
    this.map.on('zoomend', pushBounds);
    queueMicrotask(() => pushBounds());

    this.rebuildMarkers();
    queueMicrotask(() => this.syncHeatmapLayer());
  }

  private syncMarkerDomClasses(): void {
    const sel = this.discovery.selectedArenaId();
    const hov = this.discovery.hoveredArenaId();
    this.markers.forEach((marker, id) => {
      const wrap = marker.getElement();
      if (!wrap) {
        return;
      }
      wrap.classList.toggle('arena-marker-wrap--active', id === sel);
      wrap.classList.toggle('arena-marker-wrap--hover', id === hov && id !== sel);
      wrap.classList.toggle('arena-marker-wrap--favorite', this.favorites.has(id));
    });
  }

  /** Pontos de calor mock: peso ~ reservas + buscas (NexaGO). */
  private buildHeatPoints(arenas: ArenaPreview[]): [number, number, number][] {
    const pts: [number, number, number][] = [];
    for (const a of arenas) {
      if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) {
        continue;
      }
      const seed = Number.parseInt(a.id, 10) || 1;
      const bookings = (seed % 6) + 4 + Math.round(a.rating * 1.4);
      const searches = (seed % 5) + 3 + (a.available ? 3 : 0);
      const w = Math.min(1, bookings * 0.065 + searches * 0.048);
      pts.push([a.lat, a.lng, w]);
      const jitter = 0.014;
      pts.push([
        a.lat + jitter * Math.sin(seed * 0.73),
        a.lng + jitter * Math.cos(seed * 0.91),
        w * 0.52,
      ]);
    }
    return pts;
  }

  private syncHeatmapLayer(): void {
    const map = this.map;
    if (!map) {
      return;
    }
    if (this.heatLayer) {
      map.removeLayer(this.heatLayer);
      this.heatLayer = null;
    }
    if (!this.showHeatmap()) {
      return;
    }
    const raw = this.buildHeatPoints(this.discoveryFilteredArenas());
    if (raw.length === 0) {
      return;
    }
    const createHeat = (L as unknown as { heatLayer: (data: typeof raw, o: object) => L.Layer })
      .heatLayer;
    this.heatLayer = createHeat(raw, {
      radius: 38,
      blur: 26,
      maxZoom: 17,
      max: 0.88,
      minOpacity: 0.14,
      gradient: {
        0.0: 'rgba(0,0,0,0)',
        0.28: 'rgba(139,92,246,0.38)',
        0.52: 'rgba(139,92,246,0.72)',
        0.74: 'rgba(59,130,246,0.88)',
        1.0: 'rgba(16,185,129,0.96)',
      },
    }).addTo(map);
  }

  private rebuildMarkers(): void {
    if (!this.map) {
      return;
    }
    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();

    for (const arena of this.discoveryFilteredArenas()) {
      if (!Number.isFinite(arena.lat) || !Number.isFinite(arena.lng)) {
        continue;
      }
      const icon = L.divIcon({
        className: 'arena-marker-wrap',
        html: `<div class="arena-marker-pin" aria-hidden="true"></div>`,
        iconSize: [40, 48],
        iconAnchor: [20, 48],
      });
      const marker = L.marker([arena.lat, arena.lng], { icon }).addTo(this.map);
      marker.on('click', () => {
        this.discovery.selectArena(arena.id);
        this.onMarkerActivated(arena.id);
      });
      marker.on('mouseover', () => this.discovery.hoverArena(arena.id));
      marker.on('mouseout', () => {
        if (this.discovery.hoveredArenaId() === arena.id) {
          this.discovery.hoverArena(null);
        }
      });
      this.markers.set(arena.id, marker);

      if (!prefersReducedMotion()) {
        queueMicrotask(() => {
          const el = marker.getElement();
          if (!el) {
            return;
          }
          gsap.fromTo(
            el,
            { scale: 0.82, opacity: 0.75 },
            { scale: 1, opacity: 1, duration: 0.32, ease: 'power3.out' },
          );
        });
      }
    }
    this.syncMarkerDomClasses();
  }

  /**
   * Centraliza o mapa na arena selecionada só quando o container já tem dimensões —
   * evita erro "Invalid LatLng (NaN, NaN)" se flyTo corre antes do primeiro layout.
   */
  private scheduleMapFocusToSelectedArena(expectedArenaId: string, attempt = 0): void {
    const maxAttempts = 24;
    const map = this.map;
    if (!map) {
      return;
    }
    if (this.discovery.selectedArenaId() !== expectedArenaId) {
      return;
    }

    map.invalidateSize(false);
    const box = map.getContainer().getBoundingClientRect();
    if ((box.width < 2 || box.height < 2) && attempt < maxAttempts) {
      requestAnimationFrame(() => this.scheduleMapFocusToSelectedArena(expectedArenaId, attempt + 1));
      return;
    }

    const arena = this.discoveryFilteredArenas().find((a) => a.id === expectedArenaId);
    const marker = arena ? this.markers.get(expectedArenaId) : undefined;
    if (!arena || !marker || !Number.isFinite(arena.lat) || !Number.isFinite(arena.lng)) {
      return;
    }

    try {
      map.flyTo([arena.lat, arena.lng], 12.5, { duration: 0.7 });
    } catch {
      map.setView([arena.lat, arena.lng], 12.5);
    }
  }

  openDetailFromPeek(cardEl: HTMLElement, arena: ArenaPreview): void {
    this.mobileMapPeekOpen.set(false);
    this.selectArena(arena.id);
    if (typeof document !== 'undefined') {
      this.sharedTransition.captureFromCard(cardEl, arena.id);
    }
    void this.router.navigate(['/arena', arena.id], {
      queryParams: { date: this.selectedDateIso(), time: this.selectedTime() },
    });
  }
}

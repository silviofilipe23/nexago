import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ARENA_SPORT_CHIP_OPTIONS, type ArenaSportChip } from '@nexago/arena-discovery';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { AtBellComponent } from '../painel/at-bell.component';
import { fetchAthleteDirectoryPage, fetchPublicProfilesByIds, levelBucketOf, searchAthleteDirectory, type AthletePublicProfile } from '../data/public-profiles-repository';
import { fetchAthleteRankingGeneral } from '../data/rankings-repository';
import type { FilterLevel } from '../ranking/athlete-ranking.models';
import type { AthleteDirectoryEntry } from './athlete-directory.models';

export type SortBy = 'ranking' | 'name' | 'level';

const LEVEL_OPTIONS: readonly FilterLevel[] = ['all', 'Iniciante', 'Intermediário', 'Open'];
const LEVEL_ORDER: Record<FilterLevel, number> = { all: -1, Open: 0, Intermediário: 1, Iniciante: 2 };
const CITY_ALL = 'all';

const SORT_OPTIONS: readonly { value: SortBy; label: string }[] = [
  { value: 'ranking', label: 'Ranking' },
  { value: 'name', label: 'Nome' },
  { value: 'level', label: 'Nível' },
];

const SPORT_SHORT_LABEL: Partial<Record<ArenaSportChip, string>> = {
  beachVolleyball: 'Vôlei',
  beachTennis: 'Beach tênis',
  tennis: 'Tênis',
  padel: 'Padel',
  volleyball: 'Vôlei indoor',
  football: 'Futebol',
};

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
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
  if (parts.length === 0) return 'AT';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

function entryFromProfile(profile: AthletePublicProfile, rank: number | null): AthleteDirectoryEntry {
  return {
    id: profile.id,
    handle: profile.handle ?? profile.id,
    fullName: profile.displayName,
    city: profile.city ?? '',
    sport: profile.sportChip,
    level: levelBucketOf(profile.levelCode),
    rankingPosition: rank,
  };
}

/** Busca de atletas real: `public_profiles` paginado (`hasAthleteRole==true`, cursor por id do
 *  doc) ou `keywords array-contains` quando há termo de busca — espelha
 *  `AthleteDiscoverRepository` (Flutter). Sem "sugeridos pra você"/distância real (dependeriam
 *  de grafo de seguidores e geolocalização, nenhum dos dois existe hoje). */
@Component({
  selector: 'app-athlete-directory',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, AtBellComponent],
  templateUrl: './athlete-directory.component.html',
  styleUrl: './athlete-directory.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.meta.k)': 'focusSearch($event)',
    '(document:keydown.control.k)': 'focusSearch($event)',
  },
})
export class AthleteDirectoryComponent {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();

  protected readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });
  protected readonly headerInitials = computed(() => initialsOf(this.accountLabel()));

  protected readonly queryInput = signal('');
  protected readonly filterQuery = signal('');
  private queryDebounceHandle: ReturnType<typeof setTimeout> | undefined;

  protected readonly sportOptions = ARENA_SPORT_CHIP_OPTIONS.filter((o) => o.chip !== 'all');
  protected readonly levelOptions = LEVEL_OPTIONS;
  protected readonly sortOptions = SORT_OPTIONS;

  protected readonly sportFilter = signal<ArenaSportChip>('beachVolleyball');
  protected readonly levelFilter = signal<FilterLevel>('all');
  protected readonly cityFilter = signal<string>(CITY_ALL);
  protected readonly sortBy = signal<SortBy>('ranking');

  protected readonly loading = signal(true);
  protected readonly allAthletes = signal<readonly AthleteDirectoryEntry[]>([]);
  private nextCursor: string | null = null;
  protected readonly hasMore = signal(false);
  protected readonly loadingMore = signal(false);
  private rankPositionById = new Map<string, number>();

  protected readonly cityOptions = computed(() => {
    const cities = [...new Set(this.allAthletes().map((a) => a.city).filter((c) => c.length > 0))].sort((a, b) => a.localeCompare(b));
    return [CITY_ALL, ...cities];
  });

  protected readonly filteredOthers = computed(() => {
    const sport = this.sportFilter();
    const level = this.levelFilter();
    const city = this.cityFilter();
    const q = this.filterQuery().trim().toLowerCase();
    const sort = this.sortBy();

    const list = this.allAthletes()
      .filter((a) => a.sport === sport)
      .filter((a) => level === 'all' || a.level === level)
      .filter((a) => city === CITY_ALL || a.city === city)
      .filter((a) => !q || a.fullName.toLowerCase().includes(q));

    return [...list].sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.fullName.localeCompare(b.fullName, 'pt');
        case 'level':
          return LEVEL_ORDER[a.level ?? 'all'] - LEVEL_ORDER[b.level ?? 'all'] || (a.rankingPosition ?? Infinity) - (b.rankingPosition ?? Infinity);
        case 'ranking':
        default:
          return (a.rankingPosition ?? Infinity) - (b.rankingPosition ?? Infinity);
      }
    });
  });

  protected readonly totalRegisteredLabel = computed(() => {
    const n = this.allAthletes().length;
    return `${n} carregado${n === 1 ? '' : 's'}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.queryDebounceHandle));

    effect(() => {
      const q = this.filterQuery();
      void this.reload(q);
    });
  }

  private async reload(term: string): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId) {
      this.allAthletes.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      if (this.rankPositionById.size === 0) {
        const ranking = await fetchAthleteRankingGeneral(db, projectId);
        ranking.forEach((r, i) => this.rankPositionById.set(r.id, i + 1));
      }

      if (term.trim()) {
        const profiles = await searchAthleteDirectory(db, term);
        this.allAthletes.set(profiles.map((p) => entryFromProfile(p, this.rankPositionById.get(p.id) ?? null)));
        this.hasMore.set(false);
        this.nextCursor = null;
      } else {
        const page = await fetchAthleteDirectoryPage(db, null);
        this.allAthletes.set(page.profiles.map((p) => entryFromProfile(p, this.rankPositionById.get(p.id) ?? null)));
        this.nextCursor = page.nextCursor;
        this.hasMore.set(page.nextCursor != null);
      }
    } catch {
      this.allAthletes.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    const db = this.firestore;
    if (!db || !this.nextCursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    try {
      const page = await fetchAthleteDirectoryPage(db, this.nextCursor);
      this.allAthletes.update((current) => [
        ...current,
        ...page.profiles.map((p) => entryFromProfile(p, this.rankPositionById.get(p.id) ?? null)),
      ]);
      this.nextCursor = page.nextCursor;
      this.hasMore.set(page.nextCursor != null);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected focusSearch(event: Event): void {
    event.preventDefault();
    this.searchInputRef()?.nativeElement.focus();
  }

  protected onQueryInput(value: string): void {
    this.queryInput.set(value);
    clearTimeout(this.queryDebounceHandle);
    this.queryDebounceHandle = setTimeout(() => this.filterQuery.set(value), 250);
  }

  protected setSport(chip: string): void {
    this.sportFilter.set(chip as ArenaSportChip);
  }

  protected setLevel(level: string): void {
    this.levelFilter.set(level as FilterLevel);
  }

  protected setCity(city: string): void {
    this.cityFilter.set(city);
  }

  protected setSortBy(value: string): void {
    this.sortBy.set(value as SortBy);
  }

  protected sportLabel(chip: ArenaSportChip): string {
    return this.sportOptions.find((o) => o.chip === chip)?.label ?? chip;
  }

  protected sportShortLabel(chip: ArenaSportChip): string {
    return SPORT_SHORT_LABEL[chip] ?? chip;
  }

  protected levelLabel(level: FilterLevel): string {
    return level === 'all' ? 'Nível: Todos' : level;
  }

  protected cityLabel(city: string): string {
    return city === CITY_ALL ? 'Todas as cidades' : city;
  }

  protected sortLabel(value: SortBy): string {
    return `Ordenar: ${this.sortOptions.find((o) => o.value === value)?.label ?? value}`;
  }

  protected readonly athleteInitials = initialsOf;
}

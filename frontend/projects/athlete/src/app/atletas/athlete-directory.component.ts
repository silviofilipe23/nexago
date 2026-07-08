import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ARENA_SPORT_CHIP_OPTIONS, type ArenaSportChip } from '@nexago/arena-discovery';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import type { FilterLevel } from '../ranking/athlete-ranking.models';
import { MOCK_ATHLETE_DIRECTORY } from './athlete-directory.mock';
import type { AthleteDirectoryEntry } from './athlete-directory.models';

export type SortBy = 'ranking' | 'name' | 'level';

const LEVEL_OPTIONS: readonly FilterLevel[] = ['all', 'Iniciante', 'Intermediário', 'Avançado', 'Profissional'];
const LEVEL_ORDER: Record<FilterLevel, number> = {
  all: -1,
  Profissional: 0,
  Avançado: 1,
  Intermediário: 2,
  Iniciante: 3,
};
const CITY_ALL = 'all';

const DISTANCE_OPTIONS: readonly { km: number; label: string }[] = [
  { km: 10, label: 'Até 10 km' },
  { km: 25, label: 'Até 25 km' },
  { km: 50, label: 'Até 50 km' },
  { km: Infinity, label: 'Qualquer distância' },
];

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

@Component({
  selector: 'app-athlete-directory',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
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
  protected readonly distanceOptions = DISTANCE_OPTIONS;
  protected readonly sortOptions = SORT_OPTIONS;

  protected readonly sportFilter = signal<ArenaSportChip>('beachVolleyball');
  protected readonly levelFilter = signal<FilterLevel>('all');
  protected readonly cityFilter = signal<string>(CITY_ALL);
  protected readonly distanceFilter = signal<number>(Infinity);
  protected readonly sortBy = signal<SortBy>('ranking');

  protected readonly allAthletes = signal<readonly AthleteDirectoryEntry[]>(MOCK_ATHLETE_DIRECTORY);
  protected readonly followedIds = signal<ReadonlySet<string>>(new Set());

  protected readonly cityOptions = computed(() => {
    const cities = [...new Set(this.allAthletes().map((a) => a.city))].sort((a, b) => a.localeCompare(b));
    return [CITY_ALL, ...cities];
  });

  protected readonly suggested = computed(() => {
    const q = this.filterQuery().trim().toLowerCase();
    return this.allAthletes()
      .filter((a) => a.suggestionReason != null)
      .filter((a) => !q || a.fullName.toLowerCase().includes(q));
  });

  protected readonly filteredOthers = computed(() => {
    const sport = this.sportFilter();
    const level = this.levelFilter();
    const city = this.cityFilter();
    const maxKm = this.distanceFilter();
    const q = this.filterQuery().trim().toLowerCase();
    const sort = this.sortBy();

    const list = this.allAthletes()
      .filter((a) => a.suggestionReason == null)
      .filter((a) => a.sport === sport)
      .filter((a) => level === 'all' || a.level === level)
      .filter((a) => city === CITY_ALL || a.city === city)
      .filter((a) => a.distanceKm <= maxKm)
      .filter((a) => !q || a.fullName.toLowerCase().includes(q));

    return [...list].sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.fullName.localeCompare(b.fullName, 'pt');
        case 'level':
          return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.rankingPosition - b.rankingPosition;
        case 'ranking':
        default:
          return a.rankingPosition - b.rankingPosition;
      }
    });
  });

  protected readonly totalRegisteredLabel = computed(() => {
    const n = this.allAthletes().length;
    return `${n} cadastrado${n === 1 ? '' : 's'}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.queryDebounceHandle));
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

  protected setDistance(km: string): void {
    this.distanceFilter.set(Number(km));
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

  protected distanceLabel(km: number): string {
    return this.distanceOptions.find((o) => o.km === km)?.label ?? `Até ${km} km`;
  }

  protected sortLabel(value: SortBy): string {
    return `Ordenar: ${this.sortOptions.find((o) => o.value === value)?.label ?? value}`;
  }

  protected isFollowed(id: string): boolean {
    return this.followedIds().has(id);
  }

  protected toggleFollow(id: string): void {
    this.followedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected readonly athleteInitials = initialsOf;
}

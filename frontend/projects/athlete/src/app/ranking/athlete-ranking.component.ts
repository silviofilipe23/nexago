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
import {
  MOCK_RANKING_DOUBLES,
  MOCK_RANKING_INDIVIDUAL,
  MOCK_SELF_DOUBLES,
  MOCK_SELF_INDIVIDUAL,
  RANKING_SCORING_RULES,
} from './athlete-ranking.mock';
import type { FilterLevel, RankingMode, RankingParticipant } from './athlete-ranking.models';

export interface RankingRow extends RankingParticipant {
  rank: number;
}

const LEVEL_OPTIONS: readonly FilterLevel[] = ['all', 'Iniciante', 'Intermediário', 'Avançado', 'Profissional'];
const CITY_ALL = 'all';

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

function trendTone(trend: number): 'up' | 'down' | 'neutral' {
  if (trend > 0) return 'up';
  if (trend < 0) return 'down';
  return 'neutral';
}

@Component({
  selector: 'app-athlete-ranking',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './athlete-ranking.component.html',
  styleUrl: './athlete-ranking.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.meta.k)': 'focusSearch($event)',
    '(document:keydown.control.k)': 'focusSearch($event)',
  },
})
export class AthleteRankingComponent {
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

  protected readonly mode = signal<RankingMode>('individual');

  protected readonly queryInput = signal('');
  protected readonly filterQuery = signal('');
  protected readonly sportFilter = signal<ArenaSportChip>('beachVolleyball');
  protected readonly levelFilter = signal<FilterLevel>('all');
  protected readonly cityFilter = signal<string>(CITY_ALL);

  private queryDebounceHandle: ReturnType<typeof setTimeout> | undefined;

  protected readonly sportOptions = ARENA_SPORT_CHIP_OPTIONS.filter((o) => o.chip !== 'all');
  protected readonly levelOptions = LEVEL_OPTIONS;

  protected readonly allParticipants = computed<readonly RankingParticipant[]>(() =>
    this.mode() === 'individual' ? MOCK_RANKING_INDIVIDUAL : MOCK_RANKING_DOUBLES,
  );

  protected readonly selfEntry = computed(() =>
    this.mode() === 'individual' ? MOCK_SELF_INDIVIDUAL : MOCK_SELF_DOUBLES,
  );

  protected readonly cityOptions = computed(() => {
    const cities = [...new Set(this.allParticipants().map((p) => p.city))].sort((a, b) => a.localeCompare(b));
    return [CITY_ALL, ...cities];
  });

  protected readonly rankedList = computed<RankingRow[]>(() => {
    const sport = this.sportFilter();
    const level = this.levelFilter();
    const city = this.cityFilter();
    const q = this.filterQuery().trim().toLowerCase();

    return this.allParticipants()
      .filter((p) => p.sport === sport)
      .filter((p) => level === 'all' || p.level === level)
      .filter((p) => city === CITY_ALL || p.city === city)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.city.toLowerCase().includes(q))
      .sort((a, b) => b.points - a.points)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  });

  protected readonly podium = computed(() => this.rankedList().slice(0, 3));
  protected readonly restList = computed(() => this.rankedList().slice(3));
  protected readonly totalCount = computed(() => this.rankedList().length);
  protected readonly topLabel = computed(() => `Top ${this.totalCount()} da região`);
  protected readonly modeLabel = computed(() => (this.mode() === 'individual' ? 'Ranking individual' : 'Ranking de duplas'));

  protected readonly scoringRules = RANKING_SCORING_RULES;

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

  protected setMode(mode: RankingMode): void {
    this.mode.set(mode);
    this.cityFilter.set(CITY_ALL);
  }

  protected isMode(mode: RankingMode): boolean {
    return this.mode() === mode;
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

  protected sportLabel(chip: ArenaSportChip): string {
    return this.sportOptions.find((o) => o.chip === chip)?.label ?? chip;
  }

  protected levelLabel(level: FilterLevel): string {
    return level === 'all' ? 'Todas categorias' : level;
  }

  protected cityLabel(city: string): string {
    return city === CITY_ALL ? 'Todas as cidades' : city;
  }

  protected readonly trendTone = trendTone;
  protected readonly absTrend = Math.abs;
  protected readonly rowInitials = initialsOf;
}

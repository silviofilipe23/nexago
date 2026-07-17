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
import { ARENA_SPORT_CHIP_OPTIONS, sportFirestoreIdFromChip, type ArenaSportChip } from '@nexago/arena-discovery';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import { AtBellComponent } from '../painel/at-bell.component';
import { fetchAthleteDirectoryPage, levelBucketOf, searchAthleteDirectory, type AthletePublicProfile } from '../data/public-profiles-repository';
import { fetchAthleteRankingGeneral } from '../data/rankings-repository';
import type { FilterLevel } from '../ranking/athlete-ranking.models';
import type { AthleteDirectoryEntry } from './athlete-directory.models';

export type SortBy = 'ranking' | 'name' | 'level';

const LEVEL_OPTIONS: readonly FilterLevel[] = ['all', 'Iniciante 1', 'Iniciante 2', 'Intermediário 1', 'Intermediário 2', 'Open'];
const LEVEL_ORDER: Record<FilterLevel, number> = { all: -1, 'Open': 0, 'Intermediário 2': 1, 'Intermediário 1': 2, 'Iniciante 2': 3, 'Iniciante 1': 4 };
const CITY_ALL = 'all';

const SORT_OPTIONS: readonly { value: SortBy; label: string }[] = [
  { value: 'ranking', label: 'Ranking' },
  { value: 'name', label: 'Nome' },
  { value: 'level', label: 'Nível' },
];

/** Tamanho de página Firestore (espelha `AthleteDiscoverRepository.pageSize`). */
const PAGE_TARGET = 30;
/** Teto de páginas por reload quando refina nível/cidade no client (custo: ≤150 leituras). */
const MAX_REFINE_PAGES = 5;

const SPORT_SHORT_LABEL: Partial<Record<ArenaSportChip, string>> = {
  beachVolleyball: 'Vôlei de praia',
  beachTennis: 'Beach tênis',
  tennis: 'Tênis',
  padel: 'Padel',
  volleyball: 'Vôlei de quadra',
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
    nickname: profile.nickname,
    fullName: profile.displayName,
    city: profile.city ?? '',
    sport: profile.sportChip,
    level: levelBucketOf(profile.levelCode),
    rankingPosition: rank,
    avatarUrl: profile.avatarUrl,
  };
}

/** Diretório de atletas: pré-filtra esporte no Firestore (`discoverSportIds`, mesmo índice do
 *  app) e busca textual via `keywords`. Nível/cidade não têm índice — refinados no client após
 *  o fetch (com paginação extra limitada). Ordenação só no client. */
@Component({
  selector: 'app-athlete-directory',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, AtBellComponent, NxPageLoadingComponent, NxSpinnerComponent],
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
  /** Descarta respostas atrasadas quando o usuário troca de filtro rápido. */
  private reloadGeneration = 0;

  protected readonly cityOptions = computed(() => {
    const cities = [...new Set(this.allAthletes().map((a) => a.city).filter((c) => c.length > 0))].sort((a, b) => a.localeCompare(b));
    return [CITY_ALL, ...cities];
  });

  protected readonly filteredOthers = computed(() => {
    const sport = this.sportFilter();
    const level = this.levelFilter();
    const city = this.cityFilter();
    const sort = this.sortBy();
    // Esporte já veio pré-filtrado do Firestore quando há código canônico; mantém o filtro
    // local como rede de segurança (padel / perfis sem discoverSportIds / busca por keywords).
    const list = this.allAthletes()
      .filter((a) => a.sport === sport)
      .filter((a) => level === 'all' || a.level === level)
      .filter((a) => city === CITY_ALL || a.city === city);

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
    const n = this.filteredOthers().length;
    const loaded = this.allAthletes().length;
    if (n === loaded) return `${n} atleta${n === 1 ? '' : 's'}`;
    return `${n} de ${loaded} carregado${loaded === 1 ? '' : 's'}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.queryDebounceHandle));

    // Qualquer mudança de filtro (texto, esporte, nível, cidade) dispara nova busca no backend.
    // Ordenação continua só no client (não há índice equivalente).
    effect(() => {
      const term = this.filterQuery();
      const sport = this.sportFilter();
      this.levelFilter();
      this.cityFilter();
      void this.reload(term, sport);
    });
  }

  private sportFirestoreIdOf(sport: ArenaSportChip): string | null {
    return sportFirestoreIdFromChip(sport);
  }

  private async reload(term: string, sport: ArenaSportChip): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    const gen = ++this.reloadGeneration;
    const level = this.levelFilter();
    const city = this.cityFilter();

    if (!db || !projectId) {
      this.allAthletes.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.nextCursor = null;
    this.hasMore.set(false);
    try {
      if (this.rankPositionById.size === 0) {
        const ranking = await fetchAthleteRankingGeneral(db, projectId);
        if (gen !== this.reloadGeneration) return;
        ranking.forEach((r, i) => this.rankPositionById.set(r.id, i + 1));
      }

      const sportFirestoreId = this.sportFirestoreIdOf(sport);

      if (term.trim()) {
        const profiles = await searchAthleteDirectory(db, term);
        if (gen !== this.reloadGeneration) return;
        this.allAthletes.set(profiles.map((p) => entryFromProfile(p, this.rankPositionById.get(p.id) ?? null)));
        this.hasMore.set(false);
        this.nextCursor = null;
      } else {
        // Nível/cidade não têm índice — pré-filtra esporte no Firestore e pagina até ter
        // resultados úteis após o refino local (teto MAX_REFINE_PAGES).
        const wantClientRefine = level !== 'all' || city !== CITY_ALL;
        const maxPages = wantClientRefine ? MAX_REFINE_PAGES : 1;
        const collected: AthleteDirectoryEntry[] = [];
        let cursor: string | null = null;
        let pages = 0;
        let next: string | null = null;

        while (pages < maxPages) {
          const page = await fetchAthleteDirectoryPage(db, { sportFirestoreId, cursor });
          if (gen !== this.reloadGeneration) return;
          pages += 1;
          collected.push(...page.profiles.map((p) => entryFromProfile(p, this.rankPositionById.get(p.id) ?? null)));
          next = page.nextCursor;
          cursor = page.nextCursor;
          if (!page.nextCursor) break;
          if (!wantClientRefine) break;
          const matching = collected.filter(
            (a) => a.sport === sport && (level === 'all' || a.level === level) && (city === CITY_ALL || a.city === city),
          ).length;
          if (matching >= PAGE_TARGET) break;
        }

        if (gen !== this.reloadGeneration) return;
        this.allAthletes.set(collected);
        this.nextCursor = next;
        this.hasMore.set(next != null);
      }
    } catch {
      if (gen !== this.reloadGeneration) return;
      this.allAthletes.set([]);
      this.hasMore.set(false);
      this.nextCursor = null;
    } finally {
      if (gen === this.reloadGeneration) this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    const db = this.firestore;
    if (!db || !this.nextCursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    try {
      const sportFirestoreId = this.sportFirestoreIdOf(this.sportFilter());
      const page = await fetchAthleteDirectoryPage(db, { sportFirestoreId, cursor: this.nextCursor });
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

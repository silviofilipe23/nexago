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
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { RANKING_SCORING_RULES } from './athlete-ranking.mock';
import type { RankingGenderFilter, RankingLevelFilter, RankingMode, RankingRow } from './athlete-ranking.models';
import {
  LEVEL_RANK_OPTIONS,
  buildAthleteRankingRows,
  buildTeamRankingRows,
  filterBySearch,
  levelLabelForRank,
  podiumRows,
  restRows,
  yearOptions,
  type RankingProfileLite,
  type RankingTeamLite,
  type RawPointsRow,
} from './ranking-logic';
import {
  fetchAthleteRankingByYear,
  fetchAthleteRankingGeneral,
  fetchPublicProfiles,
  fetchTeamRankingByYear,
  fetchTeamRankingGeneral,
  fetchTeamsByIds,
} from './ranking-repository';

interface FilterOption<T> {
  value: T;
  label: string;
}

const GENDER_OPTIONS: readonly FilterOption<RankingGenderFilter>[] = [
  { value: 'all', label: 'Todos' },
  { value: 'male', label: 'Masculino' },
  { value: 'female', label: 'Feminino' },
  { value: 'mixed', label: 'Misto' },
];

const LEVEL_OPTIONS: readonly FilterOption<RankingLevelFilter>[] = [
  { value: null, label: 'Todos os níveis' },
  ...LEVEL_RANK_OPTIONS.map((rank) => ({ value: rank, label: levelLabelForRank(rank) })),
];

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

function initialsOfName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AT';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Tela Ranking do portal do atleta: ranking real por pontos de torneio (`tournamentCategoryResults`
 *  + agregados `athleteRankings`/`teamRankings`), sem recorte por esporte — espelha
 *  `athlete_ranking_page.dart`. Sem Cloud Function nova, todas as coleções já são `allow read: if true`. */
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

  private readonly currentYear = new Date().getFullYear();

  protected readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });
  protected readonly headerInitials = computed(() => initialsOfName(this.accountLabel()));
  protected readonly currentUid = computed(() => this.auth.user()?.uid ?? null);

  protected readonly mode = signal<RankingMode>('individual');
  protected readonly yearFilter = signal<number | null>(this.currentYear);
  protected readonly genderFilter = signal<RankingGenderFilter>('all');
  protected readonly levelFilter = signal<RankingLevelFilter>(null);

  protected readonly queryInput = signal('');
  protected readonly filterQuery = signal('');
  private queryDebounceHandle: ReturnType<typeof setTimeout> | undefined;

  protected readonly yearOptions = [null, ...yearOptions(this.currentYear)];
  protected readonly genderOptions = GENDER_OPTIONS;
  protected readonly levelOptions = LEVEL_OPTIONS;
  protected readonly scoringRules = RANKING_SCORING_RULES;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly athleteRaw = signal<RawPointsRow[]>([]);
  private readonly athleteProfiles = signal<ReadonlyMap<string, RankingProfileLite>>(new Map());
  private readonly teamRaw = signal<RawPointsRow[]>([]);
  private readonly teamRefs = signal<ReadonlyMap<string, RankingTeamLite>>(new Map());
  private readonly teamProfiles = signal<ReadonlyMap<string, RankingProfileLite>>(new Map());

  protected readonly allRows = computed<RankingRow[]>(() =>
    this.mode() === 'individual'
      ? buildAthleteRankingRows(this.athleteRaw(), this.athleteProfiles(), this.genderFilter(), this.levelFilter(), this.currentUid())
      : buildTeamRankingRows(this.teamRaw(), this.teamRefs(), this.teamProfiles(), this.genderFilter(), this.levelFilter(), this.currentUid()),
  );

  /** Não é afetado pela busca por nome — a busca é pra achar outra pessoa, não pra esconder o
   *  próprio cartão de posição (pequena escolha deliberada vs. o app, que aplica busca antes). */
  protected readonly selfEntry = computed(() => this.allRows().find((r) => r.isCurrentUser) ?? null);

  protected readonly searchedRows = computed(() => filterBySearch(this.allRows(), this.filterQuery()));
  protected readonly podium = computed(() => podiumRows(this.searchedRows()));
  protected readonly restList = computed(() => restRows(this.searchedRows()));
  protected readonly totalCount = computed(() => this.searchedRows().length);
  protected readonly modeLabel = computed(() => (this.mode() === 'individual' ? 'Ranking individual' : 'Ranking de duplas'));
  protected readonly periodLabel = computed(() => (this.yearFilter() == null ? 'Geral · soma total' : `Temporada ${this.yearFilter()} · melhores 5`));

  constructor() {
    effect(() => {
      const mode = this.mode();
      const year = this.yearFilter();
      void this.loadRanking(mode, year);
    });
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
  }

  protected isMode(mode: RankingMode): boolean {
    return this.mode() === mode;
  }

  protected setYear(value: string): void {
    this.yearFilter.set(value === 'geral' ? null : Number(value));
  }

  protected setGender(value: string): void {
    this.genderFilter.set(value as RankingGenderFilter);
  }

  protected setLevel(value: string): void {
    this.levelFilter.set(value === 'all' ? null : Number(value));
  }

  protected yearOptionValue(year: number | null): string {
    return year == null ? 'geral' : String(year);
  }

  protected yearOptionLabel(year: number | null): string {
    return year == null ? 'Geral' : String(year);
  }

  protected levelOptionValue(level: RankingLevelFilter): string {
    return level == null ? 'all' : String(level);
  }

  protected levelOptionLabel(): string {
    return this.levelOptions.find((o) => o.value === this.levelFilter())?.label ?? 'Todos os níveis';
  }

  protected genderOptionLabel(): string {
    return this.genderOptions.find((o) => o.value === this.genderFilter())?.label ?? 'Todos';
  }

  protected retry(): void {
    void this.loadRanking(this.mode(), this.yearFilter());
  }

  private async loadRanking(mode: RankingMode, year: number | null): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const db = createFirestore();
      const projectId = environment.firebase.projectId;
      if (!db || !projectId) throw new Error('Firebase não configurado');

      if (mode === 'individual') {
        const raw = year == null ? await fetchAthleteRankingGeneral(db, projectId) : await fetchAthleteRankingByYear(db, projectId, year);
        const profiles = await fetchPublicProfiles(
          db,
          raw.map((r) => r.entityId),
        );
        this.athleteRaw.set(raw);
        this.athleteProfiles.set(profiles);
      } else {
        const raw = year == null ? await fetchTeamRankingGeneral(db, projectId) : await fetchTeamRankingByYear(db, projectId, year);
        const teams = await fetchTeamsByIds(
          db,
          projectId,
          raw.map((r) => r.entityId),
        );
        const athleteIds = [...teams.values()].flatMap((t) => [t.player1Id, t.player2Id]).filter((id): id is string => id != null);
        const profiles = await fetchPublicProfiles(db, athleteIds);
        this.teamRaw.set(raw);
        this.teamRefs.set(teams);
        this.teamProfiles.set(profiles);
      }
    } catch {
      this.errorMessage.set('Não foi possível carregar o ranking.');
    } finally {
      this.loading.set(false);
    }
  }
}

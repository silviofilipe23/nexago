import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import type { TeamCard, TeamGenderFilter, TeamLevelFilter } from './athlete-equipes.models';
import {
  LEVEL_RANK_OPTIONS,
  displayNameFrom,
  filterBySearch,
  initialsFrom,
  levelLabelForRank,
  levelRankFromLabel,
  matchesGenderFilter,
  normalizeTeamGender,
  teamDisplayName,
  teamInitials,
} from './teams-logic';
import { fetchMyTeams, fetchPublicProfilesLite, fetchTeamRankings, fetchTeamsPage, type TeamProfileLite, type TeamRaw } from './teams-repository';

interface FilterOption<T> {
  value: T;
  label: string;
}

const GENDER_OPTIONS: readonly FilterOption<TeamGenderFilter>[] = [
  { value: 'all', label: 'Todos' },
  { value: 'male', label: 'Masculino' },
  { value: 'female', label: 'Feminino' },
  { value: 'mixed', label: 'Misto' },
];

const LEVEL_OPTIONS: readonly FilterOption<TeamLevelFilter>[] = [
  { value: null, label: 'Todos os níveis' },
  ...LEVEL_RANK_OPTIONS.map((rank) => ({ value: rank, label: levelLabelForRank(rank) })),
];

const CITY_ALL = 'all';
const DISCOVER_PAGE_SIZE = 60;

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

/** Tela Equipes do portal do atleta: "Minhas equipes" e "Descobrir equipes" com dados reais
 *  (`teams`/`teamRankings`/`public_profiles`), espelhando `team_discover_page.dart`. "Buscar
 *  parceiro" e o envio/aceite de convite de dupla ficam fora do escopo desta tela — no app
 *  real isso é uma sub-etapa da inscrição em torneio (`tournamentRegistrationInvites`, escrita
 *  só via Cloud Function), não uma ação isolada daqui; ver spec/memória da sessão. */
@Component({
  selector: 'app-athlete-equipes',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './athlete-equipes.component.html',
  styleUrl: './athlete-equipes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.meta.k)': 'focusSearch($event)',
    '(document:keydown.control.k)': 'focusSearch($event)',
  },
})
export class AthleteEquipesComponent {
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
  protected readonly headerInitials = computed(() => initialsOfName(this.accountLabel()));
  protected readonly currentUid = computed(() => this.auth.user()?.uid ?? null);

  protected readonly queryInput = signal('');
  protected readonly filterQuery = signal('');
  private queryDebounceHandle: ReturnType<typeof setTimeout> | undefined;

  protected readonly genderFilter = signal<TeamGenderFilter>('all');
  protected readonly levelFilter = signal<TeamLevelFilter>(null);
  protected readonly cityFilter = signal<string>(CITY_ALL);

  protected readonly genderOptions = GENDER_OPTIONS;
  protected readonly levelOptions = LEVEL_OPTIONS;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly myTeamsRaw = signal<TeamRaw[]>([]);
  private readonly discoverTeamsRaw = signal<TeamRaw[]>([]);
  private readonly rankingsByTeam = signal<ReadonlyMap<string, { points: number; tournamentsCount: number }>>(new Map());
  private readonly profiles = signal<ReadonlyMap<string, TeamProfileLite>>(new Map());

  private buildCard(team: TeamRaw, isMine: boolean): TeamCard {
    const p1 = team.player1Id ? this.profiles().get(team.player1Id) : undefined;
    const p2 = team.player2Id ? this.profiles().get(team.player2Id) : undefined;
    const ranking = this.rankingsByTeam().get(team.teamId);
    return {
      teamId: team.teamId,
      displayName: teamDisplayName(team.teamName, p1?.fullName, p2?.fullName),
      player1Name: displayNameFrom(p1?.fullName, team.player1Id ?? ''),
      player2Name: displayNameFrom(p2?.fullName, team.player2Id ?? ''),
      player1Initials: team.player1Id ? initialsFrom(p1?.fullName, team.player1Id) : '--',
      player2Initials: team.player2Id ? initialsFrom(p2?.fullName, team.player2Id) : '--',
      city: p1?.city ?? p2?.city ?? null,
      points: ranking?.points ?? 0,
      tournamentsCount: ranking?.tournamentsCount ?? 0,
      isMine,
    };
  }

  private teamLevelRank(team: TeamRaw): number | null {
    const athleteRank = (uid: string | null): number | null => {
      const profile = uid ? this.profiles().get(uid) : undefined;
      const sportId = profile?.primarySportId;
      if (!sportId) return null;
      return levelRankFromLabel(profile?.levelsBySport?.[sportId] ?? null);
    };
    const r1 = athleteRank(team.player1Id);
    const r2 = athleteRank(team.player2Id);
    if (r1 == null) return r2;
    if (r2 == null) return r1;
    return Math.max(r1, r2);
  }

  protected readonly myTeamCards = computed(() => this.myTeamsRaw().map((t) => this.buildCard(t, true)));
  protected readonly filteredMyTeams = computed(() => filterBySearch(this.myTeamCards(), this.filterQuery()));
  protected readonly myTeamsCountLabel = computed(() => {
    const n = this.filteredMyTeams().length;
    return `${n} equipe${n === 1 ? '' : 's'}`;
  });

  protected readonly cityOptions = computed(() => {
    const cities = [...new Set(this.discoverTeamsRaw().flatMap((t) => [t.player1Id, t.player2Id]).map((uid) => (uid ? this.profiles().get(uid)?.city : null)).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'pt'));
    return [CITY_ALL, ...cities];
  });

  protected readonly filteredDiscoverTeams = computed(() => {
    const myIds = new Set(this.myTeamsRaw().map((t) => t.teamId));
    const gender = this.genderFilter();
    const level = this.levelFilter();
    const city = this.cityFilter();

    const filtered = this.discoverTeamsRaw()
      .filter((t) => !myIds.has(t.teamId))
      .filter((t) => matchesGenderFilter(gender, normalizeTeamGender(t.gender)))
      .filter((t) => level == null || this.teamLevelRank(t) === level)
      .map((t) => this.buildCard(t, false))
      .filter((c) => city === CITY_ALL || c.city === city);

    return filterBySearch(filtered, this.filterQuery());
  });
  protected readonly discoverTeamsCountLabel = computed(() => {
    const n = this.filteredDiscoverTeams().length;
    return `${n} equipe${n === 1 ? '' : 's'} na região`;
  });

  constructor() {
    effect(() => {
      const uid = this.currentUid();
      void this.load(uid);
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

  protected setGender(value: string): void {
    this.genderFilter.set(value as TeamGenderFilter);
  }

  protected setLevel(value: string): void {
    this.levelFilter.set(value === 'all' ? null : Number(value));
  }

  protected setCity(value: string): void {
    this.cityFilter.set(value);
  }

  protected levelOptionValue(level: TeamLevelFilter): string {
    return level == null ? 'all' : String(level);
  }

  protected levelOptionLabel(): string {
    return this.levelOptions.find((o) => o.value === this.levelFilter())?.label ?? 'Todos os níveis';
  }

  protected genderOptionLabel(): string {
    return this.genderOptions.find((o) => o.value === this.genderFilter())?.label ?? 'Todos';
  }

  protected cityLabel(city: string): string {
    return city === CITY_ALL ? 'Todas as cidades' : city;
  }

  protected retry(): void {
    void this.load(this.currentUid());
  }

  private async load(uid: string | null): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const db = createFirestore();
      const projectId = environment.firebase.projectId;
      if (!db || !projectId) throw new Error('Firebase não configurado');

      const [myTeams, discoverTeams] = await Promise.all([
        uid ? fetchMyTeams(db, projectId, uid) : Promise.resolve([]),
        fetchTeamsPage(db, projectId, DISCOVER_PAGE_SIZE),
      ]);

      const allTeams = new Map<string, TeamRaw>();
      for (const t of [...myTeams, ...discoverTeams]) allTeams.set(t.teamId, t);
      const teamIds = [...allTeams.keys()];
      const athleteIds = [...allTeams.values()].flatMap((t) => [t.player1Id, t.player2Id]).filter((id): id is string => id != null);

      const [rankings, profiles] = await Promise.all([
        fetchTeamRankings(db, projectId, teamIds),
        fetchPublicProfilesLite(db, athleteIds),
      ]);

      this.myTeamsRaw.set(myTeams);
      this.discoverTeamsRaw.set(discoverTeams);
      this.rankingsByTeam.set(rankings);
      this.profiles.set(profiles);
    } catch {
      this.errorMessage.set('Não foi possível carregar as equipes.');
    } finally {
      this.loading.set(false);
    }
  }
}

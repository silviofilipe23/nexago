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
import { MOCK_DISCOVER_TEAMS, MOCK_MY_TEAMS, MOCK_PARTNER_CANDIDATES } from './athlete-equipes.mock';
import type { DiscoverTeam, FilterAvailability, MyTeam, PartnerCandidate } from './athlete-equipes.models';

const LEVEL_OPTIONS: readonly FilterLevel[] = ['all', 'Iniciante', 'Intermediário', 'Avançado', 'Profissional'];
const CITY_ALL = 'all';

const DISTANCE_OPTIONS: readonly { km: number; label: string }[] = [
  { km: 5, label: 'Até 5 km' },
  { km: 10, label: 'Até 10 km' },
  { km: 25, label: 'Até 25 km' },
  { km: 50, label: 'Até 50 km' },
  { km: Infinity, label: 'Qualquer distância' },
];

const AVAILABILITY_OPTIONS: readonly { tag: FilterAvailability; label: string }[] = [
  { tag: 'all', label: 'Qualquer horário' },
  { tag: 'morning', label: 'Manhã' },
  { tag: 'afternoon', label: 'Tarde' },
  { tag: 'night', label: 'Noite' },
  { tag: 'weekend', label: 'Fins de semana' },
  { tag: 'flexible', label: 'Flexível' },
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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AT';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

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
  protected readonly headerInitials = computed(() => initialsOf(this.accountLabel()));

  protected readonly queryInput = signal('');
  protected readonly filterQuery = signal('');
  private queryDebounceHandle: ReturnType<typeof setTimeout> | undefined;

  protected readonly myTeams = signal<MyTeam[]>([...MOCK_MY_TEAMS]);
  protected readonly discoverTeams = signal<readonly DiscoverTeam[]>(MOCK_DISCOVER_TEAMS);
  protected readonly partnerCandidates = signal<readonly PartnerCandidate[]>(MOCK_PARTNER_CANDIDATES);
  protected readonly invitedPartnerIds = signal<ReadonlySet<string>>(new Set());

  protected readonly eventNotice = signal<string | null>(null);
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly sportOptions = ARENA_SPORT_CHIP_OPTIONS.filter((o) => o.chip !== 'all');
  protected readonly levelOptions = LEVEL_OPTIONS;
  protected readonly distanceOptions = DISTANCE_OPTIONS;
  protected readonly availabilityOptions = AVAILABILITY_OPTIONS;

  protected readonly teamSportFilter = signal<ArenaSportChip>('beachVolleyball');
  protected readonly teamLevelFilter = signal<FilterLevel>('all');
  protected readonly teamCityFilter = signal<string>(CITY_ALL);

  protected readonly partnerSportFilter = signal<ArenaSportChip>('beachVolleyball');
  protected readonly partnerLevelFilter = signal<FilterLevel>('all');
  protected readonly partnerDistanceFilter = signal<number>(Infinity);
  protected readonly partnerAvailabilityFilter = signal<FilterAvailability>('all');

  protected readonly cityOptions = computed(() => {
    const cities = [...new Set(this.discoverTeams().map((t) => t.city))].sort((a, b) => a.localeCompare(b));
    return [CITY_ALL, ...cities];
  });

  protected readonly filteredMyTeams = computed(() => {
    const q = this.filterQuery().trim().toLowerCase();
    return this.myTeams().filter((t) => !q || t.name.toLowerCase().includes(q));
  });

  protected readonly filteredDiscoverTeams = computed(() => {
    const sport = this.teamSportFilter();
    const level = this.teamLevelFilter();
    const city = this.teamCityFilter();
    const q = this.filterQuery().trim().toLowerCase();

    return this.discoverTeams()
      .filter((t) => t.sport === sport)
      .filter((t) => level === 'all' || t.level === level)
      .filter((t) => city === CITY_ALL || t.city === city)
      .filter((t) => !q || t.name.toLowerCase().includes(q));
  });

  protected readonly filteredPartners = computed(() => {
    const sport = this.partnerSportFilter();
    const level = this.partnerLevelFilter();
    const maxKm = this.partnerDistanceFilter();
    const availability = this.partnerAvailabilityFilter();
    const q = this.filterQuery().trim().toLowerCase();

    return this.partnerCandidates()
      .filter((p) => p.sport === sport)
      .filter((p) => level === 'all' || p.level === level)
      .filter((p) => p.distanceKm <= maxKm)
      .filter((p) => availability === 'all' || p.availabilityTag === availability)
      .filter((p) => !q || p.name.toLowerCase().includes(q));
  });

  protected readonly myTeamsCountLabel = computed(() => {
    const n = this.filteredMyTeams().length;
    return `${n} equipe${n === 1 ? '' : 's'}`;
  });

  protected readonly discoverTeamsCountLabel = computed(() => {
    const n = this.filteredDiscoverTeams().length;
    return `${n} equipe${n === 1 ? '' : 's'} na região`;
  });

  protected readonly partnersCountLabel = computed(() => {
    const n = this.filteredPartners().length;
    return `${n} atleta${n === 1 ? '' : 's'} próximo${n === 1 ? '' : 's'}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.queryDebounceHandle);
      clearTimeout(this.noticeTimeout);
    });
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

  protected setTeamSport(chip: string): void {
    this.teamSportFilter.set(chip as ArenaSportChip);
  }

  protected setTeamLevel(level: string): void {
    this.teamLevelFilter.set(level as FilterLevel);
  }

  protected setTeamCity(city: string): void {
    this.teamCityFilter.set(city);
  }

  protected setPartnerSport(chip: string): void {
    this.partnerSportFilter.set(chip as ArenaSportChip);
  }

  protected setPartnerLevel(level: string): void {
    this.partnerLevelFilter.set(level as FilterLevel);
  }

  protected setPartnerDistance(km: string): void {
    this.partnerDistanceFilter.set(Number(km));
  }

  protected setPartnerAvailability(tag: string): void {
    this.partnerAvailabilityFilter.set(tag as FilterAvailability);
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

  protected distanceLabel(km: number): string {
    return this.distanceOptions.find((o) => o.km === km)?.label ?? `Até ${km} km`;
  }

  protected availabilityLabel(tag: FilterAvailability): string {
    return this.availabilityOptions.find((o) => o.tag === tag)?.label ?? tag;
  }

  protected isInvited(id: string): boolean {
    return this.invitedPartnerIds().has(id);
  }

  protected invitePartner(candidate: PartnerCandidate): void {
    this.invitedPartnerIds.update((ids) => new Set(ids).add(candidate.id));
    this.showNotice(`Convite enviado para ${candidate.name}.`);
  }

  protected cancelInvite(team: MyTeam): void {
    this.myTeams.update((list) => list.filter((t) => t.id !== team.id));
    this.showNotice('Convite cancelado.');
  }

  protected challengeTeam(team: { name: string }): void {
    this.showNotice(`Desafio para ${team.name} chega em breve por aqui.`);
  }

  protected scrollToPartnerSearch(): void {
    document.getElementById('eq-partner-search')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private showNotice(message: string): void {
    this.eventNotice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.eventNotice.set(null), 4000);
  }
}

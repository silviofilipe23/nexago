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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { interval } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { AtBellComponent } from '../painel/at-bell.component';
import { fetchAllLeagues, type League } from '../data/leagues-repository';
import { fetchMyRegistrations } from '../data/tournament-registrations-repository';
import {
  fetchAllTournaments,
  fetchEnrolledCountsByTournament,
  registrationOpensAt,
  tournamentListingStatus,
  type TournamentSummary,
} from '../data/tournaments-repository';
import type {
  DiscoveryLeague,
  DiscoveryLeagueStage,
  DiscoveryTournament,
  FilterCategory,
  FilterFormat,
} from './tournament-discovery.models';
import { collectLeagueTournamentIds } from './tournament-league.helpers';
import { discoveryFillPercent, discoverySpotsOf } from './tournament-discovery.spots';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateLabelFrom(d: Date | null): string {
  if (!d) return 'Data a confirmar';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d);
}

/** `enrolled`: inscrições contadas em `inscriptions` — `null` quando a contagem não veio (aí o
 *  card cai nos contadores do doc; ver `tournament-discovery.spots.ts`). */
function discoveryTournamentFromSummary(
  s: TournamentSummary,
  myTournamentIds: ReadonlySet<string>,
  enrolled: number | null,
): DiscoveryTournament {
  const cheapestFee = s.categories.length > 0 ? Math.min(...s.categories.map((c) => c.entryFee)) : 0;
  const spots = discoverySpotsOf(s, enrolled);
  return {
    id: s.id,
    name: s.name,
    location: s.location,
    city: s.city,
    dateLabel: s.dateLabel ?? dateLabelFrom(s.startAt),
    startDate: s.startAt ?? new Date(0),
    categories: s.categories.length > 0 ? [...new Set(s.categories.map((c) => c.genderType))] : ['M'],
    format: s.format,
    priceLabel: formatBRL(cheapestFee),
    priceValue: cheapestFee,
    spotsLeft: spots.left,
    spotsTotal: spots.total,
    status: tournamentListingStatus(s),
    featured: s.featured,
    enrolledCount: spots.filled,
    liveMatchesNow: s.liveMatchesNow,
    enrolled: myTournamentIds.has(s.id),
    registrationOpensAt: registrationOpensAt(s),
    coverUrl: s.coverUrl,
    leagueId: s.leagueId ?? undefined,
    leagueStageId: s.leagueStageId ?? undefined,
  };
}

function discoveryLeagueFromLeague(l: League): DiscoveryLeague {
  return {
    id: l.id,
    name: l.name,
    seasonLabel: l.seasonLabel ?? undefined,
    city: l.city ?? undefined,
    coverUrl: l.coverUrl,
    stages: l.stages.map((s) => ({ id: s.id, name: s.name, order: s.order, dateLabel: s.dateLabel ?? undefined, tournamentIds: s.tournamentIds })),
  };
}

export type CompeteViewTab = 'all' | 'tournaments' | 'leagues';
export type CompeteBadgeTone = 'enrolled' | 'open' | 'upcoming' | 'live' | 'ended';

export interface CompeteBadge {
  label: string;
  tone: CompeteBadgeTone;
}

export interface CompeteStageView {
  stage: DiscoveryLeagueStage;
  state: 'done' | 'current' | 'upcoming';
}

export interface CompeteLeagueCard {
  league: DiscoveryLeague;
  badge: CompeteBadge;
  stageViews: CompeteStageView[];
  completedCount: number;
  dateRangeLabel: string | null;
  priceRangeLabel: string | null;
  categories: DiscoveryTournament['categories'];
  matchesFilters: boolean;
}

const MONTH_ABBR = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const;

const BADGE_PRIORITY: readonly CompeteBadgeTone[] = ['enrolled', 'live', 'open', 'upcoming', 'ended'];

function tournamentBadge(t: DiscoveryTournament, nowMs: number): CompeteBadge {
  if (t.enrolled) return { label: 'Inscrito', tone: 'enrolled' };
  if (t.registrationOpensAt && t.registrationOpensAt.getTime() > nowMs) {
    return { label: 'Em breve', tone: 'upcoming' };
  }
  if (t.status === 'live') return { label: 'Ao vivo', tone: 'live' };
  if (t.status === 'ended') return { label: 'Encerrado', tone: 'ended' };
  return { label: 'Aberto', tone: 'open' };
}

function leagueBadge(tournaments: readonly DiscoveryTournament[], nowMs: number): CompeteBadge {
  if (tournaments.length === 0) return { label: 'Em breve', tone: 'upcoming' };
  const badges = tournaments.map((t) => tournamentBadge(t, nowMs));
  for (const tone of BADGE_PRIORITY) {
    const hit = badges.find((b) => b.tone === tone);
    if (hit) return hit;
  }
  return badges[0]!;
}

function stageState(tournaments: readonly DiscoveryTournament[], nowMs: number): CompeteStageView['state'] {
  if (tournaments.length === 0) return 'upcoming';
  if (tournaments.every((t) => t.status === 'ended')) return 'done';
  if (tournaments.some((t) => t.status === 'live' || t.startDate.getTime() <= nowMs)) return 'current';
  return 'upcoming';
}

function dateRangeLabel(tournaments: readonly DiscoveryTournament[]): string | null {
  if (tournaments.length === 0) return null;
  const dates = tournaments.map((t) => t.startDate).sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const firstLabel = `${MONTH_ABBR[first.getMonth()]}`;
  const lastLabel = `${MONTH_ABBR[last.getMonth()]} ${last.getFullYear()}`;
  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    return lastLabel;
  }
  return `${firstLabel} – ${lastLabel}`;
}

function priceRangeLabel(tournaments: readonly DiscoveryTournament[]): string | null {
  if (tournaments.length === 0) return null;
  const cheapest = tournaments.reduce((min, t) => (t.priceValue < min.priceValue ? t : min));
  return `a partir de ${cheapest.priceLabel}/etapa`;
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
  return `linear-gradient(135deg, hsl(${hue} 55% 26%), hsl(${(hue + 34) % 360} 55% 12%))`;
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

@Component({
  selector: 'app-tournament-discovery',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, AtBellComponent],
  templateUrl: './tournament-discovery.component.html',
  styleUrl: './tournament-discovery.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.meta.k)': 'focusSearch($event)',
    '(document:keydown.control.k)': 'focusSearch($event)',
  },
})
export class TournamentDiscoveryComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
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

  protected readonly skeletonSlots = [1, 2, 3, 4, 5, 6] as const;
  protected readonly loading = signal(true);
  protected readonly now = signal(Date.now());

  protected readonly viewTab = signal<CompeteViewTab>('all');

  protected readonly queryInput = signal('');
  protected readonly filterQuery = signal('');
  protected readonly filterCategory = signal<FilterCategory>('all');
  protected readonly filterFormat = signal<FilterFormat>('all');
  protected readonly filterDateFrom = signal<string>('');
  protected readonly filterPriceMax = signal<number | null>(null);
  protected readonly openOnly = signal(false);
  protected readonly showMoreFilters = signal(false);

  private queryDebounceHandle: ReturnType<typeof setTimeout> | undefined;

  private readonly firestore = createFirestore();

  protected readonly allTournaments = signal<DiscoveryTournament[]>([]);
  protected readonly leagues = signal<DiscoveryLeague[]>([]);

  private readonly leagueTournamentIds = computed(() => collectLeagueTournamentIds(this.leagues()));

  protected readonly activeFilterCount = computed(() => {
    let n = 0;
    if (this.filterCategory() !== 'all') n++;
    if (this.filterFormat() !== 'all') n++;
    if (this.filterDateFrom()) n++;
    if (this.filterPriceMax() != null) n++;
    if (this.openOnly()) n++;
    return n;
  });

  private passesFilters(t: DiscoveryTournament): boolean {
    const cat = this.filterCategory();
    const fmt = this.filterFormat();
    const q = this.filterQuery().trim().toLowerCase();
    const dateFrom = this.filterDateFrom();
    const priceMax = this.filterPriceMax();
    const openOnly = this.openOnly();

    if (openOnly && t.status !== 'open' && t.status !== 'almost_full' && t.status !== 'live') return false;
    if (cat !== 'all' && !t.categories.includes(cat)) return false;
    if (fmt !== 'all' && t.format !== fmt) return false;
    if (
      q &&
      !t.name.toLowerCase().includes(q) &&
      !t.city.toLowerCase().includes(q) &&
      !t.location.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (t.startDate < from) return false;
    }
    if (priceMax != null && t.priceValue > priceMax) return false;
    return true;
  }

  protected readonly filteredTournaments = computed(() => this.allTournaments().filter((t) => this.passesFilters(t)));

  protected readonly standaloneTournaments = computed(() =>
    [...this.filteredTournaments()]
      .filter((t) => !this.leagueTournamentIds().has(t.id))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime()),
  );

  protected readonly leagueCards = computed<CompeteLeagueCard[]>(() => {
    const nowMs = this.now();
    const filteredIds = new Set(this.filteredTournaments().map((t) => t.id));
    const byId = new Map(this.allTournaments().map((t) => [t.id, t]));

    return this.leagues().map((league) => {
      const sortedStages = [...league.stages].sort((a, b) => a.order - b.order);
      const stageViews: CompeteStageView[] = sortedStages.map((stage) => {
        const stageTournaments = stage.tournamentIds
          .map((id) => byId.get(id))
          .filter((t): t is DiscoveryTournament => !!t);
        return { stage, state: stageState(stageTournaments, nowMs) };
      });
      const allLeagueTournaments = sortedStages
        .flatMap((s) => s.tournamentIds)
        .map((id) => byId.get(id))
        .filter((t): t is DiscoveryTournament => !!t);

      return {
        league,
        badge: leagueBadge(allLeagueTournaments, nowMs),
        stageViews,
        completedCount: stageViews.filter((s) => s.state === 'done').length,
        dateRangeLabel: dateRangeLabel(allLeagueTournaments),
        priceRangeLabel: priceRangeLabel(allLeagueTournaments),
        categories: [...new Set(allLeagueTournaments.flatMap((t) => t.categories))],
        matchesFilters: allLeagueTournaments.some((t) => filteredIds.has(t.id)),
      };
    });
  });

  protected readonly visibleLeagueCards = computed(() => this.leagueCards().filter((c) => c.matchesFilters));

  protected readonly tournamentsCountLabel = computed(() => {
    const n = this.standaloneTournaments().length;
    return `${n} torneio${n === 1 ? '' : 's'}`;
  });

  protected readonly leagueStagesCountLabel = computed(() => {
    const n = this.visibleLeagueCards().reduce((sum, c) => sum + c.stageViews.length, 0);
    return `${n} etapa${n === 1 ? '' : 's'}`;
  });

  protected readonly showTournaments = computed(() => this.viewTab() !== 'leagues');
  protected readonly showLeagues = computed(() => this.viewTab() !== 'tournaments');

  protected readonly stats = computed(() => {
    const nowMs = this.now();
    const tournaments = this.allTournaments();
    const enrolledStandalone = tournaments.filter((t) => t.enrolled && !this.leagueTournamentIds().has(t.id)).length;
    const enrolledLeagues = this.leagueCards().filter((c) => c.badge.tone === 'enrolled').length;
    const aoVivo = tournaments.filter((t) => t.status === 'live').length;
    const abertos = tournaments.filter((t) => tournamentBadge(t, nowMs).tone === 'open').length;
    return {
      inscritos: enrolledStandalone + enrolledLeagues,
      aoVivo,
      abertos,
    };
  });

  constructor() {
    void this.loadData();

    interval(60_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));

    this.destroyRef.onDestroy(() => clearTimeout(this.queryDebounceHandle));
  }

  private async loadData(): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const uid = this.auth.user()?.uid ?? null;
      const [tournaments, leagues, registrations] = await Promise.all([
        fetchAllTournaments(db),
        fetchAllLeagues(db),
        uid ? fetchMyRegistrations(db, projectId, uid) : Promise.resolve([]),
      ]);
      // Depende dos ids, então é um segundo salto. Degrada por conta própria: sem a contagem o
      // card mostra as vagas dos contadores do doc em vez de derrubar a listagem inteira.
      const enrolledByTournament = await fetchEnrolledCountsByTournament(
        db,
        projectId,
        tournaments.map((t) => t.id),
      ).catch(() => null);
      const myTournamentIds = new Set(registrations.map((r) => r.tournamentId));
      this.allTournaments.set(
        tournaments.map((t) =>
          // Contagem carregada: torneio fora do mapa é torneio sem nenhuma inscrição (0, não
          // "não sei"). Só a leitura recusada cai nos contadores do doc.
          discoveryTournamentFromSummary(t, myTournamentIds, enrolledByTournament ? (enrolledByTournament.get(t.id) ?? 0) : null),
        ),
      );
      this.leagues.set(leagues.map(discoveryLeagueFromLeague));
    } finally {
      this.loading.set(false);
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

  protected setViewTab(tab: CompeteViewTab): void {
    this.viewTab.set(tab);
  }

  protected isViewTab(tab: CompeteViewTab): boolean {
    return this.viewTab() === tab;
  }

  protected toggleMoreFilters(): void {
    this.showMoreFilters.update((v) => !v);
  }

  protected setCategory(c: FilterCategory): void {
    this.filterCategory.set(c);
  }

  protected setFormat(f: FilterFormat): void {
    this.filterFormat.set(f);
  }

  protected setOpenOnly(v: boolean): void {
    this.openOnly.set(v);
  }

  protected onDateInput(v: string): void {
    this.filterDateFrom.set(v);
  }

  protected onPriceMaxInput(v: string): void {
    if (!v) {
      this.filterPriceMax.set(null);
      return;
    }
    const n = Number(v);
    this.filterPriceMax.set(Number.isFinite(n) ? n : null);
  }

  protected resetFilters(): void {
    this.filterCategory.set('all');
    this.filterFormat.set('all');
    this.filterDateFrom.set('');
    this.filterPriceMax.set(null);
    this.openOnly.set(false);
  }

  protected isCategoryActive(c: FilterCategory): boolean {
    return this.filterCategory() === c;
  }

  protected isFormatActive(f: FilterFormat): boolean {
    return this.filterFormat() === f;
  }

  protected openTournament(t: DiscoveryTournament): void {
    void this.router.navigate(['/torneios', t.id]);
  }

  protected openLeague(league: DiscoveryLeague): void {
    void this.router.navigate(['/ligas', league.id]);
  }

  protected categoryPill(c: DiscoveryTournament['categories'][number]): string {
    switch (c) {
      case 'M':
        return 'Masc';
      case 'F':
        return 'Fem';
      case 'Mix':
        return 'Misto';
    }
  }

  protected tournamentBadge(t: DiscoveryTournament): CompeteBadge {
    return tournamentBadge(t, this.now());
  }

  protected fillPercent(t: DiscoveryTournament): number {
    return discoveryFillPercent({ filled: t.enrolledCount, total: t.spotsTotal });
  }

  protected readonly heroGradient = heroGradient;
}

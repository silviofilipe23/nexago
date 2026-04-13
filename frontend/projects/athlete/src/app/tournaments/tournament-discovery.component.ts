import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import gsap from 'gsap';
import { interval } from 'rxjs';
import { MOCK_DISCOVERY_LEAGUES, MOCK_DISCOVERY_TOURNAMENTS, MOCK_LIVE_STATS } from './tournament-discovery.mock';
import type {
  DiscoveryTournament,
  FilterCategory,
  FilterFormat,
} from './tournament-discovery.models';
import { collectLeagueTournamentIds } from './tournament-league.helpers';

@Component({
  selector: 'app-tournament-discovery',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './tournament-discovery.component.html',
  styleUrl: './tournament-discovery.component.scss',
})
export class TournamentDiscoveryComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly liveStats = MOCK_LIVE_STATS;
  protected readonly playersOnlineLabel = computed(() =>
    MOCK_LIVE_STATS.playersOnline.toLocaleString('pt-BR'),
  );

  /** Slots para skeleton grid */
  protected readonly skeletonSlots = [1, 2, 3, 4, 5, 6] as const;

  protected readonly filterCategory = signal<FilterCategory>('all');
  protected readonly filterFormat = signal<FilterFormat>('all');
  protected readonly filterDateFrom = signal<string>('');
  protected readonly filterLocation = signal<string>('');
  protected readonly filterPriceMax = signal<number | null>(null);
  protected readonly openOnly = signal(false);

  protected readonly loading = signal(true);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly now = signal(Date.now());

  private introDone = false;
  private filterGen = 0;

  protected readonly allTournaments = signal<DiscoveryTournament[]>([...MOCK_DISCOVERY_TOURNAMENTS]);

  private readonly leagueTournamentIds = collectLeagueTournamentIds(MOCK_DISCOVERY_LEAGUES);

  protected readonly filteredTournaments = computed(() => {
    const list = this.allTournaments();
    const cat = this.filterCategory();
    const fmt = this.filterFormat();
    const loc = this.filterLocation().trim().toLowerCase();
    const dateFrom = this.filterDateFrom();
    const priceMax = this.filterPriceMax();
    const openOnly = this.openOnly();

    return list.filter((t) => {
      if (openOnly && t.status !== 'open' && t.status !== 'almost_full' && t.status !== 'live') {
        return false;
      }
      if (cat !== 'all' && !t.categories.includes(cat)) {
        return false;
      }
      if (fmt !== 'all' && t.format !== fmt) {
        return false;
      }
      if (loc && !t.city.toLowerCase().includes(loc) && !t.location.toLowerCase().includes(loc)) {
        return false;
      }
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (t.startDate < from) {
          return false;
        }
      }
      if (priceMax != null && t.priceValue > priceMax) {
        return false;
      }
      return true;
    });
  });

  protected readonly liveNow = computed(() =>
    this.filteredTournaments().filter((t) => t.status === 'live' && t.liveMatchesNow > 0),
  );

  protected readonly trending = computed(() => {
    const pool = this.filteredTournaments().filter((t) => t.status !== 'ended');
    return [...pool].sort((a, b) => b.enrolledCount - a.enrolledCount).slice(0, 3);
  });

  /** Ligas/etapas com torneios que passam nos filtros atuais. */
  protected readonly leagueBlocks = computed(() => {
    const filtered = this.filteredTournaments();
    const byId = new Map(filtered.map((t) => [t.id, t]));
    return MOCK_DISCOVERY_LEAGUES.map((league) => ({
      league,
      stages: [...league.stages]
        .sort((a, b) => a.order - b.order)
        .map((stage) => {
          const tournaments = stage.tournamentIds
            .map((id) => byId.get(id))
            .filter((t): t is DiscoveryTournament => !!t)
            .sort((a, b) => {
              if (a.featured !== b.featured) return a.featured ? -1 : 1;
              return a.startDate.getTime() - b.startDate.getTime();
            });
          return { stage, tournaments };
        })
        .filter((x) => x.tournaments.length > 0),
    })).filter((b) => b.stages.length > 0);
  });

  /** Torneios que não estão em nenhuma liga (ou lista “Todos” sem duplicar os da liga). */
  protected readonly gridTournaments = computed(() => {
    const f = this.filteredTournaments().filter((t) => !this.leagueTournamentIds.has(t.id));
    const featured = f.filter((t) => t.featured);
    const rest = f.filter((t) => !t.featured);
    return { featured, rest };
  });

  protected readonly standaloneTournamentCount = computed(() => {
    const g = this.gridTournaments();
    return g.featured.length + g.rest.length;
  });

  constructor() {
    setTimeout(() => this.loading.set(false), 720);

    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));

    afterNextRender(
      () => {
        if (!this.prefersReducedMotion()) {
          this.playIntro();
        }
      },
      { injector: this.injector },
    );

    effect(() => {
      this.filteredTournaments();
      this.loading();
      if (this.loading()) return;
      const gen = ++this.filterGen;
      untracked(() =>
        afterNextRender(() => {
          if (gen !== this.filterGen) return;
          if (!this.prefersReducedMotion()) {
            this.animateCards();
          }
        }, { injector: this.injector }),
      );
    });
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

  protected onLocationInput(v: string): void {
    this.filterLocation.set(v);
  }

  protected onPriceMaxInput(v: string): void {
    if (!v) {
      this.filterPriceMax.set(null);
      return;
    }
    const n = Number(v);
    this.filterPriceMax.set(Number.isFinite(n) ? n : null);
  }

  protected isCategoryActive(c: FilterCategory): boolean {
    return this.filterCategory() === c;
  }

  protected isFormatActive(f: FilterFormat): boolean {
    return this.filterFormat() === f;
  }

  protected selectCard(id: string): void {
    this.selectedId.set(id);
  }

  protected clearSelection(): void {
    this.selectedId.set(null);
  }

  protected scrollToGrid(): void {
    const el = this.host.nativeElement.querySelector('#td-grid');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected openTournament(t: DiscoveryTournament): void {
    void this.router.navigate(['/torneios', t.id]);
  }

  protected statusLabel(s: DiscoveryTournament['status']): string {
    switch (s) {
      case 'open':
        return 'Aberto';
      case 'almost_full':
        return 'Quase lotado';
      case 'live':
        return 'Ao vivo';
      case 'ended':
        return 'Finalizado';
    }
  }

  protected categoryPill(c: DiscoveryTournament['categories'][number]): string {
    switch (c) {
      case 'M':
        return 'Masc.';
      case 'F':
        return 'Fem.';
      case 'Mix':
        return 'Misto';
    }
  }

  protected urgencyLabel(t: DiscoveryTournament): string | null {
    if (t.spotsLeft <= 0) return null;
    if (t.spotsLeft <= 3) return `Últimas ${t.spotsLeft} vagas`;
    if (t.spotsLeft <= 8) return `Só ${t.spotsLeft} vagas`;
    return null;
  }

  protected offerCountdown(t: DiscoveryTournament): string | null {
    const end = t.offerEndsAt;
    if (!end) return null;
    const ms = end.getTime() - this.now();
    if (ms <= 0) return 'Oferta encerrada';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (h > 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  }

  protected selectedTournament(): DiscoveryTournament | null {
    const id = this.selectedId();
    if (!id) return null;
    return this.allTournaments().find((t) => t.id === id) ?? null;
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof globalThis.matchMedia === 'function' &&
      globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private playIntro(): void {
    if (this.introDone) return;
    this.introDone = true;
    const root = this.host.nativeElement;
    const parts = root.querySelectorAll('[data-td-intro]');
    if (!parts.length) return;
    gsap.fromTo(
      parts,
      { opacity: 0, y: 36 },
      {
        opacity: 1,
        y: 0,
        duration: 0.65,
        stagger: 0.1,
        ease: 'power3.out',
        clearProps: 'transform',
      },
    );
  }

  private animateCards(): void {
    const root = this.host.nativeElement;
    const cards = root.querySelectorAll('.td-card');
    if (!cards.length) return;
    gsap.fromTo(
      cards,
      { opacity: 0, y: 22, scale: 0.98 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.45,
        stagger: 0.05,
        ease: 'power2.out',
        clearProps: 'transform',
      },
    );
  }
}

import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import gsap from 'gsap';
import { interval, map } from 'rxjs';
import type { LeagueTimelineStage } from './league-detail.models';
import { getLeagueDetailBundle } from './league-detail.mock';
import type { TournamentGenderCat } from './tournament-discovery.models';

type LeagueSubnavId = 'visao' | 'timeline' | 'ranking' | 'proxima' | 'stats' | 'feed' | 'atletas' | 'regulamento';

@Component({
  selector: 'app-league-detail-shell',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './league-detail-shell.component.html',
  styleUrl: './league-detail-shell.component.scss',
})
export class LeagueDetailShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private revealObserver: IntersectionObserver | null = null;

  private readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' },
  );

  protected readonly loading = signal(true);
  protected readonly bundle = computed(() => {
    const id = this.id();
    if (!id) return null;
    return getLeagueDetailBundle(id);
  });

  protected readonly drawerStage = signal<LeagueTimelineStage | null>(null);
  protected readonly rankingMode = signal<'pair' | 'individual'>('pair');
  protected readonly rankingGender = signal<'all' | TournamentGenderCat>('all');
  protected readonly postLikes = signal<Record<string, number>>({});
  protected readonly statDisplay = signal<Record<string, number>>({});
  protected readonly nowMs = signal(Date.now());

  protected readonly countdownLabel = computed(() => {
    const b = this.bundle();
    if (!b) return '';
    const end = new Date(b.nextStage.registrationEndsAt).getTime();
    const ms = Math.max(0, end - this.nowMs());
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  });

  protected readonly filteredRanking = computed(() => {
    const b = this.bundle();
    if (!b) return [];
    const mode = this.rankingMode();
    const g = this.rankingGender();
    const pool = mode === 'pair' ? b.rankingPairs : b.rankingIndividuals;
    if (g === 'all') return pool;
    return pool.filter((r) => r.genderScope === g);
  });

  constructor() {
    setTimeout(() => this.loading.set(false), 520);

    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.nowMs.set(Date.now()));

    effect(() => {
      const b = this.bundle();
      if (!b || this.loading()) return;
      const initial: Record<string, number> = {};
      for (const st of b.stats) initial[st.id] = 0;
      this.statDisplay.set(initial);
      untracked(() =>
        afterNextRender(() => this.runStatCountUp(b.stats), { injector: this.injector }),
      );
    });

    effect(() => {
      const b = this.bundle();
      if (this.loading() || !b) return;
      untracked(() =>
        afterNextRender(() => this.setupIntro(), { injector: this.injector }),
      );
    });

    effect(() => {
      const b = this.bundle();
      if (this.loading() || !b) return;
      untracked(() =>
        afterNextRender(() => this.setupScrollReveal(), { injector: this.injector }),
      );
    });

    this.destroyRef.onDestroy(() => {
      this.revealObserver?.disconnect();
      this.revealObserver = null;
    });
  }

  private runStatCountUp(stats: { id: string; value: number }[]): void {
    if (this.prefersReducedMotion()) {
      const done: Record<string, number> = {};
      for (const st of stats) done[st.id] = st.value;
      this.statDisplay.set(done);
      return;
    }
    const duration = 1000;
    const start = performance.now();
    const tick = (): void => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const ease = 1 - (1 - t) * (1 - t);
      const cur: Record<string, number> = {};
      for (const st of stats) {
        cur[st.id] = Math.round(st.value * ease);
      }
      this.statDisplay.set(cur);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  protected openStageDrawer(s: LeagueTimelineStage): void {
    this.drawerStage.set(s);
    afterNextRender(
      () => {
        const el = this.host.nativeElement.querySelector('.ldv-drawer');
        if (!el) return;
        gsap.fromTo(
          el,
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' },
        );
      },
      { injector: this.injector },
    );
  }

  protected closeDrawer(): void {
    this.drawerStage.set(null);
  }

  @HostListener('document:keydown.escape')
  protected onEscapeCloseDrawer(): void {
    if (this.drawerStage()) {
      this.closeDrawer();
    }
  }

  protected scrollToSection(id: LeagueSubnavId): void {
    const el = this.host.nativeElement.querySelector(`#ldv-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected setRankingMode(m: 'pair' | 'individual'): void {
    this.rankingMode.set(m);
  }

  protected setRankingGender(g: 'all' | TournamentGenderCat): void {
    this.rankingGender.set(g);
  }

  protected likePost(id: string, base: number): void {
    const cur = this.postLikes()[id] ?? base;
    this.postLikes.update((m) => ({ ...m, [id]: cur + 1 }));
  }

  protected postLikeCount(id: string, base: number): number {
    return this.postLikes()[id] ?? base;
  }

  protected statValue(id: string): number {
    return this.statDisplay()[id] ?? 0;
  }

  protected deltaArrow(d: number): string {
    if (d > 0) return '⬆️';
    if (d < 0) return '⬇️';
    return '—';
  }

  protected deltaLabel(d: number): string {
    if (d > 0) return `+${d} pos.`;
    if (d < 0) return `${d} pos.`;
    return 'Estável';
  }

  private setupScrollReveal(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    this.revealObserver?.disconnect();
    const root = this.host.nativeElement;
    const nodes = root.querySelectorAll('[data-ldv-reveal]');
    nodes.forEach((n: Element) => n.classList.remove('ldv-reveal--visible'));
    if (!nodes.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('ldv-reveal--visible');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -36px 0px' },
    );
    nodes.forEach((n: Element) => io.observe(n));
    this.revealObserver = io;
  }

  private setupIntro(): void {
    if (this.prefersReducedMotion()) return;
    const root = this.host.nativeElement;
    const parts = root.querySelectorAll('[data-ldv-intro]');
    if (!parts.length) return;
    gsap.fromTo(
      parts,
      { opacity: 0, y: 28 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'transform',
      },
    );
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof globalThis.matchMedia === 'function' &&
      globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}

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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import gsap from 'gsap';
import { map } from 'rxjs';
import { MOCK_DISCOVERY_LEAGUES, MOCK_DISCOVERY_TOURNAMENTS } from './tournament-discovery.mock';
import type { DiscoveryTournament } from './tournament-discovery.models';
import { leagueContextLabel, resolveLeagueContext } from './tournament-league.helpers';
import {
  getTournamentDetailExtra,
  type BracketPreviewState,
  type TournamentStageDetail,
} from './tournament-detail.mock';

@Component({
  selector: 'app-tournament-detail-shell',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './tournament-detail-shell.component.html',
  styleUrl: './tournament-detail-shell.component.scss',
})
export class TournamentDetailShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private revealObserver: IntersectionObserver | null = null;
  private revealScheduledForId: string | null = null;

  private readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' },
  );

  protected readonly loading = signal(true);
  protected readonly activeStageIndex = signal(0);
  protected readonly postLikes = signal<Record<string, number>>({});

  protected readonly base = computed((): DiscoveryTournament | null => {
    const id = this.id();
    return MOCK_DISCOVERY_TOURNAMENTS.find((t) => t.id === id) ?? null;
  });

  protected readonly extra = computed(() => {
    const b = this.base();
    if (!b) return null;
    return getTournamentDetailExtra(b.id, b);
  });

  protected readonly leagueContextLine = computed((): string | null => {
    const id = this.id();
    if (!id) return null;
    const ctx = resolveLeagueContext(MOCK_DISCOVERY_LEAGUES, id);
    return ctx ? leagueContextLabel(ctx) : null;
  });

  protected readonly mapsUrl = computed(() => {
    const q = this.extra()?.mapQuery ?? '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });

  protected readonly activeStage = computed((): TournamentStageDetail | null => {
    const stages = this.extra()?.stages ?? [];
    const i = this.activeStageIndex();
    return stages[i] ?? stages[0] ?? null;
  });

  protected readonly heroStatus = computed(() => {
    const b = this.base();
    if (!b) return { emoji: '', label: '', tone: 'neutral' as const };
    switch (b.status) {
      case 'open':
        return { emoji: '🔥', label: 'Inscrições abertas', tone: 'open' as const };
      case 'almost_full':
        return { emoji: '⏳', label: 'Últimas vagas', tone: 'urgent' as const };
      case 'live':
        return { emoji: '🔴', label: 'Ao vivo agora', tone: 'live' as const };
      case 'ended':
        return { emoji: '✓', label: 'Encerrado', tone: 'ended' as const };
    }
  });

  protected readonly bracketLabel = computed(() => {
    const state = this.extra()?.bracketState ?? 'soon';
    return this.bracketStateCopy(state);
  });

  constructor() {
    setTimeout(() => this.loading.set(false), 640);

    effect(() => {
      const b = this.base();
      if (this.loading()) {
        return;
      }
      if (!b) {
        this.revealScheduledForId = null;
        return;
      }
      const id = b.id;
      if (this.revealScheduledForId === id) {
        return;
      }
      this.revealScheduledForId = id;
      untracked(() => {
        afterNextRender(() => {
          this.setupIntroGsap();
          this.setupScrollReveal();
        }, { injector: this.injector });
      });
    });

    this.destroyRef.onDestroy(() => {
      this.revealObserver?.disconnect();
      this.revealObserver = null;
    });
  }

  protected setStage(i: number): void {
    this.activeStageIndex.set(i);
    if (this.prefersReducedMotion()) return;
    afterNextRender(
      () => {
        const el = this.host.nativeElement.querySelector('.tdv-stage-panel');
        if (!el) return;
        gsap.fromTo(
          el,
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'transform' },
        );
      },
      { injector: this.injector },
    );
  }

  protected scrollToCategories(): void {
    this.host.nativeElement.querySelector('#tdv-categories')?.scrollIntoView({ behavior: 'smooth' });
  }

  protected likePost(id: string, base: number): void {
    const cur = this.postLikes()[id] ?? base;
    this.postLikes.update((m) => ({ ...m, [id]: cur + 1 }));
  }

  protected postLikeCount(id: string, base: number): number {
    return this.postLikes()[id] ?? base;
  }

  protected viewersLabel(n: number): string {
    return n.toLocaleString('pt-BR');
  }

  protected bracketStateCopy(state: BracketPreviewState): string {
    switch (state) {
      case 'soon':
        return 'Chave em breve';
      case 'live':
        return 'Chave ao vivo';
      case 'done':
        return 'Resultados finais';
    }
  }

  private setupIntroGsap(): void {
    if (this.prefersReducedMotion()) return;
    const root = this.host.nativeElement;
    const parts = root.querySelectorAll('[data-tdv-intro]');
    if (!parts.length) return;
    gsap.fromTo(
      parts,
      { opacity: 0, y: 32 },
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

  private setupScrollReveal(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    this.revealObserver?.disconnect();

    const root = this.host.nativeElement;
    const nodes = root.querySelectorAll('[data-tdv-reveal]');
    nodes.forEach((n: Element) => n.classList.remove('tdv-reveal--visible'));

    if (!nodes.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('tdv-reveal--visible');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    );

    nodes.forEach((n: Element) => io.observe(n));
    this.revealObserver = io;
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof globalThis.matchMedia === 'function' &&
      globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}

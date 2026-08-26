import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { sportLabel } from '../../../lib/format';
import type { ArenaDetail } from '../../../lib/firestore/types';

gsap.registerPlugin(ScrollTrigger);

/**
 * Porta de `ArenaHero` (site Next.js, `components/hub/ArenaHero.tsx`) — cabeçalho
 * cinematográfico da arena: capa full-bleed sob o header flutuante, com parallax no scroll
 * (GSAP scrub, só transform) e scrims que dissolvem a imagem no fundo da página. Sem capa,
 * cai num fundo de gradiente de marca. Espelha o `TournamentHero` já portado (mesma técnica
 * de parallax, mesmo cleanup via `DestroyRef`) — este app é CSR-only, sem o guard
 * `typeof window !== 'undefined'` do source.
 */
@Component({
  selector: 'app-arena-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'relative block w-full overflow-hidden h-[clamp(26rem,62vh,36rem)]' },
  template: `
    <div #imageLayer class="absolute inset-0 scale-[1.08] will-change-transform">
      @if (cover(); as src) {
        <img [src]="src" alt="" class="size-full object-cover" />
      } @else {
        <div aria-hidden="true" class="absolute inset-0 bg-gradient-to-br from-surface-2 via-surface-1 to-bg">
          <div
            class="absolute inset-0"
            style="background: radial-gradient(60rem 32rem at 70% 18%, rgba(255,106,26,0.18), transparent 60%)"
          ></div>
        </div>
      }
    </div>

    <div aria-hidden="true" class="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-bg/10"></div>
    <div aria-hidden="true" class="absolute inset-0 bg-gradient-to-b from-bg/70 via-transparent to-transparent"></div>

    <div class="absolute inset-x-0 top-0">
      <div class="mx-auto max-w-5xl px-5 pt-24 sm:px-6 sm:pt-28">
        <a
          routerLink="/arenas"
          class="inline-flex items-center gap-1.5 rounded-pill bg-glass px-3 py-1.5 text-sm text-fg backdrop-blur-md backdrop-saturate-150 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
          </svg>
          Para arenas
        </a>
      </div>
    </div>

    <div #overlay class="absolute inset-x-0 bottom-0 will-change-transform">
      <div class="mx-auto max-w-5xl px-5 pb-8 sm:px-6 sm:pb-10">
        <span class="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">Arena parceira</span>

        <h1 class="mt-4 font-display text-[clamp(2rem,6vw,3.25rem)] font-800 leading-tight tracking-tight text-fg">
          {{ arena().name }}
        </h1>

        <div class="mt-5 flex flex-col gap-3 text-text-mute sm:flex-row sm:flex-wrap sm:gap-6">
          @if (place(); as p) {
            <span class="flex items-center gap-2">
              <svg class="size-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {{ p }}
            </span>
          }
          @if (courtCount() > 0) {
            <span class="flex items-center gap-2">
              <svg class="size-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect width="7" height="7" x="3" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="14" rx="1" />
                <rect width="7" height="7" x="3" y="14" rx="1" />
              </svg>
              {{ courtCount() }} {{ courtCount() === 1 ? 'quadra' : 'quadras' }}
            </span>
          }
        </div>

        @if (sports().length > 0) {
          <div class="mt-5 flex flex-wrap gap-2">
            @for (s of sports(); track s) {
              <span class="rounded-pill border border-brand/20 bg-brand-tint px-3.5 py-1 text-xs font-600 text-brand backdrop-blur-sm">
                {{ sportLabel(s) }}
              </span>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class ArenaHero {
  readonly arena = input.required<ArenaDetail>();

  protected readonly sportLabel = sportLabel;
  protected readonly place = computed(() => [this.arena().city, this.arena().state].filter(Boolean).join(', '));
  protected readonly cover = computed(() => this.arena().photoUrls[0] ?? this.arena().logoUrl ?? null);
  protected readonly sports = computed(() => this.arena().sports.slice(0, 3));
  protected readonly courtCount = computed(() => this.arena().courts.length);

  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly imageLayer = viewChild.required<ElementRef<HTMLDivElement>>('imageLayer');
  private readonly overlay = viewChild.required<ElementRef<HTMLDivElement>>('overlay');

  constructor() {
    afterNextRender(() => this.setupParallax());
  }

  private setupParallax(): void {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      // Parallax: a capa "atrasa" o scroll (move pra baixo) com leve zoom. O scale base de
      // 1.15 dá folga pra não revelar bordas no deslocamento.
      gsap.fromTo(
        this.imageLayer().nativeElement,
        { yPercent: -4, scale: 1.15 },
        {
          yPercent: 10,
          scale: 1.22,
          ease: 'none',
          scrollTrigger: { trigger: this.hostRef.nativeElement, start: 'top top', end: 'bottom top', scrub: true },
        },
      );

      // Texto sobe e desvanece suavemente conforme o hero sai de cena.
      gsap.to(this.overlay().nativeElement, {
        yPercent: -18,
        opacity: 0.35,
        ease: 'none',
        scrollTrigger: { trigger: this.hostRef.nativeElement, start: 'top top', end: 'bottom top', scrub: true },
      });
    }, this.hostRef);

    this.destroyRef.onDestroy(() => ctx.revert());
  }
}

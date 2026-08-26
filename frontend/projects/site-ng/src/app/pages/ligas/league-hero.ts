import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { LeagueSummary } from '../../../lib/firestore/types';

gsap.registerPlugin(ScrollTrigger);

/**
 * Porta de `LeagueHero` (site Next.js) — cabeçalho cinematográfico da liga: capa full-bleed sob
 * o header flutuante, com parallax no scroll (GSAP scrub, só transform) e scrims que dissolvem a
 * imagem no fundo da página. Sem capa, cai num fundo de marca. Espelha o `CinematicHero` já
 * portado: setup em `afterNextRender`, `gsap.context()` escopado à raiz do `<header>`, cleanup
 * via `DestroyRef` no lugar do `useEffect`/`ctx.revert()` do source. Respeita
 * `prefers-reduced-motion` (pula a timeline) e mantém o conteúdo sempre legível/indexável.
 */
@Component({
  selector: 'app-league-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'contents' },
  template: `
    <header #root class="relative w-full overflow-hidden h-[clamp(26rem,62vh,36rem)]">
      <div #imageLayer class="absolute inset-0 scale-[1.08] will-change-transform">
        @if (league().coverUrl; as src) {
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
        <div class="mx-auto max-w-4xl px-5 pt-24 sm:px-6 sm:pt-28">
          <a
            routerLink="/ligas"
            class="inline-flex items-center gap-1.5 rounded-pill bg-glass px-3 py-1.5 text-sm text-fg backdrop-blur-md backdrop-saturate-150 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
            </svg>
            Todas as ligas
          </a>
        </div>
      </div>

      <div #overlay class="absolute inset-x-0 bottom-0 will-change-transform">
        <div class="mx-auto max-w-4xl px-5 pb-8 sm:px-6 sm:pb-10">
          <span class="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">
            {{ league().seasonLabel ?? 'Liga nexaGO' }}
          </span>

          <h1 class="mt-4 font-display text-[clamp(2rem,6vw,3.25rem)] font-800 leading-tight tracking-tight text-fg">
            {{ league().name }}
          </h1>

          <div class="mt-5 flex flex-col gap-3 text-text-mute sm:flex-row sm:flex-wrap sm:gap-6">
            @if (league().seasonLabel; as season) {
              <span class="flex items-center gap-2">
                <svg class="size-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                {{ season }}
              </span>
            }
            @if (stageCount() > 0) {
              <span class="flex items-center gap-2">
                <svg class="size-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                  <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
                  <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
                </svg>
                {{ stageCount() }} {{ stageCount() === 1 ? 'etapa' : 'etapas' }}
              </span>
            }
          </div>
        </div>
      </div>
    </header>
  `,
})
export class LeagueHero {
  readonly league = input.required<LeagueSummary>();

  protected readonly stageCount = computed(() => this.league().stages.length);

  private readonly destroyRef = inject(DestroyRef);
  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');
  private readonly imageLayer = viewChild.required<ElementRef<HTMLDivElement>>('imageLayer');
  private readonly overlay = viewChild.required<ElementRef<HTMLDivElement>>('overlay');

  constructor() {
    afterNextRender(() => this.setupParallax());
  }

  private setupParallax(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rootEl = this.root().nativeElement;

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
          scrollTrigger: { trigger: rootEl, start: 'top top', end: 'bottom top', scrub: true },
        },
      );

      // Texto sobe e desvanece suavemente conforme o hero sai de cena.
      gsap.to(this.overlay().nativeElement, {
        yPercent: -18,
        opacity: 0.35,
        ease: 'none',
        scrollTrigger: { trigger: rootEl, start: 'top top', end: 'bottom top', scrub: true },
      });
    }, rootEl);

    this.destroyRef.onDestroy(() => ctx.revert());
  }
}

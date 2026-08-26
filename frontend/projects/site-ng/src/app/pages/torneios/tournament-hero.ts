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
import { StatusBadge } from '../../shared/hub/status-badge';
import { sportLabel, formatDate } from '../../../lib/format';
import type { TournamentDetail } from '../../../lib/firestore/types';

gsap.registerPlugin(ScrollTrigger);

/**
 * Porta de `TournamentHero` (site Next.js) — cabeçalho cinematográfico do torneio: capa
 * full-bleed sob o header flutuante, com parallax no scroll (GSAP scrub, só transform) e
 * scrims que dissolvem a imagem no fundo da página. Sem capa, cai num fundo de marca.
 * Respeita `prefers-reduced-motion` (pula a timeline) e mantém o conteúdo sempre legível —
 * este app é CSR-only, então não há SSR a preservar (diferente do source, sem guard
 * `typeof window !== 'undefined'`).
 */
@Component({
  selector: 'app-tournament-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, StatusBadge],
  host: { class: 'relative block w-full overflow-hidden h-[clamp(26rem,62vh,36rem)]' },
  template: `
    <div #imageLayer class="absolute inset-0 scale-[1.08] will-change-transform">
      @if (t().coverUrl; as cover) {
        <img [src]="cover" alt="" class="size-full object-cover" />
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
          routerLink="/torneios"
          class="inline-flex items-center gap-1.5 rounded-pill bg-glass px-3 py-1.5 text-sm text-fg backdrop-blur-md backdrop-saturate-150 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
          </svg>
          Todos os torneios
        </a>
      </div>
    </div>

    <div #overlay class="absolute inset-x-0 bottom-0 will-change-transform">
      <div class="mx-auto max-w-4xl px-5 pb-8 sm:px-6 sm:pb-10">
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">{{ sportLabel(t().sport) }}</span>
          <app-status-badge [status]="t().listingStatus" />
          @if (t().leagueStageName; as stageName) {
            <span class="text-xs text-text-mute">· {{ stageName }}</span>
          }
        </div>

        <h1 class="mt-4 font-display text-[clamp(2rem,6vw,3.25rem)] font-800 leading-tight tracking-tight text-fg">
          {{ t().name }}
        </h1>

        <div class="mt-5 flex flex-col gap-3 text-text-mute sm:flex-row sm:flex-wrap sm:gap-6">
          @if (place(); as place) {
            <span class="flex items-center gap-2">
              <svg class="size-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {{ place }}
            </span>
          }
          @if (t().dateLabel || t().startAt) {
            <span class="flex items-center gap-2">
              <svg class="size-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {{ t().dateLabel ?? formatDate(t().startAt) }}
            </span>
          }
          <span class="flex items-center gap-2">
            <svg class="size-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {{ t().enrolledCount }} inscritos
          </span>
        </div>
      </div>
    </div>
  `,
})
export class TournamentHero {
  readonly t = input.required<TournamentDetail>();

  protected readonly sportLabel = sportLabel;
  protected readonly formatDate = formatDate;
  protected readonly place = computed(() => {
    const t = this.t();
    return [t.locationName, t.city, t.state].filter(Boolean).join(', ');
  });

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

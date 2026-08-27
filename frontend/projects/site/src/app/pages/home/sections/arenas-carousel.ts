import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, input, signal, viewChild } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { ArenaCard } from '../../../shared/hub/arena-card';
import { getPublicArenas } from '../../../../lib/firestore/arenas';
import type { ArenaSummary } from '../../../../lib/firestore/types';

/**
 * Porta de `ArenasCarousel` (site Next.js) — vitrine horizontal de arenas parceiras. Scroll-snap
 * nativo + botões prev/next no desktop. Diferente da fase 1 (placeholder estático), agora busca
 * `arenas` reais do Firestore no `constructor` (CSR puro — não há SSR/ISR nesta app, então o
 * fetch acontece sempre no navegador do visitante).
 */
@Component({
  selector: 'app-arenas-carousel-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ButtonDirective, ArenaCard],
  host: {
    '(window:resize)': 'updateEdges()',
  },
  template: `
    <section class="relative py-16 sm:py-20">
      <div class="mx-auto max-w-6xl px-5 sm:px-6">
        <div nxReveal class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div class="max-w-2xl">
            <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">{{ eyebrow() }}</p>
            <h2 class="font-display text-[clamp(1.9rem,5vw,3rem)] font-700 leading-tight tracking-tight text-fg">
              {{ title() }}
            </h2>
            <p class="mt-4 text-balance text-base text-text-mute sm:text-lg">{{ description() }}</p>
          </div>

          @if (arenas().length > 0) {
            <div class="hidden shrink-0 gap-2 sm:flex">
              <button
                type="button"
                (click)="scrollByPage(-1)"
                [disabled]="atStart()"
                aria-label="Ver arenas anteriores"
                class="inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface-1 text-fg transition-colors duration-200 ease-out hover:border-brand/40 hover:text-brand disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
              >
                <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                (click)="scrollByPage(1)"
                [disabled]="atEnd()"
                aria-label="Ver mais arenas"
                class="inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface-1 text-fg transition-colors duration-200 ease-out hover:border-brand/40 hover:text-brand disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
              >
                <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          }
        </div>

        @if (loading()) {
          <div class="-mx-5 mt-10 flex gap-4 overflow-hidden px-5 sm:-mx-6 sm:mt-12 sm:px-6">
            @for (i of skeletonSlots; track i) {
              <div class="h-[280px] w-[260px] shrink-0 animate-pulse rounded-4 bg-surface-1 sm:w-[280px]"></div>
            }
          </div>
        } @else if (arenas().length === 0) {
          <p class="mt-10 text-sm text-text-mute">Nenhuma arena publicada ainda.</p>
        } @else {
          <!-- Trilho sangra até a borda mas o 1º card alinha ao gutter do conteúdo (mesmo do
              título), via -mx/px; scroll-px alinha o snap. -->
          <ul
            #track
            (scroll)="updateEdges()"
            class="-mx-5 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:-mx-6 sm:mt-12 sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
          >
            @for (arena of arenas(); track arena.id) {
              <li class="w-[260px] shrink-0 snap-start sm:w-[280px]">
                <app-arena-card [arena]="arena" />
              </li>
            }
            <!-- Card final: CTA para cadastrar a própria arena -->
            <li class="w-[260px] shrink-0 snap-start sm:w-[280px]">
              <div class="flex h-full flex-col items-start justify-center gap-4 rounded-4 border border-dashed border-brand/30 bg-brand-tint/40 p-6">
                <p class="font-display text-lg font-700 leading-tight tracking-tight text-fg">Sua arena aqui</p>
                <p class="text-sm leading-relaxed text-text-mute">Cadastre sua quadra e apareça para a comunidade da areia.</p>
                <a nxButton="primary" href="#contato" class="mt-auto">
                  Cadastrar
                  <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </a>
              </div>
            </li>
          </ul>
        }
      </div>
    </section>
  `,
})
export class ArenasCarouselSection implements AfterViewInit {
  readonly eyebrow = input('Arenas parceiras');
  readonly title = input('Arenas que evoluíram');
  readonly description = input('Arenas que já fazem parte da comunidade da areia. A sua pode ser a próxima.');

  protected readonly arenas = signal<ArenaSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly skeletonSlots = [0, 1, 2, 3];
  protected readonly atStart = signal(true);
  protected readonly atEnd = signal(false);

  private readonly track = viewChild<ElementRef<HTMLUListElement>>('track');

  constructor() {
    getPublicArenas(12).then((arenas) => {
      this.arenas.set(arenas);
      this.loading.set(false);
    });
  }

  ngAfterViewInit(): void {
    this.updateEdges();
  }

  protected updateEdges(): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    this.atStart.set(el.scrollLeft <= 4);
    this.atEnd.set(el.scrollLeft >= max - 4);
  }

  protected scrollByPage(direction: -1 | 1): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
  }
}

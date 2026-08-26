import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';
import { ButtonDirective } from '../../../shared/ui/button.directive';

interface ArenaPlaceholder {
  id: string;
  name: string;
  place: string;
  sports: string[];
}

// Placeholder estático — leitura ao vivo do Firestore (`arenas`) fica para fase posterior de
// migração. 4 arenas representativas, mesmo formato de `ArenaSummary` (nome, local, esportes).
const ARENAS: ArenaPlaceholder[] = [
  { id: 'a1', name: 'Arena Maré Alta', place: 'Florianópolis · SC', sports: ['Beach tennis', 'Vôlei de praia'] },
  { id: 'a2', name: 'Beach Point', place: 'Santos · SP', sports: ['Vôlei de praia'] },
  { id: 'a3', name: 'Areia Viva', place: 'Natal · RN', sports: ['Beach tennis'] },
  { id: 'a4', name: 'Praia Club', place: 'Recife · PE', sports: ['Beach tennis', 'Vôlei de praia'] },
];

/**
 * Porta de `ArenasCarousel` (site Next.js) — vitrine horizontal de arenas parceiras. Scroll-snap
 * nativo + botões prev/next no desktop. Diferente do original (recebe `arenas` prontas da page
 * via leitura Firestore), aqui a lista é placeholder estático — ver comentário em `ARENAS`.
 * Como a lista nunca fica vazia, não há o early-return condicional do original.
 */
@Component({
  selector: 'app-arenas-carousel-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ButtonDirective, RouterLink],
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
        </div>

        <!-- Trilho sangra até a borda mas o 1º card alinha ao gutter do conteúdo
            (mesmo do título), via -mx/px; scroll-px alinha o snap. -->
        <ul
          #track
          (scroll)="updateEdges()"
          class="-mx-5 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:-mx-6 sm:mt-12 sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
        >
          @for (arena of arenas; track arena.id) {
            <li class="w-[260px] shrink-0 snap-start sm:w-[280px]">
              <a
                routerLink="/arenas"
                (mousemove)="onSpotlightMove($event)"
                class="group/arena flex h-full flex-col overflow-hidden rounded-4 border border-line bg-surface-1 transition-colors duration-200 ease-out hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
              >
                <div class="relative aspect-[16/10] overflow-hidden bg-surface-2">
                  <div class="flex h-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface-1">
                    <svg class="size-9 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                      <path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />
                    </svg>
                  </div>
                  <div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-1/90 to-transparent"></div>
                </div>

                <div class="flex flex-1 flex-col p-4">
                  <h3 class="font-display text-base font-700 leading-tight tracking-tight text-fg">{{ arena.name }}</h3>
                  <p class="mt-1.5 inline-flex items-center gap-1.5 text-sm text-text-mute">
                    <svg class="size-3.5 shrink-0 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span class="truncate">{{ arena.place }}</span>
                  </p>
                  <div class="mt-auto flex flex-wrap gap-1.5 pt-4">
                    @for (label of arena.sports; track label) {
                      <span class="rounded-pill border border-brand/20 bg-brand-tint px-2.5 py-1 text-xs font-600 text-brand">{{ label }}</span>
                    }
                  </div>
                </div>
              </a>
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
      </div>
    </section>
  `,
})
export class ArenasCarouselSection implements AfterViewInit {
  readonly eyebrow = input('Arenas parceiras');
  readonly title = input('Arenas que evoluíram');
  readonly description = input('Arenas que já fazem parte da comunidade da areia. A sua pode ser a próxima.');

  protected readonly arenas = ARENAS;
  protected readonly atStart = signal(true);
  protected readonly atEnd = signal(false);

  private readonly track = viewChild<ElementRef<HTMLUListElement>>('track');

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

  protected onSpotlightMove(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    el.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }
}

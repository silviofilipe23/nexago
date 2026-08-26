import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';
import { ButtonDirective } from '../../../shared/ui/button.directive';

type ListingStatus = 'open' | 'almost_full' | 'live';

interface TournamentPlaceholder {
  id: string;
  name: string;
  sport: string;
  place: string;
  dateLabel: string;
  status: ListingStatus;
  categoriesCount: number;
  enrolledCount: number;
  liveMatchesNow: number;
  leagueStageName: string | null;
}

const STATUS_META: Record<ListingStatus, { label: string; toneClass: string }> = {
  live: { label: 'Ao vivo', toneClass: 'border-live/30 bg-live/10 text-live' },
  open: { label: 'Inscrições abertas', toneClass: 'border-brand/30 bg-brand-tint text-brand' },
  almost_full: { label: 'Últimas vagas', toneClass: 'border-pending/30 bg-pending/10 text-pending' },
};

// Placeholder estático — leitura ao vivo do Firestore (`tournaments`) fica para fase posterior
// de migração. 3 torneios representativos, mesmo formato de `TournamentSummary`.
const TOURNAMENTS: TournamentPlaceholder[] = [
  {
    id: 't1',
    name: 'Copa Litoral de Beach Tennis',
    sport: 'Beach tennis',
    place: 'Praia Grande · SP',
    dateLabel: '14 e 15 de setembro',
    status: 'open',
    categoriesCount: 6,
    enrolledCount: 48,
    liveMatchesNow: 0,
    leagueStageName: 'Liga nexaGO · Etapa 2',
  },
  {
    id: 't2',
    name: 'Open da Areia Vôlei',
    sport: 'Vôlei de praia',
    place: 'Florianópolis · SC',
    dateLabel: '28 de setembro',
    status: 'almost_full',
    categoriesCount: 4,
    enrolledCount: 32,
    liveMatchesNow: 0,
    leagueStageName: null,
  },
  {
    id: 't3',
    name: 'Circuito Dunas — Etapa Final',
    sport: 'Beach tennis',
    place: 'Natal · RN',
    dateLabel: 'Hoje',
    status: 'live',
    categoriesCount: 8,
    enrolledCount: 64,
    liveMatchesNow: 3,
    leagueStageName: 'Liga nexaGO · Final',
  },
];

/**
 * Porta de `TorneiosDestaque` (site Next.js) — vitrine de torneios públicos na home. Diferente
 * do original (recebe `tournaments` prontos da page via leitura Firestore), aqui a lista é
 * placeholder estático — ver comentário em `TOURNAMENTS`. Como a lista nunca fica vazia, não há
 * o early-return condicional do original.
 */
@Component({
  selector: 'app-torneios-destaque-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ButtonDirective, RouterLink],
  template: `
    <section id="torneios-destaque" class="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 sm:py-32">
      <div nxReveal class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div class="max-w-2xl">
          <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Hub público</p>
          <h2 class="font-display text-[clamp(1.9rem,5vw,3.25rem)] font-700 leading-tight tracking-tight text-fg">
            Torneios abertos na areia
          </h2>
          <p class="mt-4 text-balance text-base text-text-mute sm:text-lg">
            Etapas de beach tennis e vôlei de praia com inscrições abertas. Acompanhe chaves e resultados em tempo
            real.
          </p>
        </div>
        <a nxButton="secondary" routerLink="/torneios" class="shrink-0">
          Ver todos os torneios
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      </div>

      <ul class="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        @for (t of tournaments; track t.id; let i = $index) {
          <li>
            <div nxReveal [nxRevealDelay]="i * 60" class="h-full">
              <a
                routerLink="/torneios"
                (mousemove)="onSpotlightMove($event)"
                class="group relative flex h-full flex-col overflow-hidden rounded-5 border border-line bg-surface-1 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-brand/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <span
                  aria-hidden="true"
                  class="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style="background: radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), rgba(255,106,26,0.13), transparent 60%)"
                ></span>

                <div class="relative aspect-[16/10] overflow-hidden bg-surface-2">
                  <div class="flex h-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface-1">
                    <svg class="size-9 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                    </svg>
                  </div>
                  <div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-1/90 to-transparent"></div>
                </div>

                <div class="flex flex-1 flex-col p-6">
                  <div class="mb-4 flex items-center justify-between gap-3">
                    <span class="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">{{ t.sport }}</span>
                    <span class="inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-600" [class]="statusMeta[t.status].toneClass">
                      @if (t.status === 'live') {
                        <span class="relative flex size-1.5">
                          <span class="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-70"></span>
                          <span class="relative inline-flex size-1.5 rounded-full bg-live"></span>
                        </span>
                      }
                      {{ statusMeta[t.status].label }}
                    </span>
                  </div>

                  <h3 class="font-display text-lg font-700 leading-snug tracking-tight text-fg transition-colors group-hover:text-brand">
                    {{ t.name }}
                  </h3>

                  <dl class="mt-4 space-y-2 text-sm text-text-mute">
                    <div>
                      <dt class="sr-only">Local</dt>
                      <dd class="flex items-center gap-2">
                        <svg class="size-4 shrink-0 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span class="truncate">{{ t.place }}</span>
                      </dd>
                    </div>
                    <div>
                      <dt class="sr-only">Data</dt>
                      <dd class="flex items-center gap-2">
                        <svg class="size-4 shrink-0 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                          <path d="M16 2v4M8 2v4M3 10h18" />
                        </svg>
                        <span>{{ t.dateLabel }}</span>
                      </dd>
                    </div>
                    <div>
                      <dt class="sr-only">Categorias</dt>
                      <dd class="flex items-center gap-2">
                        <svg class="size-4 shrink-0 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                          <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
                          <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
                        </svg>
                        <span>{{ t.categoriesCount }} {{ t.categoriesCount === 1 ? 'categoria' : 'categorias' }}</span>
                      </dd>
                    </div>
                  </dl>

                  <div class="mt-6 flex items-center gap-4 border-t border-line pt-4 text-xs text-text-dim">
                    @if (t.liveMatchesNow > 0) {
                      <span class="font-600 text-live">{{ t.liveMatchesNow }} ao vivo</span>
                    }
                    <span>{{ t.enrolledCount }} inscritos</span>
                    @if (t.leagueStageName) {
                      <span class="truncate">· {{ t.leagueStageName }}</span>
                    }
                  </div>
                </div>
              </a>
            </div>
          </li>
        }
      </ul>
    </section>
  `,
})
export class TorneiosDestaqueSection {
  protected readonly tournaments = TOURNAMENTS;
  protected readonly statusMeta = STATUS_META;

  protected onSpotlightMove(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    el.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }
}

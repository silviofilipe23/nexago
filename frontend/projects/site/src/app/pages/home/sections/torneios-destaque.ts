import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../../shared/reveal.directive';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { StatusBadge } from '../../../shared/hub/status-badge';
import { getActiveTournaments } from '../../../../lib/firestore/tournaments';
import { sportLabel } from '../../../../lib/format';
import { toSlugId } from '../../../../lib/slug';
import type { TournamentSummary } from '../../../../lib/firestore/types';

/**
 * Porta de `TorneiosDestaque` (site Next.js) — vitrine de torneios públicos na home. Diferente
 * da fase 1 (placeholder estático), agora busca `tournaments` reais do Firestore no
 * `constructor` (CSR puro — o fetch acontece sempre no navegador do visitante).
 */
@Component({
  selector: 'app-torneios-destaque-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, ButtonDirective, RouterLink, StatusBadge],
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

      @if (loading()) {
        <ul class="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          @for (i of skeletonSlots; track i) {
            <li class="h-[360px] animate-pulse rounded-5 bg-surface-1"></li>
          }
        </ul>
      } @else if (tournaments().length === 0) {
        <p class="mt-14 text-sm text-text-mute">Nenhum torneio com inscrições abertas no momento.</p>
      } @else {
        <ul class="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          @for (t of tournaments(); track t.id; let i = $index) {
            <li>
              <div nxReveal [nxRevealDelay]="i * 60" class="h-full">
                <a
                  [routerLink]="['/torneios', slugFor(t)]"
                  (mousemove)="onSpotlightMove($event)"
                  class="group relative flex h-full flex-col overflow-hidden rounded-5 border border-line bg-surface-1 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-brand/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  <span
                    aria-hidden="true"
                    class="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style="background: radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), rgba(255,106,26,0.13), transparent 60%)"
                  ></span>

                  <div class="relative aspect-[16/10] overflow-hidden bg-surface-2">
                    @if (t.coverUrl; as cover) {
                      <img [src]="cover" [alt]="t.name" loading="lazy" class="size-full object-cover" />
                    } @else {
                      <div class="flex h-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface-1">
                        <svg class="size-9 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                          <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                        </svg>
                      </div>
                    }
                    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-1/90 to-transparent"></div>
                  </div>

                  <div class="flex flex-1 flex-col p-6">
                    <div class="mb-4 flex items-center justify-between gap-3">
                      <span class="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">{{ sportLabel(t.sport) }}</span>
                      <app-status-badge [status]="t.listingStatus" />
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
                          <span class="truncate">{{ placeFor(t) }}</span>
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
      }
    </section>
  `,
})
export class TorneiosDestaqueSection {
  protected readonly tournaments = signal<TournamentSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly skeletonSlots = [0, 1, 2];
  protected readonly sportLabel = sportLabel;

  constructor() {
    getActiveTournaments(6).then((tournaments) => {
      this.tournaments.set(tournaments);
      this.loading.set(false);
    });
  }

  protected slugFor(t: TournamentSummary): string {
    return toSlugId(t.name, t.id);
  }

  protected placeFor(t: TournamentSummary): string {
    return t.locationName ?? [t.city, t.state].filter(Boolean).join(' · ');
  }

  protected onSpotlightMove(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    el.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }
}

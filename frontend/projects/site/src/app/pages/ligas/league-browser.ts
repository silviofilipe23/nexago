import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RevealDirective } from '../../shared/reveal.directive';
import { Chip, FilterGroup, SearchInput } from '../../shared/hub/filter-controls';
import { LeagueCard } from './league-card';
import type { LeagueSummary } from '../../../lib/firestore/types';

/**
 * Porta de `LeagueBrowser` (site Next.js) — listagem de ligas com filtros client-side sobre a
 * lista já carregada (somente leitura, sem novas consultas). Busca por nome; filtro por
 * temporada, com opções derivadas do próprio dataset. Contagem anunciada via aria-live.
 */
@Component({
  selector: 'app-league-browser',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, SearchInput, FilterGroup, Chip, LeagueCard],
  template: `
    <div class="mt-12">
      @if (showControls()) {
        <div class="rounded-4 border border-line bg-surface-1 p-4 sm:p-5">
          <app-search-input
            [value]="query()"
            (valueChange)="query.set($event)"
            placeholder="Buscar liga pelo nome"
            label="Buscar ligas"
          />
          @if (seasons().length > 1) {
            <div class="mt-4">
              <app-filter-group label="Temporada">
                <app-chip [active]="season() === null" (pressed)="season.set(null)">Todas</app-chip>
                @for (s of seasons(); track s) {
                  <app-chip [active]="season() === s" (pressed)="season.set(s)">{{ s }}</app-chip>
                }
              </app-filter-group>
            </div>
          }
        </div>

        <div class="mt-6 flex items-center justify-between gap-4">
          <p class="text-sm text-text-mute" aria-live="polite">{{ countLabel() }}</p>
          @if (hasActiveFilters()) {
            <button
              type="button"
              (click)="clearAll()"
              class="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-600 text-text-mute transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
              Limpar filtros
            </button>
          }
        </div>
      }

      @if (filtered().length > 0) {
        <div [class]="(showControls() ? 'mt-6 ' : '') + 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'">
          @for (l of filtered(); track l.id; let i = $index) {
            <div nxReveal [nxRevealDelay]="i * 50" class="h-full">
              <app-league-card [league]="l" />
            </div>
          }
        </div>
      } @else {
        <div class="mt-6 rounded-5 border border-line bg-surface-1 p-12 text-center">
          <div class="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full border border-line bg-surface-2 text-text-dim">
            <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" />
              <line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" />
              <line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" />
              <line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" />
            </svg>
          </div>
          <p class="font-display text-lg font-700 text-fg">Nenhuma liga encontrada</p>
          <p class="mx-auto mt-2 max-w-sm text-sm text-text-mute">Tente ajustar a busca ou o filtro de temporada.</p>
          <button
            type="button"
            (click)="clearAll()"
            class="mt-5 inline-flex items-center gap-1.5 rounded-pill border border-line-strong bg-surface-0 px-4 py-2 text-sm font-600 text-fg transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Limpar filtros
          </button>
        </div>
      }
    </div>
  `,
})
export class LeagueBrowser {
  readonly leagues = input.required<LeagueSummary[]>();

  protected readonly query = signal('');
  protected readonly season = signal<string | null>(null);

  protected readonly seasons = computed(() =>
    [...new Set(this.leagues().map((l) => l.seasonLabel).filter((v): v is string => Boolean(v)))].sort(),
  );

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const season = this.season();
    return this.leagues().filter((l) => {
      if (season && l.seasonLabel !== season) return false;
      if (q && !l.name.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  protected readonly hasActiveFilters = computed(() => Boolean(this.query() || this.season()));

  // Sem dimensões úteis pra filtrar (poucas ligas, uma única temporada): grid puro.
  protected readonly showControls = computed(() => this.leagues().length > 3 || this.seasons().length > 1);

  protected readonly countLabel = computed(() => {
    const total = this.leagues().length;
    const count = this.filtered().length;
    const noun = total === 1 ? 'liga' : 'ligas';
    return count === total ? `${total} ${noun}` : `${count} de ${total} ${noun}`;
  });

  protected clearAll(): void {
    this.query.set('');
    this.season.set(null);
  }
}

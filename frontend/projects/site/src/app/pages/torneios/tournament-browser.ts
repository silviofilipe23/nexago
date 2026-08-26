import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TournamentCard } from './tournament-card';
import { SearchInput, FilterGroup, Chip } from '../../shared/hub/filter-controls';
import { sportLabel, STATUS_META } from '../../../lib/format';
import { isActiveStatus } from '../../../lib/firestore/tournament-status';
import type { TournamentListingStatus, TournamentSummary } from '../../../lib/firestore/types';

const STATUS_ORDER: TournamentListingStatus[] = ['live', 'open', 'almost_full', 'closed', 'ended'];

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

/**
 * Porta de `TournamentBrowser` (site Next.js) — listagem de torneios com filtros client-side
 * sobre a lista já carregada (somente leitura, sem novas consultas). Opções derivadas do
 * próprio dataset para não exibir filtros vazios. Busca por nome/local; filtros por esporte,
 * status e estado. Contagem de resultados é anunciada via aria-live.
 */
@Component({
  selector: 'app-tournament-browser',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TournamentCard, SearchInput, FilterGroup, Chip],
  host: { class: 'contents' },
  template: `
    <div class="mt-12">
      <!-- Barra de filtros -->
      <div class="rounded-4 border border-line bg-surface-1 p-4 sm:p-5">
        <app-search-input
          [value]="query()"
          (valueChange)="query.set($event)"
          placeholder="Buscar por nome, arena ou cidade"
          label="Buscar torneios"
        />

        <div class="mt-4 flex flex-col gap-4">
          @if (sports().length > 1) {
            <app-filter-group label="Esporte">
              <app-chip [active]="sport() === null" (pressed)="sport.set(null)">Todos</app-chip>
              @for (s of sports(); track s) {
                <app-chip [active]="sport() === s" (pressed)="sport.set(s)">{{ sportLabel(s) }}</app-chip>
              }
            </app-filter-group>
          }

          @if (statuses().length > 1) {
            <app-filter-group label="Status">
              <app-chip [active]="status() === null" (pressed)="status.set(null)">Todos</app-chip>
              @for (s of statuses(); track s) {
                <app-chip [active]="status() === s" (pressed)="status.set(s)">{{ statusMeta[s].label }}</app-chip>
              }
            </app-filter-group>
          }

          @if (states().length > 1) {
            <app-filter-group label="Estado">
              <label class="sr-only" for="filter-state">Filtrar por estado</label>
              <select
                id="filter-state"
                (change)="state.set($any($event.target).value || null)"
                class="h-9 cursor-pointer rounded-pill border border-line bg-surface-0 px-4 text-sm font-600 text-fg focus-visible:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <option value="" [selected]="state() === null">Todos os estados</option>
                @for (uf of states(); track uf) {
                  <option [value]="uf" [selected]="uf === state()">{{ uf }}</option>
                }
              </select>
            </app-filter-group>
          }
        </div>
      </div>

      <!-- Contagem + limpar -->
      <div class="mt-6 flex items-center justify-between gap-4">
        <p class="text-sm text-text-mute" aria-live="polite">
          {{ countLabel() }}
        </p>
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

      <!-- Resultados — ativos no grid principal, encerrados na seção abaixo -->
      @if (filtered().length > 0) {
        @if (active().length > 0) {
          <ul class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            @for (t of active(); track t.id) {
              <li>
                <app-tournament-card [t]="t" />
              </li>
            }
          </ul>
        } @else {
          <p class="mt-6 rounded-4 border border-line bg-surface-1 px-5 py-4 text-sm text-text-mute">
            Nenhum torneio aberto ou em andamento no momento — veja os que já aconteceram abaixo.
          </p>
        }

        @if (ended().length > 0) {
          <section class="mt-14">
            <h2 class="font-display text-xl font-700 tracking-tight text-fg">Já aconteceram</h2>
            <p class="mt-1 text-sm text-text-mute">
              {{ ended().length === 1 ? '1 torneio encerrado' : ended().length + ' torneios encerrados' }}
            </p>
            <ul class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              @for (t of ended(); track t.id) {
                <li>
                  <app-tournament-card [t]="t" />
                </li>
              }
            </ul>
          </section>
        }
      } @else {
        <div class="mt-6 rounded-5 border border-line bg-surface-1 p-12 text-center">
          <div class="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full border border-line bg-surface-2 text-text-dim">
            <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 4H14a2 2 0 0 0-2 2v2" /><path d="M17 8V4" />
              <path d="M3 22v-2a2 2 0 0 1 2-2h4" /><path d="m3 3 18 18" />
              <path d="M13.86 13.86 12 20l-1.86-4.14a1 1 0 0 0-.55-.55L5 13.4l4.14-1.86a1 1 0 0 0 .55-.55L11.4 7l1.55 3.45" />
            </svg>
          </div>
          <p class="font-display text-lg font-700 text-fg">Nenhum torneio encontrado</p>
          <p class="mx-auto mt-2 max-w-sm text-sm text-text-mute">
            Tente ajustar a busca ou os filtros para ver mais resultados.
          </p>
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
export class TournamentBrowser {
  readonly tournaments = input.required<TournamentSummary[]>();

  protected readonly query = signal('');
  protected readonly sport = signal<string | null>(null);
  protected readonly status = signal<TournamentListingStatus | null>(null);
  protected readonly state = signal<string | null>(null);

  protected readonly sportLabel = sportLabel;
  protected readonly statusMeta = STATUS_META;

  protected readonly sports = computed(() => unique(this.tournaments().map((t) => t.sport)));
  protected readonly statuses = computed(() => {
    const present = new Set(this.tournaments().map((t) => t.listingStatus));
    return STATUS_ORDER.filter((s) => present.has(s));
  });
  protected readonly states = computed(() => unique(this.tournaments().map((t) => t.state)).sort());

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const sport = this.sport();
    const status = this.status();
    const state = this.state();
    return this.tournaments().filter((t) => {
      if (sport && t.sport !== sport) return false;
      if (status && t.listingStatus !== status) return false;
      if (state && t.state !== state) return false;
      if (q) {
        const haystack = [t.name, t.city, t.locationName, t.state].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

  // A lista já chega ordenada (ativos por data crescente, encerrados decrescente) — aqui só
  // separa em duas seções, preservando essa ordem.
  protected readonly active = computed(() => this.filtered().filter((t) => isActiveStatus(t.listingStatus)));
  protected readonly ended = computed(() => this.filtered().filter((t) => !isActiveStatus(t.listingStatus)));

  protected readonly hasActiveFilters = computed(
    () => Boolean(this.query()) || this.sport() !== null || this.status() !== null || this.state() !== null,
  );

  protected readonly countLabel = computed(() => {
    const total = this.tournaments().length;
    const shown = this.filtered().length;
    const noun = total === 1 ? 'torneio' : 'torneios';
    return shown === total ? `${total} ${noun}` : `${shown} de ${total} ${noun}`;
  });

  protected clearAll(): void {
    this.query.set('');
    this.sport.set(null);
    this.status.set(null);
    this.state.set(null);
  }
}

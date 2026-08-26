import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { sportLabel } from '../../../lib/format';
import { toSlugId } from '../../../lib/slug';
import type { ArenaSummary } from '../../../lib/firestore/types';

/**
 * Card de arena para a vitrine pública — usado na home (`ArenasCarouselSection`) e na
 * listagem `/arenas`. Capa (foto/logo) com fallback gráfico, nome, localização e até 2
 * esportes. O card inteiro é o link para o perfil (`/arena/{slug-id}`).
 */
@Component({
  selector: 'app-arena-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'contents' },
  template: `
    <a
      [routerLink]="href()"
      class="group/arena flex h-full flex-col overflow-hidden rounded-4 border border-line bg-surface-1 transition-colors duration-200 ease-out hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
    >
      <div class="relative aspect-[16/10] overflow-hidden bg-surface-2">
        @if (cover(); as src) {
          <img
            [src]="src"
            [alt]="'Arena ' + arena().name"
            loading="lazy"
            class="size-full object-cover transition-transform duration-300 ease-out group-hover/arena:scale-[1.04] motion-reduce:transition-none"
          />
        } @else {
          <div class="flex h-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface-1">
            <svg class="size-9 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
              <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
              <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
              <path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />
            </svg>
          </div>
        }
        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-1/90 to-transparent"></div>
      </div>

      <div class="flex flex-1 flex-col p-4">
        <h3 class="font-display text-base font-700 leading-tight tracking-tight text-fg">{{ arena().name }}</h3>
        @if (place(); as p) {
          <p class="mt-1.5 inline-flex items-center gap-1.5 text-sm text-text-mute">
            <svg class="size-3.5 shrink-0 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span class="truncate">{{ p }}</span>
          </p>
        }
        @if (sportLabels().length > 0) {
          <div class="mt-auto flex flex-wrap gap-1.5 pt-4">
            @for (label of sportLabels(); track label) {
              <span class="rounded-pill border border-brand/20 bg-brand-tint px-2.5 py-1 text-xs font-600 text-brand">{{ label }}</span>
            }
          </div>
        }
      </div>
    </a>
  `,
})
export class ArenaCard {
  readonly arena = input.required<ArenaSummary>();

  protected readonly href = computed(() => `/arena/${toSlugId(this.arena().name, this.arena().id)}`);
  protected readonly place = computed(() => [this.arena().city, this.arena().state].filter(Boolean).join(' · '));
  protected readonly cover = computed(() => this.arena().photoUrls[0] ?? this.arena().logoUrl ?? null);
  // Deduplica pelo rótulo exibido: courtTypes diferentes podem cair no mesmo label genérico.
  protected readonly sportLabels = computed(() => [...new Set(this.arena().sports.map(sportLabel))].slice(0, 2));
}

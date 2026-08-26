import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSlugId } from '../../../lib/slug';
import type { LeagueSummary } from '../../../lib/firestore/types';

/**
 * Porta de `LeagueCard` (site Next.js). Capa (coverUrl) com fallback gráfico, nome, temporada e
 * nº de etapas. O card inteiro é o link para o perfil da liga (`/ligas/{slug-id}`). Mesma
 * linguagem visual do `ArenaCard` já portado.
 */
@Component({
  selector: 'app-league-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'contents' },
  template: `
    <a
      [routerLink]="href()"
      class="group/league flex h-full flex-col overflow-hidden rounded-4 border border-line bg-surface-1 transition-colors duration-200 ease-out hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:transition-none"
    >
      <div class="relative aspect-[16/10] overflow-hidden bg-surface-2">
        @if (league().coverUrl; as src) {
          <img
            [src]="src"
            [alt]="'Liga ' + league().name"
            loading="lazy"
            class="size-full object-cover transition-transform duration-300 ease-out group-hover/league:scale-[1.04] motion-reduce:transition-none"
          />
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

      <div class="flex flex-1 flex-col p-5">
        <h3 class="font-display text-lg font-700 leading-tight tracking-tight text-fg transition-colors group-hover/league:text-brand">
          {{ league().name }}
        </h3>

        <dl class="mt-3 space-y-2 text-sm text-text-mute">
          @if (league().seasonLabel; as season) {
            <div>
              <dt class="sr-only">Temporada</dt>
              <dd class="flex items-center gap-2">
                <svg class="size-4 shrink-0 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                <span class="truncate">{{ season }}</span>
              </dd>
            </div>
          }
          @if (stageCount() > 0) {
            <div>
              <dt class="sr-only">Etapas</dt>
              <dd class="flex items-center gap-2">
                <svg class="size-4 shrink-0 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                  <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
                  <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
                </svg>
                <span>{{ stageCount() }} {{ stageCount() === 1 ? 'etapa' : 'etapas' }}</span>
              </dd>
            </div>
          }
        </dl>
      </div>
    </a>
  `,
})
export class LeagueCard {
  readonly league = input.required<LeagueSummary>();

  protected readonly href = computed(() => `/ligas/${toSlugId(this.league().name, this.league().id)}`);
  protected readonly stageCount = computed(() => this.league().stages.length);
}

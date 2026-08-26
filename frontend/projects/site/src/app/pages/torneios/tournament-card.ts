import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatusBadge } from '../../shared/hub/status-badge';
import { sportLabel } from '../../../lib/format';
import { toSlugId } from '../../../lib/slug';
import type { TournamentSummary } from '../../../lib/firestore/types';

/**
 * Porta de `TournamentCard` (site Next.js) — card de torneio usado na listagem `/torneios`.
 * Mesma linguagem visual do card já portado em `torneios-destaque.ts` (home): spotlight que
 * segue o cursor via custom properties `--mx`/`--my`, capa 16:10 com fallback de troféu.
 */
@Component({
  selector: 'app-tournament-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, StatusBadge],
  host: { class: 'contents' },
  template: `
    <a
      [routerLink]="['/torneios', slug()]"
      (mousemove)="onSpotlightMove($event)"
      class="group relative flex h-full flex-col overflow-hidden rounded-5 border border-line bg-surface-1 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-brand/40 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style="background: radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), rgba(255,106,26,0.13), transparent 60%)"
      ></span>

      <div class="relative aspect-[16/10] overflow-hidden bg-surface-2">
        @if (t().coverUrl; as cover) {
          <img [src]="cover" alt="" loading="lazy" class="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04] motion-reduce:transition-none" />
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
          <span class="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">{{ sportLabel(t().sport) }}</span>
          <app-status-badge [status]="t().listingStatus" />
        </div>

        <h3 class="font-display text-lg font-700 leading-snug tracking-tight text-fg transition-colors group-hover:text-brand">
          {{ t().name }}
        </h3>

        <dl class="mt-4 space-y-2 text-sm text-text-mute">
          <div>
            <dt class="sr-only">Local</dt>
            <dd class="flex items-center gap-2">
              <svg class="size-4 shrink-0 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span class="truncate">{{ place() }}</span>
            </dd>
          </div>
          @if (t().dateLabel; as dateLabel) {
            <div>
              <dt class="sr-only">Data</dt>
              <dd class="flex items-center gap-2">
                <svg class="size-4 shrink-0 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                <span>{{ dateLabel }}</span>
              </dd>
            </div>
          }
          @if (t().categoriesCount > 0) {
            <div>
              <dt class="sr-only">Categorias</dt>
              <dd class="flex items-center gap-2">
                <svg class="size-4 shrink-0 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                  <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
                  <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
                </svg>
                <span>{{ t().categoriesCount }} {{ t().categoriesCount === 1 ? 'categoria' : 'categorias' }}</span>
              </dd>
            </div>
          }
        </dl>

        <div class="mt-6 flex items-center gap-4 border-t border-line pt-4 text-xs text-text-dim">
          @if (t().liveMatchesNow > 0) {
            <span class="font-600 text-live">{{ t().liveMatchesNow }} ao vivo</span>
          }
          <span>{{ t().enrolledCount }} inscritos</span>
          @if (t().leagueStageName; as stageName) {
            <span class="truncate">· {{ stageName }}</span>
          }
        </div>
      </div>
    </a>
  `,
})
export class TournamentCard {
  readonly t = input.required<TournamentSummary>();

  protected readonly sportLabel = sportLabel;
  protected readonly slug = computed(() => toSlugId(this.t().name, this.t().id));
  protected readonly place = computed(() => {
    const t = this.t();
    return [t.locationName, t.city].filter(Boolean).join(' · ') || t.city || 'Local a definir';
  });

  protected onSpotlightMove(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    el.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }
}

import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { tournamentCoverOrDefault } from '@nexago/tournament-covers';
import { StatusBadge } from '../../../shared/hub/status-badge';
import { getTournamentById } from '../../../../lib/firestore/tournaments';
import { formatDate, sportLabel } from '../../../../lib/format';
import { toSlugId } from '../../../../lib/slug';
import type { TournamentSummary } from '../../../../lib/firestore/types';

/**
 * Bloco "Torneio" do post: lê o torneio AO VIVO (`getTournamentById`, que já aplica a regra de
 * público/rascunho e o status de `tournament-status.ts`) e mostra status, data e local com link
 * para `/torneios/<slug-id>`. Se o torneio sumiu ou não é público, o bloco some em silêncio.
 */
@Component({
  selector: 'app-blog-tournament-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, StatusBadge],
  host: { class: 'block', '[class.hidden]': 'gone()' },
  template: `
    @if (loading()) {
      <div class="h-28 animate-pulse rounded-4 bg-surface-1" aria-hidden="true"></div>
    } @else if (tournament(); as t) {
      <a
        [routerLink]="['/torneios', slug()]"
        class="group flex items-center gap-4 rounded-4 border border-line bg-surface-1 p-3 transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:p-4"
      >
        <div class="size-20 shrink-0 overflow-hidden rounded-3 bg-surface-2 sm:size-24">
          @if (cover(); as c) {
            <img [src]="c" alt="" loading="lazy" class="size-full object-cover" />
          } @else {
            <div class="flex size-full items-center justify-center text-text-dim">
              <svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </div>
          }
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-[11px] font-600 uppercase tracking-wider text-text-dim">
              Torneio{{ sport() ? ' · ' + sport() : '' }}
            </span>
            <app-status-badge [status]="t.listingStatus" />
          </div>
          <p class="mt-1.5 line-clamp-2 font-display text-base font-700 leading-snug tracking-tight text-fg transition-colors group-hover:text-brand sm:text-lg">
            {{ t.name }}
          </p>
          <p class="mt-1 truncate text-sm text-text-mute">{{ details() }}</p>
        </div>

        <svg class="size-5 shrink-0 text-brand transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
      </a>
    }
  `,
})
export class BlogTournamentBlock {
  readonly tournamentId = input.required<string>();

  protected readonly tournament = signal<TournamentSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly gone = computed(() => !this.loading() && !this.tournament());

  protected readonly slug = computed(() => {
    const t = this.tournament();
    return t ? toSlugId(t.name, t.id) : '';
  });
  protected readonly cover = computed(() => {
    const t = this.tournament();
    return t ? tournamentCoverOrDefault(t.coverUrl, t.sport) : null;
  });
  protected readonly sport = computed(() => {
    const t = this.tournament();
    return t?.sport ? sportLabel(t.sport) : '';
  });
  protected readonly details = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const date = t.dateLabel || formatDate(t.startAt) || 'Data a definir';
    const place = [t.locationName, t.city].filter(Boolean).join(' · ') || 'Local a definir';
    return `${date} · ${place}`;
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.tournamentId();
      this.loading.set(true);
      this.tournament.set(null);
      let cancelled = false;
      onCleanup(() => (cancelled = true));

      getTournamentById(id).then((t) => {
        if (cancelled) return; // o post (ou o bloco) mudou enquanto lia
        this.tournament.set(t);
        this.loading.set(false);
      });
    });
  }
}

import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getArenaSummaryById } from '../../../../lib/firestore/arenas';
import { sportLabel } from '../../../../lib/format';
import { toSlugId } from '../../../../lib/slug';
import type { ArenaSummary } from '../../../../lib/firestore/types';

/**
 * Bloco "Arena" do post: lê a arena ao vivo (mesma regra da página `/arena/:id` — existe =
 * pública) e mostra capa, nome e cidade com link para `/arena/<slug-id>`. Horários livres e
 * "Reservar" são do app; no site, só o card. Se a arena sumiu, o bloco some em silêncio.
 */
@Component({
  selector: 'app-blog-arena-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'block', '[class.hidden]': 'gone()' },
  template: `
    @if (loading()) {
      <div class="h-28 animate-pulse rounded-4 bg-surface-1" aria-hidden="true"></div>
    } @else if (arena(); as a) {
      <a
        [routerLink]="href()"
        class="group flex items-center gap-4 rounded-4 border border-line bg-surface-1 p-3 transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:p-4"
      >
        <div class="size-20 shrink-0 overflow-hidden rounded-3 bg-surface-2 sm:size-24">
          @if (cover(); as src) {
            <img [src]="src" alt="" loading="lazy" class="size-full object-cover" />
          } @else {
            <div class="flex size-full items-center justify-center text-text-dim">
              <svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
          }
        </div>

        <div class="min-w-0 flex-1">
          <span class="font-mono text-[11px] font-600 uppercase tracking-wider text-text-dim">
            Arena{{ sports() ? ' · ' + sports() : '' }}
          </span>
          <p class="mt-1.5 line-clamp-2 font-display text-base font-700 leading-snug tracking-tight text-fg transition-colors group-hover:text-brand sm:text-lg">
            {{ a.name }}
          </p>
          @if (place()) {
            <p class="mt-1 truncate text-sm text-text-mute">{{ place() }}</p>
          }
        </div>

        <svg class="size-5 shrink-0 text-brand transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
      </a>
    }
  `,
})
export class BlogArenaBlock {
  readonly arenaId = input.required<string>();

  protected readonly arena = signal<ArenaSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly gone = computed(() => !this.loading() && !this.arena());

  // Mesmas derivações do `ArenaCard` da listagem `/arenas`.
  protected readonly href = computed(() => {
    const a = this.arena();
    return a ? `/arena/${toSlugId(a.name, a.id)}` : '/arenas';
  });
  protected readonly cover = computed(() => {
    const a = this.arena();
    return a ? (a.photoUrls[0] ?? a.logoUrl ?? null) : null;
  });
  protected readonly place = computed(() => {
    const a = this.arena();
    return a ? [a.city, a.state].filter(Boolean).join(' · ') : '';
  });
  protected readonly sports = computed(() => {
    const a = this.arena();
    return a ? [...new Set(a.sports.map(sportLabel))].slice(0, 2).join(', ') : '';
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.arenaId();
      this.loading.set(true);
      this.arena.set(null);
      let cancelled = false;
      onCleanup(() => (cancelled = true));

      getArenaSummaryById(id).then((a) => {
        if (cancelled) return;
        this.arena.set(a);
        this.loading.set(false);
      });
    });
  }
}

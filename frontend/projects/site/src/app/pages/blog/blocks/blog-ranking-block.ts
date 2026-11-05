import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { StoreButtons } from '../../../shared/ui/store-buttons';
import { getRankingTop, seasonYear, type RankingTopRow } from '../../../../lib/firestore/rankings';
import type { BlogRankingGender, BlogRankingMode } from '../../../../lib/firestore/blog';
import { sportLabel } from '../../../../lib/format';

const GENDER_LABEL: Record<BlogRankingGender, string> = {
  all: '',
  masculino: 'Masculino',
  feminino: 'Feminino',
  misto: 'Misto',
};

const POINTS = new Intl.NumberFormat('pt-BR');

/**
 * Bloco "Ranking" do post: top 5 da temporada atual (ano em São Paulo) do esporte, no modo e
 * gênero escolhidos — mesma regra do ranking do app (ver `lib/firestore/rankings.ts`). O ranking
 * completo é do app: rodapé com os botões de loja. Lista vazia: o bloco some.
 */
@Component({
  selector: 'app-blog-ranking-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StoreButtons],
  host: { class: 'block', '[class.hidden]': 'gone()' },
  template: `
    @if (loading()) {
      <div class="h-72 animate-pulse rounded-4 bg-surface-1" aria-hidden="true"></div>
    } @else if (rows().length > 0) {
      <section class="rounded-4 border border-line bg-surface-1" [attr.aria-label]="title()">
        <header class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
          <p class="font-display text-base font-700 tracking-tight text-fg">{{ title() }}</p>
          <p class="font-mono text-[11px] font-600 uppercase tracking-wider text-text-dim">{{ subtitle() }}</p>
        </header>

        <ol class="divide-y divide-line">
          @for (r of rows(); track r.id) {
            <li class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span
                class="w-6 shrink-0 text-center font-display text-base font-800 tabular-nums"
                [class]="r.rank === 1 ? 'text-brand' : 'text-text-mute'"
              >{{ r.rank }}</span>
              <span class="flex shrink-0 -space-x-2">
                @for (av of r.avatars; track $index) {
                  <!-- Iniciais por baixo: se a foto não carregar, ela some e as iniciais ficam. -->
                  <span class="relative flex size-9 items-center justify-center overflow-hidden rounded-full border-2 border-surface-1 bg-surface-2 text-[11px] font-700 text-text-mute">
                    {{ av.initials }}
                    @if (av.photoUrl) {
                      <img
                        [src]="av.photoUrl"
                        alt=""
                        loading="lazy"
                        (error)="$any($event.target).hidden = true"
                        class="absolute inset-0 size-full object-cover"
                      />
                    }
                  </span>
                }
              </span>
              <span class="min-w-0 flex-1 truncate text-sm font-600 text-fg">{{ r.name }}</span>
              <span class="shrink-0 text-sm tabular-nums text-text-mute">
                <span class="font-700 text-fg">{{ points(r.points) }}</span> pts
              </span>
            </li>
          }
        </ol>

        <footer class="flex flex-col gap-3 border-t border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p class="text-sm text-text-mute">Ranking completo no app nexaGO</p>
          <app-store-buttons size="sm" className="flex flex-wrap gap-2" />
        </footer>
      </section>
    }
  `,
})
export class BlogRankingBlock {
  readonly sport = input.required<string>();
  readonly mode = input.required<BlogRankingMode>();
  readonly gender = input.required<BlogRankingGender>();

  protected readonly rows = signal<RankingTopRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly gone = computed(() => !this.loading() && this.rows().length === 0);

  protected readonly title = computed(() => `Ranking de ${sportLabel(this.sport())}`);
  protected readonly subtitle = computed(() =>
    [this.mode() === 'teams' ? 'Equipes' : 'Atletas', GENDER_LABEL[this.gender()], `Temporada ${seasonYear()}`]
      .filter(Boolean)
      .join(' · '),
  );

  protected points(value: number): string {
    return POINTS.format(value);
  }

  constructor() {
    effect((onCleanup) => {
      const sport = this.sport();
      const mode = this.mode();
      const gender = this.gender();
      this.loading.set(true);
      this.rows.set([]);
      let cancelled = false;
      onCleanup(() => (cancelled = true));

      getRankingTop(sport, mode, gender).then((rows) => {
        if (cancelled) return;
        this.rows.set(rows);
        this.loading.set(false);
      });
    });
  }
}

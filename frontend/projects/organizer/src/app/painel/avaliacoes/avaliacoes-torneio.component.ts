import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import type { OrganizerTournament } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import {
  REVIEWS_EMPTY_TEXT,
  aspectRows,
  collectingText,
  commentCards,
  distributionRows,
  formatRating,
  hasPublicNumbers,
  isReviewWindowOpen,
  responseRateLabel,
  reviewAspectChips,
  reviewWindowLabel,
  reviewsCountLabel,
  reviewsEmptyState,
  starsText,
  type AnonymousReview,
  type CommentFilter,
  type TournamentReviewSummary,
} from '../data/tournament-reviews';
import { watchAnonymousReviews, watchTournamentReviewSummary } from '../data/tournament-reviews-repository';
import { OgBarRowComponent } from '../ui/bar-row.component';
import { OgCardComponent } from '../ui/card.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';

type ReviewTournament = Pick<OrganizerTournament, 'name' | 'status' | 'endAt'>;
type View = 'loading' | 'failed' | 'notFound' | 'empty' | 'collecting' | 'full';

/** Avaliações dos atletas sobre o torneio — spec §4. Anônimas: nada aqui identifica o atleta.
 *  Resumo e comentários chegam ao vivo; os comentários só são pedidos com 3+ avaliações (a rule
 *  negaria antes disso). */
@Component({
  selector: 'og-avaliacoes-torneio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgBarRowComponent, NxPageLoadingComponent],
  template: `
    <og-page-header title="Avaliações" [subtitle]="headerSubtitle()" />

    <div class="og-content">
      @switch (view()) {
        @case ('loading') {
          <app-nx-page-loading title="Carregando avaliações…" />
        }
        @case ('failed') {
          <p class="og-rv-empty">Não foi possível carregar as avaliações. Recarregue a página.</p>
        }
        @case ('notFound') {
          <p class="og-rv-empty">Torneio não encontrado.</p>
        }
        @case ('empty') {
          <og-card kicker="Avaliação dos atletas">
            <p class="og-rv-collecting">{{ emptyText() }}</p>
          </og-card>
        }
        @case ('collecting') {
          <og-card kicker="Avaliação dos atletas" [title]="windowLabel()">
            <p class="og-rv-collecting">{{ collecting() }}</p>
          </og-card>
        }
        @case ('full') {
          <div class="og-rv">
            <og-card pad="sm">
              <div class="og-rv-top">
                <div class="og-rv-average">{{ average() }}<span class="og-rv-star" aria-hidden="true">★</span></div>
                <div class="og-rv-top-meta">
                  <div class="og-rv-count">{{ countLabel() }}</div>
                  <div>{{ responseRate() }}</div>
                  <span class="og-rv-window" [class.open]="windowOpen()">{{ windowLabel() }}</span>
                </div>
              </div>
            </og-card>

            <div class="og-rv-grid">
              <og-card kicker="Distribuição" title="Notas gerais">
                @for (row of distribution(); track row.stars; let last = $last) {
                  <og-bar-row [label]="row.label" [sub]="countOf(row.count)" [pct]="row.pct" [last]="last" />
                }
              </og-card>
              <og-card kicker="Aspectos" title="Do mais fraco ao mais forte">
                @for (a of aspects(); track a.key) {
                  <div class="og-rv-aspect">
                    <span class="og-rv-aspect-name">{{ a.label }}</span>
                    <span class="og-rv-aspect-val">{{ a.text }}</span>
                    <div class="og-rv-aspect-track"><span [style.width.%]="a.pct"></span></div>
                  </div>
                } @empty {
                  <p class="og-rv-empty">Nenhum aspecto recebeu nota.</p>
                }
              </og-card>
            </div>

            <og-card kicker="Comentários anônimos" [title]="commentsTitle()">
              <div card-action class="og-rv-filter" role="group" aria-label="Filtrar comentários">
                <button type="button" class="og-chip" [class.active]="filter() === 'all'" (click)="filter.set('all')">Todos</button>
                <button type="button" class="og-chip" [class.active]="filter() === 'low'" (click)="filter.set('low')">Só 1–2★</button>
              </div>
              @if (reviewsFailed()) {
                <p class="og-rv-empty">Não foi possível carregar os comentários.</p>
              } @else if (reviewsLoading()) {
                <p class="og-rv-empty">Carregando comentários…</p>
              } @else {
                @for (r of comments(); track r.id) {
                  <article class="og-rv-comment">
                    <div class="og-rv-comment-head">
                      <span class="og-rv-comment-stars" [attr.aria-label]="r.overall + ' de 5 estrelas'">{{ stars(r.overall) }}</span>
                      @for (chip of chips(r); track chip) {
                        <span class="og-rv-chip">{{ chip }}</span>
                      }
                    </div>
                    <p class="og-rv-comment-text">{{ r.comment }}</p>
                  </article>
                } @empty {
                  <p class="og-rv-empty">
                    {{ filter() === 'low' ? 'Nenhum comentário com 1 ou 2 estrelas.' : 'Nenhum atleta escreveu comentário.' }}
                  </p>
                }
              }
            </og-card>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .og-rv {
      container-type: inline-size;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .og-rv-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-rv-collecting {
      font-family: var(--nx-font-ui);
      font-size: 14px;
      line-height: 1.5;
      color: var(--nx-text);
      margin: 0;
    }
    .og-rv-top {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
    }
    .og-rv-average {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 48px;
      line-height: 1;
      color: var(--nx-text);
    }
    .og-rv-star {
      color: var(--nx-orange-500);
      font-size: 32px;
      margin-left: 6px;
    }
    .og-rv-top-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
    }
    .og-rv-count {
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .og-rv-window {
      align-self: flex-start;
      margin-top: 4px;
      padding: 3px 10px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-1);
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-mute);
    }
    .og-rv-window.open {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
    }
    .og-rv-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      align-items: start;
    }
    .og-rv-aspect {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-rv-aspect:last-child {
      border-bottom: none;
    }
    .og-rv-aspect-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-rv-aspect-val {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .og-rv-aspect-track {
      grid-column: 1 / -1;
      height: 6px;
      border-radius: 3px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }
    .og-rv-aspect-track span {
      display: block;
      height: 100%;
      background: var(--nx-orange-500);
    }
    .og-rv-filter {
      display: flex;
      gap: 8px;
    }
    .og-rv-comment {
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-rv-comment:last-child {
      border-bottom: none;
    }
    .og-rv-comment-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .og-rv-comment-stars {
      color: var(--nx-orange-500);
      letter-spacing: 1px;
      font-size: 14px;
    }
    .og-rv-chip {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-mute);
      background: var(--nx-surface-1);
      border-radius: var(--nx-r-pill);
      padding: 2px 8px;
    }
    .og-rv-comment-text {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 14px;
      line-height: 1.5;
      color: var(--nx-text);
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    @container (max-width: 720px) {
      .og-rv-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AvaliacoesTorneioComponent {
  readonly id = input<string>('');

  /** Relógio da tela: decide se a janela está aberta e qual estado vazio mostrar. */
  protected readonly now = signal(new Date());
  protected readonly tournamentLoading = signal(true);
  protected readonly summaryLoading = signal(true);
  protected readonly summaryFailed = signal(false);
  protected readonly tournament = signal<ReviewTournament | null>(null);
  protected readonly summary = signal<TournamentReviewSummary | null>(null);
  protected readonly reviews = signal<AnonymousReview[]>([]);
  protected readonly reviewsFailed = signal(false);
  /** Até o primeiro snapshot, lista vazia não quer dizer "ninguém comentou". */
  protected readonly reviewsLoading = signal(false);
  protected readonly filter = signal<CommentFilter>('all');

  /** A rule só libera os comentários com 3+ avaliações; abaixo disso nem se pede. */
  private readonly canReadComments = computed(() => {
    const s = this.summary();
    return s != null && hasPublicNumbers(s);
  });

  protected readonly view = computed<View>(() => {
    if (this.summaryLoading() || this.tournamentLoading()) return 'loading';
    if (this.summaryFailed()) return 'failed';
    const s = this.summary();
    if (!s) return this.tournament() ? 'empty' : 'notFound';
    return hasPublicNumbers(s) ? 'full' : 'collecting';
  });

  protected readonly headerSubtitle = computed(() => this.tournament()?.name ?? this.summary()?.tournamentName ?? '');
  protected readonly emptyText = computed(() => {
    const t = this.tournament();
    return t ? REVIEWS_EMPTY_TEXT[reviewsEmptyState(t, this.now())] : '';
  });
  protected readonly collecting = computed(() => {
    const s = this.summary();
    return s ? collectingText(s) : '';
  });
  protected readonly windowOpen = computed(() => {
    const s = this.summary();
    return s != null && isReviewWindowOpen(s, this.now());
  });
  protected readonly windowLabel = computed(() => {
    const s = this.summary();
    return s ? reviewWindowLabel(s, this.now()) : '';
  });
  protected readonly average = computed(() => {
    const s = this.summary();
    return s?.average != null ? formatRating(s.average) : '—';
  });
  protected readonly countLabel = computed(() => reviewsCountLabel(this.summary()?.count ?? 0));
  protected readonly responseRate = computed(() => {
    const s = this.summary();
    return s ? responseRateLabel(s) : '';
  });
  protected readonly distribution = computed(() => distributionRows(this.summary()?.distribution ?? null));
  protected readonly aspects = computed(() => aspectRows(this.summary()?.aspects ?? null));
  protected readonly comments = computed(() => commentCards(this.reviews(), this.filter()));
  protected readonly commentsTitle = computed(() => {
    if (this.reviewsLoading()) return '';
    const n = commentCards(this.reviews(), 'all').length;
    return n === 1 ? '1 comentário' : `${n} comentários`;
  });

  protected readonly countOf = reviewsCountLabel;
  protected readonly stars = starsText;
  protected readonly chips = reviewAspectChips;

  constructor() {
    effect((onCleanup) => {
      const tid = this.id();
      this.tournament.set(null);
      this.summary.set(null);
      this.summaryFailed.set(false);
      this.filter.set('all');
      this.now.set(new Date());
      if (!tid) {
        this.tournamentLoading.set(false);
        this.summaryLoading.set(false);
        return;
      }
      this.tournamentLoading.set(true);
      this.summaryLoading.set(true);
      let active = true;
      getTournament(tid)
        .then((t) => {
          if (active) this.tournament.set(t ? { name: t.name, status: t.status, endAt: t.endAt } : null);
        })
        // Sem o torneio a tela ainda mostra o resumo; sem os dois, "Torneio não encontrado".
        .catch(() => undefined)
        .finally(() => {
          if (active) this.tournamentLoading.set(false);
        });
      const stop = watchTournamentReviewSummary(
        tid,
        (s) => {
          this.summary.set(s);
          this.summaryFailed.set(false);
          this.summaryLoading.set(false);
        },
        () => {
          this.summaryFailed.set(true);
          this.summaryLoading.set(false);
        },
      );
      onCleanup(() => {
        active = false;
        stop();
      });
    });

    // Limpa no `onCleanup`, não no começo: trocar de torneio ou cair abaixo de 3 desmonta o
    // listener e zera a lista; sem listener aberto, nada é tocado.
    effect((onCleanup) => {
      const tid = this.id();
      if (!tid || !this.canReadComments()) return;
      this.reviewsLoading.set(true);
      const stop = watchAnonymousReviews(
        tid,
        (list) => {
          this.reviews.set(list);
          this.reviewsFailed.set(false);
          this.reviewsLoading.set(false);
        },
        () => {
          this.reviewsFailed.set(true);
          this.reviewsLoading.set(false);
        },
      );
      onCleanup(() => {
        stop();
        this.reviews.set([]);
        this.reviewsFailed.set(false);
        this.reviewsLoading.set(false);
      });
    });
  }
}

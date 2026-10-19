import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STORE_REVIEWS_API } from '../data/store-reviews-api';
import {
  REVIEWS_PREVIEW,
  REVIEW_SORT_OPTIONS,
  formatReviewDate,
  matchesReviewFilter,
  reviewChips,
  reviewCountLabel,
  reviewFilterChips,
  reviewSummary,
  sortReviews,
  type PublicReview,
  type ReviewFilter,
  type ReviewSort,
} from '../data/store-reviews-model';
import type { StoreProduct } from '../data/store-showcase-model';
import { trackLojaEvent } from './loja-telemetry';

/**
 * Avaliações na página do produto (web 02): nota média, distribuição, caimento, filtros e os
 * comentários de quem comprou. Lê o espelho público `storeShowcase/{id}/reviews`; sem a rule no
 * ar (ou sem Firebase), a seção some em vez de mostrar erro.
 */
@Component({
  selector: 'app-loja-avaliacoes',
  imports: [RouterLink],
  templateUrl: './loja-avaliacoes.component.html',
  styleUrl: './loja-avaliacoes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LojaAvaliacoesComponent {
  readonly product = input.required<StoreProduct>();
  /** Tamanho escolhido na página — liga o filtro "Tamanho M". */
  readonly size = input<{ valueId: string; label: string } | null>(null);

  private readonly api = inject(STORE_REVIEWS_API);

  protected readonly sortOptions = REVIEW_SORT_OPTIONS;
  protected readonly starSlots = [1, 2, 3, 4, 5];
  private readonly now = new Date();

  protected readonly reviews = signal<PublicReview[]>([]);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly filter = signal<ReviewFilter>('todas');
  protected readonly sort = signal<ReviewSort>('recentes');
  /** "Ver todas": abre a lista carregada inteira (as 100 mais recentes). */
  protected readonly expanded = signal(false);

  private readonly productId = computed(() => this.product().id);
  protected readonly summary = computed(() => reviewSummary(this.product()));
  /** O espelho do produto pode estar um passo atrás da lista: vale o maior. */
  protected readonly total = computed(() => Math.max(this.summary().count, this.reviews().length));
  protected readonly chips = computed(() => reviewFilterChips(this.reviews(), this.size()));
  protected readonly filtered = computed(() => {
    const size = this.size()?.valueId ?? null;
    const f = this.chips().some((c) => c.id === this.filter()) ? this.filter() : 'todas';
    return sortReviews(
      this.reviews().filter((r) => matchesReviewFilter(r, f, size)),
      this.sort(),
    );
  });
  protected readonly visible = computed(() => (this.expanded() ? this.filtered() : this.filtered().slice(0, REVIEWS_PREVIEW)));
  protected readonly remaining = computed(() => this.filtered().length - this.visible().length);
  protected readonly countLabel = computed(() => reviewCountLabel(this.total()));

  constructor() {
    effect((onCleanup) => {
      const id = this.productId();
      untracked(() => {
        this.reviews.set([]);
        this.loaded.set(false);
        this.failed.set(false);
        this.filter.set('todas');
        this.expanded.set(false);
      });
      if (!this.api) {
        untracked(() => this.failed.set(true));
        return;
      }
      const stop = this.api.watchProductReviews(
        id,
        (list) => {
          this.reviews.set(list);
          this.loaded.set(true);
        },
        () => this.failed.set(true),
      );
      onCleanup(stop);
    });
  }

  protected setFilter(id: ReviewFilter): void {
    this.filter.set(id);
    trackLojaEvent('loja_avaliacoes_filtro', { produto_id: this.productId(), filtro: id });
  }

  protected setSort(value: string): void {
    this.sort.set(value as ReviewSort);
  }

  protected date(r: PublicReview): string {
    return formatReviewDate(r.createdAt, this.now);
  }

  protected meta(r: PublicReview): string {
    return [this.date(r), r.variantLabel].filter(Boolean).join(' · ');
  }

  protected chipsOf(r: PublicReview): string[] {
    return reviewChips(r);
  }
}

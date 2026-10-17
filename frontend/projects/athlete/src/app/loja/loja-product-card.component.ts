import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCentsBRL } from '../data/cashback-model';
import {
  cardBadge,
  displayPriceCents,
  formatRating,
  pixPriceCents,
  priceVaries,
  showRating,
  strikePriceCents,
  type StoreProduct,
} from '../data/store-showcase-model';

/** Card da grade da vitrine (web): foto, selo, favoritar, categoria, nome, nota e preço. */
@Component({
  selector: 'app-loja-product-card',
  imports: [RouterLink],
  templateUrl: './loja-product-card.component.html',
  styleUrl: './loja-product-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'lj-card', '[class.lj-card--sold-out]': 'product().soldOut' },
})
export class LojaProductCardComponent {
  readonly product = input.required<StoreProduct>();
  readonly categoryLabel = input('');
  readonly pixDiscountPct = input<number | null>(null);
  readonly favorite = input(false);
  readonly now = input(new Date());

  readonly opened = output<void>();
  readonly favoriteToggled = output<void>();

  protected readonly badge = computed(() => cardBadge(this.product(), this.now()));
  protected readonly priceLabel = computed(() => formatCentsBRL(displayPriceCents(this.product())));
  protected readonly fromLabel = computed(() => (priceVaries(this.product()) ? 'a partir de' : null));
  protected readonly strikeLabel = computed(() => {
    const cents = strikePriceCents(this.product());
    return cents === null ? null : formatCentsBRL(cents);
  });
  protected readonly pixLabel = computed(() => {
    const pct = this.pixDiscountPct();
    return pct === null ? null : formatCentsBRL(pixPriceCents(displayPriceCents(this.product()), pct));
  });
  protected readonly rating = computed(() => {
    const p = this.product();
    return showRating(p) ? { avg: formatRating(p.ratingAvg!), count: p.ratingCount } : null;
  });
  /** Sem foto: fundo listrado com o nome da categoria, no tom de cada uma (como no desenho). */
  protected readonly placeholderTone = computed(() => {
    switch (this.product().category) {
      case 'vestuario':
      case 'rede-quadra':
        return 'warm';
      case 'acessorios':
        return 'cool';
      default:
        return 'neutral';
    }
  });

  protected toggleFavorite(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.favoriteToggled.emit();
  }
}

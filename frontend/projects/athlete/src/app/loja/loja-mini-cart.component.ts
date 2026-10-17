import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCentsBRL } from '../data/cashback-model';
import { variantLabel } from '../data/store-product-model';
import { cartLineExtraCents, type StoreCartItem, type StoreProduct } from '../data/store-showcase-model';

export interface MiniCartLine {
  key: string;
  name: string;
  /** "Branco areia · M"; vazio em produto sem variação. */
  detail: string;
  coverUrl: string | null;
  qty: number;
  totalCents: number;
}

/**
 * Linhas do carrinho com nome, variação e total. Linha personalizada é uma linha à parte (o
 * `lineId` é a chave) e soma o adicional que o servidor gravou. Produto que saiu da vitrine some.
 */
export function buildMiniCartLines(cart: readonly StoreCartItem[], products: readonly StoreProduct[]): MiniCartLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return cart.flatMap((item) => {
    const p = byId.get(item.productId);
    const v = p?.variants.find((x) => x.id === item.skuId);
    if (!p || !v) return [];
    const detail = [variantLabel(p, v), item.customization ? 'Personalizada' : ''].filter(Boolean).join(' · ');
    return [
      {
        key: item.lineId ?? `${item.productId}/${item.skuId}`,
        name: p.name,
        detail,
        coverUrl: p.coverUrl,
        qty: item.qty,
        totalCents: (v.priceCents + cartLineExtraCents(item)) * item.qty,
      },
    ];
  });
}

/** Mini-carrinho que desliza da direita depois de "Adicionar ao carrinho" (web). */
@Component({
  selector: 'app-loja-mini-cart',
  imports: [RouterLink],
  template: `
    <header class="mc-head">
      <span class="mc-check" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10" /></svg>
      </span>
      <strong>Adicionado ao carrinho</strong>
      <button type="button" class="mc-close" aria-label="Fechar" (click)="closed.emit()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </header>
    <ul class="mc-list">
      @for (line of lines(); track line.key) {
        <li class="mc-line">
          <span class="mc-thumb">
            @if (line.coverUrl; as cover) {
              <img [src]="cover" alt="" loading="lazy" />
            }
          </span>
          <span class="mc-text">
            <strong>{{ line.name }}</strong>
            <small>{{ line.detail ? line.detail + ' · ' : '' }}{{ line.qty }}×</small>
          </span>
          <span class="mc-price">{{ money(line.totalCents) }}</span>
        </li>
      }
    </ul>
    <div class="mc-subtotal">
      <span>Subtotal</span>
      <strong>{{ money(subtotalCents()) }}</strong>
    </div>
    <a class="mc-primary" routerLink="/loja/carrinho">Ver carrinho</a>
    <button type="button" class="mc-secondary" (click)="closed.emit()">Continuar comprando</button>
  `,
  styleUrl: './loja-mini-cart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'dialog', 'aria-label': 'Adicionado ao carrinho', class: 'lp-minicart' },
})
export class LojaMiniCartComponent {
  readonly lines = input.required<MiniCartLine[]>();
  readonly subtotalCents = input.required<number>();
  readonly closed = output<void>();

  protected money(cents: number): string {
    return formatCentsBRL(cents);
  }
}

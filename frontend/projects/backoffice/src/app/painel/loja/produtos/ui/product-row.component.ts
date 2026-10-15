import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent } from '../../../ui/pill.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import { stockState } from '../data/product-filters';
import { PRODUCT_CATEGORY_LABELS, type StoreProduct } from '../data/products.repository';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Uma linha da tabela de produtos. Só desenha: quem decide é a tela. */
@Component({
  selector: 'bo-product-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PillComponent, ToggleComponent],
  template: `
    <div class="row" [class.selected]="selected()">
      <label class="cell-check">
        <input
          type="checkbox"
          [checked]="selected()"
          [attr.aria-label]="'Selecionar ' + product().name"
          (change)="selectedChange.emit(!selected())"
        />
      </label>

      <div class="cell-product">
        <div class="thumb" aria-hidden="true"></div>
        <div class="who">
          <div class="name">{{ product().name }}</div>
          <div class="sku">{{ product().sku }}</div>
        </div>
      </div>

      <div class="cell-category">{{ categoryLabel() }}</div>
      <div class="cell-variations">{{ product().variations }}</div>

      <div class="cell-price">
        <div class="now">{{ price() }}</div>
        @if (comparePrice(); as was) {
          <div class="was">{{ was }}</div>
        }
      </div>

      <div class="cell-stock">
        @switch (state()) {
          @case ('esgotado') {
            <bo-pill tone="red">Esgotado</bo-pill>
          }
          @case ('baixo') {
            <bo-pill tone="yellow">{{ product().stock }} · Baixo</bo-pill>
          }
          @default {
            <span class="units">{{ product().stock }} un.</span>
          }
        }
      </div>

      <div class="cell-sold">{{ product().soldLast30 }}</div>

      <div class="cell-channels">
        @for (channel of product().channels; track channel) {
          <span class="channel">{{ channel === 'web' ? 'WEB' : 'APP' }}</span>
        }
      </div>

      <div class="cell-active">
        <bo-toggle
          [checked]="product().active"
          [ariaLabel]="(product().active ? 'Desativar ' : 'Ativar ') + product().name"
          (checkedChange)="activeChange.emit($event)"
        />
      </div>

      <button type="button" class="cell-more" disabled title="Em breve" aria-label="Mais ações">
        <bo-icon name="chevron-right" [size]="14" />
      </button>
    </div>
  `,
  styles: `
    .row {
      display: grid;
      grid-template-columns: 34px minmax(200px, 1.6fr) 120px 70px 110px 110px 70px 92px 54px 34px;
      align-items: center;
      gap: 10px;
      height: 54px;
      padding: 0 14px;
      border-top: 1px solid var(--nx-line);
      transition: background 140ms var(--nx-ease-out);
    }

    .row:hover {
      background: var(--nx-surface-1);
    }

    .row.selected {
      background: rgba(255, 106, 26, 0.05);
    }

    .cell-check {
      display: grid;
      place-items: center;
      cursor: pointer;
    }

    .cell-product {
      display: flex;
      align-items: center;
      gap: 11px;
      min-width: 0;
    }

    .thumb {
      width: 34px;
      height: 34px;
      flex: none;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: repeating-linear-gradient(
        -45deg,
        var(--nx-surface-1),
        var(--nx-surface-1) 4px,
        var(--nx-surface-2) 4px,
        var(--nx-surface-2) 8px
      );
    }

    .who {
      min-width: 0;
    }

    .name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sku,
    .cell-category,
    .cell-variations,
    .cell-sold {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .cell-variations,
    .cell-sold {
      text-align: center;
    }

    .cell-price {
      text-align: right;
    }

    .now {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .was {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      text-decoration: line-through;
    }

    .units {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .cell-channels {
      display: flex;
      gap: 5px;
    }

    .channel {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      padding: 3px 6px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
    }

    .cell-active {
      display: grid;
      place-items: center;
    }

    .cell-more {
      background: transparent;
      border: none;
      color: var(--nx-text-dim);
      display: grid;
      place-items: center;
      opacity: 0.5;
      cursor: default;
    }
  `,
})
export class ProductRowComponent {
  readonly product = input.required<StoreProduct>();
  readonly selected = input(false);

  readonly activeChange = output<boolean>();
  readonly selectedChange = output<boolean>();

  protected readonly state = computed(() => stockState(this.product()));
  protected readonly categoryLabel = computed(() => PRODUCT_CATEGORY_LABELS[this.product().category]);
  protected readonly price = computed(() => BRL.format(this.product().priceCents / 100));
  protected readonly comparePrice = computed(() => {
    const was = this.product().compareAtPriceCents;
    return was === null ? null : BRL.format(was / 100);
  });
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import {
  EMPTY_CRITERIA,
  PRODUCT_TABS,
  filterProducts,
  tabCounts,
  type ProductCriteria,
  type ProductTab,
} from './data/product-filters';
import { ProductsRepository, type StoreProduct } from './data/products.repository';
import { ProductRowComponent } from './ui/product-row.component';

type LoadState = 'loading' | 'ok' | 'error';

/** Catálogo da loja nexaGO. Fase de desenho: lê dados de exemplo (ver o kicker do card). */
@Component({
  selector: 'bo-panel-produtos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    IconComponent,
    ProductRowComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Produtos" subtitle="Loja">
        <span class="count-pill">{{ countLabel() }}</span>
        <div class="header-actions">
          <button type="button" class="bo-mini-btn" disabled title="Em breve">
            <bo-icon name="download" [size]="13" />
            Importar planilha
          </button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" disabled title="Em breve">
            <bo-icon name="plus" [size]="13" />
            Novo produto
          </button>
        </div>
      </bo-page-header>

      <div class="tabs">
        @for (tab of productTabs; track tab.id) {
          <button
            type="button"
            [class.active]="criteria().tab === tab.id"
            [attr.aria-pressed]="criteria().tab === tab.id"
            (click)="setTab(tab.id)"
          >
            {{ tab.label }}
            <span class="tab-count">{{ counts()[tab.id] }}</span>
          </button>
        }
      </div>

      <div class="body">
        <bo-panel-card pad="sm" kicker="dados de exemplo" title="Catálogo">
          @if (state() === 'error') {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else if (state() === 'loading') {
            <div class="table-head">
              <span></span><span>Produto</span><span>Categoria</span><span>Variações</span>
              <span>Preço</span><span>Estoque</span><span>Vendas 30d</span><span>Canais</span>
              <span>Ativo</span><span></span>
            </div>
            @for (slot of skeleton; track slot) {
              <div class="skeleton-row"></div>
            }
          } @else if (rows().length === 0) {
            <div class="empty">
              <bo-icon name="archive" [size]="20" />
              @if (all().length === 0) {
                <p>Nenhum produto cadastrado</p>
              } @else {
                <p>Nenhum produto com esses filtros</p>
                <button type="button" class="bo-mini-btn" (click)="clearFilters()">
                  Limpar filtros
                </button>
              }
            </div>
          } @else {
            <div class="table-head">
              <span></span><span>Produto</span><span>Categoria</span><span>Variações</span>
              <span>Preço</span><span>Estoque</span><span>Vendas 30d</span><span>Canais</span>
              <span>Ativo</span><span></span>
            </div>
            @for (product of rows(); track product.id) {
              <bo-product-row [product]="product" (activeChange)="setActive(product.id, $event)" />
            }
          }
        </bo-panel-card>
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .count-pill {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 5px 10px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      white-space: nowrap;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .tabs {
      display: flex;
      gap: 4px;
      padding: 10px 32px 0;
      border-bottom: 1px solid var(--nx-line);
      overflow-x: auto;
      flex: none;
    }

    .tabs button {
      flex: none;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 36px;
      padding: 0 12px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
    }

    .tabs button:hover {
      color: var(--nx-text);
    }

    .tabs button.active {
      color: var(--nx-orange-500);
      border-bottom-color: var(--nx-orange-500);
    }

    .tab-count {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .tabs button.active .tab-count {
      color: var(--nx-orange-500);
    }

    .body {
      padding: 20px 32px 40px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-width: 0;
    }

    .table-head {
      display: grid;
      grid-template-columns: 34px minmax(200px, 1.6fr) 120px 70px 110px 110px 70px 92px 54px 34px;
      gap: 10px;
      padding: 0 14px 9px;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .skeleton-row {
      height: 54px;
      border-top: 1px solid var(--nx-line);
      background: linear-gradient(
        90deg,
        var(--nx-surface-1) 25%,
        var(--nx-surface-2) 37%,
        var(--nx-surface-1) 63%
      );
      background-size: 400% 100%;
      animation: shimmer 1.3s ease-in-out infinite;
    }

    @keyframes shimmer {
      from {
        background-position: 100% 0;
      }
      to {
        background-position: 0 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .skeleton-row {
        animation: none;
      }
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 44px 0;
      color: var(--nx-text-dim);
    }

    .empty p {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 13px;
    }

    .retry {
      margin-top: 12px;
    }
  `,
})
export class PanelProdutosComponent {
  private readonly repository = inject(ProductsRepository);

  protected readonly skeleton = [0, 1, 2, 3, 4, 5, 6, 7];

  protected readonly all = signal<StoreProduct[]>([]);
  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');

  protected readonly productTabs = PRODUCT_TABS;
  protected readonly criteria = signal<ProductCriteria>(EMPTY_CRITERIA);

  protected readonly rows = computed(() => filterProducts(this.all(), this.criteria()));
  protected readonly counts = computed(() => tabCounts(this.all(), this.criteria()));

  protected readonly countLabel = computed(() => {
    const rows = this.all();
    const skus = rows.reduce((total, p) => total + p.variations, 0);
    return `${rows.length} produtos · ${skus} SKUs`;
  });

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    try {
      this.all.set(await this.repository.list());
      this.state.set('ok');
    } catch (error) {
      this.errorMessage.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  protected setTab(tab: ProductTab): void {
    this.criteria.update((c) => ({ ...c, tab }));
  }

  protected clearFilters(): void {
    this.criteria.set(EMPTY_CRITERIA);
  }

  protected setActive(id: string, active: boolean): void {
    this.all.update((rows) => rows.map((p) => (p.id === id ? { ...p, active } : p)));
  }
}

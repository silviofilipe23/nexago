import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { StockAdjustDialogComponent, type StockAdjustResult } from './stock-adjust-dialog.component';

type StockCategory = 'Bebida' | 'Snack' | 'Material' | 'Aluguel';
type StockLevel = 'em_estoque' | 'estoque_baixo' | 'esgotado';
type CategoryFilter = 'todos' | StockCategory;

interface Product {
  id: string;
  name: string;
  category: StockCategory;
  price: number;
  stock: number;
  minStock: number;
  unit: string;
}

const LEVEL_LABEL: Record<StockLevel, string> = {
  em_estoque: 'Em estoque',
  estoque_baixo: 'Estoque baixo',
  esgotado: 'Esgotado',
};

const LEVEL_TONE: Record<StockLevel, PillTone> = {
  em_estoque: 'green',
  estoque_baixo: 'yellow',
  esgotado: 'red',
};

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'Bebida', label: 'Bebida' },
  { key: 'Snack', label: 'Snack' },
  { key: 'Material', label: 'Material' },
  { key: 'Aluguel', label: 'Aluguel' },
];

const PRODUCTS: Product[] = [
  { id: 'e1', name: 'Água mineral 500ml', category: 'Bebida', price: 6, stock: 84, minStock: 24, unit: 'un' },
  { id: 'e2', name: 'Isotônico 500ml', category: 'Bebida', price: 9, stock: 46, minStock: 20, unit: 'un' },
  { id: 'e3', name: 'Refrigerante lata', category: 'Bebida', price: 7, stock: 12, minStock: 15, unit: 'un' },
  { id: 'e4', name: 'Barrinha de cereal', category: 'Snack', price: 8, stock: 5, minStock: 10, unit: 'un' },
  { id: 'e5', name: 'Banana', category: 'Snack', price: 4, stock: 0, minStock: 10, unit: 'un' },
  { id: 'e6', name: 'Bola Beach Tennis (dupla)', category: 'Material', price: 45, stock: 18, minStock: 6, unit: 'un' },
  { id: 'e7', name: 'Luva de proteção', category: 'Material', price: 32, stock: 9, minStock: 4, unit: 'un' },
  { id: 'e8', name: 'Aluguel raquete Beach Tennis', category: 'Aluguel', price: 25, stock: 14, minStock: 5, unit: 'un' },
];

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function levelOf(p: Product): StockLevel {
  if (p.stock === 0) {
    return 'esgotado';
  }
  return p.stock <= p.minStock ? 'estoque_baixo' : 'em_estoque';
}

/** Tela Estoque do painel (protótipo ArEstoqueScreen): KPIs e tabela de produtos com filtro por categoria e ajuste rápido. */
@Component({
  selector: 'ar-panel-stock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, StockAdjustDialogComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Estoque" [subtitle]="arenaName() + ' · ' + products().length + ' produtos cadastrados'">
        <button type="button" class="ar-mini-btn" (click)="openAdjustFor(products()[0])">
          <ar-icon name="box" [size]="14" />
          Ajustar estoque
        </button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="createProduct()">
          <ar-icon name="plus" [size]="14" />
          Novo produto
        </button>
      </ar-page-header>

      <div class="body">
        <div class="summary-row">
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-dim">Produtos cadastrados</div>
            <div class="summary-value">{{ products().length }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-dim">Estoque baixo</div>
            <div class="summary-value tone-pending">{{ lowStockCount() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-dim">Esgotados</div>
            <div class="summary-value tone-live">{{ outOfStockCount() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-dim">Valor em estoque</div>
            <div class="summary-value">R$ 970,00</div>
          </ar-panel-card>
        </div>

        <ar-panel-card [kicker]="listKicker()" title="Produtos" class="table-card">
          <div class="ar-filter-bar" card-actions>
            @for (f of categoryFilters; track f.key) {
              <button type="button" class="ar-chip" [class.active]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }}</button>
            }
          </div>

          <div class="table-head">
            <span></span>
            <span>Produto</span>
            <span>Categoria</span>
            <span>Preço</span>
            <span>Estoque</span>
            <span>Nível</span>
            <span></span>
          </div>
          <div class="table-list">
            @for (p of filteredProducts(); track p.id) {
              <div class="table-row">
                <div class="thumb" aria-hidden="true"></div>
                <div class="product-name">{{ p.name }}</div>
                <div class="product-category">{{ p.category }}</div>
                <div class="product-price">{{ formatBRL(p.price) }}</div>
                <div class="product-stock" [class]="'tone-' + levelOf(p)">{{ p.stock }} <span class="unit">{{ p.unit }}</span></div>
                <div><ar-pill [tone]="levelTone[levelOf(p)]">{{ levelLabel[levelOf(p)] }}</ar-pill></div>
                <div class="product-actions">
                  <button type="button" class="ar-mini-btn" (click)="editProduct(p.id)">
                    <ar-icon name="edit" [size]="13" />
                    Editar
                  </button>
                </div>
              </div>
            }
          </div>
        </ar-panel-card>
      </div>

      @if (adjustTarget(); as target) {
        <ar-stock-adjust-dialog
          [productName]="target.name"
          [currentStock]="target.stock"
          [unit]="target.unit"
          (cancel)="adjustTarget.set(null)"
          (confirmed)="applyAdjustment(target.id, $event)"
        />
      }
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .summary-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .summary-card {
      flex: 1;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .summary-label.tone-dim {
      color: var(--nx-text-dim);
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .summary-value.tone-pending {
      color: var(--nx-pending);
    }

    .summary-value.tone-live {
      color: var(--nx-live);
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 40px 1.8fr 120px 100px 110px 130px 100px;
      gap: 14px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-list {
      display: flex;
      flex-direction: column;
    }

    .table-row {
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .thumb {
      width: 40px;
      height: 40px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }

    .product-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .product-category,
    .product-price {
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .product-stock {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }

    .product-stock .unit {
      font-weight: 500;
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    .product-stock.tone-estoque_baixo {
      color: var(--nx-pending);
    }

    .product-stock.tone-esgotado {
      color: var(--nx-live);
    }

    .product-actions {
      display: flex;
      justify-content: flex-end;
    }

    @media (max-width: 1180px) {
      .summary-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelStockComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly formatBRL = formatBRL;
  protected readonly levelOf = levelOf;
  protected readonly levelLabel = LEVEL_LABEL;
  protected readonly levelTone = LEVEL_TONE;
  protected readonly categoryFilters = CATEGORY_FILTERS;

  protected readonly products = signal<Product[]>(PRODUCTS);
  protected readonly filter = signal<CategoryFilter>('todos');
  protected readonly adjustTarget = signal<Product | null>(null);

  protected readonly filteredProducts = computed(() => {
    const f = this.filter();
    return f === 'todos' ? this.products() : this.products().filter((p) => p.category === f);
  });

  protected readonly listKicker = computed(() => `${this.filteredProducts().length} de ${this.products().length}`);

  protected readonly lowStockCount = computed(() => this.products().filter((p) => levelOf(p) === 'estoque_baixo').length);
  protected readonly outOfStockCount = computed(() => this.products().filter((p) => levelOf(p) === 'esgotado').length);

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected createProduct(): void {
    this.router.navigate(['/painel/estoque/novo']);
  }

  protected editProduct(id: string): void {
    this.router.navigate(['/painel/estoque', id, 'editar']);
  }

  protected openAdjustFor(product: Product | undefined): void {
    if (product) {
      this.adjustTarget.set(product);
    }
  }

  protected applyAdjustment(productId: string, result: StockAdjustResult): void {
    const delta = result.type === 'entrada' ? result.quantity : -result.quantity;
    this.products.update((current) =>
      current.map((p) => (p.id === productId ? { ...p, stock: Math.max(0, p.stock + delta) } : p)),
    );
    this.adjustTarget.set(null);
  }
}

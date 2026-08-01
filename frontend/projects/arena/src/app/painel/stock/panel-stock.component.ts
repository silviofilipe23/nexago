import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  ARENA_PRODUCT_CATEGORIES,
  ARENA_PRODUCT_CATEGORY_LABEL,
  ARENA_PRODUCT_STOCK_STATUS_LABEL,
  buildProductSummary,
  formatCentsBRL,
  productStockStatus,
  type ArenaProduct,
  type ArenaProductCategory,
  type ArenaProductStockStatus,
} from './product.model';
import { fetchProducts, registerStockMovement } from './products-repository';
import { StockAdjustDialogComponent, type StockAdjustResult } from './stock-adjust-dialog.component';

type CategoryFilter = 'todos' | ArenaProductCategory;

const STATUS_TONE: Record<ArenaProductStockStatus, PillTone> = { ok: 'green', low: 'yellow', out: 'red' };

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  ...ARENA_PRODUCT_CATEGORIES.map((key) => ({ key, label: ARENA_PRODUCT_CATEGORY_LABEL[key] })),
];

/** Tela Estoque do painel: KPIs e tabela de produtos com filtro por categoria e ajuste rápido,
 *  conectada a `arenas/{arenaId}/products` (estoque é capability Pro/Elite). */
@Component({
  selector: 'ar-panel-stock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, StockAdjustDialogComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Estoque" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn" [disabled]="readOnly() || products().length === 0" (click)="openAdjustFor(products()[0])">
          <ar-icon name="box" [size]="14" />
          Ajustar estoque
        </button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="createProduct()">
          <ar-icon name="plus" [size]="14" />
          Novo produto
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
          </ar-panel-card>
        } @else if (arenaLoading() || loading()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando estoque…</p>
          </ar-panel-card>
        } @else if (errorMessage(); as err) {
          <ar-panel-card pad="lg">
            <p class="state-text">{{ err }}</p>
            <button type="button" class="ar-mini-btn" (click)="retry()">Tentar de novo</button>
          </ar-panel-card>
        } @else if (showPaywall()) {
          <ar-panel-card pad="lg">
            <p class="paywall-title">Estoque é um recurso dos planos Pro e Elite</p>
            <p class="state-text">Fale com o suporte para fazer upgrade e liberar o controle de estoque e produtos da sua arena.</p>
          </ar-panel-card>
        } @else {
          @if (planReadOnly()) {
            <div class="readonly-banner">
              Seu plano atual não inclui controle de estoque — o catálogo ficou somente leitura. Fale com o suporte para fazer upgrade.
            </div>
          }
          @if (notice(); as n) {
            <div class="notice-banner">
              {{ n }}
              <button type="button" class="notice-dismiss" (click)="notice.set(null)">×</button>
            </div>
          }

          <div class="summary-row">
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Produtos cadastrados</div>
              <div class="summary-value">{{ summary().activeCount }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Estoque baixo</div>
              <div class="summary-value tone-pending">{{ summary().lowCount }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Esgotados</div>
              <div class="summary-value tone-live">{{ summary().outCount }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Valor em estoque</div>
              <div class="summary-value">{{ formatBRL(summary().inventoryValueCents) }}</div>
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
                  <div class="thumb" aria-hidden="true">{{ p.emoji }}</div>
                  <div class="product-name">{{ p.name }}</div>
                  <div class="product-category">{{ categoryLabel[p.category] }}</div>
                  <div class="product-price">{{ formatBRL(p.priceCents) }}</div>
                  <div class="product-stock" [class]="'tone-' + statusOf(p)">{{ p.stockQuantity }} <span class="unit">un</span></div>
                  <div><ar-pill [tone]="statusTone[statusOf(p)]">{{ statusLabel[statusOf(p)] }}</ar-pill></div>
                  <div class="product-actions">
                    <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="editProduct(p.id)">
                      <ar-icon name="edit" [size]="13" />
                      Editar
                    </button>
                  </div>
                </div>
              } @empty {
                <p class="state-text empty-text">Nenhum produto cadastrado ainda.</p>
              }
            </div>
          </ar-panel-card>
        }
      </div>

      @if (adjustTarget(); as target) {
        <ar-stock-adjust-dialog
          [productName]="target.name"
          [currentStock]="target.stockQuantity"
          (cancel)="adjustTarget.set(null)"
          (confirmed)="applyAdjustment($event)"
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

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0 0 12px;
    }

    .empty-text {
      margin: 12px 0;
    }

    .paywall-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0 0 8px;
    }

    .readonly-banner,
    .notice-banner {
      flex: none;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .notice-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .notice-dismiss {
      background: transparent;
      border: none;
      color: var(--nx-text-dim);
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
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
      display: grid;
      place-items: center;
      font-size: 16px;
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

    .product-stock.tone-low {
      color: var(--nx-pending);
    }

    .product-stock.tone-out {
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
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly formatBRL = formatCentsBRL;
  protected readonly statusOf = productStockStatus;
  protected readonly statusLabel = ARENA_PRODUCT_STOCK_STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly categoryLabel = ARENA_PRODUCT_CATEGORY_LABEL;
  protected readonly categoryFilters = CATEGORY_FILTERS;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  /** Plano sem estoque — mensagem de upsell própria (ver `planReadOnly` abaixo). */
  protected readonly planReadOnly = computed(() => !this.arenaContext.hasCapability('estoque'));
  /** Cargo com leitura mas sem escrita em `estoque` (recepção). */
  protected readonly cargoReadOnly = computed(() => !this.access.canWrite('estoque'));
  protected readonly readOnly = computed(() => this.planReadOnly() || this.cargoReadOnly());

  protected readonly products = signal<ArenaProduct[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly filter = signal<CategoryFilter>('todos');
  protected readonly adjustTarget = signal<ArenaProduct | null>(null);

  protected readonly filteredProducts = computed(() => {
    const f = this.filter();
    return f === 'todos' ? this.products() : this.products().filter((p) => p.category === f);
  });

  protected readonly listKicker = computed(() => `${this.filteredProducts().length} de ${this.products().length}`);
  protected readonly summary = computed(() => buildProductSummary(this.products()));
  protected readonly showPaywall = computed(() => this.planReadOnly() && this.products().length === 0);

  protected readonly headerSubtitle = computed(
    () => `${this.arenaContext.arenaName() ?? this.auth.displayName() ?? 'Arena'} · ${this.products().length} produtos cadastrados`,
  );

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.loadProducts(arenaId);
    });
  }

  protected retry(): void {
    const arenaId = this.arenaContext.arenaId();
    if (arenaId) void this.loadProducts(arenaId);
  }

  private async loadProducts(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.products.set(await fetchProducts(arenaFirestore(), arenaId));
    } catch {
      this.errorMessage.set('Não foi possível carregar o estoque. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }

  protected createProduct(): void {
    if (this.readOnly()) return;
    this.router.navigate(['/painel/estoque/novo']);
  }

  protected editProduct(id: string): void {
    if (this.readOnly()) return;
    this.router.navigate(['/painel/estoque', id, 'editar']);
  }

  protected openAdjustFor(product: ArenaProduct | undefined): void {
    if (product && !this.readOnly()) {
      this.adjustTarget.set(product);
    }
  }

  protected async applyAdjustment(result: StockAdjustResult): Promise<void> {
    const target = this.adjustTarget();
    const arenaId = this.arenaContext.arenaId();
    const uid = this.auth.user()?.uid;
    this.adjustTarget.set(null);
    if (!target || !arenaId || !uid) return;
    try {
      await registerStockMovement(arenaFirestore(), arenaId, target.id, result.type, result.quantity, uid, result.note);
      await this.loadProducts(arenaId);
    } catch (err) {
      this.notice.set(err instanceof Error ? err.message : 'Não foi possível registrar a movimentação.');
    }
  }
}

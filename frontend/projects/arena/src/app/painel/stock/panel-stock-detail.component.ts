import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { StockAdjustDialogComponent, type StockAdjustResult } from './stock-adjust-dialog.component';

type StockCategory = 'Bebida' | 'Snack' | 'Material' | 'Aluguel';
type StockLevel = 'em_estoque' | 'estoque_baixo' | 'esgotado';

interface Movement {
  date: string;
  reason: string;
  qty: number;
}

interface ProductDetail {
  name: string;
  category: StockCategory;
  price: number;
  cost: number;
  unit: string;
  minStock: number;
  stock: number;
  movements: Movement[];
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

const MOCK_PRODUCTS: Record<string, ProductDetail> = {
  e1: {
    name: 'Água mineral 500ml',
    category: 'Bebida',
    price: 6,
    cost: 2.8,
    unit: 'un',
    minStock: 24,
    stock: 84,
    movements: [{ date: 'Hoje, 09:05', reason: 'Venda · Comanda #048', qty: -4 }],
  },
  e2: {
    name: 'Isotônico 500ml',
    category: 'Bebida',
    price: 9,
    cost: 4.5,
    unit: 'un',
    minStock: 20,
    stock: 46,
    movements: [
      { date: 'Hoje, 09:12', reason: 'Venda · Comanda #048', qty: -2 },
      { date: 'Ontem, 18:40', reason: 'Venda · Comanda #045', qty: -3 },
      { date: '28 jun, 10:00', reason: 'Compra · Fornecedor Águas GO', qty: 50 },
    ],
  },
  e3: {
    name: 'Refrigerante lata',
    category: 'Bebida',
    price: 7,
    cost: 3.2,
    unit: 'un',
    minStock: 15,
    stock: 12,
    movements: [{ date: 'Ontem, 14:00', reason: 'Venda · Comanda #041', qty: -6 }],
  },
  e4: {
    name: 'Barrinha de cereal',
    category: 'Snack',
    price: 8,
    cost: 3.6,
    unit: 'un',
    minStock: 10,
    stock: 5,
    movements: [{ date: '29 jun, 11:20', reason: 'Venda · Comanda #039', qty: -3 }],
  },
  e5: {
    name: 'Banana',
    category: 'Snack',
    price: 4,
    cost: 1.5,
    unit: 'un',
    minStock: 10,
    stock: 0,
    movements: [{ date: '27 jun, 16:00', reason: 'Venda · Comanda #030', qty: -10 }],
  },
  e6: {
    name: 'Bola Beach Tennis (dupla)',
    category: 'Material',
    price: 45,
    cost: 22,
    unit: 'un',
    minStock: 6,
    stock: 18,
    movements: [{ date: '20 jun, 09:00', reason: 'Compra · Fornecedor SportBall', qty: 12 }],
  },
  e7: {
    name: 'Luva de proteção',
    category: 'Material',
    price: 32,
    cost: 15,
    unit: 'un',
    minStock: 4,
    stock: 9,
    movements: [{ date: '18 jun, 10:30', reason: 'Compra · Fornecedor SportBall', qty: 10 }],
  },
  e8: {
    name: 'Aluguel raquete Beach Tennis',
    category: 'Aluguel',
    price: 25,
    cost: 60,
    unit: 'un',
    minStock: 5,
    stock: 14,
    movements: [{ date: 'Hoje, 08:30', reason: 'Devolução · Comanda #047', qty: 1 }],
  },
};

const CATEGORY_OPTIONS: StockCategory[] = ['Bebida', 'Snack', 'Material', 'Aluguel'];

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function levelOf(stock: number, minStock: number): StockLevel {
  if (stock === 0) {
    return 'esgotado';
  }
  return stock <= minStock ? 'estoque_baixo' : 'em_estoque';
}

/** Tela Detalhe do produto (protótipo ArStockDetailScreen): dados editáveis, movimentações, nível de estoque e valor imobilizado. */
@Component({
  selector: 'ar-panel-stock-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent, StockAdjustDialogComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="name()" [subtitle]="'Estoque · ' + category()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="save()">
          <ar-icon name="check" [size]="14" />
          Salvar alterações
        </button>
      </ar-page-header>

      <div class="body">
        <div class="col-left">
          <ar-panel-card title="Dados do produto">
            <div class="photo-row">
              <div class="thumb" aria-hidden="true"></div>
              <div>
                <div class="product-title">{{ name() }}</div>
                <div class="product-hint">Arraste uma imagem para substituir a foto</div>
              </div>
            </div>

            <div class="row-2">
              <div>
                <div class="field-label">Nome</div>
                <input type="text" class="input-box" [value]="name()" (input)="name.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Categoria</div>
                <div class="ar-filter-bar">
                  @for (opt of categoryOptions; track opt) {
                    <button type="button" class="ar-chip" [class.active]="category() === opt" (click)="category.set(opt)">{{ opt }}</button>
                  }
                </div>
              </div>
            </div>

            <div class="row-2 row-gap">
              <div>
                <div class="field-label">Preço de venda</div>
                <div class="price-box">
                  <span>R$</span>
                  <input type="text" inputmode="decimal" [value]="priceValue()" (input)="priceValue.set($any($event.target).value)" />
                </div>
              </div>
              <div>
                <div class="field-label">Custo unitário</div>
                <div class="price-box">
                  <span>R$</span>
                  <input type="text" inputmode="decimal" [value]="costValue()" (input)="costValue.set($any($event.target).value)" />
                </div>
              </div>
            </div>

            <div class="row-2 row-gap">
              <div>
                <div class="field-label">Unidade</div>
                <input type="text" class="input-box" [value]="unit()" (input)="unit.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Estoque mínimo</div>
                <input type="number" min="0" class="input-box" [value]="minStock()" (input)="minStock.set($any($event.target).valueAsNumber || 0)" />
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card [kicker]="movementsKicker()" title="Movimentações" class="movements-card">
            <div class="table-head">
              <span>Data</span>
              <span>Motivo</span>
              <span class="right">Qtd</span>
            </div>
            <div class="table-list">
              @for (m of movements(); track m.date + m.reason) {
                <div class="table-row">
                  <div class="mv-date">{{ m.date }}</div>
                  <div class="mv-reason">{{ m.reason }}</div>
                  <div class="mv-qty right" [class.positive]="m.qty > 0">{{ m.qty > 0 ? '+' : '' }}{{ m.qty }}</div>
                </div>
              }
            </div>
          </ar-panel-card>
        </div>

        <div class="col-right">
          <ar-panel-card title="Nível de estoque">
            <ar-pill card-actions [tone]="levelTone[level()]">{{ levelLabel[level()] }}</ar-pill>
            <div class="stock-value">{{ stock() }} <span class="unit">{{ unit() }}</span></div>

            <div class="field-label bar-label">Estoque atual <span class="bar-pct">{{ stockPercent() }}%</span></div>
            <div class="bar-track">
              <div class="bar-fill" [class]="'tone-' + level()" [style.width.%]="stockPercent()"></div>
            </div>
            <div class="bar-caption">Mínimo recomendado: {{ minStock() }} {{ unit() }}</div>
          </ar-panel-card>

          <ar-panel-card title="Valor imobilizado">
            <div class="imobilizado-row">
              <span>Custo total</span>
              <span class="value">{{ formatBRL(costTotal()) }}</span>
            </div>
            <div class="imobilizado-row">
              <span>Valor de venda</span>
              <span class="value">{{ formatBRL(saleTotal()) }}</span>
            </div>
            <div class="imobilizado-row">
              <span>Margem</span>
              <span class="value tone-green">{{ margin() }}%</span>
            </div>
          </ar-panel-card>

          <button type="button" class="ar-mini-btn adjust-btn" (click)="showAdjust.set(true)">
            <ar-icon name="box" [size]="14" />
            Ajustar estoque
          </button>

          <button type="button" class="remove-link" (click)="showRemoveConfirm.set(true)">
            <ar-icon name="alert-triangle" [size]="14" />
            Remover produto
          </button>
        </div>
      </div>

      @if (showAdjust()) {
        <ar-stock-adjust-dialog
          [productName]="name()"
          [currentStock]="stock()"
          [unit]="unit()"
          (cancel)="showAdjust.set(false)"
          (confirmed)="applyAdjustment($event)"
        />
      }

      @if (showRemoveConfirm()) {
        <ar-modal (close)="showRemoveConfirm.set(false)">
          <h2 class="confirm-title">Remover produto?</h2>
          <p class="confirm-body">
            "{{ name() }}" será removido do estoque da arena. Esta ação não pode ser desfeita.
          </p>
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" (click)="showRemoveConfirm.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn danger-btn" (click)="removeProduct()">Remover produto</button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 373px;
      gap: 16px;
      align-items: start;
      overflow: auto;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .photo-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }

    .thumb {
      width: 76px;
      height: 76px;
      flex: none;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }

    .product-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }

    .product-hint {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .row-gap {
      margin-top: 18px;
    }

    .price-box {
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .price-box:focus-within {
      border-color: var(--nx-orange-500);
    }

    .price-box span {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text-dim);
    }

    .price-box input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
    }

    .movements-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1fr 1.6fr 90px;
      gap: 12px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-row {
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .mv-date {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    .mv-reason {
      font-size: 13px;
      color: var(--nx-text);
    }

    .mv-qty {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .mv-qty.positive {
      color: var(--nx-win);
    }

    .right {
      text-align: right;
    }

    .stock-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 34px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 8px 0 18px;
    }

    .stock-value .unit {
      font-size: 15px;
      font-weight: 600;
      color: var(--nx-text-dim);
    }

    .bar-label {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .bar-pct {
      color: var(--nx-text);
      font-weight: 700;
    }

    .bar-track {
      height: 8px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 4px;
    }

    .bar-fill.tone-em_estoque {
      background: var(--nx-win);
    }

    .bar-fill.tone-estoque_baixo {
      background: var(--nx-pending);
    }

    .bar-fill.tone-esgotado {
      background: var(--nx-live);
    }

    .bar-caption {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 10px;
    }

    .imobilizado-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
    }

    .imobilizado-row span:first-child {
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .imobilizado-row .value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }

    .imobilizado-row .value.tone-green {
      color: var(--nx-win);
    }

    .adjust-btn {
      width: 100%;
      justify-content: center;
      height: 44px;
    }

    .remove-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px 0;
      color: var(--nx-live);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
    }

    .remove-link:hover {
      text-decoration: underline;
    }

    .confirm-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin: 0 0 10px;
    }

    .confirm-body {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 22px;
    }

    .confirm-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .danger-btn {
      height: 44px;
      padding: 0 20px;
      background: var(--nx-live);
      color: #fff;
      border: none;
    }

    .danger-btn:hover {
      background: #ff564c;
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .row-2 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelStockDetailComponent {
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly categoryOptions = CATEGORY_OPTIONS;
  protected readonly formatBRL = formatBRL;
  protected readonly levelLabel = LEVEL_LABEL;
  protected readonly levelTone = LEVEL_TONE;

  protected readonly showAdjust = signal(false);
  protected readonly showRemoveConfirm = signal(false);

  private readonly productData = computed(() => MOCK_PRODUCTS[this.id()] ?? null);

  protected readonly name = linkedSignal(() => this.productData()?.name ?? 'Produto');
  protected readonly category = linkedSignal<StockCategory>(() => this.productData()?.category ?? 'Bebida');
  protected readonly priceValue = linkedSignal(() => (this.productData()?.price ?? 0).toFixed(2).replace('.', ','));
  protected readonly costValue = linkedSignal(() => (this.productData()?.cost ?? 0).toFixed(2).replace('.', ','));
  protected readonly unit = linkedSignal(() => this.productData()?.unit ?? 'un');
  protected readonly minStock = linkedSignal(() => this.productData()?.minStock ?? 0);
  protected readonly stock = linkedSignal(() => this.productData()?.stock ?? 0);
  protected readonly movements = linkedSignal(() => this.productData()?.movements ?? []);

  protected readonly movementsKicker = computed(() => `${this.movements().length} lançamentos recentes`);

  protected readonly level = computed(() => levelOf(this.stock(), this.minStock()));

  protected readonly stockPercent = computed(() => {
    const target = this.minStock() * 3;
    if (target <= 0) {
      return this.stock() > 0 ? 100 : 0;
    }
    return Math.min(100, Math.round((this.stock() / target) * 100));
  });

  private readonly priceNumber = computed(() => Number(this.priceValue().replace(',', '.')) || 0);
  private readonly costNumber = computed(() => Number(this.costValue().replace(',', '.')) || 0);

  protected readonly costTotal = computed(() => this.costNumber() * this.stock());
  protected readonly saleTotal = computed(() => this.priceNumber() * this.stock());
  protected readonly margin = computed(() => {
    const price = this.priceNumber();
    return price > 0 ? Math.round(((price - this.costNumber()) / price) * 100) : 0;
  });

  protected applyAdjustment(result: StockAdjustResult): void {
    const delta = result.type === 'entrada' ? result.quantity : -result.quantity;
    this.stock.set(Math.max(0, this.stock() + delta));
    this.movements.update((current) => [{ date: 'Agora', reason: result.reason, qty: delta }, ...current]);
    this.showAdjust.set(false);
  }

  protected save(): void {
    this.router.navigate(['/painel/estoque']);
  }

  protected removeProduct(): void {
    this.showRemoveConfirm.set(false);
    this.router.navigate(['/painel/estoque']);
  }
}

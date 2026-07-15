import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  ARENA_PRODUCT_CATEGORIES,
  ARENA_PRODUCT_CATEGORY_LABEL,
  ARENA_PRODUCT_STOCK_STATUS_LABEL,
  formatCentsBRL,
  formatCentsInputValue,
  formatMovementDate,
  formatSignedQuantityDelta,
  movementHistoryTitle,
  parseBRLInputToCents,
  productStockBarFillRatio,
  productStockStatus,
  type ArenaProduct,
  type ArenaProductCategory,
  type ArenaProductStockStatus,
  type ArenaStockMovement,
} from './product.model';
import { deactivateProduct, deleteProduct, fetchMovements, fetchProduct, registerStockMovement, updateProduct } from './products-repository';
import { StockAdjustDialogComponent, type StockAdjustResult } from './stock-adjust-dialog.component';

const STATUS_TONE: Record<ArenaProductStockStatus, PillTone> = { ok: 'green', low: 'yellow', out: 'red' };

/** Tela Detalhe do produto: edição real, histórico de movimentações e desativar/excluir,
 *  conectada a `arenas/{arenaId}/products/{id}` e `arenas/{arenaId}/stockMovements`.
 *  Sem custo/margem (não existe no schema) e sem o fluxo de "desfazer exclusão" com timer do
 *  app Flutter — aqui desativar/excluir é direto, com confirmação. */
@Component({
  selector: 'ar-panel-stock-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent, StockAdjustDialogComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="name() || 'Produto'" [subtitle]="'Estoque · ' + categoryLabel[category()]">
        @if (product(); as p) {
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving() || readOnly()" (click)="save()">
            <ar-icon name="check" [size]="14" />
            {{ saving() ? 'Salvando…' : 'Salvar alterações' }}
          </button>
        }
      </ar-page-header>

      <div class="body">
        @if (loading()) {
          <p class="state-text">Carregando produto…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else if (product(); as p) {
          @if (readOnly()) {
            <div class="readonly-banner">Seu plano atual não inclui edição de estoque — fale com o suporte para fazer upgrade.</div>
          }
          @if (saveError(); as serr) {
            <div class="error-banner">{{ serr }}</div>
          }

          <div class="col-left">
            <ar-panel-card title="Dados do produto">
              <div class="row-2">
                <div>
                  <div class="field-label">Nome</div>
                  <input type="text" class="input-box" [value]="name()" (input)="name.set($any($event.target).value)" [disabled]="readOnly()" />
                </div>
                <div>
                  <div class="field-label">Emoji</div>
                  <input type="text" maxlength="8" class="input-box" [value]="emoji()" (input)="emoji.set($any($event.target).value)" [disabled]="readOnly()" />
                </div>
              </div>

              <div class="field-label row-gap">Categoria</div>
              <div class="ar-filter-bar">
                @for (opt of categoryOptions; track opt) {
                  <button type="button" class="ar-chip" [class.active]="category() === opt" [disabled]="readOnly()" (click)="category.set(opt)">
                    {{ categoryLabel[opt] }}
                  </button>
                }
              </div>

              <div class="row-2 row-gap">
                <div>
                  <div class="field-label">Preço de venda</div>
                  <div class="price-box">
                    <span>R$</span>
                    <input type="text" inputmode="decimal" [value]="priceValue()" (input)="priceValue.set($any($event.target).value)" [disabled]="readOnly()" />
                  </div>
                </div>
                <div>
                  <div class="field-label">Estoque mínimo</div>
                  <input
                    type="number"
                    min="0"
                    class="input-box"
                    [value]="minStock()"
                    (input)="minStock.set($any($event.target).valueAsNumber || 0)"
                    [disabled]="readOnly()"
                  />
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
                @for (m of movements(); track m.id) {
                  <div class="table-row">
                    <div class="mv-date">{{ formatMovementDate(m.createdAt) }}</div>
                    <div class="mv-reason">{{ movementHistoryTitle(m) }}</div>
                    <div class="mv-qty right" [class.positive]="m.quantityDelta > 0">{{ formatSignedQuantityDelta(m.quantityDelta) }}</div>
                  </div>
                } @empty {
                  <p class="state-text">Nenhuma movimentação registrada ainda.</p>
                }
              </div>
            </ar-panel-card>
          </div>

          <div class="col-right">
            <ar-panel-card title="Nível de estoque">
              <ar-pill card-actions [tone]="statusTone[status()]">{{ statusLabel[status()] }}</ar-pill>
              <div class="stock-value">{{ p.stockQuantity }} <span class="unit">un</span></div>

              <div class="field-label bar-label">Estoque atual <span class="bar-pct">{{ stockPercent() }}%</span></div>
              <div class="bar-track">
                <div class="bar-fill" [class]="'tone-' + status()" [style.width.%]="stockPercent()"></div>
              </div>
              <div class="bar-caption">Mínimo recomendado: {{ minStock() }} un</div>
            </ar-panel-card>

            <ar-panel-card title="Valor em estoque">
              <div class="imobilizado-row">
                <span>Valor de venda total</span>
                <span class="value">{{ formatBRL(p.priceCents * p.stockQuantity) }}</span>
              </div>
            </ar-panel-card>

            <button type="button" class="ar-mini-btn adjust-btn" [disabled]="readOnly()" (click)="showAdjust.set(true)">
              <ar-icon name="box" [size]="14" />
              Ajustar estoque
            </button>

            <button type="button" class="remove-link" (click)="showRemoveConfirm.set(true)">
              <ar-icon name="alert-triangle" [size]="14" />
              Remover produto
            </button>
          </div>
        } @else {
          <p class="state-text">Produto não encontrado.</p>
        }
      </div>

      @if (showAdjust()) {
        <ar-stock-adjust-dialog
          [productName]="name()"
          [currentStock]="product()?.stockQuantity ?? 0"
          (cancel)="showAdjust.set(false)"
          (confirmed)="applyAdjustment($event)"
        />
      }

      @if (showRemoveConfirm()) {
        <ar-modal (close)="showRemoveConfirm.set(false)">
          <h2 class="confirm-title">Remover produto?</h2>
          <p class="confirm-body">
            "{{ name() }}" será removido do estoque da arena.
            @if (movements().length > 0) {
              Como já tem movimentações registradas, o recomendado é <strong>desativar</strong> (mantém o histórico e some da lista).
              Excluir de vez apaga o produto, mas não o histórico já registrado.
            } @else {
              Esta ação não pode ser desfeita.
            }
          </p>
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="removing()" (click)="showRemoveConfirm.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn" [disabled]="removing()" (click)="deactivate()">Desativar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="removing()" (click)="hardDelete()">Excluir definitivamente</button>
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

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .readonly-banner,
    .error-banner {
      grid-column: 1 / -1;
      border-radius: var(--nx-r-2);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .readonly-banner {
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
    }

    .error-banner {
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
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

    .bar-fill.tone-ok {
      background: var(--nx-win);
    }

    .bar-fill.tone-low {
      background: var(--nx-pending);
    }

    .bar-fill.tone-out {
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
      gap: 12px;
      flex-wrap: wrap;
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
  private readonly auth = inject(AuthService);
  private readonly arenaContext = inject(ArenaContextService);

  readonly id = input.required<string>();

  protected readonly categoryOptions = ARENA_PRODUCT_CATEGORIES;
  protected readonly categoryLabel = ARENA_PRODUCT_CATEGORY_LABEL;
  protected readonly statusLabel = ARENA_PRODUCT_STOCK_STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly formatBRL = formatCentsBRL;
  protected readonly formatMovementDate = formatMovementDate;
  protected readonly formatSignedQuantityDelta = formatSignedQuantityDelta;
  protected readonly movementHistoryTitle = movementHistoryTitle;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly removing = signal(false);

  protected readonly showAdjust = signal(false);
  protected readonly showRemoveConfirm = signal(false);

  protected readonly product = signal<ArenaProduct | null>(null);
  protected readonly movements = signal<ArenaStockMovement[]>([]);

  protected readonly readOnly = computed(() => !this.arenaContext.hasCapability('estoque'));

  protected readonly name = linkedSignal(() => this.product()?.name ?? '');
  protected readonly category = linkedSignal<ArenaProductCategory>(() => this.product()?.category ?? 'bebidas');
  protected readonly emoji = linkedSignal(() => this.product()?.emoji ?? '');
  protected readonly priceValue = linkedSignal(() => formatCentsInputValue(this.product()?.priceCents ?? 0));
  protected readonly minStock = linkedSignal(() => this.product()?.minStockQuantity ?? 0);

  protected readonly movementsKicker = computed(() => `${this.movements().length} lançamentos recentes`);
  protected readonly status = computed(() => {
    const p = this.product();
    return p ? productStockStatus(p) : 'out';
  });
  protected readonly stockPercent = computed(() => {
    const p = this.product();
    return p ? Math.round(productStockBarFillRatio(p) * 100) : 0;
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const productId = this.id();
      if (!arenaId || !productId) return;
      void this.loadAll(arenaId, productId);
    });
  }

  private async loadAll(arenaId: string, productId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [product, movements] = await Promise.all([
        fetchProduct(arenaFirestore(), arenaId, productId),
        fetchMovements(arenaFirestore(), arenaId, productId),
      ]);
      this.product.set(product);
      this.movements.set(movements);
    } catch {
      this.loadError.set('Não foi possível carregar o produto.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const p = this.product();
    if (!arenaId || !p || this.readOnly()) {
      return;
    }
    if (!this.name().trim()) {
      this.saveError.set('Informe o nome do produto.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await updateProduct(arenaFirestore(), arenaId, p.id, {
        name: this.name().trim(),
        category: this.category(),
        active: p.active,
        priceCents: parseBRLInputToCents(this.priceValue()),
        stockQuantity: p.stockQuantity,
        minStockQuantity: Math.max(0, Math.round(this.minStock())),
        emoji: this.emoji().trim() || undefined,
      });
      void this.router.navigate(['/painel/estoque']);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível salvar as alterações.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async applyAdjustment(result: StockAdjustResult): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const p = this.product();
    const uid = this.auth.user()?.uid;
    this.showAdjust.set(false);
    if (!arenaId || !p || !uid) {
      return;
    }
    try {
      await registerStockMovement(arenaFirestore(), arenaId, p.id, result.type, result.quantity, uid, result.note);
      await this.loadAll(arenaId, p.id);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível registrar a movimentação.');
    }
  }

  protected async deactivate(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const p = this.product();
    if (!arenaId || !p) return;
    this.removing.set(true);
    try {
      await deactivateProduct(arenaFirestore(), arenaId, p.id);
      this.showRemoveConfirm.set(false);
      void this.router.navigate(['/painel/estoque']);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível desativar o produto.');
    } finally {
      this.removing.set(false);
    }
  }

  protected async hardDelete(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const p = this.product();
    if (!arenaId || !p) return;
    this.removing.set(true);
    try {
      await deleteProduct(arenaFirestore(), arenaId, p.id);
      this.showRemoveConfirm.set(false);
      void this.router.navigate(['/painel/estoque']);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível excluir o produto.');
    } finally {
      this.removing.set(false);
    }
  }
}

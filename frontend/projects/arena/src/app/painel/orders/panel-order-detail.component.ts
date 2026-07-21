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
import { formatCentsInputValue, formatMovementDate, parseBRLInputToCents, type ArenaProduct } from '../stock/product.model';
import { fetchProducts } from '../stock/products-repository';
import {
  ARENA_COMANDA_PAYMENT_METHOD_LABEL,
  ARENA_COMANDA_STATUS_LABEL,
  comandaCloseEmptyBlockReason,
  comandaItemReverseBlockReason,
  comandaRemainingCents,
  comandaStatusIsActive,
  formatCentsBRL,
  formatComandaNumber,
  type ArenaComanda,
  type ArenaComandaItem,
  type ArenaComandaPayment,
  type ArenaComandaPaymentMethod,
} from './comanda.model';
import {
  addItemsBatch,
  closeEmptyComanda,
  fetchComanda,
  fetchComandaItems,
  fetchComandaPayments,
  registerPayment,
  reverseComandaItem,
} from './comandas-repository';

const PAYMENT_METHODS: ArenaComandaPaymentMethod[] = ['pix', 'credit', 'debit', 'cash', 'wallet', 'other'];

/** Tela Detalhe da comanda: itens reais de `arenaComandas/{id}/items` (adicionar baixa
 *  estoque via `addItemsBatch`, estornar via `reverseComandaItem`) e pagamentos reais via
 *  `registerPayment`. Adicionar item exige plano Pro/Parceiro; estornar item e receber
 *  pagamento continuam liberados mesmo com plano rebaixado (mesma regra do Flutter/rules). */
@Component({
  selector: 'ar-panel-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="headerTitle()" [subtitle]="headerSubtitle()" />

      <div class="body">
        @if (loading()) {
          <p class="state-text">Carregando comanda…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else if (comanda(); as c) {
          <div class="col-left">
            <ar-panel-card [kicker]="itemsKicker()" title="Itens">
              <div class="table-head">
                <span>Produto</span>
                <span class="right">Qtd</span>
                <span class="right">Preço</span>
                <span class="right">Subtotal</span>
                <span></span>
              </div>
              <div class="table-list">
                @for (it of items(); track it.id) {
                  <div class="table-row">
                    <div class="item-cell">
                      <div class="thumb" aria-hidden="true">{{ it.emoji }}</div>
                      <div>
                        <div class="item-name">{{ it.productName }}</div>
                        <div class="item-category">{{ it.source === 'app' ? 'App' : 'Balcão' }} · {{ it.addedByName }}</div>
                      </div>
                    </div>
                    <div class="right item-qty">x{{ it.quantity }}</div>
                    <div class="right item-price">{{ formatBRL(it.unitPriceCents) }}</div>
                    <div class="right item-subtotal">{{ formatBRL(it.lineTotalCents) }}</div>
                    <button
                      type="button"
                      class="remove-btn"
                      [disabled]="reversingId() === it.id || !!reverseBlockReason(c, it)"
                      [title]="reverseBlockReason(c, it) ?? 'Estornar item'"
                      (click)="reverseItem(c, it)"
                      aria-label="Estornar item"
                    >
                      ×
                    </button>
                  </div>
                } @empty {
                  <p class="state-text">Nenhum item lançado ainda.</p>
                }
              </div>

              @if (itemError(); as ierr) {
                <div class="error-banner">{{ ierr }}</div>
              }

              @if (canAddItem()) {
                <div class="add-block">
                  <div class="search-box">
                    <ar-icon name="search" [size]="15" style="color: var(--nx-text-dim)" />
                    <input
                      type="text"
                      placeholder="Buscar produto do estoque para adicionar…"
                      [value]="addQuery()"
                      (input)="onAddQueryInput($any($event.target).value)"
                    />
                  </div>
                  @if (addSuggestions().length > 0) {
                    <div class="suggestions">
                      @for (p of addSuggestions(); track p.id) {
                        <button type="button" class="suggestion-row" (click)="selectProduct(p)">
                          <span>{{ p.emoji }} {{ p.name }}</span>
                          <span>{{ formatBRL(p.priceCents) }}</span>
                        </button>
                      }
                    </div>
                  }
                  @if (selectedProduct(); as sp) {
                    <div class="selected-row">
                      <span class="selected-name">{{ sp.name }}</span>
                      <input
                        type="number"
                        min="1"
                        class="qty-input-sm"
                        [value]="addQuantity()"
                        (input)="addQuantity.set(Math.max(1, $any($event.target).valueAsNumber || 1))"
                      />
                      <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="adding()" (click)="confirmAddItem(c)">
                        {{ adding() ? 'Adicionando…' : 'Adicionar' }}
                      </button>
                      <button type="button" class="ar-ghost-btn" (click)="selectedProduct.set(null)">Cancelar</button>
                    </div>
                  }
                </div>
              } @else if (readOnly()) {
                <p class="state-text readonly-hint">Seu plano atual não permite adicionar itens — fale com o suporte para fazer upgrade.</p>
              }
            </ar-panel-card>
          </div>

          <div class="col-right">
            <ar-panel-card title="Cliente">
              <div class="client-row">
                <div class="thumb client-thumb" aria-hidden="true"></div>
                <div>
                  <div class="client-name">{{ c.customerName }}</div>
                  <div class="client-meta">{{ statusLabel[c.status] }}{{ c.customerWhatsapp ? ' · ' + c.customerWhatsapp : '' }}</div>
                </div>
              </div>
            </ar-panel-card>

            <ar-panel-card title="Resumo">
              <div class="summary-row">
                <span>Consumo</span>
                <span class="value">{{ formatBRL(c.itemsTotalCents) }}</span>
              </div>
              @if (c.rentalCents > 0) {
                <div class="summary-row">
                  <span>Locação</span>
                  <span class="value">{{ formatBRL(c.rentalCents) }}</span>
                </div>
              }
              <div class="summary-divider"></div>
              <div class="summary-row total-row">
                <span>Total</span>
                <span class="value total-value">{{ formatBRL(c.totalCents) }}</span>
              </div>
              <div class="summary-row">
                <span>Pago</span>
                <span class="value tone-green">{{ formatBRL(c.paidCents) }}</span>
              </div>
              <div class="summary-row">
                <span>Restante</span>
                <span class="value">{{ formatBRL(remainingCents()) }}</span>
              </div>
            </ar-panel-card>

            @if (payments().length > 0) {
              <ar-panel-card title="Pagamentos recebidos">
                <div class="payment-history">
                  @for (p of payments(); track p.id) {
                    <div class="payment-row">
                      <span>{{ paymentMethodLabel[p.method] }}</span>
                      <span class="dim">{{ formatMovementDate(p.createdAt) }}</span>
                      <span class="value">{{ formatBRL(p.amountCents) }}</span>
                    </div>
                  }
                </div>
              </ar-panel-card>
            }

            @if (canPay()) {
              <ar-panel-card title="Registrar pagamento">
                @if (payError(); as perr) {
                  <div class="error-banner">{{ perr }}</div>
                }
                <div class="payment-list">
                  @for (m of paymentMethods; track m) {
                    <button type="button" class="payment-btn" [class.active]="paymentMethod() === m" (click)="paymentMethod.set(m)">
                      {{ paymentMethodLabel[m] }}
                      @if (paymentMethod() === m) {
                        <ar-icon name="check" [size]="15" />
                      }
                    </button>
                  }
                </div>

                <div class="field-label row-gap">Valor</div>
                <div class="price-box">
                  <span>R$</span>
                  <input type="text" inputmode="decimal" [value]="paymentAmountValue()" (input)="paymentAmountValue.set($any($event.target).value)" />
                </div>

                <button type="button" class="close-btn" [disabled]="paying()" (click)="submitPayment(c)">
                  <ar-icon name="cash" [size]="15" />
                  {{ paying() ? 'Registrando…' : 'Registrar pagamento' }}
                </button>
              </ar-panel-card>
            } @else if (canCloseEmpty()) {
              <ar-panel-card title="Fechar comanda">
                <p class="state-text">Nenhum item foi lançado nesta comanda.</p>
                @if (closeEmptyError(); as cerr) {
                  <div class="error-banner">{{ cerr }}</div>
                }
                <button type="button" class="ar-mini-btn close-empty-btn" [disabled]="closingEmpty()" (click)="showCloseConfirm.set(true)">
                  Fechar comanda
                </button>
              </ar-panel-card>
            } @else if (c.status === 'closed') {
              <p class="state-text">{{ c.totalCents === 0 ? 'Comanda fechada sem consumo.' : 'Comanda fechada — totalmente paga.' }}</p>
            }
          </div>

          @if (showCloseConfirm()) {
            <ar-modal (close)="showCloseConfirm.set(false)">
              <h2 class="confirm-title">Fechar comanda sem consumo?</h2>
              <p class="confirm-body">
                Nenhum item foi lançado em "{{ c.customerName }}". Ela será marcada como fechada e sai da lista de comandas abertas.
              </p>
              <div class="confirm-actions">
                <button type="button" class="ar-ghost-btn" [disabled]="closingEmpty()" (click)="showCloseConfirm.set(false)">Cancelar</button>
                <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="closingEmpty()" (click)="confirmCloseEmpty(c)">
                  {{ closingEmpty() ? 'Fechando…' : 'Fechar comanda' }}
                </button>
              </div>
            </ar-modal>
          }
        } @else {
          <p class="state-text">Comanda não encontrada.</p>
        }
      </div>
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

    .readonly-hint {
      margin-top: 14px;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
      margin-top: 12px;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.8fr 60px 90px 100px 28px;
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

    .item-cell {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .thumb {
      width: 40px;
      height: 40px;
      flex: none;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: grid;
      place-items: center;
      font-size: 16px;
    }

    .item-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .item-category {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .item-qty,
    .item-price {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .item-subtotal {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .right {
      text-align: right;
    }

    .remove-btn {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nx-live);
      font-size: 16px;
      line-height: 1;
      display: grid;
      place-items: center;
    }

    .remove-btn:hover:not(:disabled) {
      background: rgba(255, 59, 48, 0.12);
    }

    .remove-btn:disabled {
      color: var(--nx-text-dim);
      cursor: not-allowed;
    }

    .add-block {
      margin-top: 14px;
    }

    .search-box {
      height: 46px;
      border-radius: var(--nx-r-2);
      border: 1px dashed var(--nx-line-strong);
      background: transparent;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
    }

    .search-box input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
    }

    .suggestions {
      margin-top: 8px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      overflow: hidden;
    }

    .suggestion-row {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--nx-surface-0);
      border: none;
      border-bottom: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-size: 13px;
      cursor: pointer;
      text-align: left;
    }

    .suggestion-row:last-child {
      border-bottom: none;
    }

    .suggestion-row:hover {
      background: var(--nx-surface-1);
    }

    .selected-row {
      margin-top: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .selected-name {
      flex: 1;
      min-width: 0;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .qty-input-sm {
      width: 64px;
      height: 40px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      text-align: center;
      font-family: var(--nx-font-ui);
      font-size: 14px;
    }

    .client-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .client-thumb {
      width: 44px;
      height: 44px;
    }

    .client-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }

    .client-meta {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }

    .summary-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
    }

    .summary-row span:first-child {
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .summary-row .value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }

    .summary-row .value.tone-green {
      color: var(--nx-win);
    }

    .summary-divider {
      height: 1px;
      background: var(--nx-line);
      margin: 8px 0;
    }

    .total-row .value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      color: var(--nx-text);
    }

    .payment-history {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .payment-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .payment-row .dim {
      color: var(--nx-text-dim);
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
    }

    .payment-row .value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      color: var(--nx-text);
    }

    .payment-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .payment-btn {
      height: 52px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      transition: all 140ms var(--nx-ease-out);
    }

    .payment-btn:hover {
      background: var(--nx-surface-2);
    }

    .payment-btn.active {
      background: var(--nx-orange-tint);
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .row-gap {
      margin-top: 16px;
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
      margin-bottom: 16px;
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

    .close-btn {
      width: 100%;
      height: 52px;
      border-radius: var(--nx-r-3);
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      border: none;
      cursor: pointer;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14.5px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-shadow: 0 6px 20px rgba(255, 106, 26, 0.2);
      transition: background 140ms var(--nx-ease-out);
    }

    .close-btn:hover:not(:disabled) {
      background: var(--nx-orange-400);
    }

    .close-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .close-empty-btn {
      width: 100%;
      margin-top: 14px;
      height: 44px;
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

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelOrderDetailComponent {
  private readonly auth = inject(AuthService);
  private readonly arenaContext = inject(ArenaContextService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly Math = Math;
  protected readonly formatBRL = formatCentsBRL;
  protected readonly formatComandaNumber = formatComandaNumber;
  protected readonly formatMovementDate = formatMovementDate;
  protected readonly statusLabel = ARENA_COMANDA_STATUS_LABEL;
  protected readonly paymentMethodLabel = ARENA_COMANDA_PAYMENT_METHOD_LABEL;
  protected readonly paymentMethods = PAYMENT_METHODS;
  protected readonly reverseBlockReason = comandaItemReverseBlockReason;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly comanda = signal<ArenaComanda | null>(null);
  protected readonly items = signal<ArenaComandaItem[]>([]);
  protected readonly payments = signal<ArenaComandaPayment[]>([]);
  protected readonly products = signal<ArenaProduct[]>([]);

  protected readonly readOnly = computed(() => !this.arenaContext.hasCapability('pdvComandas'));

  protected readonly addQuery = signal('');
  protected readonly selectedProduct = signal<ArenaProduct | null>(null);
  protected readonly addQuantity = signal(1);
  protected readonly adding = signal(false);
  protected readonly itemError = signal<string | null>(null);
  protected readonly reversingId = signal<string | null>(null);

  protected readonly paymentMethod = signal<ArenaComandaPaymentMethod>('pix');
  protected readonly paying = signal(false);
  protected readonly payError = signal<string | null>(null);

  protected readonly showCloseConfirm = signal(false);
  protected readonly closingEmpty = signal(false);
  protected readonly closeEmptyError = signal<string | null>(null);

  protected readonly headerTitle = computed(() => {
    const c = this.comanda();
    return c ? `Comanda ${formatComandaNumber(c.displayNumber)}` : 'Comanda';
  });
  protected readonly headerSubtitle = computed(() => {
    const c = this.comanda();
    return c ? `${c.customerName} · ${ARENA_COMANDA_STATUS_LABEL[c.status]}` : '';
  });

  protected readonly itemsKicker = computed(() => `${this.items().length} itens lançados`);
  protected readonly remainingCents = computed(() => {
    const c = this.comanda();
    return c ? comandaRemainingCents(c) : 0;
  });
  protected readonly paymentAmountValue = linkedSignal(() => formatCentsInputValue(this.remainingCents()));

  protected readonly canAddItem = computed(() => {
    const c = this.comanda();
    return !!c && comandaStatusIsActive(c.status) && !this.readOnly();
  });
  protected readonly canPay = computed(() => {
    const c = this.comanda();
    return !!c && comandaStatusIsActive(c.status) && this.remainingCents() > 0;
  });
  protected readonly canCloseEmpty = computed(() => {
    const c = this.comanda();
    return !!c && !comandaCloseEmptyBlockReason(c);
  });

  protected readonly addSuggestions = computed(() => {
    if (this.selectedProduct()) return [];
    const q = this.addQuery().trim().toLowerCase();
    if (!q) return [];
    return this.products()
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 6);
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const comandaId = this.id();
      if (!arenaId || !comandaId) return;
      void this.loadAll(arenaId, comandaId);
    });
  }

  private async loadAll(arenaId: string, comandaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const db = arenaFirestore();
      const [comanda, items, payments, products] = await Promise.all([
        fetchComanda(db, comandaId),
        fetchComandaItems(db, comandaId),
        fetchComandaPayments(db, comandaId),
        fetchProducts(db, arenaId),
      ]);
      this.comanda.set(comanda);
      this.items.set(items);
      this.payments.set(payments);
      this.products.set(products.filter((p) => p.active));
    } catch {
      this.loadError.set('Não foi possível carregar a comanda.');
    } finally {
      this.loading.set(false);
    }
  }

  protected onAddQueryInput(value: string): void {
    this.addQuery.set(value);
    this.selectedProduct.set(null);
  }

  protected selectProduct(product: ArenaProduct): void {
    this.selectedProduct.set(product);
    this.addQuantity.set(1);
  }

  protected async confirmAddItem(comanda: ArenaComanda): Promise<void> {
    const product = this.selectedProduct();
    const arenaId = this.arenaContext.arenaId();
    const uid = this.auth.user()?.uid;
    const addedByName = this.auth.displayName() ?? 'Gestor';
    if (!product || !arenaId || !uid) return;

    this.adding.set(true);
    this.itemError.set(null);
    try {
      await addItemsBatch(
        arenaFirestore(),
        arenaId,
        comanda.id,
        [{ productId: product.id, quantity: Math.max(1, Math.round(this.addQuantity())) }],
        uid,
        addedByName,
      );
      this.selectedProduct.set(null);
      this.addQuery.set('');
      this.addQuantity.set(1);
      await this.loadAll(arenaId, comanda.id);
    } catch (err) {
      this.itemError.set(err instanceof Error ? err.message : 'Não foi possível adicionar o item.');
    } finally {
      this.adding.set(false);
    }
  }

  protected async reverseItem(comanda: ArenaComanda, item: ArenaComandaItem): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const uid = this.auth.user()?.uid;
    if (!arenaId || !uid) return;
    const block = comandaItemReverseBlockReason(comanda, item);
    if (block) {
      this.itemError.set(block);
      return;
    }

    this.reversingId.set(item.id);
    this.itemError.set(null);
    try {
      await reverseComandaItem(arenaFirestore(), arenaId, comanda.id, item.id, uid);
      await this.loadAll(arenaId, comanda.id);
    } catch (err) {
      this.itemError.set(err instanceof Error ? err.message : 'Não foi possível estornar o item.');
    } finally {
      this.reversingId.set(null);
    }
  }

  protected async submitPayment(comanda: ArenaComanda): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const uid = this.auth.user()?.uid;
    if (!arenaId || !uid) return;

    const amountCents = parseBRLInputToCents(this.paymentAmountValue());
    if (amountCents <= 0) {
      this.payError.set('Informe um valor válido.');
      return;
    }

    this.paying.set(true);
    this.payError.set(null);
    try {
      await registerPayment(arenaFirestore(), comanda.id, this.paymentMethod(), amountCents, comanda.customerName, uid);
      await this.loadAll(arenaId, comanda.id);
    } catch (err) {
      this.payError.set(err instanceof Error ? err.message : 'Não foi possível registrar o pagamento.');
    } finally {
      this.paying.set(false);
    }
  }

  protected async confirmCloseEmpty(comanda: ArenaComanda): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.closingEmpty.set(true);
    this.closeEmptyError.set(null);
    try {
      await closeEmptyComanda(arenaFirestore(), comanda.id);
      this.showCloseConfirm.set(false);
      await this.loadAll(arenaId, comanda.id);
    } catch (err) {
      this.closeEmptyError.set(err instanceof Error ? err.message : 'Não foi possível fechar a comanda.');
    } finally {
      this.closingEmpty.set(false);
    }
  }
}

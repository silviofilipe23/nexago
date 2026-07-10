import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal, viewChild, type ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';

type PaymentMethod = 'Pix' | 'Cartão' | 'Dinheiro';

interface OrderItem {
  id: string;
  name: string;
  category: string;
  qty: number;
  price: number;
}

interface OrderDetail {
  location: string;
  sport: string;
  client: string;
  openedLabel: string;
  items: OrderItem[];
  payment: PaymentMethod;
}

const PAYMENT_OPTIONS: PaymentMethod[] = ['Pix', 'Cartão', 'Dinheiro'];

const DEFAULT_ORDER: OrderDetail = {
  location: '—',
  sport: '',
  client: 'Novo cliente',
  openedLabel: 'Aberta agora',
  items: [],
  payment: 'Pix',
};

const MOCK_ORDERS: Record<string, OrderDetail> = {
  c048: {
    location: 'Quadra 1',
    sport: 'Beach Tennis',
    client: 'Grupo Rafael S.',
    openedLabel: 'Aberta há 1h 20min',
    payment: 'Pix',
    items: [
      { id: 'i1', name: 'Água mineral 500ml', category: 'Bebida', qty: 3, price: 6 },
      { id: 'i2', name: 'Isotônico 500ml', category: 'Bebida', qty: 2, price: 9 },
      { id: 'i3', name: 'Aluguel de raquete · Beach Tennis', category: 'Material', qty: 1, price: 25 },
    ],
  },
  c047: {
    location: 'Quadra 3',
    sport: 'Vôlei de praia',
    client: 'Camila T. e Bruna L.',
    openedLabel: 'Aberta há 35min',
    payment: 'Pix',
    items: [
      { id: 'i1', name: 'Isotônico 500ml', category: 'Bebida', qty: 2, price: 9 },
      { id: 'i2', name: 'Barrinha de cereal', category: 'Snack', qty: 1, price: 8 },
    ],
  },
  c046: {
    location: 'Balcão',
    sport: '',
    client: 'Cliente avulso',
    openedLabel: 'Aberta há 8min',
    payment: 'Dinheiro',
    items: [
      { id: 'i1', name: 'Água mineral 500ml', category: 'Bebida', qty: 2, price: 6 },
      { id: 'i2', name: 'Refrigerante lata', category: 'Bebida', qty: 1, price: 7 },
    ],
  },
  c045: {
    location: 'Balcão',
    sport: '',
    client: 'Enzo Ribeiro',
    openedLabel: 'Fechada às 17:40',
    payment: 'Cartão',
    items: [{ id: 'i1', name: 'Isotônico 500ml', category: 'Bebida', qty: 4, price: 9 }],
  },
  c044: {
    location: 'Quadra 2',
    sport: 'Vôlei de praia',
    client: 'Maria Tavares',
    openedLabel: 'Fechada às 15:10',
    payment: 'Pix',
    items: [
      { id: 'i1', name: 'Bola Beach Tennis (dupla)', category: 'Material', qty: 1, price: 45 },
      { id: 'i2', name: 'Isotônico 500ml', category: 'Bebida', qty: 4, price: 9 },
    ],
  },
};

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/** Tela Detalhe da comanda (protótipo ArComandaDetalheScreen): itens lançados, cliente/local, resumo e fechamento com forma de pagamento. */
@Component({
  selector: 'ar-panel-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="'Comanda #' + code()" [subtitle]="location() + ' · ' + openedLabel()">
        <button type="button" class="ar-mini-btn" (click)="focusAddItem()">
          <ar-icon name="plus" [size]="14" />
          Adicionar item
        </button>
      </ar-page-header>

      <div class="body">
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
                    <div class="thumb" aria-hidden="true"></div>
                    <div>
                      <div class="item-name">{{ it.name }}</div>
                      <div class="item-category">{{ it.category }}</div>
                    </div>
                  </div>
                  <div class="right item-qty">x{{ it.qty }}</div>
                  <div class="right item-price">{{ formatBRL(it.price) }}</div>
                  <div class="right item-subtotal">{{ formatBRL(it.price * it.qty) }}</div>
                  <button type="button" class="remove-btn" (click)="removeItem(it.id)" aria-label="Remover item">×</button>
                </div>
              }
            </div>

            <div class="add-row">
              <ar-icon name="plus" [size]="14" style="color: var(--nx-text-dim)" />
              <input
                #addItemInput
                type="text"
                placeholder="Buscar produto do estoque para adicionar…"
                [value]="newItemName()"
                (input)="newItemName.set($any($event.target).value)"
                (keydown.enter)="addItem()"
              />
            </div>
          </ar-panel-card>
        </div>

        <div class="col-right">
          <ar-panel-card title="Cliente / local">
            <div class="client-row">
              <div class="thumb client-thumb" aria-hidden="true"></div>
              <div>
                <div class="client-name">{{ client() }}</div>
                <div class="client-meta">{{ location() }}{{ sport() ? ' · ' + sport() : '' }}</div>
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card title="Resumo">
            <div class="summary-row">
              <span>Subtotal</span>
              <span class="value">{{ formatBRL(subtotal()) }}</span>
            </div>
            <div class="summary-row">
              <span>Taxa de serviço</span>
              <span class="value dim">—</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-row total-row">
              <span>Total</span>
              <span class="value total-value">{{ formatBRL(total()) }}</span>
            </div>
          </ar-panel-card>

          <ar-panel-card title="Forma de pagamento">
            <div class="payment-list">
              @for (opt of paymentOptions; track opt) {
                <button type="button" class="payment-btn" [class.active]="payment() === opt" (click)="payment.set(opt)">
                  {{ opt }}
                  @if (payment() === opt) {
                    <ar-icon name="check" [size]="15" />
                  }
                </button>
              }
            </div>
          </ar-panel-card>

          <button type="button" class="close-btn" (click)="closeOrder()">
            <ar-icon name="cash" [size]="15" />
            Fechar comanda e cobrar
          </button>
        </div>
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

    .remove-btn:hover {
      background: rgba(255, 59, 48, 0.12);
    }

    .add-row {
      margin-top: 14px;
      height: 46px;
      border-radius: var(--nx-r-2);
      border: 1px dashed var(--nx-line-strong);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
    }

    .add-row input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
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

    .summary-row .value.dim {
      color: var(--nx-text-dim);
      font-weight: 500;
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

    .close-btn {
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

    .close-btn:hover {
      background: var(--nx-orange-400);
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelOrderDetailComponent {
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly paymentOptions = PAYMENT_OPTIONS;
  protected readonly formatBRL = formatBRL;

  protected readonly newItemName = signal('');

  private readonly addItemInputRef = viewChild<ElementRef<HTMLInputElement>>('addItemInput');

  private readonly orderData = computed(() => MOCK_ORDERS[this.id()] ?? DEFAULT_ORDER);

  protected readonly code = computed(() => this.id().replace(/^c/, ''));
  protected readonly location = linkedSignal(() => this.orderData().location);
  protected readonly sport = linkedSignal(() => this.orderData().sport);
  protected readonly client = linkedSignal(() => this.orderData().client);
  protected readonly openedLabel = linkedSignal(() => this.orderData().openedLabel);
  protected readonly items = linkedSignal(() => this.orderData().items);
  protected readonly payment = linkedSignal<PaymentMethod>(() => this.orderData().payment);

  protected readonly itemsKicker = computed(() => `${this.items().length} itens lançados`);

  protected readonly subtotal = computed(() => this.items().reduce((sum, it) => sum + it.price * it.qty, 0));
  protected readonly total = computed(() => this.subtotal());

  protected removeItem(itemId: string): void {
    this.items.update((current) => current.filter((it) => it.id !== itemId));
  }

  protected addItem(): void {
    const name = this.newItemName().trim();
    if (!name) {
      return;
    }
    this.items.update((current) => [...current, { id: `new-${Date.now()}`, name, category: 'Outro', qty: 1, price: 0 }]);
    this.newItemName.set('');
  }

  protected focusAddItem(): void {
    this.addItemInputRef()?.nativeElement.focus();
  }

  protected closeOrder(): void {
    this.router.navigate(['/painel/comandas']);
  }
}

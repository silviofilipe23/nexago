import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type OrderStatus = 'aberta' | 'fechada';
type StatusFilter = 'abertas' | 'fechadas' | 'todas';
type LocationOption = 'Quadra 1' | 'Quadra 2' | 'Quadra 3' | 'Balcão';

interface Order {
  id: string;
  code: string;
  location: string;
  client: string;
  items: number;
  timeLabel: string;
  total: number;
  status: OrderStatus;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
};

const STATUS_TONE: Record<OrderStatus, PillTone> = {
  aberta: 'orange',
  fechada: 'dim',
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'abertas', label: 'Abertas' },
  { key: 'fechadas', label: 'Fechadas' },
  { key: 'todas', label: 'Todas' },
];

const LOCATION_OPTIONS: LocationOption[] = ['Quadra 1', 'Quadra 2', 'Quadra 3', 'Balcão'];

const ORDERS: Order[] = [
  { id: 'c048', code: '048', location: 'Quadra 1', client: 'Grupo Rafael S.', items: 6, timeLabel: 'Aberta há 1h 20min', total: 142.5, status: 'aberta' },
  { id: 'c047', code: '047', location: 'Quadra 3', client: 'Camila T. e Bruna L.', items: 3, timeLabel: 'Aberta há 35min', total: 58, status: 'aberta' },
  { id: 'c046', code: '046', location: 'Balcão', client: 'Cliente avulso', items: 2, timeLabel: 'Aberta há 8min', total: 24, status: 'aberta' },
  { id: 'c045', code: '045', location: 'Balcão', client: 'Enzo Ribeiro', items: 4, timeLabel: 'Fechada às 17:40', total: 108, status: 'fechada' },
  { id: 'c044', code: '044', location: 'Quadra 2', client: 'Maria Tavares', items: 5, timeLabel: 'Fechada às 15:10', total: 186, status: 'fechada' },
];

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/** Tela Comandas do painel (protótipo ArComandasScreen): KPIs, lista de comandas por status e abertura de nova comanda. */
@Component({
  selector: 'ar-panel-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Comandas" [subtitle]="arenaName() + ' · ' + openCount() + ' abertas agora'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="showNewOrder.set(true)">
          <ar-icon name="plus" [size]="14" />
          Nova comanda
        </button>
      </ar-page-header>

      <div class="body">
        <div class="summary-row">
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-orange">Comandas abertas</div>
            <div class="summary-value">{{ openCount() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-dim">Em aberto</div>
            <div class="summary-value">{{ formatBRL(openTotal()) }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-dim">Faturado hoje</div>
            <div class="summary-value tone-green">{{ formatBRL(billedToday) }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="summary-card">
            <div class="summary-label tone-dim">Ticket médio</div>
            <div class="summary-value">{{ formatBRL(averageTicket()) }}</div>
          </ar-panel-card>
        </div>

        <ar-panel-card [kicker]="listKicker()" title="Comandas" class="table-card">
          <div class="ar-filter-bar" card-actions>
            @for (f of statusFilters; track f.key) {
              <button type="button" class="ar-chip" [class.active]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }}</button>
            }
          </div>

          <div class="table-head">
            <span>Comanda</span>
            <span>Cliente</span>
            <span>Itens</span>
            <span>Tempo</span>
            <span class="right">Total</span>
            <span>Status</span>
          </div>
          <div class="table-list">
            @for (o of filteredOrders(); track o.id) {
              <div class="table-row" (click)="openOrder(o.id)">
                <div class="order-cell">
                  <div class="order-icon">
                    <ar-icon name="bookmark" [size]="16" />
                  </div>
                  <div class="order-code">#{{ o.code }} · {{ o.location }}</div>
                </div>
                <div class="order-client">{{ o.client }}</div>
                <div class="order-items">{{ o.items }}</div>
                <div class="order-time">{{ o.timeLabel }}</div>
                <div class="order-total right">{{ formatBRL(o.total) }}</div>
                <div><ar-pill [tone]="statusTone[o.status]">{{ statusLabel[o.status] }}</ar-pill></div>
              </div>
            }
          </div>
        </ar-panel-card>
      </div>

      @if (showNewOrder()) {
        <ar-modal (close)="showNewOrder.set(false)">
          <h2 class="modal-title">Nova comanda</h2>
          <p class="modal-subtitle">Selecione o local e o cliente para abrir a conta</p>

          <div class="field-label">Local</div>
          <div class="ar-filter-bar filter-block">
            @for (loc of locationOptions; track loc) {
              <button type="button" class="ar-chip" [class.active]="newLocation() === loc" (click)="newLocation.set(loc)">{{ loc }}</button>
            }
          </div>

          <div class="field-label">Cliente</div>
          <div class="search-box">
            <ar-icon name="search" [size]="15" style="color: var(--nx-text-dim)" />
            <input
              type="text"
              placeholder="Buscar atleta cadastrado…"
              [value]="athleteSearch()"
              (input)="athleteSearch.set($any($event.target).value); walkInName.set('')"
            />
          </div>

          <div class="or-divider"><span>ou</span></div>

          <input
            type="text"
            class="input-box walkin-input"
            placeholder="Nome do cliente avulso"
            [value]="walkInName()"
            (input)="walkInName.set($any($event.target).value); athleteSearch.set('')"
          />

          <div class="actions">
            <button type="button" class="ar-ghost-btn" (click)="showNewOrder.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="!canCreate()" (click)="createOrder()">
              Abrir comanda
            </button>
          </div>
        </ar-modal>
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

    .summary-label.tone-orange {
      color: var(--nx-orange-500);
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

    .summary-value.tone-green {
      color: var(--nx-win);
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.6fr 1.3fr 80px 170px 130px 110px;
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
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);
      cursor: pointer;
      border-radius: var(--nx-r-2);
      transition: background 140ms var(--nx-ease-out);
    }

    .table-row:hover {
      background: var(--nx-surface-1);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .order-cell {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .order-icon {
      width: 34px;
      height: 34px;
      flex: none;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
      color: var(--nx-orange-500);
    }

    .order-code {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .order-client,
    .order-items,
    .order-time {
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .order-time {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    .order-total {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14.5px;
      color: var(--nx-text);
    }

    .right {
      text-align: right;
    }

    .modal-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }

    .modal-subtitle {
      font-size: 13px;
      color: var(--nx-text-dim);
      margin: 4px 0 20px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .filter-block {
      margin-bottom: 20px;
    }

    .search-box {
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 9px;
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
      font-size: 14px;
    }

    .or-divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 16px 0;
      color: var(--nx-text-dim);
      font-size: 11px;
    }

    .or-divider::before,
    .or-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--nx-line);
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

    .walkin-input {
      margin-bottom: 24px;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
    }

    @media (max-width: 1180px) {
      .summary-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelOrdersComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly formatBRL = formatBRL;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly locationOptions = LOCATION_OPTIONS;
  protected readonly billedToday = 518.5;

  protected readonly orders = signal<Order[]>(ORDERS);
  protected readonly filter = signal<StatusFilter>('abertas');
  protected readonly showNewOrder = signal(false);

  protected readonly newLocation = signal<LocationOption>('Quadra 1');
  protected readonly athleteSearch = signal('');
  protected readonly walkInName = signal('');

  protected readonly filteredOrders = computed(() => {
    const f = this.filter();
    if (f === 'todas') {
      return this.orders();
    }
    const status: OrderStatus = f === 'abertas' ? 'aberta' : 'fechada';
    return this.orders().filter((o) => o.status === status);
  });

  protected readonly listKicker = computed(() => `${this.filteredOrders().length} registros`);

  protected readonly openOrders = computed(() => this.orders().filter((o) => o.status === 'aberta'));
  protected readonly openCount = computed(() => this.openOrders().length);
  protected readonly openTotal = computed(() => this.openOrders().reduce((sum, o) => sum + o.total, 0));
  protected readonly averageTicket = computed(() => (this.orders().length ? this.billedToday / this.orders().length : 0));

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected readonly canCreate = computed(() => this.athleteSearch().trim().length > 0 || this.walkInName().trim().length > 0);

  protected openOrder(id: string): void {
    this.router.navigate(['/painel/comandas', id]);
  }

  protected createOrder(): void {
    if (!this.canCreate()) {
      return;
    }
    const nextCode = String(Math.max(...this.orders().map((o) => Number(o.code))) + 1).padStart(3, '0');
    const client = this.athleteSearch().trim() || this.walkInName().trim();
    const newOrder: Order = {
      id: `c${nextCode}`,
      code: nextCode,
      location: this.newLocation(),
      client,
      items: 0,
      timeLabel: 'Aberta agora',
      total: 0,
      status: 'aberta',
    };
    this.orders.update((current) => [newOrder, ...current]);
    this.showNewOrder.set(false);
    this.athleteSearch.set('');
    this.walkInName.set('');
    this.router.navigate(['/painel/comandas', newOrder.id]);
  }
}

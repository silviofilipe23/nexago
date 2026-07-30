import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
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
  ARENA_COMANDA_STATUS_LABEL,
  comandaStatusIsActive,
  computeComandasKpis,
  formatCentsBRL,
  formatComandaNumber,
  type ArenaComanda,
  type ArenaComandaStatus,
} from './comanda.model';
import { createComanda, fetchComandas } from './comandas-repository';

type StatusFilter = 'abertas' | 'fechadas' | 'todas';

const STATUS_TONE: Record<ArenaComandaStatus, PillTone> = {
  open: 'orange',
  closing: 'yellow',
  partiallyPaid: 'orange',
  closed: 'dim',
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'abertas', label: 'Abertas' },
  { key: 'fechadas', label: 'Fechadas' },
  { key: 'todas', label: 'Todas' },
];

/** Tela Comandas do painel: KPIs e lista real de `arenaComandas` (PDV é capability Pro/Elite).
 *  Abertura de comanda aqui é sempre "sem vínculo" (sem reserva de quadra ligada — essa
 *  integração com a Agenda ainda não existe neste portal) e sem busca de atleta cadastrado. */
@Component({
  selector: 'ar-panel-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Comandas" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="openNewOrder()">
          <ar-icon name="plus" [size]="14" />
          Nova comanda
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
          </ar-panel-card>
        } @else if (arenaLoading() || loading()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando comandas…</p>
          </ar-panel-card>
        } @else if (errorMessage(); as err) {
          <ar-panel-card pad="lg">
            <p class="state-text">{{ err }}</p>
            <button type="button" class="ar-mini-btn" (click)="retry()">Tentar de novo</button>
          </ar-panel-card>
        } @else if (showPaywall()) {
          <ar-panel-card pad="lg">
            <p class="paywall-title">PDV e comandas são um recurso dos planos Pro e Elite</p>
            <p class="state-text">Fale com o suporte para fazer upgrade e liberar o PDV da sua arena.</p>
          </ar-panel-card>
        } @else {
          @if (readOnly()) {
            <div class="readonly-banner">Seu plano atual não inclui abrir novas comandas — fale com o suporte para fazer upgrade.</div>
          }

          <div class="summary-row">
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">Comandas abertas</div>
              <div class="summary-value">{{ kpis().openCount }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Faturado hoje</div>
              <div class="summary-value tone-green">{{ formatBRL(kpis().todayTotalCents) }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Ticket médio hoje</div>
              <div class="summary-value">{{ formatBRL(kpis().averageTicketCents) }}</div>
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
              <span class="right">Total</span>
              <span>Status</span>
            </div>
            <div class="table-list">
              @for (c of filteredComandas(); track c.id) {
                <div class="table-row" (click)="openOrder(c.id)">
                  <div class="order-cell">
                    <div class="order-icon">
                      <ar-icon name="bookmark" [size]="16" />
                    </div>
                    <div class="order-code">{{ formatComandaNumber(c.displayNumber) }}{{ c.locationLabel ? ' · ' + c.locationLabel : '' }}</div>
                  </div>
                  <div class="order-client">{{ c.customerName }}</div>
                  <div class="order-items">{{ c.itemsCount }}</div>
                  <div class="order-total right">{{ formatBRL(c.totalCents) }}</div>
                  <div><ar-pill [tone]="statusTone[c.status]">{{ statusLabel[c.status] }}</ar-pill></div>
                </div>
              } @empty {
                <p class="state-text empty-text">Nenhuma comanda por aqui.</p>
              }
            </div>
          </ar-panel-card>
        }
      </div>

      @if (showNewOrder()) {
        <ar-modal (close)="showNewOrder.set(false)">
          <h2 class="modal-title">Nova comanda</h2>
          <p class="modal-subtitle">Sem vínculo com reserva de quadra — informe o nome do cliente pra abrir a conta.</p>

          @if (createError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }

          <div class="field-label">Cliente</div>
          <input
            type="text"
            class="input-box walkin-input"
            placeholder="Nome do cliente"
            [value]="newCustomerName()"
            (input)="newCustomerName.set($any($event.target).value)"
          />

          <div class="actions">
            <button type="button" class="ar-ghost-btn" [disabled]="creating()" (click)="showNewOrder.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="!canCreate()" (click)="createOrder()">
              {{ creating() ? 'Abrindo…' : 'Abrir comanda' }}
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
    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .error-banner {
      border-color: var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      margin-bottom: 16px;
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
      grid-template-columns: 1.6fr 1.3fr 80px 130px 150px;
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
    .order-items {
      font-size: 13px;
      color: var(--nx-text-mute);
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
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly formatBRL = formatCentsBRL;
  protected readonly formatComandaNumber = formatComandaNumber;
  protected readonly statusLabel = ARENA_COMANDA_STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly statusFilters = STATUS_FILTERS;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly readOnly = computed(() => !this.arenaContext.hasCapability('pdvComandas'));

  protected readonly comandas = signal<ArenaComanda[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly filter = signal<StatusFilter>('abertas');

  protected readonly showNewOrder = signal(false);
  protected readonly newCustomerName = signal('');
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly kpis = computed(() => computeComandasKpis(this.comandas()));

  protected readonly filteredComandas = computed(() => {
    const f = this.filter();
    if (f === 'todas') return this.comandas();
    if (f === 'abertas') return this.comandas().filter((c) => comandaStatusIsActive(c.status));
    return this.comandas().filter((c) => c.status === 'closed');
  });

  protected readonly listKicker = computed(() => `${this.filteredComandas().length} registros`);
  protected readonly showPaywall = computed(() => this.readOnly() && this.comandas().length === 0);
  protected readonly canCreate = computed(() => this.newCustomerName().trim().length > 0 && !this.creating());

  protected readonly headerSubtitle = computed(
    () => `${this.arenaContext.arenaName() ?? this.auth.displayName() ?? 'Arena'} · ${this.kpis().openCount} abertas agora`,
  );

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.loadComandas(arenaId);
    });
  }

  protected retry(): void {
    const arenaId = this.arenaContext.arenaId();
    if (arenaId) void this.loadComandas(arenaId);
  }

  private async loadComandas(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.comandas.set(await fetchComandas(arenaFirestore(), arenaId));
    } catch {
      this.errorMessage.set('Não foi possível carregar as comandas. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }

  protected openNewOrder(): void {
    if (this.readOnly()) return;
    this.createError.set(null);
    this.newCustomerName.set('');
    this.showNewOrder.set(true);
  }

  protected openOrder(id: string): void {
    this.router.navigate(['/painel/comandas', id]);
  }

  protected async createOrder(): Promise<void> {
    if (!this.canCreate()) return;
    const arenaId = this.arenaContext.arenaId();
    const uid = this.auth.user()?.uid;
    if (!arenaId || !uid) return;

    this.creating.set(true);
    this.createError.set(null);
    try {
      const comandaId = await createComanda(arenaFirestore(), arenaId, uid, {
        customerName: this.newCustomerName().trim(),
      });
      this.showNewOrder.set(false);
      void this.router.navigate(['/painel/comandas', comandaId]);
    } catch (err) {
      this.createError.set(err instanceof Error ? err.message : 'Não foi possível abrir a comanda.');
    } finally {
      this.creating.set(false);
    }
  }
}

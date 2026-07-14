import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { formatCentsInputValue, parseBRLInputToCents } from '../stock/product.model';
import { BarRowComponent } from '../ui/bar-row.component';
import { IconComponent } from '../ui/icon.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { buildMovementsCsv, downloadCsv } from './finance-csv';
import { mergeFinanceMovements, movementStatusLabel } from './finance-movements';
import {
  ARENA_BOOKING_FEE_PERCENT,
  ARENA_WALLET_SUMMARY_EMPTY,
  COURT_REVENUE_EMPTY,
  formatBRL,
  roundMoney,
  type ArenaLedgerEntry,
  type ArenaWalletSummary,
  type ArenaWithdrawalItem,
  type CourtRevenueResult,
  type FinanceMovementStatus,
  type FinanceMovementType,
} from './finance.model';
import {
  fetchArenaPayoutPixKey,
  fetchCourtRevenueAndPending,
  fetchLedgerEntries,
  fetchWallet,
  fetchWithdrawals,
  requestWithdrawal,
  setArenaPayoutPixKey,
} from './finance-repository';

type TxFilter = 'all' | FinanceMovementType;

const STATUS_TONE: Record<FinanceMovementStatus, PillTone> = { ok: 'green', pend: 'yellow', fail: 'red' };

/** Tela Financeiro do painel: saldo/carteira, movimentações (ledger + saques), solicitação de
 *  saque via PIX e recebimento por quadra — todos reais, conectados a `arenaWallets`,
 *  `arenaWithdrawals` e `arenaBookings` (espelhando o app Flutter, sem Cloud Function nova
 *  além da callable de saque que já existia). */
@Component({
  selector: 'ar-panel-finance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, LineChartComponent, BarRowComponent, PillComponent, IconComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Financeiro" [subtitle]="arenaName() + ' · saldo e movimentações'">
        <a routerLink="/painel/financeiro/relatorios" class="ar-mini-btn">
          <ar-icon name="download" [size]="14" />
          Relatórios
        </a>
        <button
          type="button"
          class="ar-mini-btn ar-mini-btn-primary"
          [disabled]="loading() || filteredMovements().length === 0"
          (click)="exportStatement()"
        >
          <ar-icon name="download" [size]="14" />
          Exportar extrato
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
          </ar-panel-card>
        } @else if (arenaLoading() || loading()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando financeiro…</p>
          </ar-panel-card>
        } @else if (errorMessage(); as err) {
          <ar-panel-card pad="lg">
            <p class="state-text">{{ err }}</p>
            <button type="button" class="ar-mini-btn" (click)="retry()">Tentar de novo</button>
          </ar-panel-card>
        } @else {
          <div class="summary-row">
            @for (s of summaries(); track s.label) {
              <ar-panel-card pad="sm" class="summary-card">
                <div class="summary-label" [class]="'tone-' + s.labelTone">{{ s.label }}</div>
                <div class="summary-value" [class]="'tone-' + s.valueTone">{{ s.value }}</div>
                <div class="summary-caption" [class]="'tone-' + s.captionTone">{{ s.caption }}</div>
              </ar-panel-card>
            }
          </div>

          <div class="main-grid">
            <div class="col-left">
              <ar-panel-card kicker="Últimos 7 dias" title="Faturamento" class="chart-card">
                <ar-line-chart [height]="110" [data]="revenueData()" [labels]="revenueDays()" />
              </ar-panel-card>

              <ar-panel-card title="Movimentações" [kicker]="listKicker()" class="tx-card">
                <div class="ar-filter-bar" card-actions>
                  <button type="button" class="ar-chip" [class.active]="filter() === 'all'" (click)="filter.set('all')">Todos</button>
                  <button type="button" class="ar-chip" [class.active]="filter() === 'credit'" (click)="filter.set('credit')">Recebimentos</button>
                  <button type="button" class="ar-chip" [class.active]="filter() === 'debit'" (click)="filter.set('debit')">Saques</button>
                </div>

                <div class="tx-head">
                  <span></span>
                  <span>Descrição</span>
                  <span>Detalhe</span>
                  <span>Data</span>
                  <span>Status</span>
                  <span class="right">Valor</span>
                </div>
                <div class="tx-list">
                  @for (tx of filteredMovements(); track tx.id) {
                    <div class="tx-row">
                      <div class="tx-icon" [class.in]="tx.type === 'credit'">
                        @if (tx.type === 'credit') {
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 5v14" /><path d="M5 12l7 7 7-7" />
                          </svg>
                        } @else {
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
                          </svg>
                        }
                      </div>
                      <div class="tx-label">{{ tx.label }}</div>
                      <div class="tx-sub">{{ tx.sub }}</div>
                      <div class="tx-date">{{ tx.dateLabel }}</div>
                      <div><ar-pill [tone]="statusTone[tx.status]">{{ statusLabel(tx) }}</ar-pill></div>
                      <div class="tx-amount right" [class.in]="tx.type === 'credit'">
                        {{ tx.type === 'credit' ? '+' : '−' }}{{ formatBRL(tx.amountReais) }}
                      </div>
                    </div>
                  } @empty {
                    <p class="state-text">Nenhuma movimentação ainda.</p>
                  }
                </div>
              </ar-panel-card>
            </div>

            <div class="col-right">
              <ar-panel-card pad="sm" title="Solicitar saque">
                <div class="field-label">Valor</div>
                <div class="amount-field">
                  <input type="text" inputmode="decimal" [value]="withdrawAmountValue()" (input)="withdrawAmountValue.set($any($event.target).value)" />
                  <button type="button" class="ar-pill-btn" (click)="setWithdrawAll()">
                    <ar-pill tone="orange">Sacar tudo</ar-pill>
                  </button>
                </div>

                <div class="field-label">Chave PIX</div>
                @if (editingPixKey()) {
                  <div class="pix-edit-row">
                    <input
                      class="pix-input"
                      type="text"
                      placeholder="CPF, e-mail, telefone ou chave aleatória"
                      [value]="pixKeyValue()"
                      (input)="pixKeyValue.set($any($event.target).value)"
                    />
                    <button type="button" class="ar-mini-btn" (click)="savePixKey()">Salvar</button>
                  </div>
                } @else {
                  <div class="pix-field">
                    <span>{{ pixKeyValue() || 'Nenhuma chave cadastrada' }}</span>
                    <button type="button" class="pix-edit-link" (click)="editingPixKey.set(true)">editar</button>
                  </div>
                }

                @if (withdrawError(); as err) {
                  <p class="withdraw-error">{{ err }}</p>
                }
                @if (withdrawNotice(); as notice) {
                  <p class="withdraw-notice">{{ notice }}</p>
                }

                <button
                  type="button"
                  class="ar-mini-btn ar-mini-btn-primary"
                  [disabled]="withdrawSaving() || wallet().availableReais <= 0"
                  (click)="requestWithdraw()"
                >
                  {{ withdrawSaving() ? 'Enviando…' : 'Solicitar saque' }}
                </button>
              </ar-panel-card>

              <ar-panel-card pad="sm" title="Recebimento por quadra">
                <div class="bars">
                  @for (row of byCourt(); track row.label; let last = $last) {
                    <ar-bar-row [label]="row.label" [sub]="row.sub" [pct]="row.pct" tone="orange" [last]="last" />
                  } @empty {
                    <p class="state-text">Sem reservas pagas nos últimos 30 dias.</p>
                  }
                </div>
              </ar-panel-card>
            </div>
          </div>
        }
      </div>
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
      font-size: 30px;
      letter-spacing: -0.02em;
      margin-top: 8px;
    }

    .summary-value.tone-text {
      color: var(--nx-text);
    }

    .summary-value.tone-pending {
      color: var(--nx-pending);
    }

    .summary-caption {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      margin-top: 6px;
    }

    .summary-caption.tone-dim {
      color: var(--nx-text-dim);
    }

    .summary-caption.tone-green {
      color: var(--nx-win);
    }

    .main-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 16px;
      min-height: 0;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .col-left {
      min-height: 0;
      overflow: hidden;
    }

    .chart-card {
      flex: none;
    }

    .tx-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .tx-head,
    .tx-row {
      display: grid;
      grid-template-columns: 40px 1.3fr 1fr 88px 96px 90px;
      gap: 12px;
      align-items: center;
    }

    .tx-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .tx-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .tx-head span.right {
      text-align: right;
    }

    .tx-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .tx-list::-webkit-scrollbar {
      display: none;
    }

    .tx-row {
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .tx-row:last-child {
      border-bottom: none;
    }

    .tx-icon {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-dim);
    }

    .tx-icon.in {
      background: rgba(43, 209, 126, 0.1);
      border-color: rgba(43, 209, 126, 0.24);
      color: var(--nx-win);
    }

    .tx-label {
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tx-sub {
      min-width: 0;
      font-size: 12px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tx-date {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    .tx-amount {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .tx-amount.in {
      color: var(--nx-win);
    }

    .right {
      text-align: right;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }

    .amount-field {
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      padding: 0 12px;
      margin-bottom: 12px;
      gap: 8px;
    }

    .amount-field input {
      flex: 1;
      min-width: 0;
      border: none;
      background: transparent;
      outline: none;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 16px;
      color: var(--nx-text);
    }

    .ar-pill-btn {
      border: none;
      background: transparent;
      padding: 0;
      cursor: pointer;
      flex: none;
    }

    .pix-field {
      height: 40px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 0 12px;
      margin-bottom: 14px;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }

    .pix-edit-link {
      border: none;
      background: transparent;
      color: var(--nx-orange-500);
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      cursor: pointer;
      flex: none;
      padding: 0;
    }

    .pix-edit-row {
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
    }

    .pix-input {
      flex: 1;
      min-width: 0;
      height: 40px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      padding: 0 12px;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text);
    }

    .withdraw-error {
      font-size: 12px;
      color: var(--nx-live);
      margin: 0 0 10px;
    }

    .withdraw-notice {
      font-size: 12px;
      color: var(--nx-win);
      margin: 0 0 10px;
    }

    .bars {
      margin-top: -4px;
    }

    @media (max-width: 1180px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .summary-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelFinanceComponent {
  private readonly auth = inject(AuthService);
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly formatBRL = formatBRL;
  protected readonly statusLabel = movementStatusLabel;
  protected readonly statusTone = STATUS_TONE;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly filter = signal<TxFilter>('all');

  protected readonly wallet = signal<ArenaWalletSummary>(ARENA_WALLET_SUMMARY_EMPTY);
  protected readonly ledger = signal<ArenaLedgerEntry[]>([]);
  protected readonly withdrawals = signal<ArenaWithdrawalItem[]>([]);
  protected readonly courtRevenue = signal<CourtRevenueResult>(COURT_REVENUE_EMPTY);

  protected readonly withdrawAmountValue = signal('0,00');
  protected readonly pixKeyValue = signal('');
  protected readonly editingPixKey = signal(false);
  protected readonly withdrawSaving = signal(false);
  protected readonly withdrawNotice = signal<string | null>(null);
  protected readonly withdrawError = signal<string | null>(null);

  protected readonly movements = computed(() => mergeFinanceMovements(this.ledger(), this.withdrawals()));
  protected readonly filteredMovements = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.movements() : this.movements().filter((m) => m.type === f);
  });
  protected readonly listKicker = computed(() => `${this.filteredMovements().length} lançamentos`);

  protected readonly grossRevenue30d = computed(() => this.courtRevenue().courtRows.reduce((sum, r) => sum + r.totalReais, 0));

  protected readonly feePercent = computed(() => {
    const status = this.arenaContext.planStatus();
    const entitled = this.arenaContext.entitled();
    const effectiveTier = entitled ? status.tier : 'essencial';
    return effectiveTier === 'pro' || effectiveTier === 'parceiro' ? 0 : ARENA_BOOKING_FEE_PERCENT;
  });

  protected readonly feeRetained30d = computed(() => roundMoney((this.grossRevenue30d() * this.feePercent()) / 100));

  protected readonly summaries = computed(() => {
    const wallet = this.wallet();
    const pending = this.courtRevenue().pending;
    return [
      {
        label: 'Saldo disponível',
        labelTone: 'orange' as const,
        value: formatBRL(wallet.availableReais),
        valueTone: 'text' as const,
        caption: wallet.pendingReais > 0 ? `${formatBRL(wallet.pendingReais)} em processamento` : 'Nenhum saque em processamento',
        captionTone: 'dim' as const,
      },
      {
        label: 'Recebido (30 dias)',
        labelTone: 'dim' as const,
        value: formatBRL(this.grossRevenue30d()),
        valueTone: 'text' as const,
        caption: `${this.courtRevenue().courtRows.length} quadra(s) com reservas pagas`,
        captionTone: 'dim' as const,
      },
      {
        label: 'Taxa da plataforma',
        labelTone: 'dim' as const,
        value: `${this.feePercent()}%`,
        valueTone: 'text' as const,
        caption: `${formatBRL(this.feeRetained30d())} retidos (30 dias)`,
        captionTone: 'dim' as const,
      },
      {
        label: 'Pendências',
        labelTone: 'dim' as const,
        value: String(pending.count),
        valueTone: pending.count > 0 ? ('pending' as const) : ('text' as const),
        caption: pending.count > 0 ? `${formatBRL(pending.totalReais)} aguardando pagamento` : 'Nenhuma reserva pendente',
        captionTone: 'dim' as const,
      },
    ];
  });

  protected readonly revenueData = computed(() => this.courtRevenue().last7Days.map((d) => d.value));
  protected readonly revenueDays = computed(() => this.courtRevenue().last7Days.map((d) => d.label));

  protected readonly byCourt = computed(() => {
    const rows = this.courtRevenue().courtRows;
    const total = this.grossRevenue30d();
    return rows.map((r) => ({
      label: r.courtName,
      sub: formatBRL(r.totalReais),
      pct: total > 0 ? Math.round((r.totalReais / total) * 100) : 0,
    }));
  });

  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? this.auth.displayName() ?? 'Arena');

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.loadFinance(arenaId);
    });
  }

  protected retry(): void {
    const arenaId = this.arenaContext.arenaId();
    if (arenaId) void this.loadFinance(arenaId);
  }

  protected setWithdrawAll(): void {
    this.withdrawAmountValue.set(formatCentsInputValue(Math.round(this.wallet().availableReais * 100)));
  }

  protected async savePixKey(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    const key = this.pixKeyValue().trim();
    if (key.length < 5) {
      this.withdrawError.set('Informe uma chave PIX válida.');
      return;
    }
    await setArenaPayoutPixKey(arenaFirestore(), arenaId, key);
    this.editingPixKey.set(false);
    this.withdrawError.set(null);
    this.withdrawNotice.set('Chave PIX salva.');
  }

  protected async requestWithdraw(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    const amount = parseBRLInputToCents(this.withdrawAmountValue()) / 100;
    if (amount <= 0) {
      this.withdrawError.set('Informe um valor válido para saque.');
      return;
    }
    if (this.pixKeyValue().trim().length < 5) {
      this.withdrawError.set('Cadastre uma chave PIX antes de solicitar o saque.');
      this.editingPixKey.set(true);
      return;
    }

    this.withdrawSaving.set(true);
    this.withdrawError.set(null);
    this.withdrawNotice.set(null);
    try {
      const result = await requestWithdrawal(arenaFunctions(), arenaId, amount, this.pixKeyValue().trim());
      this.withdrawNotice.set(
        result.message ?? (result.autoProcessed ? 'Saque enviado via PIX.' : 'Saque solicitado — aguardando aprovação da plataforma.'),
      );
      this.withdrawAmountValue.set('0,00');
      await this.loadFinance(arenaId);
    } catch (e) {
      this.withdrawError.set(e instanceof Error ? e.message : 'Não foi possível solicitar o saque.');
    } finally {
      this.withdrawSaving.set(false);
    }
  }

  protected exportStatement(): void {
    const csv = buildMovementsCsv(this.filteredMovements());
    downloadCsv(`extrato-financeiro-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  private async loadFinance(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const db = arenaFirestore();
      const [wallet, ledger, withdrawals, courtRevenue, pixKey] = await Promise.all([
        fetchWallet(db, arenaId),
        fetchLedgerEntries(db, arenaId),
        fetchWithdrawals(db, arenaId),
        fetchCourtRevenueAndPending(db, arenaId),
        fetchArenaPayoutPixKey(db, arenaId),
      ]);
      this.wallet.set(wallet);
      this.ledger.set(ledger);
      this.withdrawals.set(withdrawals);
      this.courtRevenue.set(courtRevenue);
      if (!this.editingPixKey()) this.pixKeyValue.set(pixKey);
    } catch {
      this.errorMessage.set('Não foi possível carregar os dados financeiros.');
    } finally {
      this.loading.set(false);
    }
  }
}

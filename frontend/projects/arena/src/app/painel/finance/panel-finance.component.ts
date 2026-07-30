import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import {
  ArenaWalletError,
  fetchArenaPayoutPix,
  requestArenaWithdrawal,
  saveArenaPayoutPix,
  watchArenaLedger,
  watchArenaWallet,
  watchArenaWithdrawals,
} from './arena-wallet-repository';
import {
  PIX_KEY_TYPE_HINT,
  PIX_KEY_TYPE_LABEL,
  buildFinancialMovements,
  computeFinancialPeriodStats,
  filterFinancialMovements,
  formatBRL,
  formatFinancialMovementTimestamp,
  formatNextPayoutLabel,
  maskPixKey,
  validatePixKey,
  type ArenaLedgerEntry,
  type ArenaWalletSummary,
  type ArenaWithdrawalItem,
  type ArenaWithdrawalRequestResult,
  type FinancialHistoryFilter,
  type FinancialPeriod,
  type PixKeyType,
} from './arena-wallet.model';

const MIN_WITHDRAWAL_REAIS = 20;
const AUTO_MAX_REAIS = 500;

const PERIODS: FinancialPeriod[] = [7, 30, 90];
const PIX_KEY_TYPES: PixKeyType[] = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'];
const HISTORY_FILTERS: { key: FinancialHistoryFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'receipts', label: 'Recebimentos' },
  { key: 'withdrawals', label: 'Saques' },
];

/** Tela Financeiro do painel: saldo/ledger/saques reais, espelhando `ArenaPaymentsPage`
 *  (Flutter) — `arenaWallets`/`arenaWithdrawals`, saque via Cloud Function
 *  `requestArenaWithdrawal`. Sem "Taxa da plataforma"/"Pendências" como KPI e sem "Recebimento
 *  por quadra": o app real também não mostra taxa (o ledger já guarda `netReais` líquido) nem
 *  existe split de receita por quadra em lugar nenhum do schema. */
@Component({
  selector: 'ar-panel-finance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Financeiro" [subtitle]="arenaName() + ' · saldo e movimentações'">
        <a routerLink="/painel/financeiro/relatorios" class="ar-mini-btn">
          <ar-icon name="download" [size]="14" />
          Relatórios
        </a>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="showNotice('Extrato completo em breve.')">
          <ar-icon name="download" [size]="14" />
          Exportar extrato
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando…</p>
        } @else {
          @if (notice(); as n) {
            <div class="tp-notice" role="status">{{ n }}</div>
          }

          <div class="main-grid">
            <div class="col-left">
              <ar-panel-card class="balance-card">
                <div class="balance-head">
                  <span class="balance-kicker">Saldo disponível</span>
                  <div class="period-seg">
                    @for (p of periods; track p) {
                      <button type="button" class="period-chip" [class.active]="period() === p" (click)="setPeriod(p)">{{ p }}d</button>
                    }
                  </div>
                </div>
                <div class="balance-value">{{ formatBRL(wallet().availableReais) }}</div>
                <div class="balance-stats">
                  <div class="balance-stat">
                    <span class="stat-label">Recebido</span>
                    <span class="stat-value tone-green">{{ formatBRL(periodStats().receivedReais) }}</span>
                  </div>
                  <div class="stat-divider"></div>
                  <div class="balance-stat">
                    <span class="stat-label">Sacado</span>
                    <span class="stat-value">{{ formatBRL(periodStats().withdrawnReais) }}</span>
                  </div>
                  <div class="stat-divider"></div>
                  <div class="balance-stat">
                    <span class="stat-label">Próx. repasse</span>
                    <span class="stat-value">{{ nextPayoutLabel() }}</span>
                  </div>
                </div>
              </ar-panel-card>

              <ar-panel-card title="Movimentações" [kicker]="filteredMovements().length + ' movimentações'" class="tx-card">
                <div class="ar-filter-bar" card-actions>
                  @for (f of historyFilters; track f.key) {
                    <button type="button" class="ar-chip" [class.active]="historyFilter() === f.key" (click)="setHistoryFilter(f.key)">{{ f.label }}</button>
                  }
                </div>

                <div class="tx-list">
                  @for (tx of filteredMovements(); track tx.id) {
                    <div class="tx-row">
                      <div class="tx-icon" [class.in]="tx.isPositive" [class.failed]="tx.isFailed">
                        @if (tx.isPositive) {
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14" /><path d="M5 12l7 7 7-7" /></svg>
                        } @else {
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
                        }
                      </div>
                      <div class="tx-label">{{ tx.title }}</div>
                      <div class="tx-date">{{ formatFinancialMovementTimestamp(tx.at) }}</div>
                      <ar-pill [tone]="tx.isFailed ? 'red' : tx.isPositive ? 'green' : 'dim'">{{ tx.statusLabel }}</ar-pill>
                      <div class="tx-amount right" [class.in]="tx.isPositive">{{ tx.isPositive ? '+' : '−' }}{{ formatBRL(tx.amountReais) }}</div>
                    </div>
                  } @empty {
                    <p class="state-text">Nenhuma movimentação neste filtro.</p>
                  }
                </div>
              </ar-panel-card>
            </div>

            <div class="col-right">
              <ar-panel-card pad="sm" title="Solicitar saque" [kicker]="'Mín. ' + formatBRL(minWithdrawal)">
                @if (hasPendingWithdrawal()) {
                  <p class="pending-note">Já existe um saque pendente. Aguarde a conclusão antes de solicitar outro.</p>
                }

                <div class="field-label">Valor</div>
                <div class="amount-field" [class.error]="amountError() != null">
                  <input type="text" inputmode="decimal" placeholder="R$ 0,00" [value]="amountInput()" (input)="onAmountInput($any($event.target).value)" />
                  <ar-pill tone="orange" class="withdraw-all-btn" (click)="withdrawAll()">Sacar tudo</ar-pill>
                </div>
                @if (amountError(); as err) {
                  <p class="field-error">{{ err }}</p>
                }

                <div class="field-label">Chave PIX de destino</div>
                <div class="pix-field">
                  <span>{{ pixKey().trim() ? maskPixKey(pixKey()) : 'Cadastre uma chave PIX' }}</span>
                  <button type="button" class="ar-ghost-btn edit-pix-btn" (click)="openPixEdit()">Editar</button>
                </div>

                <button type="button" class="ar-mini-btn ar-mini-btn-primary submit-btn" [disabled]="!canSubmit()" (click)="submitWithdrawal()">
                  {{ submitting() ? 'Enviando…' : 'Solicitar saque' }}
                </button>
                <p class="withdraw-fee-hint">Tarifa de R$ 1,75 por saque · grátis no plano Elite.</p>
              </ar-panel-card>
            </div>
          </div>
        }
      </div>

      @if (showPixEdit()) {
        <ar-modal (close)="showPixEdit.set(false)">
          <h2 class="modal-title">Chave PIX de destino</h2>
          <p class="modal-subtitle">Usada pra receber seus saques.</p>

          <div class="field-label">Tipo da chave</div>
          <select class="pix-select" [value]="pixEditType()" (change)="pixEditType.set($any($event.target).value)">
            @for (t of pixKeyTypes; track t) {
              <option [value]="t">{{ pixTypeLabel[t] }}</option>
            }
          </select>

          <div class="field-label pix-key-label">Chave PIX</div>
          <input type="text" class="pix-input" [placeholder]="pixTypeHint[pixEditType()]" [value]="pixEditKey()" (input)="pixEditKey.set($any($event.target).value)" />
          @if (pixEditError(); as err) {
            <p class="field-error">{{ err }}</p>
          }

          <div class="actions">
            <button type="button" class="ar-ghost-btn" (click)="showPixEdit.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="savePixEdit()">Salvar</button>
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
    }

    .tp-notice {
      padding: 10px 14px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      font-size: 13px;
    }

    .main-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 16px;
      min-height: 0;
      align-items: start;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .balance-card {
      background: radial-gradient(circle at top right, rgba(255, 106, 26, 0.14), var(--nx-surface-0));
    }

    .balance-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .balance-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }

    .period-seg {
      display: flex;
      gap: 2px;
      background: var(--nx-surface-1);
      border-radius: var(--nx-r-2);
      padding: 3px;
    }

    .period-chip {
      height: 24px;
      padding: 0 10px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--nx-text-dim);
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
    }

    .period-chip.active {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
    }

    .balance-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 32px;
      color: var(--nx-text);
      margin-top: 10px;
    }

    .balance-stats {
      display: flex;
      align-items: center;
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid var(--nx-line);
    }

    .balance-stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .stat-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      color: var(--nx-text-dim);
    }

    .stat-value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 11.5px;
      color: var(--nx-text);
    }

    .stat-value.tone-green {
      color: var(--nx-win);
    }

    .stat-divider {
      width: 1px;
      height: 28px;
      background: var(--nx-line);
    }

    .tx-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .tx-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
      display: flex;
      flex-direction: column;
    }

    .tx-list::-webkit-scrollbar {
      display: none;
    }

    .tx-row {
      display: grid;
      grid-template-columns: 40px 1.3fr 96px 96px 96px;
      gap: 12px;
      align-items: center;
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

    .tx-icon.failed {
      background: rgba(255, 82, 82, 0.1);
      border-color: rgba(255, 82, 82, 0.24);
      color: var(--nx-live);
    }

    .tx-label {
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
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

    .pending-note {
      font-size: 12.5px;
      color: var(--nx-pending);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      padding: 8px 10px;
      margin: 0 0 12px;
    }

    .amount-field {
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      padding: 0 6px 0 12px;
      margin-bottom: 6px;
    }

    .amount-field.error {
      border-color: var(--nx-live);
    }

    .amount-field input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 16px;
      color: var(--nx-text);
    }

    .withdraw-all-btn {
      cursor: pointer;
    }

    .field-error {
      font-size: 11.5px;
      color: var(--nx-live);
      margin: 0 0 12px;
    }

    .pix-field {
      height: 40px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 6px 0 12px;
      margin-bottom: 14px;
    }

    .pix-field span {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .edit-pix-btn {
      flex: none;
      height: 30px;
      padding: 0 10px;
      font-size: 11px;
    }

    .submit-btn {
      width: 100%;
      height: 44px;
      justify-content: center;
    }

    .withdraw-fee-hint {
      font-size: 11px;
      color: var(--nx-text-dim);
      text-align: center;
      margin: 8px 0 0;
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

    .pix-select,
    .pix-input {
      width: 100%;
      height: 42px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
      padding: 0 12px;
      box-sizing: border-box;
      margin-bottom: 14px;
    }

    .pix-key-label {
      margin-top: 4px;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    }

    @media (max-width: 1180px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelFinanceComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly destroyRef = inject(DestroyRef);
  private unsubWallet: Unsubscribe | null = null;
  private unsubLedger: Unsubscribe | null = null;
  private unsubWithdrawals: Unsubscribe | null = null;
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly formatBRL = formatBRL;
  protected readonly maskPixKey = maskPixKey;
  protected readonly formatFinancialMovementTimestamp = formatFinancialMovementTimestamp;
  protected readonly periods = PERIODS;
  protected readonly pixKeyTypes = PIX_KEY_TYPES;
  protected readonly historyFilters = HISTORY_FILTERS;
  protected readonly pixTypeLabel = PIX_KEY_TYPE_LABEL;
  protected readonly pixTypeHint = PIX_KEY_TYPE_HINT;
  protected readonly minWithdrawal = MIN_WITHDRAWAL_REAIS;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? 'Arena');

  protected readonly loading = signal(true);
  protected readonly wallet = signal<ArenaWalletSummary>({ availableReais: 0, pendingReais: 0 });
  protected readonly ledger = signal<ArenaLedgerEntry[]>([]);
  protected readonly withdrawals = signal<ArenaWithdrawalItem[]>([]);
  protected readonly period = signal<FinancialPeriod>(30);
  protected readonly historyFilter = signal<FinancialHistoryFilter>('all');

  protected readonly periodStats = computed(() => computeFinancialPeriodStats(this.ledger(), this.withdrawals(), this.period()));
  protected readonly nextPayoutLabel = computed(() => formatNextPayoutLabel(this.wallet().pendingReais));
  protected readonly movements = computed(() => buildFinancialMovements(this.ledger(), this.withdrawals(), this.arenaName()));
  protected readonly filteredMovements = computed(() => filterFinancialMovements(this.movements(), this.historyFilter()));
  protected readonly hasPendingWithdrawal = computed(() => this.withdrawals().some((w) => w.status === 'pending'));

  protected readonly amountInput = signal('');
  protected readonly pixKey = signal('');
  protected readonly pixKeyType = signal<PixKeyType>('CPF');
  protected readonly submitting = signal(false);
  protected readonly notice = signal<string | null>(null);

  protected readonly showPixEdit = signal(false);
  protected readonly pixEditType = signal<PixKeyType>('CPF');
  protected readonly pixEditKey = signal('');
  protected readonly pixEditError = signal<string | null>(null);

  protected readonly parsedAmount = computed<number | null>(() => {
    const raw = this.amountInput().trim().replace(',', '.');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  });

  protected readonly amountError = computed<string | null>(() => {
    const raw = this.amountInput().trim();
    if (!raw) return null;
    const amount = this.parsedAmount();
    if (amount == null) return 'Informe um valor válido.';
    if (amount <= 0) return 'O valor deve ser maior que zero.';
    if (amount < MIN_WITHDRAWAL_REAIS) return `Mínimo: ${formatBRL(MIN_WITHDRAWAL_REAIS)}.`;
    if (amount > this.wallet().availableReais + 0.001) return `Máximo disponível: ${formatBRL(this.wallet().availableReais)}.`;
    return null;
  });

  protected readonly pixKeyError = computed<string | null>(() => {
    const key = this.pixKey().trim();
    if (key.length < 5) return null;
    return validatePixKey(this.pixKeyType(), key);
  });

  protected readonly canSubmit = computed(() => {
    if (this.submitting() || this.hasPendingWithdrawal()) return false;
    if (this.pixKey().trim().length < 5 || this.pixKeyError() != null) return false;
    const amount = this.parsedAmount();
    if (amount == null || amount < MIN_WITHDRAWAL_REAIS) return false;
    return this.amountError() == null;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.unsubWallet?.();
      this.unsubLedger?.();
      this.unsubWithdrawals?.();
      clearTimeout(this.noticeTimeout);
    });

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      this.unsubWallet?.();
      this.unsubLedger?.();
      this.unsubWithdrawals?.();
      this.unsubWallet = null;
      this.unsubLedger = null;
      this.unsubWithdrawals = null;
      if (!arenaId) return;

      this.loading.set(true);
      const db = arenaFirestore();
      this.unsubWallet = watchArenaWallet(db, arenaId, (w) => {
        this.wallet.set(w);
        this.loading.set(false);
      });
      this.unsubLedger = watchArenaLedger(db, arenaId, (l) => this.ledger.set(l));
      this.unsubWithdrawals = watchArenaWithdrawals(db, arenaId, (w) => this.withdrawals.set(w));

      void fetchArenaPayoutPix(db, arenaId).then((pix) => {
        if (pix.pixKey) {
          this.pixKey.set(pix.pixKey);
          this.pixKeyType.set(pix.pixKeyType);
        }
      });
    });
  }

  protected setPeriod(p: FinancialPeriod): void {
    this.period.set(p);
  }

  protected setHistoryFilter(f: FinancialHistoryFilter): void {
    this.historyFilter.set(f);
  }

  protected onAmountInput(v: string): void {
    this.amountInput.set(v.replace(/[^\d.,]/g, ''));
  }

  protected withdrawAll(): void {
    const available = this.wallet().availableReais;
    if (available <= 0) return;
    this.amountInput.set(available.toFixed(2).replace('.', ','));
  }

  protected openPixEdit(): void {
    this.pixEditType.set(this.pixKeyType());
    this.pixEditKey.set(this.pixKey());
    this.pixEditError.set(null);
    this.showPixEdit.set(true);
  }

  protected savePixEdit(): void {
    const key = this.pixEditKey().trim();
    const type = this.pixEditType();
    if (key.length > 0) {
      const error = validatePixKey(type, key);
      if (error) {
        this.pixEditError.set(error);
        return;
      }
    }
    this.pixKey.set(key);
    this.pixKeyType.set(type);
    this.showPixEdit.set(false);

    const arenaId = this.arenaContext.arenaId();
    if (arenaId && key) {
      void saveArenaPayoutPix(arenaFirestore(), arenaId, key, type);
    }
  }

  protected async submitWithdrawal(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const amount = this.parsedAmount();
    if (!arenaId || amount == null || !this.canSubmit()) return;
    this.submitting.set(true);
    try {
      const result = await requestArenaWithdrawal(arenaFunctions(), {
        arenaId,
        amountReais: amount,
        pixKey: this.pixKey().trim(),
        pixKeyType: this.pixKeyType(),
      });
      this.amountInput.set('');
      this.showNotice(this.withdrawalResultMessage(result));
    } catch (err) {
      this.showNotice(err instanceof ArenaWalletError ? err.message : 'Não foi possível solicitar o saque.');
    } finally {
      this.submitting.set(false);
    }
  }

  private withdrawalResultMessage(result: ArenaWithdrawalRequestResult): string {
    if (result.autoProcessed && result.status === 'approved' && result.payoutStatus === 'sent') {
      return 'PIX enviado. O valor deve cair em instantes na sua chave.';
    }
    if (result.message?.trim()) return result.message.trim();
    if (result.status === 'pending' && result.processingMode === 'manual_review') {
      return `Saque acima de ${formatBRL(AUTO_MAX_REAIS)}. Aguardando aprovação da plataforma.`;
    }
    if (result.status === 'pending' && result.payoutStatus === 'failed') {
      return 'Não foi possível enviar o PIX automaticamente. Nossa equipe vai revisar.';
    }
    return 'Saque solicitado. Aguarde aprovação.';
  }

  protected showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 5000);
  }
}

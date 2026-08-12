import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../auth/auth.service';
import type { PillTone } from '../data/mock-data';
import {
  PIX_KEY_TYPES,
  PIX_KEY_TYPE_HINT,
  PIX_KEY_TYPE_LABEL,
  maskPixKey,
  resolveInitialPixKeyType,
  validatePixKeyForType,
  type PixKeyType,
} from '../data/pix-key';
import {
  OrganizerWalletError,
  requestWithdrawal,
  setPayoutPixKey,
  watchLedger,
  watchWallet,
  watchWithdrawals,
  type OrganizerLedgerEntry,
  type OrganizerWalletSummary,
  type OrganizerWithdrawal,
  type WithdrawalRequestResult,
} from '../data/wallet-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { NxProcessingOverlayComponent } from '../../shared/loading/nx-processing-overlay.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

/** organizer_financial_page.dart:14 (`_minWithdrawalReais`). */
const MIN_WITHDRAWAL_REAIS = 20;

/** organizer_financial_page.dart:447-451 (`_WithdrawalTile`), com o `payoutStatus` também considerado
 *  (o mesmo sinal que o backend usa pra falha de envio de PIX — ver arena-wallet.model.ts:196-208). */
function withdrawalStatusLabel(w: Pick<OrganizerWithdrawal, 'status' | 'payoutStatus'>): string {
  const payout = (w.payoutStatus ?? '').trim().toLowerCase();
  const status = w.status.trim().toLowerCase();
  if (payout === 'failed' || status === 'rejected') return 'Falhou';
  if (payout === 'sent' || status === 'approved') return 'Enviado';
  return 'Pendente';
}

function withdrawalTone(w: Pick<OrganizerWithdrawal, 'status' | 'payoutStatus'>): PillTone {
  const payout = (w.payoutStatus ?? '').trim().toLowerCase();
  const status = w.status.trim().toLowerCase();
  if (payout === 'failed' || status === 'rejected') return 'red';
  if (payout === 'sent' || status === 'approved') return 'green';
  return 'yellow';
}

interface FinanceiroFeedback {
  ok: boolean;
  message: string;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const EMPTY_WALLET: OrganizerWalletSummary = { availableReais: 0, pendingReais: 0, payoutPixKey: '', payoutPixKeyType: '' };

/** Saldo consolidado, chave PIX de repasse, saque e extrato/saques reais da carteira do organizador. */
@Component({
  selector: 'og-financeiro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    OgPageHeaderComponent,
    OgCardComponent,
    OgIconComponent,
    OgPillComponent,
    OgFormFieldComponent,
    NxPageLoadingComponent,
    NxProcessingOverlayComponent,
    NxSpinnerComponent,
  ],
  template: `
    <og-page-header title="Financeiro" subtitle="Saldo consolidado da carteira">
      <!-- <a class="og-mini-btn og-mini-btn-primary" href="#og-saque-card"><og-icon name="download" [size]="14" />Sacar saldo</a> -->
    </og-page-header>

    <div class="og-content">
      @if (loading()) {
        <app-nx-page-loading title="Carregando financeiro…" subtitle="Saldo, extrato e saques" />
      } @else {
        <div class="og-kpi-row">
          <og-card pad="sm" flex="1.2">
            <div class="og-kpi-label">Saldo disponível</div>
            <div class="og-kpi-value" style="font-size:30px">{{ saldoLabel() }}</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <!-- mock (fase 2): sem agregado anual de arrecadação exposto pelo repositório da carteira -->
            <div class="og-kpi-label">Arrecadado (ano) — em breve</div>
            <div class="og-kpi-value sm" style="font-size:26px">—</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <!-- mock (fase 2): taxas agregadas não expostas (só o extrato paginado do ledger) -->
            <div class="og-kpi-label">Taxas da plataforma — em breve</div>
            <div class="og-kpi-value sm" style="font-size:26px">—</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Pendente de repasse</div>
            <div class="og-kpi-value sm" style="font-size:26px;color:var(--nx-pending)">{{ pendenteLabel() }}</div>
          </og-card>
        </div>

        <div class="og-financeiro-grid">
          <og-card kicker="Movimentação" title="Extrato" pad="0">
            <div class="og-table-head">
              <span style="flex:1">Data</span>
              <span style="width:90px;text-align:right">Bruto</span>
              <span style="width:90px;text-align:right">Taxa</span>
              <span style="width:90px;text-align:right">Líquido</span>
            </div>
            <div class="og-table-body">
              @for (e of ledger(); track e.id) {
                <div class="og-row">
                  <span style="flex:1" class="og-fin-date">{{ dateLabel(e.createdAt) }}</span>
                  <span style="width:90px;text-align:right" class="og-fin-value">{{ brl(e.grossReais) }}</span>
                  <span style="width:90px;text-align:right;color:var(--nx-text-dim)" class="og-fin-value">{{ brl(e.platformFeeReais) }}</span>
                  <span style="width:90px;text-align:right;color:var(--nx-win)" class="og-fin-value">{{ brl(e.netReais) }}</span>
                </div>
              } @empty {
                <p class="og-empty">Nenhum recebimento ainda.</p>
              }
            </div>
          </og-card>

          <div class="og-financeiro-side">
            <og-card kicker="Evolução" title="Receita por mês">
              <!-- mock (fase 2): sem série histórica de receita mensal disponível ainda -->
              <p class="og-empty">— em breve</p>
            </og-card>
            <og-card kicker="Por evento" title="Arrecadação" flex="1">
              <!-- mock (fase 2): ledger não vincula entradas a um evento/torneio específico -->
              <p class="og-empty">— em breve</p>
            </og-card>
          </div>
        </div>

        <div class="og-financeiro-grid">
          <og-card kicker="Repasses" title="Saques" pad="0">
            <div class="og-table-head">
              <span style="flex:1">Data</span>
              <span style="flex:1">Chave PIX</span>
              <span style="width:100px;text-align:right">Valor</span>
              <span style="width:90px;text-align:right">Status</span>
            </div>
            <div class="og-table-body">
              @for (w of withdrawals(); track w.id) {
                <div class="og-row">
                  <span style="flex:1" class="og-fin-date">{{ dateLabel(w.createdAt) }}</span>
                  <span style="flex:1" class="og-fin-evento">{{ maskPixKeyDisplay(w.pixKey) }}</span>
                  <span style="width:100px;text-align:right" class="og-fin-value">{{ brl(w.amountReais) }}</span>
                  <span style="width:90px;text-align:right"><og-pill [tone]="withdrawalToneOf(w)">{{ withdrawalLabelOf(w) }}</og-pill></span>
                </div>
              } @empty {
                <p class="og-empty">Nenhum saque ainda.</p>
              }
            </div>
          </og-card>

          <div class="og-financeiro-side">
            <og-card kicker="Repasse" title="Chave PIX de saque" pad="sm">
              @if (!editingPix()) {
                <div class="og-fin-pixrow">
                  <span class="og-fin-pixkey">{{ currentPixLabel() }}</span>
                  <button type="button" class="og-ghost-btn" (click)="startEditPix()">
                    <og-icon name="edit" [size]="14" />{{ hasPixKey() ? 'Trocar' : 'Cadastrar' }}
                  </button>
                </div>
              } @else {
                <form [formGroup]="pixForm" (ngSubmit)="submitPixKey()" class="og-fin-pixform">
                  <og-form-field label="Tipo de chave">
                    <select class="og-input" formControlName="pixKeyType">
                      @for (t of pixKeyTypes; track t) {
                        <option [value]="t">{{ pixKeyTypeLabel[t] }}</option>
                      }
                    </select>
                  </og-form-field>
                  <og-form-field label="Chave PIX">
                    <input class="og-input" type="text" formControlName="pixKey" autocomplete="off" [placeholder]="pixKeyHintFor(pixKeyTypeValue())" />
                  </og-form-field>
                  @if (pixKeyErrorLive(); as err) {
                    <p class="og-fin-error">{{ err }}</p>
                  }
                  <div class="og-fin-formactions">
                    <button type="button" class="og-ghost-btn" (click)="cancelEditPix()">Cancelar</button>
                    <button type="submit" class="og-mini-btn og-mini-btn-primary" [disabled]="!canSavePix()">
                      @if (pixSaving()) {
                        <app-nx-spinner [size]="12" tone="dark" />
                      }
                      {{ pixSaving() ? 'Salvando…' : 'Salvar' }}
                    </button>
                  </div>
                </form>
              }
              @if (pixFeedback(); as f) {
                <p class="og-fin-feedback" [style.color]="f.ok ? 'var(--nx-win)' : 'var(--nx-live)'">{{ f.message }}</p>
              }
            </og-card>

            <og-card kicker="Saque" title="Solicitar saque" pad="sm" id="og-saque-card">
              <og-form-field label="Valor do saque">
                <div class="og-input og-fin-amount-input">
                  <span class="prefix">R$</span>
                  <input type="text" inputmode="decimal" [formControl]="withdrawForm.controls.amount" placeholder="0,00" />
                  <og-pill tone="orange" style="cursor:pointer" (click)="withdrawAll()">Tudo</og-pill>
                </div>
              </og-form-field>
              @if (amountError(); as err) {
                <p class="og-fin-error">{{ err }}</p>
              }
              @if (!hasPixKey()) {
                <p class="og-fin-hint">Cadastre uma chave PIX acima para poder sacar.</p>
              }
              <button type="button" class="og-mini-btn og-mini-btn-primary og-fin-submit" [disabled]="!canWithdraw()" (click)="submitWithdrawal()">
                @if (withdrawing()) {
                  <app-nx-spinner [size]="12" tone="dark" />
                }
                {{ withdrawing() ? 'Enviando…' : 'Solicitar saque' }}
              </button>
              @if (withdrawFeedback(); as f) {
                <p class="og-fin-feedback" [style.color]="f.ok ? 'var(--nx-win)' : 'var(--nx-live)'">{{ f.message }}</p>
              }
            </og-card>
          </div>
        </div>
      }
    </div>
    @if (withdrawing()) {
      <app-nx-processing-overlay title="Enviando solicitação de saque…" description="Registrando o pedido na sua carteira." />
    }
  `,
  styles: `
    /* Sem display: o box do host é do shell (regra .og-main > router-outlet + * em
       styles.scss). Aqui fica só a âncora do overlay de saque. */
    :host {
      position: relative;
    }

    .og-fin-loading {
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-financeiro-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
      flex: 1;
      min-height: 0;
    }
    .og-financeiro-side {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
    }
    .og-fin-desc {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-fin-evento {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-fin-date {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .og-fin-value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
    }
    .og-fin-pixrow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .og-fin-pixkey {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-text);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-fin-pixform {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .og-fin-formactions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 2px;
    }
    .og-fin-amount-input {
      gap: 8px;
    }
    .og-fin-amount-input .prefix {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-fin-amount-input input {
      flex: 1;
      min-width: 0;
      border: none;
      outline: none;
      background: transparent;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 15px;
      color: var(--nx-text);
    }
    .og-fin-submit {
      width: 100%;
      justify-content: center;
      margin-top: 10px;
    }
    .og-fin-error {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-live);
      margin: 2px 0 0;
    }
    .og-fin-hint {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 8px 0 0;
    }
    .og-fin-feedback {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      margin: 10px 0 0;
    }
  `,
})
export class FinanceiroComponent {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly pixKeyTypes = PIX_KEY_TYPES;
  protected readonly pixKeyTypeLabel = PIX_KEY_TYPE_LABEL;

  protected readonly loading = signal(true);
  protected readonly wallet = signal<OrganizerWalletSummary>(EMPTY_WALLET);
  protected readonly ledger = signal<OrganizerLedgerEntry[]>([]);
  protected readonly withdrawals = signal<OrganizerWithdrawal[]>([]);

  /** Espelha o estado local `_pixKey`/`_pixKeyType` de organizer_financial_page.dart: prefill único
   *  a partir da carteira (linhas 166-174), depois só muda por edição explícita do organizador. */
  protected readonly payoutPixKey = signal('');
  protected readonly payoutPixKeyType = signal<PixKeyType>('CPF');
  private pixPrefilled = false;

  protected readonly editingPix = signal(false);
  protected readonly pixSaving = signal(false);
  protected readonly pixFeedback = signal<FinanceiroFeedback | null>(null);

  protected readonly withdrawing = signal(false);
  protected readonly withdrawFeedback = signal<FinanceiroFeedback | null>(null);

  protected readonly pixForm = this.fb.group({
    pixKeyType: 'CPF' as PixKeyType,
    pixKey: '',
  });
  protected readonly withdrawForm = this.fb.group({
    amount: '',
  });

  private readonly pixKeyTypeValueSignal = toSignal(this.pixForm.controls.pixKeyType.valueChanges, { initialValue: 'CPF' as PixKeyType });
  private readonly pixKeyValueSignal = toSignal(this.pixForm.controls.pixKey.valueChanges, { initialValue: '' });
  private readonly amountValueSignal = toSignal(this.withdrawForm.controls.amount.valueChanges, { initialValue: '' });

  protected readonly saldoLabel = computed(() => BRL.format(this.wallet().availableReais));
  protected readonly pendenteLabel = computed(() => BRL.format(this.wallet().pendingReais));
  protected readonly hasPixKey = computed(() => this.payoutPixKey().trim().length >= 5);
  protected readonly currentPixLabel = computed(() =>
    this.hasPixKey() ? `${PIX_KEY_TYPE_LABEL[this.payoutPixKeyType()]} · ${this.payoutPixKey()}` : 'Nenhuma chave cadastrada',
  );

  /** organizer_financial_page.dart:600-602 (`_PixKeyEditSheetState` — erro aparece a partir de chave não-vazia). */
  protected readonly pixKeyErrorLive = computed<string | null>(() => {
    const key = this.pixKeyValueSignal().trim();
    if (!key) return null;
    return validatePixKeyForType(this.pixKeyTypeValueSignal(), key);
  });
  /** organizer_financial_page.dart:602 (`canSave`). */
  protected readonly canSavePix = computed(() => {
    if (this.pixSaving()) return false;
    return this.pixKeyValueSignal().trim().length >= 5 && this.pixKeyErrorLive() == null;
  });

  protected readonly parsedAmount = computed<number | null>(() => {
    const raw = this.amountValueSignal().trim().replace(',', '.');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  });

  /** organizer_financial_page.dart:44-56 (`_amountError`), incluindo o piso de R$ 20 (linha 14). */
  protected readonly amountError = computed<string | null>(() => {
    const raw = this.amountValueSignal().trim();
    if (!raw) return null;
    const amount = this.parsedAmount();
    if (amount == null) return 'Informe um valor válido.';
    if (amount < MIN_WITHDRAWAL_REAIS) return `Mínimo: ${BRL.format(MIN_WITHDRAWAL_REAIS)}.`;
    if (amount > this.wallet().availableReais + 0.001) return `Máximo disponível: ${BRL.format(this.wallet().availableReais)}.`;
    return null;
  });

  /** organizer_financial_page.dart:58-65 (`_canSubmit`). */
  protected readonly canWithdraw = computed(() => {
    if (this.withdrawing()) return false;
    if (!this.hasPixKey()) return false;
    const amount = this.parsedAmount();
    if (amount == null || amount < MIN_WITHDRAWAL_REAIS) return false;
    return this.amountError() == null;
  });

  constructor() {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loading.set(false);
      return;
    }

    const unsubscribeWallet = watchWallet(uid, (wallet) => {
      this.wallet.set(wallet);
      this.loading.set(false);
      if (!this.pixPrefilled && wallet.payoutPixKey.trim().length >= 5) {
        this.pixPrefilled = true;
        this.payoutPixKey.set(wallet.payoutPixKey.trim());
        this.payoutPixKeyType.set(resolveInitialPixKeyType(wallet.payoutPixKeyType, wallet.payoutPixKey));
      }
    });
    this.destroyRef.onDestroy(() => unsubscribeWallet());

    const unsubscribeLedger = watchLedger(uid, (entries) => this.ledger.set(entries));
    this.destroyRef.onDestroy(() => unsubscribeLedger());

    const unsubscribeWithdrawals = watchWithdrawals(uid, (items) => this.withdrawals.set(items));
    this.destroyRef.onDestroy(() => unsubscribeWithdrawals());
  }

  protected dateLabel(date: Date | null): string {
    return date ? DATE_FORMAT.format(date) : '—';
  }

  protected brl(n: number): string {
    return BRL.format(n);
  }

  protected pixKeyTypeValue(): PixKeyType {
    return this.pixKeyTypeValueSignal();
  }

  protected pixKeyHintFor(type: PixKeyType): string {
    return PIX_KEY_TYPE_HINT[type];
  }

  protected maskPixKeyDisplay(key: string): string {
    return maskPixKey(key);
  }

  protected withdrawalLabelOf(w: OrganizerWithdrawal): string {
    return withdrawalStatusLabel(w);
  }

  protected withdrawalToneOf(w: OrganizerWithdrawal): PillTone {
    return withdrawalTone(w);
  }

  protected startEditPix(): void {
    this.pixForm.setValue({ pixKeyType: this.payoutPixKeyType(), pixKey: this.payoutPixKey() });
    this.pixFeedback.set(null);
    this.editingPix.set(true);
  }

  protected cancelEditPix(): void {
    this.editingPix.set(false);
  }

  /** organizer_financial_page.dart:73-103 (`_editPixKey`) — atualiza o estado local e só então
   *  chama a callable; erro na callable não desfaz o valor local (mesmo comportamento do Flutter). */
  protected async submitPixKey(): Promise<void> {
    if (!this.canSavePix()) return;
    const type = this.pixKeyTypeValueSignal();
    const key = this.pixKeyValueSignal().trim();

    this.payoutPixKey.set(key);
    this.payoutPixKeyType.set(type);
    this.editingPix.set(false);
    this.pixSaving.set(true);
    this.pixFeedback.set(null);
    try {
      await setPayoutPixKey(key, type);
      this.pixFeedback.set({ ok: true, message: 'Chave PIX salva.' });
    } catch (err) {
      const message = err instanceof OrganizerWalletError ? err.message : 'Não foi possível salvar a chave.';
      this.pixFeedback.set({ ok: false, message: `Não foi possível salvar a chave: ${message}` });
    } finally {
      this.pixSaving.set(false);
    }
  }

  protected withdrawAll(): void {
    const available = this.wallet().availableReais;
    if (available <= 0) return;
    this.withdrawForm.controls.amount.setValue(available.toFixed(2).replace('.', ','));
  }

  /** organizer_financial_page.dart:105-139 (`_requestWithdrawal`). */
  protected async submitWithdrawal(): Promise<void> {
    const amount = this.parsedAmount();
    if (amount == null || !this.canWithdraw()) return;

    this.withdrawing.set(true);
    this.withdrawFeedback.set(null);
    try {
      const result = await requestWithdrawal(amount, this.payoutPixKey(), this.payoutPixKeyType());
      this.withdrawForm.controls.amount.setValue('');
      const failedPayout = result.status === 'pending' && result.payoutStatus === 'failed';
      this.withdrawFeedback.set({ ok: !failedPayout, message: this.resultMessage(result) });
    } catch (err) {
      const message = err instanceof OrganizerWalletError ? err.message : 'Não foi possível solicitar o saque.';
      this.withdrawFeedback.set({ ok: false, message });
    } finally {
      this.withdrawing.set(false);
    }
  }

  /** organizer_financial_page.dart:141-152 (`_resultMessage`) — sem o ramo `processingMode` porque o
   *  contrato TS de `WithdrawalRequestResult` (wallet-repository.ts) não expõe esse campo; o texto do
   *  backend em `message` cobre o mesmo caso quando aplicável. */
  private resultMessage(r: WithdrawalRequestResult): string {
    if (r.autoProcessed && r.status === 'approved' && r.payoutStatus === 'sent') {
      return 'PIX enviado. O valor deve cair em instantes na sua chave.';
    }
    if (r.message?.trim()) return r.message.trim();
    return 'Saque solicitado. Aguarde aprovação.';
  }
}

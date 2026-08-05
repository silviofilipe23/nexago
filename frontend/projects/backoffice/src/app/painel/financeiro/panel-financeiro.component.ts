import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../data/callable-error';
import { ConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { IconComponent } from '../ui/icon.component';
import { KpiMiniComponent } from '../ui/kpi-mini.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import {
  WithdrawalsRepository,
  type PendingWithdrawal,
  type WithdrawalDecision,
  type WithdrawalKind,
} from './data/withdrawals.repository';

interface KindTab {
  kind: WithdrawalKind;
  label: string;
}

const TABS: KindTab[] = [
  { kind: 'organizer', label: 'Organizadores' },
  { kind: 'arena', label: 'Arenas' },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; rows: readonly PendingWithdrawal[] }
  | { kind: 'error'; message: string };

interface PendingDecision {
  withdrawal: PendingWithdrawal;
  decision: WithdrawalDecision;
}

const DECISION_COPY: Record<
  WithdrawalDecision,
  { title: string; confirm: string; tone: 'primary' | 'danger'; description: string; noteHint: string }
> = {
  approved: {
    title: 'Aprovar e pagar via PIX',
    confirm: 'Aprovar e pagar',
    tone: 'primary',
    description:
      'Isso dispara a transferência PIX de verdade pelo Asaas, na hora. Confira o valor e a chave antes de confirmar — não há desfazer.',
    noteHint: 'Observação (opcional) — fica registrada na solicitação',
  },
  approved_manual: {
    title: 'Marcar como pago por fora',
    confirm: 'Marcar como pago',
    tone: 'primary',
    description:
      'Use quando o PIX já saiu fora do sistema. O saldo reservado é baixado e nenhuma transferência é disparada.',
    noteHint: 'Como foi pago (opcional)',
  },
  rejected: {
    title: 'Recusar solicitação',
    confirm: 'Recusar saque',
    tone: 'danger',
    description: 'O valor reservado volta para a carteira e o solicitante pode pedir de novo.',
    noteHint: 'Motivo da recusa — o solicitante precisa entender o que fazer',
  },
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Fila de saques pendentes (organizadores e arenas) com revisão pelo admin da plataforma. */
@Component({
  selector: 'bo-panel-financeiro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiMiniComponent,
    PillComponent,
    IconComponent,
    ConfirmDialogComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Financeiro" [subtitle]="subtitle()">
        <button type="button" class="bo-mini-btn" [disabled]="loading()" (click)="load()">
          <bo-icon name="swap" [size]="13" />
          Atualizar
        </button>
      </bo-page-header>

      <div class="bo-filter-bar">
        <div class="bo-chart-tabs">
          @for (tab of tabs; track tab.kind) {
            <button type="button" [class.active]="activeKind() === tab.kind" (click)="select(tab.kind)">
              {{ tab.label }}
            </button>
          }
        </div>
      </div>

      <div class="body">
        @if (feedback(); as message) {
          <div class="bo-feedback">
            <bo-icon name="check" [size]="15" />
            <span>{{ message }}</span>
          </div>
        }

        <div class="kpi-grid">
          <bo-kpi-mini label="Saques pendentes" [value]="pendingCount()" />
          <bo-kpi-mini label="Total a repassar" [value]="pendingTotal()" />
          <bo-kpi-mini label="Maior solicitação" [value]="biggest()" />
          <bo-kpi-mini
            label="Com falha de repasse"
            [value]="failedCount()"
            [tone]="hasFailures() ? 'red' : 'neutral'"
          />
        </div>

        <bo-panel-card
          pad="sm"
          [kicker]="activeKind() === 'organizer' ? 'organizerWithdrawals' : 'arenaWithdrawals'"
          title="Saques aguardando revisão"
        >
          @switch (state().kind) {
            @case ('loading') {
              <p class="status">Carregando saques pendentes…</p>
            }
            @case ('error') {
              <div class="bo-alert">
                <bo-icon name="alert" [size]="16" />
                <span>{{ errorMessage() }}</span>
              </div>
              <button type="button" class="bo-mini-btn retry" (click)="load()">Tentar de novo</button>
            }
            @case ('ok') {
              <div class="table-head">
                <span>Solicitante</span>
                <span>Chave PIX</span>
                <span class="right">Valor</span>
                <span class="right">Solicitado em</span>
                <span></span>
              </div>

              <div>
                @for (row of rows(); track row.id) {
                  <div class="table-row">
                    <div class="cell-who">
                      <div class="who-name">{{ row.requesterName }}</div>
                      <div class="who-id">{{ row.requesterId }}</div>
                      @if (row.payoutError) {
                        <div class="who-error">
                          <bo-pill tone="red">Falha anterior</bo-pill>
                          <span>{{ row.payoutError }}</span>
                        </div>
                      }
                    </div>
                    <div class="cell-pix">{{ row.pixKey || '—' }}</div>
                    <div class="right cell-amount">{{ money(row.amountReais) }}</div>
                    <div class="right cell-date">{{ dateOf(row) }}</div>
                    <div class="cell-actions">
                      <button
                        type="button"
                        class="bo-mini-btn bo-mini-btn-primary"
                        (click)="ask(row, 'approved')"
                      >
                        Aprovar e pagar
                      </button>
                      <button type="button" class="bo-mini-btn" (click)="ask(row, 'approved_manual')">
                        Pago por fora
                      </button>
                      <button type="button" class="bo-ghost-btn danger" (click)="ask(row, 'rejected')">
                        Recusar
                      </button>
                    </div>
                  </div>
                } @empty {
                  <p class="status">Nenhum saque pendente nesta fila.</p>
                }
              </div>
            }
          }
        </bo-panel-card>
      </div>

      @if (pending(); as decision) {
        <bo-confirm-dialog
          [open]="true"
          [title]="copy[decision.decision].title"
          [description]="copy[decision.decision].description"
          [confirmLabel]="copy[decision.decision].confirm"
          [tone]="copy[decision.decision].tone"
          [busy]="submitting()"
          [confirmDisabled]="decision.decision === 'rejected' && !note().trim()"
          [error]="submitError()"
          (confirmed)="confirm()"
          (dismissed)="cancel()"
        >
          <div class="dialog-summary">
            <div>
              <span>Solicitante</span>
              <strong>{{ decision.withdrawal.requesterName }}</strong>
            </div>
            <div>
              <span>Valor</span>
              <strong>{{ money(decision.withdrawal.amountReais) }}</strong>
            </div>
            <div>
              <span>Chave PIX</span>
              <strong>{{ decision.withdrawal.pixKey || '—' }}</strong>
            </div>
          </div>

          <label class="dialog-note">
            <span>{{ copy[decision.decision].noteHint }}</span>
            <textarea
              class="bo-input note"
              rows="2"
              [value]="note()"
              (input)="note.set(noteValue($event))"
            ></textarea>
          </label>
        </bo-confirm-dialog>
      }
    </bo-panel-shell>
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

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }


    .status {
      margin: 16px 0 4px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .retry {
      align-self: flex-start;
      margin-top: 12px;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.5fr 1.4fr 120px 130px 340px;
      gap: 10px;
      align-items: center;
    }

    .table-head {
      padding: 0 4px 10px;
      border-bottom: 1px solid var(--nx-line-strong);
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-head span.right {
      text-align: right;
    }

    .table-row {
      padding: 12px 4px;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .table-row .right {
      text-align: right;
    }

    .cell-who {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .who-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .who-id {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .who-error {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
      font-size: 11px;
      line-height: 1.4;
      color: var(--nx-live);
    }

    .cell-pix {
      min-width: 0;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-amount {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .cell-date {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    .cell-actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
    }

    .cell-actions button {
      white-space: nowrap;
    }

    .bo-ghost-btn.danger {
      color: var(--nx-live);
    }

    .dialog-summary {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
    }

    .dialog-summary div {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }

    .dialog-summary span {
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    .dialog-summary strong {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      font-weight: 700;
      color: var(--nx-text);
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dialog-note {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .dialog-note span {
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }

    textarea.note {
      height: auto;
      padding: 10px 12px;
      resize: vertical;
      font-size: 13px;
      line-height: 1.45;
    }

    @media (max-width: 1180px) {
      .table-head,
      .table-row {
        grid-template-columns: 1.4fr 1.2fr 110px 300px;
      }

      .table-head span:nth-child(4),
      .table-row .cell-date {
        display: none;
      }
    }

    @media (max-width: 720px) {
      .kpi-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class PanelFinanceiroComponent {
  private readonly repository = inject(WithdrawalsRepository);

  protected readonly tabs = TABS;
  protected readonly copy = DECISION_COPY;

  protected readonly activeKind = signal<WithdrawalKind>('organizer');
  protected readonly state = signal<LoadState>({ kind: 'loading' });
  protected readonly pending = signal<PendingDecision | null>(null);
  protected readonly note = signal('');
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly feedback = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected readonly rows = computed<readonly PendingWithdrawal[]>(() => {
    const state = this.state();
    return state.kind === 'ok' ? state.rows : [];
  });

  protected readonly loading = computed(() => this.state().kind === 'loading');

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  });

  protected readonly pendingCount = computed(() =>
    this.state().kind === 'ok' ? String(this.rows().length) : '—',
  );

  protected readonly pendingTotal = computed(() =>
    this.state().kind === 'ok'
      ? BRL.format(this.rows().reduce((sum, row) => sum + row.amountReais, 0))
      : '—',
  );

  protected readonly biggest = computed(() => {
    if (this.state().kind !== 'ok' || this.rows().length === 0) {
      return '—';
    }
    return BRL.format(Math.max(...this.rows().map((row) => row.amountReais)));
  });

  protected readonly failedCount = computed(() =>
    this.state().kind === 'ok' ? String(this.rows().filter((row) => row.payoutError).length) : '—',
  );

  protected readonly hasFailures = computed(() => this.rows().some((row) => row.payoutError));

  protected readonly subtitle = computed(() => {
    const state = this.state();
    if (state.kind === 'loading') {
      return 'Carregando saques…';
    }
    if (state.kind === 'error') {
      return 'Não foi possível carregar a fila de saques';
    }
    const total = state.rows.length;
    return `${total} ${total === 1 ? 'saque pendente' : 'saques pendentes'} · ${this.pendingTotal()}`;
  });

  protected select(kind: WithdrawalKind): void {
    if (kind === this.activeKind()) {
      return;
    }
    this.activeKind.set(kind);
    this.feedback.set(null);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set({ kind: 'loading' });
    try {
      this.state.set({ kind: 'ok', rows: await this.repository.listPending(this.activeKind()) });
    } catch (err) {
      this.state.set({ kind: 'error', message: callableErrorMessage(err) });
    }
  }

  protected ask(withdrawal: PendingWithdrawal, decision: WithdrawalDecision): void {
    this.note.set('');
    this.submitError.set(null);
    this.feedback.set(null);
    this.pending.set({ withdrawal, decision });
  }

  protected cancel(): void {
    if (this.submitting()) {
      return;
    }
    this.pending.set(null);
  }

  protected async confirm(): Promise<void> {
    const current = this.pending();
    if (!current || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    try {
      await this.repository.review(
        current.withdrawal.kind,
        current.withdrawal.id,
        current.decision,
        this.note().trim(),
      );
      this.pending.set(null);
      this.feedback.set(this.successMessage(current));
      await this.load();
    } catch (err) {
      this.submitError.set(callableErrorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }

  private successMessage({ withdrawal, decision }: PendingDecision): string {
    const who = withdrawal.requesterName;
    const value = BRL.format(withdrawal.amountReais);
    if (decision === 'rejected') {
      return `Saque de ${value} de ${who} recusado — o valor voltou para a carteira.`;
    }
    if (decision === 'approved_manual') {
      return `Saque de ${value} de ${who} marcado como pago por fora.`;
    }
    return `PIX de ${value} enviado para ${who}.`;
  }

  protected money(amount: number): string {
    return BRL.format(amount);
  }

  protected dateOf(row: PendingWithdrawal): string {
    return row.createdAt ? DATE_TIME.format(row.createdAt) : '—';
  }

  protected noteValue(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }
}

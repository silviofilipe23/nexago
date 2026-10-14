import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { TabsComponent } from '../ui/tabs.component';
import { localIsoDate } from '../treinos/training-rules';
import { FinanceService } from './finance.service';
import { METHOD_LABEL, type Charge, type PaymentMethod } from './finance-model';
import {
  centsToInput,
  chargeState,
  collectionMessage,
  formatBRL,
  formatDate,
  monthTotals,
  overdueSummary,
  shiftMonth,
  toCents,
  type ChargeState,
} from './finance-rules';

const TABS = ['Todos', 'Pendentes', 'Atrasados', 'Pagos'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const STATE_LABEL: Record<ChargeState, string> = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado', cancelado: 'Cancelado' };
const STATE_TONE: Record<ChargeState, PillTone> = { pago: 'green', pendente: 'yellow', atrasado: 'red', cancelado: 'dim' };
const METHODS: PaymentMethod[] = ['pix', 'dinheiro', 'cartao', 'outro'];

type ActionMode = 'baixa' | 'editar' | 'cancelar' | 'desfazer';

/** Pagamentos: parcelas do mês, atrasos e baixa manual (livro-caixa, fase 1). */
@Component({
  selector: 'co-panel-pagamentos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, KpiCardComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, TabsComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Pagamentos" [subtitle]="monthLabel()">
        <a class="co-mini-btn" routerLink="/painel/financeiro/planos">Planos</a>
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/financeiro/matricular">Matricular aluno</a>
      </co-page-header>

      <div class="body">
        <div class="month-nav">
          <button type="button" class="co-mini-btn" aria-label="Mês anterior" (click)="shift(-1)">‹</button>
          <span class="month-label">{{ monthLabel() }}</span>
          <button type="button" class="co-mini-btn" aria-label="Próximo mês" (click)="shift(1)">›</button>
        </div>
        <p class="disclaimer">Controle interno de mensalidades. O nexaGO não processa esses pagamentos.</p>

        @if (finance.error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (actionError(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        <div class="kpi-row">
          <co-kpi-card label="Recebido no mês" [value]="money(totals().receivedCents)" />
          <co-kpi-card label="A receber no mês" [value]="money(totals().toReceiveCents)" deltaTone="flat" />
          <co-kpi-card label="Em atraso" [value]="money(overdue().cents)" [delta]="overdue().count + ' parcela(s)'" deltaTone="red" />
        </div>

        <co-tabs [tabs]="tabs" [active]="activeTab()" (change)="activeTab.set($event)" />

        <co-panel-card [title]="activeTab() === 'Atrasados' ? 'Atrasadas (todos os meses)' : 'Parcelas do mês'" [kicker]="rows().length + ' parcela(s)'">
          @for (c of rows(); track c.id) {
            <div class="row">
              <div class="who">
                <div class="name">{{ c.athleteName || 'Atleta' }}</div>
                <div class="sub">
                  {{ c.planName }} · vence {{ date(c.dueDate) }}
                  @if (c.status === 'pago' && c.paidAt) {
                    · pago em {{ date(c.paidAt) }} ({{ methodLabel(c.method) }})
                  }
                </div>
              </div>
              <div class="amount">{{ money(c.amountCents) }}</div>
              <co-pill [tone]="tone(c)">{{ label(c) }}</co-pill>
              <div class="actions">
                @if (c.status === 'pendente') {
                  <button type="button" class="co-ghost-btn" (click)="open(c, 'baixa')">Dar baixa</button>
                  <button type="button" class="co-ghost-btn" (click)="open(c, 'editar')">Editar</button>
                  <button type="button" class="co-ghost-btn danger" (click)="open(c, 'cancelar')">Cancelar</button>
                }
                @if (c.status === 'pago') {
                  <button type="button" class="co-ghost-btn" (click)="open(c, 'desfazer')">Desfazer baixa</button>
                }
                @if (state(c) === 'atrasado') {
                  <button type="button" class="co-ghost-btn" (click)="copy(c)">{{ copiedId() === c.id ? 'Copiado!' : 'Copiar cobrança' }}</button>
                }
                <a class="co-ghost-btn" [routerLink]="['/painel/financeiro/matricular']" [queryParams]="{ aluno: c.athleteUid }">Matrícula</a>
              </div>

              @if (openId() === c.id) {
                <div class="panel">
                  @switch (mode()) {
                    @case ('baixa') {
                      <label class="lbl" [for]="'m-' + c.id">Método</label>
                      <select class="input" [id]="'m-' + c.id" (change)="payMethod.set($any($event.target).value)">
                        @for (m of methods; track m) {
                          <option [value]="m" [selected]="m === payMethod()">{{ methodLabel(m) }}</option>
                        }
                      </select>
                      <label class="lbl" [for]="'d-' + c.id">Data do pagamento</label>
                      <input class="input" type="date" [id]="'d-' + c.id" [value]="payDate()" (input)="payDate.set($any($event.target).value)" />
                      <label class="lbl" [for]="'n-' + c.id">Nota (opcional)</label>
                      <input class="input" [id]="'n-' + c.id" [value]="payNote()" (input)="payNote.set($any($event.target).value)" />
                      <div class="panel-actions">
                        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="busyId() === c.id || !payDate()" (click)="confirmPaid(c)">Confirmar baixa</button>
                        <button type="button" class="co-ghost-btn" (click)="close()">Voltar</button>
                      </div>
                    }
                    @case ('editar') {
                      <label class="lbl" [for]="'v-' + c.id">Valor (R$)</label>
                      <input class="input" [id]="'v-' + c.id" [value]="editAmount()" (input)="editAmount.set($any($event.target).value)" />
                      <label class="lbl" [for]="'dd-' + c.id">Vencimento</label>
                      <input class="input" type="date" [id]="'dd-' + c.id" [value]="editDue()" (input)="editDue.set($any($event.target).value)" />
                      <div class="panel-actions">
                        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="busyId() === c.id" (click)="confirmEdit(c)">Salvar</button>
                        <button type="button" class="co-ghost-btn" (click)="close()">Voltar</button>
                      </div>
                    }
                    @case ('cancelar') {
                      <p class="note">Cancelar esta parcela?</p>
                      <div class="panel-actions">
                        <button type="button" class="co-ghost-btn danger" [disabled]="busyId() === c.id" (click)="confirmCancel(c)">Cancelar parcela</button>
                        <button type="button" class="co-ghost-btn" (click)="close()">Voltar</button>
                      </div>
                    }
                    @case ('desfazer') {
                      <p class="note">Voltar esta parcela para pendente? Os dados da baixa serão apagados.</p>
                      <div class="panel-actions">
                        <button type="button" class="co-ghost-btn danger" [disabled]="busyId() === c.id" (click)="confirmUndo(c)">Desfazer baixa</button>
                        <button type="button" class="co-ghost-btn" (click)="close()">Voltar</button>
                      </div>
                    }
                  }
                </div>
              }
            </div>
          } @empty {
            @if (finance.ready() && !finance.error()) {
              <p class="note">Nenhuma parcela aqui. <a routerLink="/painel/financeiro/matricular">Matricular um aluno</a> gera as parcelas.</p>
            }
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px var(--co-gutter, 32px) 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .month-nav {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .month-label {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      min-width: 130px;
      text-align: center;
    }
    .disclaimer {
      margin: 0;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .kpi-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px 14px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .row:last-child {
      border-bottom: none;
    }
    .who {
      flex: 1 1 220px;
      min-width: 0;
    }
    .name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .sub {
      margin-top: 2px;
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
    .amount {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .panel {
      flex: 1 1 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 14px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }
    .lbl {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .input {
      height: 38px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .panel-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }
    .note {
      margin: 0;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
    .danger {
      color: var(--nx-red-500, #ff5b5b);
    }
  `,
})
export class PanelPagamentosComponent {
  protected readonly finance = inject(FinanceService);

  protected readonly tabs = TABS;
  protected readonly methods = METHODS;
  protected readonly activeTab = signal('Todos');
  private readonly today = localIsoDate();

  protected readonly openId = signal<string | null>(null);
  protected readonly mode = signal<ActionMode>('baixa');
  protected readonly busyId = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly copiedId = signal<string | null>(null);

  protected readonly payMethod = signal<PaymentMethod>('pix');
  protected readonly payDate = signal(this.today);
  protected readonly payNote = signal('');
  protected readonly editAmount = signal('');
  protected readonly editDue = signal('');

  protected readonly monthLabel = computed(() => {
    const [y, m] = this.finance.month().split('-').map(Number);
    return `${MONTH_NAMES[m! - 1]} de ${y}`;
  });

  protected readonly totals = computed(() => monthTotals(this.finance.monthCharges(), this.today));
  protected readonly overdue = computed(() => overdueSummary(this.finance.overdueCharges(), this.today));

  protected readonly rows = computed(() => {
    const tab = this.activeTab();
    const source = tab === 'Atrasados' ? this.finance.overdueCharges() : this.finance.monthCharges();
    return source
      .filter((c) => {
        const s = chargeState(c, this.today);
        return tab === 'Todos' || tab === 'Atrasados' || (tab === 'Pendentes' && s === 'pendente') || (tab === 'Pagos' && s === 'pago');
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.athleteName.localeCompare(b.athleteName));
  });

  protected money(cents: number): string {
    return formatBRL(cents);
  }
  protected date(iso: string): string {
    return formatDate(iso);
  }
  protected state(c: Charge): ChargeState {
    return chargeState(c, this.today);
  }
  protected label(c: Charge): string {
    return STATE_LABEL[this.state(c)];
  }
  protected tone(c: Charge): PillTone {
    return STATE_TONE[this.state(c)];
  }
  protected methodLabel(method: PaymentMethod | null): string {
    return method ? METHOD_LABEL[method] : '';
  }

  protected shift(delta: number): void {
    this.close();
    this.finance.month.update((m) => shiftMonth(m, delta));
  }

  protected open(c: Charge, mode: ActionMode): void {
    this.actionError.set(null);
    this.openId.set(c.id);
    this.mode.set(mode);
    if (mode === 'baixa') {
      this.payMethod.set('pix');
      this.payDate.set(this.today);
      this.payNote.set('');
    }
    if (mode === 'editar') {
      this.editAmount.set(centsToInput(c.amountCents));
      this.editDue.set(c.dueDate);
    }
  }

  protected close(): void {
    this.openId.set(null);
  }

  private async run(id: string, action: () => Promise<void>, failure: string): Promise<void> {
    this.actionError.set(null);
    this.busyId.set(id);
    try {
      await action();
      this.close();
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : failure);
    } finally {
      this.busyId.set(null);
    }
  }

  protected confirmPaid(c: Charge): Promise<void> {
    return this.run(
      c.id,
      () => this.finance.markPaid(c.id, { paidAt: this.payDate(), method: this.payMethod(), note: this.payNote() }),
      'Não foi possível dar baixa.',
    );
  }

  protected confirmEdit(c: Charge): Promise<void> {
    const cents = toCents(this.editAmount());
    if (cents === null || cents <= 0 || !this.editDue()) {
      this.actionError.set('Informe um valor maior que zero e o vencimento.');
      return Promise.resolve();
    }
    return this.run(c.id, () => this.finance.editCharge(c.id, { amountCents: cents, dueDate: this.editDue() }), 'Não foi possível editar a parcela.');
  }

  protected confirmCancel(c: Charge): Promise<void> {
    return this.run(c.id, () => this.finance.cancelCharge(c.id), 'Não foi possível cancelar a parcela.');
  }

  protected confirmUndo(c: Charge): Promise<void> {
    return this.run(c.id, () => this.finance.undoPaid(c.id), 'Não foi possível desfazer a baixa.');
  }

  protected async copy(c: Charge): Promise<void> {
    try {
      await navigator.clipboard.writeText(collectionMessage(c.amountCents, c.dueDate));
      this.copiedId.set(c.id);
      setTimeout(() => this.copiedId.set(null), 2000);
    } catch {
      this.actionError.set('Não foi possível copiar. Copie a mensagem manualmente.');
    }
  }
}

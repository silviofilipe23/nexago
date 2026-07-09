import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { BarRowComponent } from '../ui/bar-row.component';
import { IconComponent } from '../ui/icon.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type TxType = 'in' | 'out';
type TxStatus = 'ok' | 'sent' | 'pend' | 'fail';
type TxFilter = 'all' | TxType;

interface Transaction {
  id: number;
  type: TxType;
  amount: number;
  label: string;
  sub: string;
  date: string;
  status: TxStatus;
}

interface FinanceSummary {
  label: string;
  labelTone: 'orange' | 'dim';
  value: string;
  valueTone: 'text' | 'pending';
  caption: string;
  captionTone: 'dim' | 'green';
}

const TX_STATUS_LABEL: Record<TxStatus, string> = {
  ok: 'Recebido',
  sent: 'Enviado',
  pend: 'Pendente',
  fail: 'Falhou',
};

const TX_STATUS_TONE: Record<TxStatus, PillTone> = {
  ok: 'green',
  sent: 'green',
  pend: 'yellow',
  fail: 'red',
};

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/** Tela Financeiro do painel (protótipo ArFinanceiroScreen): saldo, faturamento, movimentações e saque. */
@Component({
  selector: 'ar-panel-finance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, LineChartComponent, BarRowComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Financeiro" [subtitle]="arenaName() + ' · saldo e movimentações'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary">
          <ar-icon name="download" [size]="14" />
          Exportar extrato
        </button>
      </ar-page-header>

      <div class="body">
        <div class="summary-row">
          @for (s of summaries; track s.label) {
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
              <ar-line-chart [height]="110" [data]="revenueData" [labels]="revenueDays" />
            </ar-panel-card>

            <ar-panel-card title="Movimentações" [kicker]="listKicker()" class="tx-card">
              <div class="ar-filter-bar" card-actions>
                <button type="button" class="ar-chip" [class.active]="filter() === 'all'" (click)="filter.set('all')">Todos</button>
                <button type="button" class="ar-chip" [class.active]="filter() === 'in'" (click)="filter.set('in')">Recebimentos</button>
                <button type="button" class="ar-chip" [class.active]="filter() === 'out'" (click)="filter.set('out')">Saques</button>
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
                @for (tx of filteredTx(); track tx.id) {
                  <div class="tx-row">
                    <div class="tx-icon" [class.in]="tx.type === 'in'">
                      @if (tx.type === 'in') {
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
                    <div class="tx-date">{{ tx.date }}</div>
                    <div><ar-pill [tone]="statusTone[tx.status]">{{ statusLabel[tx.status] }}</ar-pill></div>
                    <div class="tx-amount right" [class.in]="tx.type === 'in'">
                      {{ tx.type === 'in' ? '+' : '−' }}{{ formatBRL(tx.amount) }}
                    </div>
                  </div>
                }
              </div>
            </ar-panel-card>
          </div>

          <div class="col-right">
            <ar-panel-card pad="sm" title="Solicitar saque">
              <div class="field-label">Valor</div>
              <div class="amount-field">
                <span>R$ 0,00</span>
                <ar-pill tone="orange">Sacar tudo</ar-pill>
              </div>
              <div class="field-label">Chave PIX</div>
              <div class="pix-field">9b1213f1-3790…</div>
              <button type="button" class="ar-mini-btn ar-mini-btn-primary">Solicitar saque</button>
            </ar-panel-card>

            <ar-panel-card pad="sm" title="Recebimento por quadra">
              <div class="bars">
                @for (row of byCourt; track row.label; let last = $last) {
                  <ar-bar-row [label]="row.label" [sub]="row.sub" [pct]="row.pct" tone="orange" [last]="last" />
                }
              </div>
            </ar-panel-card>
          </div>
        </div>
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
    }

    .amount-field span {
      flex: 1;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 16px;
      color: var(--nx-text-dim);
    }

    .pix-field {
      height: 40px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      padding: 0 12px;
      margin-bottom: 14px;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-mute);
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

  protected readonly formatBRL = formatBRL;
  protected readonly statusLabel = TX_STATUS_LABEL;
  protected readonly statusTone = TX_STATUS_TONE;

  protected readonly filter = signal<TxFilter>('all');

  protected readonly revenueData = [820, 940, 880, 1120, 990, 1340, 1240];
  protected readonly revenueDays = ['Qua', 'Qui', 'Sex', 'Sáb', 'Dom', 'Seg', 'Ter'];

  protected readonly summaries: FinanceSummary[] = [
    { label: 'Saldo disponível', labelTone: 'orange', value: formatBRL(2340), valueTone: 'text', caption: 'Próx. repasse · 15 Jul', captionTone: 'dim' },
    { label: 'Recebido no mês', labelTone: 'dim', value: formatBRL(6820), valueTone: 'text', caption: '↑ 12% vs mês anterior', captionTone: 'green' },
    { label: 'Taxa da plataforma', labelTone: 'dim', value: '6%', valueTone: 'text', caption: `${formatBRL(409)} retidos no mês`, captionTone: 'dim' },
    { label: 'Pendências', labelTone: 'dim', value: '1', valueTone: 'pending', caption: `${formatBRL(48)} aguardando pagamento`, captionTone: 'dim' },
  ];

  protected readonly byCourt = [
    { label: 'Quadra 1', sub: 'Beach Tennis', pct: 48 },
    { label: 'Quadra 2', sub: 'Vôlei de praia', pct: 40 },
    { label: 'Quadra 3', sub: 'Beach Soccer', pct: 12 },
  ];

  private readonly transactions: Transaction[] = [
    { id: 1, type: 'in', amount: 98, label: 'Reserva · Quadra 1', sub: 'João S. · Beach Tennis', date: 'Hoje, 09:12', status: 'ok' },
    { id: 2, type: 'in', amount: 60, label: 'Reserva · Quadra 2', sub: 'Maria T. · Vôlei de praia', date: 'Hoje, 08:40', status: 'ok' },
    { id: 3, type: 'out', amount: 150, label: 'Saque PIX', sub: 'Chave aleatória · …462f4', date: 'Ontem, 14:00', status: 'sent' },
    { id: 4, type: 'in', amount: 48, label: 'Reserva · Quadra 1', sub: 'Enzo R. · Beach Tennis', date: 'Ontem, 16:45', status: 'pend' },
    { id: 5, type: 'in', amount: 72, label: 'Reserva · Quadra 2', sub: 'Camila S. · Vôlei de praia', date: '25 jun, 09:15', status: 'ok' },
    { id: 6, type: 'out', amount: 60, label: 'Saque PIX', sub: 'Chave aleatória · …9835', date: '23 jun, 08:00', status: 'fail' },
  ];

  protected readonly filteredTx = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.transactions : this.transactions.filter((t) => t.type === f);
  });

  protected readonly listKicker = computed(() => `${this.filteredTx().length} lançamentos`);

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');
}

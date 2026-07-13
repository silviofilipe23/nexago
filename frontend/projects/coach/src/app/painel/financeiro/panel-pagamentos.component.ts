import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AthleteAvatarComponent, type AthleteStatus } from '../ui/athlete-avatar.component';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { ProgressBarComponent } from '../ui/progress-bar.component';
import { RowComponent } from '../ui/row.component';
import { TabsComponent } from '../ui/tabs.component';

type PaymentStatus = 'pago' | 'pendente' | 'atrasado';

interface Payment {
  athleteName: string;
  athleteInitials: string;
  athleteStatus: AthleteStatus;
  plano: string;
  valor: number;
  vencimento: string;
  status: PaymentStatus;
  metodo: string | null;
  dataPagamento: string | null;
}

const PAYMENTS: Payment[] = [
  { athleteName: 'João Silva', athleteInitials: 'JS', athleteStatus: 'ativo', plano: 'Mensal', valor: 180, vencimento: '05/07/2026', status: 'pago', metodo: 'Pix', dataPagamento: '04/07' },
  { athleteName: 'Ana Beatriz', athleteInitials: 'AB', athleteStatus: 'ativo', plano: 'Trimestral', valor: 480, vencimento: '10/07/2026', status: 'pago', metodo: 'Cartão', dataPagamento: '09/07' },
  { athleteName: 'Lucas Ramos', athleteInitials: 'LR', athleteStatus: 'lesionado', plano: 'Mensal', valor: 180, vencimento: '01/07/2026', status: 'atrasado', metodo: null, dataPagamento: null },
  { athleteName: 'Pedro Silva', athleteInitials: 'PS', athleteStatus: 'lesionado', plano: 'Mensal', valor: 180, vencimento: '08/07/2026', status: 'pendente', metodo: null, dataPagamento: null },
  { athleteName: 'João Vitor', athleteInitials: 'JV', athleteStatus: 'afastado', plano: 'Anual', valor: 1600, vencimento: '15/01/2027', status: 'pago', metodo: 'Cartão', dataPagamento: '15/01' },
  { athleteName: 'Rafael Nunes', athleteInitials: 'RN', athleteStatus: 'ferias', plano: 'Mensal', valor: 180, vencimento: '12/07/2026', status: 'pendente', metodo: null, dataPagamento: null },
];

const STATUS_TONE: Record<PaymentStatus, PillTone> = { pago: 'green', pendente: 'yellow', atrasado: 'red' };
const STATUS_LABEL: Record<PaymentStatus, string> = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado' };

function brl(value: number): string {
  return 'R$ ' + value.toLocaleString('pt-BR');
}

/** Pagamentos (protótipo TrPagamentosScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-pagamentos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AthleteAvatarComponent,
    IconComponent,
    KpiCardComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    PillComponent,
    ProgressBarComponent,
    RowComponent,
    TabsComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Pagamentos" subtitle="Planos dos atletas · Equipe Adulto Masculino">
        <a class="co-ghost-btn" routerLink="/painel/financeiro/planos">
          <co-icon name="wallet" [size]="14" />
          Planos
        </a>
        <button type="button" class="co-mini-btn co-mini-btn-primary">
          <co-icon name="download" [size]="14" />
          Exportar
        </button>
      </co-page-header>

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Recebido no mês" [value]="brl(recebido())" delta="4 de 6 atletas" deltaTone="green" />
          <co-kpi-card label="Em aberto" [value]="brl(emAberto())" delta="2 pendências" deltaTone="orange" />
          <co-kpi-card label="Inadimplentes" value="1" delta="Vencido há 11 dias" deltaTone="red" />
          <co-kpi-card label="Adimplência" value="67%" delta="Da equipe" deltaTone="flat" />
        </div>

        <co-panel-card pad="lg" class="summary-card">
          <div class="summary-head">
            <div>
              <div class="summary-kicker">Arrecadado no mês</div>
              <div class="summary-value">{{ brl(recebido()) }}</div>
            </div>
            <div class="summary-forecast">
              <div class="summary-total">{{ brl(recebido() + emAberto()) }}</div>
              <div class="summary-forecast-label">previsto no mês</div>
            </div>
          </div>
          <co-progress-bar [pct]="paidPct()" tone="green" [height]="8" />
          <div class="summary-foot">
            <span>4 de 6 planos pagos</span>
            <span class="pending">{{ brl(emAberto()) }} em aberto</span>
          </div>
        </co-panel-card>

        <div class="tabs-row">
          <co-tabs [tabs]="tabs" [active]="activeTab()" (change)="activeTab.set($event)" />
        </div>

        <co-panel-card [title]="activeTab() === 'Todos' ? 'Todos os planos' : activeTab()" [kicker]="filteredPayments().length + ' atletas'" class="list-card">
          @for (p of filteredPayments(); track p.athleteName; let last = $last) {
            <co-row [title]="p.athleteName" [sub]="paymentSub(p)" [last]="last">
              <co-athlete-avatar row-avatar [initials]="p.athleteInitials" [size]="34" [status]="p.athleteStatus" />
              <div row-trailing class="trailing">
                <span class="valor">{{ brl(p.valor) }}</span>
                <co-pill [tone]="STATUS_TONE[p.status]">{{ STATUS_LABEL[p.status] }}</co-pill>
                @if (p.status !== 'pago') {
                  <button type="button" class="co-mini-btn co-mini-btn-primary">Cobrar</button>
                }
              </div>
            </co-row>
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
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
    .kpi-row {
      display: flex;
      gap: 16px;
    }
    .summary-card {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .summary-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .summary-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-400);
    }
    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
      color: var(--nx-text);
      letter-spacing: -0.03em;
      margin-top: 6px;
    }
    .summary-forecast {
      text-align: right;
    }
    .summary-total {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text-mute);
    }
    .summary-forecast-label {
      font-family: var(--nx-font-ui);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 1px;
    }
    .summary-foot {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-mute);
    }
    .summary-foot .pending {
      color: var(--nx-pending);
    }
    .tabs-row {
      display: flex;
    }
    .list-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .trailing {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .valor {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
  `,
})
export class PanelPagamentosComponent {
  protected readonly tabs = ['Todos', 'Pendentes', 'Pagos'];
  protected readonly activeTab = signal('Todos');
  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly STATUS_LABEL = STATUS_LABEL;

  protected readonly filteredPayments = computed(() => {
    const tab = this.activeTab();
    if (tab === 'Pendentes') {
      return PAYMENTS.filter((p) => p.status !== 'pago');
    }
    if (tab === 'Pagos') {
      return PAYMENTS.filter((p) => p.status === 'pago');
    }
    return PAYMENTS;
  });

  protected readonly recebido = computed(() =>
    PAYMENTS.filter((p) => p.status === 'pago').reduce((sum, p) => sum + p.valor, 0),
  );

  protected readonly emAberto = computed(() =>
    PAYMENTS.filter((p) => p.status !== 'pago').reduce((sum, p) => sum + p.valor, 0),
  );

  protected readonly paidPct = computed(() =>
    Math.round((this.recebido() / (this.recebido() + this.emAberto())) * 100),
  );

  protected brl(value: number): string {
    return brl(value);
  }

  protected paymentSub(p: Payment): string {
    return p.status === 'pago'
      ? `${p.plano} · ${p.metodo} · recebido em ${p.dataPagamento}`
      : `${p.plano} · vence em ${p.vencimento}`;
  }
}

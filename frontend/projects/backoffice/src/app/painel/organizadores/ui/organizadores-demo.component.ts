import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { IconComponent, type PanelIconName } from '../../ui/icon.component';
import { LineChartComponent } from '../../ui/line-chart.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PillComponent, type PillTone } from '../../ui/pill.component';

interface RankItem {
  name: string;
  city: string;
  gmv: string;
  tournaments: number;
}

interface RiskRadarItem {
  score: number;
  name: string;
  reason: string;
}

interface StateItem {
  state: string;
  count: number;
}

interface FunnelStep {
  label: string;
  value: number;
  pct: number;
}

interface HealthStat {
  label: string;
  pct: number;
}

interface TaskItem {
  icon: PanelIconName;
  label: string;
  count: number;
  tone: PillTone;
}

type GrowthTab = 'Novos' | 'Ativos' | 'GMV';

const GROWTH_SERIES: Record<GrowthTab, number[]> = {
  Novos: [9, 11, 12, 14, 15, 18, 19, 21, 23, 25, 28, 31],
  Ativos: [186, 199, 209, 218, 228, 238, 247, 256, 264, 272, 280, 287],
  GMV: [98, 110, 118, 124, 131, 140, 148, 156, 163, 170, 178, 186],
};

function riskTone(score: number): 'red' | 'yellow' | 'green' {
  if (score >= 70) {
    return 'red';
  }
  if (score >= 40) {
    return 'yellow';
  }
  return 'green';
}

/**
 * Painéis analíticos da tela de Organizadores — crescimento, funil, distribuição,
 * atividades, radar de risco, top 5, saúde da base e tarefas.
 *
 * TUDO AQUI É DADO DE EXEMPLO: nenhuma dessas métricas existe no backend hoje
 * (não há GMV, nota nem fila de solicitações por organizador). Fica isolado do
 * resto da tela justamente para o dado real e o demonstrativo não se misturarem.
 */
@Component({
  selector: 'bo-organizadores-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, LineChartComponent, PillComponent, IconComponent],
  template: `
    <div class="secondary-grid">
      <div class="col-left">
        <bo-panel-card kicker="Últimos 12 meses" title="Crescimento dos organizadores">
          <div class="bo-chart-tabs" card-actions>
            @for (tab of growthTabs; track tab) {
              <button
                type="button"
                [class.active]="growthTab() === tab"
                (click)="growthTab.set(tab)"
              >
                {{ tab }}
              </button>
            }
          </div>
          <bo-line-chart
            [height]="126"
            [data]="growthData()"
            [months]="growthMonths"
            [ariaLabel]="'Crescimento de organizadores nos últimos 12 meses · ' + growthTab()"
          />
        </bo-panel-card>

        <bo-panel-card kicker="De atleta a organizador" title="Funil de promoção">
          <div class="funnel">
            @for (step of funnel; track step.label; let last = $last) {
              <div class="funnel-step">
                <div class="funnel-bar" [style.width.%]="step.pct">
                  <span>{{ step.value }}</span>
                </div>
                <span class="funnel-label">{{ step.label }}</span>
              </div>
              @if (!last) {
                <div class="funnel-arrow">
                  <bo-icon
                    name="chevron-right"
                    [size]="12"
                    style="transform: rotate(90deg); color: var(--nx-text-dim)"
                  />
                </div>
              }
            }
          </div>
        </bo-panel-card>

        <bo-panel-card kicker="Por estado" title="Distribuição dos organizadores">
          <div>
            @for (item of states; track item.state) {
              <div class="state-row">
                <span class="state-name">{{ item.state }}</span>
                <div class="state-bar-track">
                  <div class="state-bar-fill" [style.width.%]="(item.count / states[0].count) * 100"></div>
                </div>
                <span class="state-count">{{ item.count }}</span>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card title="Últimas atividades">
          <button type="button" class="bo-ghost-btn" card-actions>Ver tudo</button>
          <div class="list">
            @for (item of activity; track item.time) {
              <div class="bo-row">
                <div class="bo-activity-avatar" aria-hidden="true">{{ item.initials }}</div>
                <div class="bo-log-text" [innerHTML]="item.text"></div>
                <span class="bo-log-time">{{ item.time }}</span>
              </div>
            }
          </div>
        </bo-panel-card>
      </div>

      <div class="col-right">
        <bo-panel-card pad="sm" kicker="Radar de risco" title="Quem precisa de atenção" class="radar-card">
          <div>
            @for (item of radar; track item.name) {
              <div class="radar-row">
                <div class="radar-score" [class]="'tone-' + risk(item.score)">{{ item.score }}</div>
                <div class="radar-body">
                  <div class="radar-name">{{ item.name }}</div>
                  <div class="radar-reason">{{ item.reason }}</div>
                </div>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Top 5 · GMV">
          <button type="button" class="bo-ghost-btn" card-actions>Ver top 10</button>
          <div>
            @for (item of rank; track item.name; let i = $index) {
              <div class="rank-row">
                <div class="rank-badge" [class.top]="i < 3">{{ i + 1 }}</div>
                <div class="rank-body">
                  <div class="rank-name">{{ item.name }}</div>
                  <div class="rank-city">{{ item.city }}</div>
                </div>
                <div class="rank-stats">
                  <div class="rank-gmv">{{ item.gmv }}</div>
                  <div class="rank-tournaments">{{ item.tournaments }} torneios</div>
                </div>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Saúde da base">
          <div class="health-grid">
            @for (item of health; track item.label) {
              <div class="health-stat">
                <div class="health-head">
                  <span>{{ item.label }}</span>
                  <span class="health-pct">{{ item.pct }}%</span>
                </div>
                <div class="health-track">
                  <div
                    class="health-fill"
                    [class.mid]="item.pct < 85 && item.pct >= 60"
                    [class.low]="item.pct < 60"
                    [style.width.%]="item.pct"
                  ></div>
                </div>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Tarefas pendentes">
          <bo-pill tone="orange" card-actions>{{ totalTasks() }}</bo-pill>
          <div>
            @for (task of tasks; track task.label) {
              <div class="task-row">
                <bo-icon [name]="task.icon" [size]="15" style="color: var(--nx-text-dim)" />
                <span class="task-label">{{ task.label }}</span>
                <bo-pill [tone]="task.tone">{{ task.count }}</bo-pill>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Ações rápidas">
          <div class="shortcuts-grid">
            <a class="bo-shortcut" routerLink="/painel/organizadores/promover">
              <bo-icon name="plus" [size]="16" /><span>Promover atleta</span>
            </a>
            <div class="bo-shortcut"><bo-icon name="check" [size]="16" /><span>Aprovar solicitação</span></div>
            <div class="bo-shortcut"><bo-icon name="mail" [size]="16" /><span>Enviar comunicado</span></div>
            <div class="bo-shortcut"><bo-icon name="download" [size]="16" /><span>Exportar CSV</span></div>
          </div>
        </bo-panel-card>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .secondary-grid {
      display: grid;
      grid-template-columns: 1fr 372px;
      gap: 16px;
      align-items: start;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .list {
      display: flex;
      flex-direction: column;
      margin-top: -6px;
    }

    .radar-card {
      box-shadow: 0 0 0 1px rgba(255, 59, 48, 0.14);
    }

    .funnel {
      display: flex;
      flex-direction: column;
    }

    .funnel-step {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .funnel-bar {
      min-width: 46px;
      height: 34px;
      border-radius: var(--nx-r-2);
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0 12px;
    }

    .funnel-bar span {
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 15px;
      color: var(--nx-orange-500);
    }

    .funnel-label {
      font-size: 12.5px;
      font-weight: 500;
      color: var(--nx-text-mute);
    }

    .funnel-arrow {
      display: flex;
      justify-content: flex-start;
      padding: 3px 0 3px 22px;
    }

    .state-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 7px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .state-row:last-child {
      border-bottom: none;
    }

    .state-name {
      width: 128px;
      flex: none;
      font-size: 12.5px;
      font-weight: 500;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .state-bar-track {
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .state-bar-fill {
      height: 100%;
      border-radius: 4px;
      background: var(--nx-orange-500);
    }

    .state-count {
      width: 30px;
      flex: none;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text-mute);
    }

    .radar-row {
      display: flex;
      align-items: flex-start;
      gap: 11px;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .radar-row:last-child {
      border-bottom: none;
    }

    .radar-score {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      flex: none;
      margin-top: 1px;
      display: grid;
      place-items: center;
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text-mute);
    }

    .radar-score.tone-red {
      background: rgba(255, 59, 48, 0.12);
      border-color: rgba(255, 59, 48, 0.3);
      color: var(--nx-live);
    }

    .radar-score.tone-yellow {
      background: rgba(244, 197, 67, 0.12);
      border-color: rgba(244, 197, 67, 0.3);
      color: var(--nx-pending);
    }

    .radar-score.tone-green {
      background: rgba(43, 209, 126, 0.12);
      border-color: rgba(43, 209, 126, 0.3);
      color: var(--nx-win);
    }

    .radar-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .radar-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .radar-reason {
      font-size: 11.5px;
      line-height: 1.4;
      color: var(--nx-text-dim);
    }

    .rank-row {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .rank-row:last-child {
      border-bottom: none;
    }

    .rank-badge {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .rank-badge.top {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
      color: var(--nx-orange-500);
    }

    .rank-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .rank-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .rank-city {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .rank-stats {
      flex: none;
      text-align: right;
    }

    .rank-gmv {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text);
    }

    .rank-tournaments {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .health-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px 20px;
    }

    .health-stat {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .health-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }

    .health-head span {
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }

    .health-pct {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }

    .health-track {
      height: 6px;
      border-radius: 3px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .health-fill {
      height: 100%;
      border-radius: 3px;
      background: var(--nx-win);
    }

    .health-fill.mid {
      background: var(--nx-orange-500);
    }

    .health-fill.low {
      background: var(--nx-pending);
    }

    .task-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .task-row:last-child {
      border-bottom: none;
    }

    .task-label {
      flex: 1;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .shortcuts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .shortcuts-grid a.bo-shortcut {
      text-decoration: none;
    }

    @media (max-width: 1180px) {
      .secondary-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class OrganizadoresDemoComponent {
  protected readonly risk = riskTone;

  protected readonly growthTab = signal<GrowthTab>('Novos');
  protected readonly growthTabs: GrowthTab[] = ['Novos', 'Ativos', 'GMV'];
  protected readonly growthData = computed(() => GROWTH_SERIES[this.growthTab()]);
  protected readonly growthMonths = [
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
  ];

  protected readonly funnel: FunnelStep[] = [
    { label: 'Solicitações recebidas', value: 34, pct: 100 },
    { label: 'Em análise', value: 21, pct: 87 },
    { label: 'Verificação concluída', value: 16, pct: 72 },
    { label: 'Role atribuída', value: 14, pct: 62 },
    { label: 'Primeiro torneio publicado', value: 9, pct: 46 },
  ];

  protected readonly states: StateItem[] = [
    { state: 'São Paulo · SP', count: 58 },
    { state: 'Ceará · CE', count: 41 },
    { state: 'Rio de Janeiro · RJ', count: 33 },
    { state: 'Santa Catarina · SC', count: 28 },
    { state: 'Bahia · BA', count: 22 },
    { state: 'Pernambuco · PE', count: 17 },
    { state: 'Goiás · GO', count: 13 },
  ];

  protected readonly activity = [
    {
      initials: 'RM',
      text: '<strong>Rafael Menezes</strong> publicou o torneio Etapa Praia do Futuro',
      time: '12 min',
    },
    {
      initials: 'AS',
      text: '<strong>Ana Souza</strong> aprovou a solicitação de <strong>Carla Nogueira</strong>',
      time: '1 h',
    },
    { initials: 'JP', text: '<strong>Juliana Prado</strong> solicitou repasse de R$ 4.320', time: '2 h' },
    { initials: 'TB', text: '<strong>Tiago Barros</strong> cancelou o Rei da Praia · Etapa 8', time: '5 h' },
    {
      initials: 'AS',
      text: '<strong>Ana Souza</strong> suspendeu <strong>Paulo Henrique</strong> por disputas',
      time: 'ontem',
    },
  ];

  protected readonly radar: RiskRadarItem[] = [
    { score: 86, name: 'Paulo Henrique', reason: 'Suspenso · 3 disputas de reembolso abertas' },
    { score: 64, name: 'Tiago Barros', reason: 'Cancelou 2 torneios com inscritos em 30 dias' },
    { score: 52, name: 'Larissa Andrade', reason: 'Repasse pendente há 6 dias · PIX inválido' },
    { score: 18, name: 'Rafael Menezes', reason: 'Operação saudável' },
  ];

  protected readonly rank: RankItem[] = [
    { name: 'Rafael Menezes', city: 'Fortaleza · CE', gmv: 'R$ 38.200', tournaments: 24 },
    { name: 'Juliana Prado', city: 'São Paulo · SP', gmv: 'R$ 31.400', tournaments: 19 },
    { name: 'Marcos Vinícius', city: 'Salvador · BA', gmv: 'R$ 22.900', tournaments: 15 },
    { name: 'Carla Nogueira', city: 'Florianópolis · SC', gmv: 'R$ 18.750', tournaments: 12 },
    { name: 'Tiago Barros', city: 'Niterói · RJ', gmv: 'R$ 9.300', tournaments: 8 },
  ];

  protected readonly health: HealthStat[] = [
    { label: 'Verificação completa', pct: 92 },
    { label: 'PIX validado', pct: 88 },
    { label: 'Nota ≥ 4,5', pct: 81 },
    { label: 'Torneio nos últimos 60d', pct: 74 },
  ];

  protected readonly tasks: TaskItem[] = [
    { icon: 'check', label: 'Solicitações de acesso', count: 7, tone: 'orange' },
    { icon: 'file', label: 'Documentos em análise', count: 3, tone: 'dim' },
    { icon: 'cash', label: 'Repasses aguardando', count: 5, tone: 'orange' },
    { icon: 'flag', label: 'Disputas abertas', count: 3, tone: 'red' },
    { icon: 'clock', label: 'Verificações expirando', count: 1, tone: 'yellow' },
  ];

  protected readonly totalTasks = computed(() => this.tasks.reduce((sum, t) => sum + t.count, 0));
}

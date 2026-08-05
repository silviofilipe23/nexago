import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { IconComponent, type PanelIconName } from '../../ui/icon.component';
import { LineChartComponent } from '../../ui/line-chart.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PillComponent, type PillTone } from '../../ui/pill.component';

interface AlertItem {
  label: string;
  meta?: string;
  count: string;
  tone: PillTone;
}

interface RankItem {
  name: string;
  city: string;
  revenue: string;
  bookings: number;
}

interface DeclineItem {
  name: string;
  city: string;
  delta: string;
}

interface RiskRadarItem {
  score: number;
  name: string;
  reason: string;
}

interface CityItem {
  city: string;
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
 * Painéis de apoio da tela de Arenas — alertas, crescimento, funil, cidades,
 * atividades, radar, top 5, quedas, saúde e tarefas.
 *
 * TUDO AQUI É DADO DE EXEMPLO: receita, risco, reservas e fila de aprovação não
 * existem no backend hoje. Fica isolado para não se misturar com a tabela real.
 */
@Component({
  selector: 'bo-arenas-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, LineChartComponent, PillComponent, IconComponent],
  template: `
    <bo-panel-card pad="sm" kicker="Todos os dias começam aqui" title="Alertas operacionais">
      <bo-pill tone="red" card-actions>40</bo-pill>
      <div class="alerts-grid">
        <div>
          @for (item of alertsA; track item.label) {
            <div class="bo-row">
              <div class="bo-row-icon" [class.danger]="item.tone === 'red'">
                <bo-icon name="alert" [size]="14" />
              </div>
              <div class="bo-row-body">
                <div class="bo-row-title">{{ item.label }}</div>
                @if (item.meta) {
                  <div class="bo-row-meta">{{ item.meta }}</div>
                }
              </div>
              <bo-pill [tone]="item.tone">{{ item.count }}</bo-pill>
              <bo-icon name="chevron-right" [size]="13" style="color: var(--nx-text-dim); flex: none" />
            </div>
          }
        </div>
        <div>
          @for (item of alertsB; track item.label) {
            <div class="bo-row">
              <div class="bo-row-icon" [class.danger]="item.tone === 'red'">
                <bo-icon name="alert" [size]="14" />
              </div>
              <div class="bo-row-body">
                <div class="bo-row-title">{{ item.label }}</div>
                @if (item.meta) {
                  <div class="bo-row-meta">{{ item.meta }}</div>
                }
              </div>
              <bo-pill [tone]="item.tone">{{ item.count }}</bo-pill>
              <bo-icon name="chevron-right" [size]="13" style="color: var(--nx-text-dim); flex: none" />
            </div>
          }
        </div>
      </div>
    </bo-panel-card>

    <div class="secondary-grid">
      <div class="col-left">
        <bo-panel-card kicker="Últimos 12 meses" title="Crescimento das arenas" class="chart-card">
          <div class="bo-chart-tabs" card-actions>
            <button type="button" class="active">Novas</button>
            <button type="button">Ativas</button>
            <button type="button">Receita</button>
          </div>
          <bo-line-chart [height]="126" [data]="growthData" [months]="growthMonths" ariaLabel="Crescimento de arenas nos últimos 12 meses" />
        </bo-panel-card>

        <bo-panel-card kicker="Onboarding comercial" title="Funil de conversão">
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
                  <bo-icon name="chevron-right" [size]="12" style="transform: rotate(90deg); color: var(--nx-text-dim)" />
                </div>
              }
            }
          </div>
        </bo-panel-card>

        <bo-panel-card kicker="Por cidade" title="Distribuição das arenas">
          <div>
            @for (c of cities; track c.city) {
              <div class="city-row">
                <span class="city-name">{{ c.city }}</span>
                <div class="city-bar-track">
                  <div class="city-bar-fill" [style.width.%]="(c.count / cities[0].count) * 100"></div>
                </div>
                <span class="city-count">{{ c.count }}</span>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card title="Últimas atividades" class="activity-card">
          <button type="button" class="bo-ghost-btn" card-actions>Ver tudo</button>
          <div class="list">
            @for (item of activity; track item.time) {
              <div class="bo-row activity-row">
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
            @for (r of radar; track r.name) {
              <div class="radar-row">
                <div class="radar-score" [class]="'tone-' + risk(r.score)">{{ r.score }}</div>
                <div class="radar-body">
                  <div class="radar-name">{{ r.name }}</div>
                  <div class="radar-reason">{{ r.reason }}</div>
                </div>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Top 5 · Receita">
          <button type="button" class="bo-ghost-btn" card-actions>Ver top 10</button>
          <div>
            @for (r of rank; track r.name; let i = $index) {
              <div class="rank-row">
                <div class="rank-badge" [class.top]="i < 3">{{ i + 1 }}</div>
                <div class="rank-body">
                  <div class="rank-name">{{ r.name }}</div>
                  <div class="rank-city">{{ r.city }}</div>
                </div>
                <div class="rank-stats">
                  <div class="rank-revenue">{{ r.revenue }}</div>
                  <div class="rank-bookings">{{ r.bookings }} res.</div>
                </div>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Arenas em queda">
          <bo-pill tone="red" card-actions>{{ decline.length }}</bo-pill>
          <div>
            @for (d of decline; track d.name) {
              <div class="decline-row">
                <div class="decline-body">
                  <div class="decline-name">{{ d.name }}</div>
                  <div class="decline-city">{{ d.city }}</div>
                </div>
                <span class="decline-delta">
                  <bo-icon name="trend-up" [size]="10" style="transform: rotate(180deg)" />
                  {{ d.delta }}
                </span>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Saúde da base">
          <div class="health-grid">
            @for (h of health; track h.label) {
              <div class="health-stat">
                <div class="health-head">
                  <span>{{ h.label }}</span>
                  <span class="health-pct">{{ h.pct }}%</span>
                </div>
                <div class="health-track">
                  <div class="health-fill" [class.mid]="h.pct < 85 && h.pct >= 60" [class.low]="h.pct < 60" [style.width.%]="h.pct"></div>
                </div>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Tarefas pendentes">
          <bo-pill tone="orange" card-actions>{{ totalTasks() }}</bo-pill>
          <div>
            @for (t of tasks; track t.label) {
              <div class="task-row">
                <bo-icon [name]="t.icon" [size]="15" style="color: var(--nx-text-dim)" />
                <span class="task-label">{{ t.label }}</span>
                <bo-pill [tone]="t.tone">{{ t.count }}</bo-pill>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Ações rápidas">
          <div class="shortcuts-grid">
            <div class="bo-shortcut"><bo-icon name="plus" [size]="16" /><span>Nova arena</span></div>
            <div class="bo-shortcut"><bo-icon name="check" [size]="16" /><span>Aprovar cadastro</span></div>
            <div class="bo-shortcut"><bo-icon name="download" [size]="16" /><span>Exportar CSV</span></div>
            <div class="bo-shortcut"><bo-icon name="mail" [size]="16" /><span>Enviar comunicado</span></div>
            <div class="bo-shortcut"><bo-icon name="trophy" [size]="16" /><span>Criar campanha</span></div>
            <div class="bo-shortcut"><bo-icon name="arena" [size]="16" /><span>Gerar relatório</span></div>
          </div>
        </bo-panel-card>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .alerts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 32px;
    }

    .bo-row-icon.danger {
      background: rgba(255, 59, 48, 0.1);
      border-color: rgba(255, 59, 48, 0.28);
      color: var(--nx-live);
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

    .city-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 7px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .city-row:last-child {
      border-bottom: none;
    }

    .city-name {
      width: 108px;
      flex: none;
      font-size: 12.5px;
      font-weight: 500;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .city-bar-track {
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .city-bar-fill {
      height: 100%;
      border-radius: 4px;
      background: var(--nx-orange-500);
    }

    .city-count {
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

    .rank-revenue {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text);
    }

    .rank-bookings {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .decline-row {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .decline-row:last-child {
      border-bottom: none;
    }

    .decline-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .decline-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .decline-city {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .decline-delta {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: none;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-live);
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

    @media (max-width: 1180px) {
      .secondary-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class ArenasDemoComponent {
  protected readonly risk = riskTone;

  protected readonly alertsA: AlertItem[] = [
    { label: 'Arenas aguardando aprovação', meta: 'mais antiga há 2 dias', count: '12', tone: 'orange' },
    { label: 'Arenas com documentação pendente', count: '4', tone: 'orange' },
    { label: 'Saques aguardando análise', meta: 'R$ 12.400 no total', count: '8', tone: 'orange' },
    { label: 'Arenas com muitas reclamações', count: '3', tone: 'red' },
  ];

  protected readonly alertsB: AlertItem[] = [
    { label: 'Sem movimentação há mais de 30 dias', count: '5', tone: 'orange' },
    { label: 'Pagamentos falhando', count: '2', tone: 'red' },
    { label: 'Plano vencendo essa semana', count: '6', tone: 'orange' },
  ];

  protected readonly growthData = [12, 15, 19, 21, 24, 28, 31, 34, 37, 40, 43, 46];

  protected readonly growthMonths = ['Ago', 'Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul'];

  protected readonly funnel: FunnelStep[] = [
    { label: 'Leads', value: 42, pct: 100 },
    { label: 'Cadastro iniciado', value: 18, pct: 72 },
    { label: 'Documentação enviada', value: 12, pct: 54 },
    { label: 'Aprovadas', value: 9, pct: 38 },
    { label: 'Primeira reserva', value: 6, pct: 24 },
  ];

  protected readonly cities: CityItem[] = [
    { city: 'São Paulo', count: 71 },
    { city: 'Goiânia', count: 38 },
    { city: 'Rio de Janeiro', count: 34 },
    { city: 'Brasília', count: 24 },
    { city: 'Recife', count: 19 },
    { city: 'Fortaleza', count: 16 },
    { city: 'Curitiba', count: 12 },
  ];

  protected readonly activity = [
    { initials: 'XP', text: '<strong>Arena XPTO</strong> alterou preços das quadras', time: '2 min' },
    { initials: 'AB', text: '<strong>Arena ABC</strong> criou o torneio Copa Verão', time: '18 min' },
    { initials: 'PR', text: '<strong>Arena Praia</strong> recebeu avaliação 5★', time: '41 min' },
    { initials: 'BM', text: '<strong>Arena Beira Mar</strong> solicitou saque de R$ 2.100', time: '1 h' },
    { initials: 'BC', text: '<strong>Arena Beach</strong> cancelou o plano Premium', time: '3 h' },
  ];

  protected readonly radar: RiskRadarItem[] = [
    { score: 92, name: 'Arena Bela Vista', reason: 'Suspensa · sem reservas há 90 dias' },
    { score: 88, name: 'Beach Club Alphaville', reason: 'Pagamento falhando + plano vencido' },
    { score: 75, name: 'Arena do Sol', reason: 'Queda de 42% nas reservas do mês' },
    { score: 68, name: 'Beach Sports Recife', reason: 'Muitas reclamações · avaliação 3,2' },
    { score: 15, name: 'Clube 5 Estrelas', reason: 'Operação saudável' },
  ];

  protected readonly rank: RankItem[] = [
    { name: 'Clube 5 Estrelas', city: 'Fortaleza · CE', revenue: 'R$ 21.100', bookings: 470 },
    { name: 'Arena Ipanema Beach', city: 'Rio de Janeiro · RJ', revenue: 'R$ 18.400', bookings: 412 },
    { name: 'Society Vitória', city: 'Vitória · ES', revenue: 'R$ 14.900', bookings: 358 },
    { name: 'Praça Society BH', city: 'Belo Horizonte · MG', revenue: 'R$ 11.750', bookings: 210 },
    { name: 'Arena Vale do Sol', city: 'Campinas · SP', revenue: 'R$ 9.980', bookings: 188 },
  ];

  protected readonly decline: DeclineItem[] = [
    { name: 'Arena do Sol', city: 'Salvador · BA', delta: '-42%' },
    { name: 'Society Sabará', city: 'Sabará · MG', delta: '-31%' },
    { name: 'Quadra Vista Alegre', city: 'Joinville · SC', delta: '-24%' },
    { name: 'Arena Beira Rio', city: 'Porto Alegre · RS', delta: '-17%' },
  ];

  protected readonly health: HealthStat[] = [
    { label: 'PIX configurado', pct: 95 },
    { label: 'Com fotos', pct: 82 },
    { label: 'Cadastro completo', pct: 91 },
    { label: 'Reservas 30d', pct: 76 },
  ];

  protected readonly tasks: TaskItem[] = [
    { icon: 'arena', label: 'Aprovações', count: 5, tone: 'orange' },
    { icon: 'ticket', label: 'Documentos', count: 3, tone: 'dim' },
    { icon: 'cash', label: 'Saques', count: 8, tone: 'orange' },
    { icon: 'flag', label: 'Denúncias', count: 2, tone: 'red' },
    { icon: 'mail', label: 'Chamados', count: 6, tone: 'dim' },
    { icon: 'clock', label: 'Planos vencendo', count: 4, tone: 'yellow' },
  ];

  protected readonly totalTasks = computed(() => this.tasks.reduce((sum, t) => sum + t.count, 0));
}

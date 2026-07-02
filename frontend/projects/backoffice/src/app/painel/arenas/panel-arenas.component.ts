import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { IconComponent, type PanelIconName } from '../ui/icon.component';
import { KpiMiniComponent, type KpiMiniTone } from '../ui/kpi-mini.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { StatusDotComponent, type StatusTone } from '../ui/status-dot.component';

type ArenaStatus = 'Ativa' | 'Em análise' | 'Suspensa';
type ArenaPlan = 'Premium' | 'Free';

interface ArenaRow {
  name: string;
  city: string;
  status: ArenaStatus;
  plan: ArenaPlan;
  revenue: string | null;
  risk: number | null;
  registeredAt: string;
  bookings: number;
}

interface KpiItem {
  label: string;
  value: string;
  tone?: KpiMiniTone;
}

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

const FILTERS = [
  'Todas',
  'Apenas ativas',
  'Apenas suspensas',
  'Em análise',
  'Sem reservas',
  'Plano Premium',
  'Plano Free',
  'Com saque pendente',
  'Com chamados',
  'Com reclamações',
  'Cadastro incompleto',
] as const;

type ArenaFilter = (typeof FILTERS)[number];

const STATUS_TONE: Record<ArenaStatus, PillTone> = {
  Ativa: 'green',
  'Em análise': 'yellow',
  Suspensa: 'red',
};

const PLAN_TONE: Record<ArenaPlan, PillTone> = {
  Premium: 'orange',
  Free: 'dim',
};

function riskTone(score: number | null): StatusTone | null {
  if (score == null) {
    return null;
  }
  if (score >= 70) {
    return 'red';
  }
  if (score >= 40) {
    return 'yellow';
  }
  return 'green';
}

/** Tela de Arenas do painel (protótipo BoArenasScreen): KPIs, alertas, tabela e visão operacional. */
@Component({
  selector: 'bo-panel-arenas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiMiniComponent,
    LineChartComponent,
    PillComponent,
    StatusDotComponent,
    IconComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Arenas" subtitle="1.248 arenas · atualizado há 2 min">
        <div class="header-actions">
          <div class="bo-search-box">
            <bo-icon name="search" [size]="15" />
            <span>Buscar…</span>
            <span class="kbd">⌘K</span>
          </div>
          <button type="button" class="bo-bell-btn" aria-label="Notificações">
            <bo-icon name="bell" [size]="17" />
            <span class="dot" aria-hidden="true"></span>
          </button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary">
            <bo-icon name="plus" [size]="14" />
            Nova arena
          </button>
        </div>
      </bo-page-header>

      <div class="bo-filter-bar">
        <bo-icon name="filter" [size]="14" style="color: var(--nx-text-dim); flex: none" />
        @for (f of filters; track f) {
          <button type="button" class="bo-chip" [class.active]="activeFilter() === f" (click)="activeFilter.set(f)">
            {{ f }}
          </button>
        }
      </div>

      <div class="body">
        <div class="kpi-grid">
          @for (kpi of kpis; track kpi.label) {
            <bo-kpi-mini [label]="kpi.label" [value]="kpi.value" [tone]="kpi.tone ?? 'neutral'" />
          }
        </div>

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

        <bo-panel-card pad="sm" title="Todas as arenas">
          <div class="table-actions" card-actions>
            <button type="button" class="bo-ghost-btn">
              <bo-icon name="download" [size]="14" />
              Exportar
            </button>
            <button type="button" class="bo-mini-btn">
              <bo-icon name="filter" [size]="13" />
              Filtros avançados
            </button>
          </div>

          @if (activeFilter() !== 'Todas') {
            <div class="results-hint">
              <span class="filter-badge">
                {{ activeFilter() }}
                <button type="button" aria-label="Limpar filtro" (click)="activeFilter.set('Todas')">✕</button>
              </span>
              Mostrando {{ filteredArenas().length }} de {{ arenas.length }} arenas
            </div>
          }

          <div class="table-head">
            <span>Arena</span>
            <span>Cidade</span>
            <span>Status</span>
            <span>Plano</span>
            <span class="right">Receita</span>
            <span class="right">Risco</span>
            <span class="right">Cadastro</span>
            <span class="right">Reservas</span>
            <span></span>
          </div>
          <div>
            @for (arena of filteredArenas(); track arena.name) {
              <div class="table-row">
                <div class="cell-name">{{ arena.name }}</div>
                <div class="cell-city">{{ arena.city }}</div>
                <div><bo-pill [tone]="statusTone[arena.status]">{{ arena.status }}</bo-pill></div>
                <div><bo-pill [tone]="planTone[arena.plan]">{{ arena.plan }}</bo-pill></div>
                <div class="right cell-revenue" [class.empty]="!arena.revenue">{{ arena.revenue || '—' }}</div>
                <div class="right">
                  @if (arena.risk == null) {
                    <span class="cell-risk-empty">—</span>
                  } @else {
                    <span class="cell-risk">
                      <bo-status-dot [tone]="risk(arena.risk)!" [size]="7" />
                      {{ arena.risk }}
                    </span>
                  }
                </div>
                <div class="right cell-dim">{{ arena.registeredAt }}</div>
                <div class="right cell-bookings">{{ arena.bookings }}</div>
                <div class="right">
                  @if (arena.status === 'Em análise') {
                    <button type="button" class="bo-mini-btn bo-mini-btn-primary">Aprovar</button>
                  } @else {
                    <button type="button" class="bo-ghost-btn">Ver</button>
                  }
                </div>
              </div>
            }
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
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

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

    .filter-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
      color: var(--nx-orange-500);
      border-radius: var(--nx-r-pill);
      padding: 2px 10px 2px 12px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .filter-badge button {
      background: transparent;
      border: none;
      cursor: pointer;
      color: inherit;
      display: grid;
      place-items: center;
      padding: 0;
      font: inherit;
    }

    .table-actions {
      display: flex;
      gap: 8px;
    }

    .results-hint {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.7fr 1fr 100px 78px 104px 92px 100px 84px 84px;
      gap: 8px;
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
      padding: 11px 4px;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .table-row .right {
      text-align: right;
    }

    .cell-name {
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-city {
      min-width: 0;
      font-size: 12.5px;
      color: var(--nx-text-mute);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-revenue {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      font-weight: 600;
      color: var(--nx-text);
    }

    .cell-revenue.empty {
      color: var(--nx-text-dim);
    }

    .cell-risk {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .cell-risk-empty {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    .cell-dim {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    .cell-bookings {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-text-mute);
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

    @media (max-width: 720px) {
      .kpi-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class PanelArenasComponent {
  protected readonly filters = FILTERS;
  protected readonly statusTone = STATUS_TONE;
  protected readonly planTone = PLAN_TONE;
  protected readonly risk = riskTone;

  protected readonly activeFilter = signal<ArenaFilter>('Todas');

  protected readonly kpis: KpiItem[] = [
    { label: 'Arenas totais', value: '1.248' },
    { label: 'Ativas', value: '1.197', tone: 'green' },
    { label: 'Em análise', value: '18', tone: 'yellow' },
    { label: 'Suspensas', value: '9', tone: 'red' },
    { label: 'Novas este mês', value: '46' },
    { label: 'Receita das arenas (GMV)', value: 'R$ 428k' },
    { label: 'Receita NexaGO', value: 'R$ 32,4k' },
    { label: 'Reservas hoje', value: '486' },
  ];

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

  protected readonly arenas: ArenaRow[] = [
    { name: 'Clube 5 Estrelas', city: 'Fortaleza · CE', status: 'Ativa', plan: 'Premium', revenue: 'R$ 21.100', risk: 15, registeredAt: '19/05/23', bookings: 470 },
    { name: 'Arena Ipanema Beach', city: 'Rio de Janeiro · RJ', status: 'Ativa', plan: 'Premium', revenue: 'R$ 18.400', risk: 8, registeredAt: '12/03/24', bookings: 412 },
    { name: 'Society Vitória', city: 'Vitória · ES', status: 'Ativa', plan: 'Premium', revenue: 'R$ 14.900', risk: 22, registeredAt: '03/11/23', bookings: 358 },
    { name: 'Praça Society BH', city: 'Belo Horizonte · MG', status: 'Ativa', plan: 'Premium', revenue: 'R$ 11.750', risk: 41, registeredAt: '07/02/24', bookings: 210 },
    { name: 'Beach Sports Recife', city: 'Recife · PE', status: 'Ativa', plan: 'Free', revenue: 'R$ 6.200', risk: 68, registeredAt: '14/01/25', bookings: 96 },
    { name: 'Arena do Sol', city: 'Salvador · BA', status: 'Ativa', plan: 'Free', revenue: 'R$ 3.400', risk: 75, registeredAt: '22/08/23', bookings: 58 },
    { name: 'Arena Quadra 10', city: 'Goiânia · GO', status: 'Em análise', plan: 'Free', revenue: null, risk: null, registeredAt: '28/06/26', bookings: 0 },
    { name: 'Arena Litoral Norte', city: 'Natal · RN', status: 'Em análise', plan: 'Free', revenue: null, risk: null, registeredAt: '30/06/26', bookings: 0 },
    { name: 'Beach Club Alphaville', city: 'São Paulo · SP', status: 'Suspensa', plan: 'Premium', revenue: 'R$ 0', risk: 88, registeredAt: '15/12/22', bookings: 2 },
    { name: 'Arena Bela Vista', city: 'Curitiba · PR', status: 'Suspensa', plan: 'Free', revenue: 'R$ 0', risk: 92, registeredAt: '02/09/22', bookings: 4 },
  ];

  protected readonly filteredArenas = computed(() => {
    switch (this.activeFilter()) {
      case 'Apenas ativas':
        return this.arenas.filter((a) => a.status === 'Ativa');
      case 'Apenas suspensas':
        return this.arenas.filter((a) => a.status === 'Suspensa');
      case 'Em análise':
        return this.arenas.filter((a) => a.status === 'Em análise');
      case 'Sem reservas':
        return this.arenas.filter((a) => a.bookings === 0);
      case 'Plano Premium':
        return this.arenas.filter((a) => a.plan === 'Premium');
      case 'Plano Free':
        return this.arenas.filter((a) => a.plan === 'Free');
      default:
        return this.arenas;
    }
  });

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

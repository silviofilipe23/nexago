import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { StatusDotComponent, type StatusTone } from '../ui/status-dot.component';

interface PendingItem {
  icon: 'arena' | 'cash' | 'flag' | 'mail';
  label: string;
  meta: string;
  count: string;
  tone: PillTone;
}

interface SystemStatusItem {
  name: string;
  state: string;
  tone: StatusTone;
  uptime: string;
}

interface ActivityItem {
  initials: string;
  sys: boolean;
  text: string;
  time: string;
}

function greetingFor(hour: number): string {
  if (hour < 12) {
    return 'Bom dia';
  }
  if (hour < 18) {
    return 'Boa tarde';
  }
  return 'Boa noite';
}

/** Home do painel (protótipo BoHomeScreen): KPIs, crescimento, pendências, status e atividade. */
@Component({
  selector: 'bo-panel-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiCardComponent,
    LineChartComponent,
    PillComponent,
    StatusDotComponent,
    IconComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header [title]="greetingTitle()" [subtitle]="todayLabel()">
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
          <div class="bo-avatar" style="width: 38px; height: 38px; font-size: 13px;" aria-hidden="true">
            {{ initials() }}
          </div>
        </div>
      </bo-page-header>

      <div class="body">
        <div class="kpi-row">
          <bo-kpi-card label="Atletas ativos" value="12.482" delta="8,4%" />
          <bo-kpi-card label="Arenas na base" value="317" delta="4,1%" />
          <bo-kpi-card label="Torneios ativos" value="58" delta="12,0%" />
          <bo-kpi-card label="Receita · Jul" value="R$ 214k" delta="2,3%" deltaTone="red" />
        </div>

        <div class="main-grid">
          <div class="col-left">
            <bo-panel-card kicker="Últimos 12 meses" title="Crescimento de atletas" class="chart-card">
              <div class="bo-chart-tabs" card-actions>
                <button type="button" class="active">Atletas</button>
                <button type="button">Reservas</button>
                <button type="button">Receita</button>
              </div>
              <bo-line-chart [height]="126" [data]="growthData" [months]="growthMonths" ariaLabel="Crescimento de atletas nos últimos 12 meses" />
            </bo-panel-card>

            <bo-panel-card title="Atividade recente" class="activity-card">
              <button type="button" class="bo-ghost-btn" card-actions>Ver tudo</button>
              <div class="list">
                @for (item of activity; track item.time) {
                  <div class="bo-row activity-row">
                    <div class="bo-activity-avatar" [class.sys]="item.sys" aria-hidden="true">{{ item.initials }}</div>
                    <div class="bo-log-text" [innerHTML]="item.text"></div>
                    <span class="bo-log-time">{{ item.time }}</span>
                  </div>
                }
              </div>
            </bo-panel-card>
          </div>

          <div class="col-right">
            <bo-panel-card pad="sm" title="Pendente de ação">
              <bo-pill tone="orange" card-actions>{{ totalPending() }}</bo-pill>
              <div class="list">
                @for (item of pending; track item.label) {
                  <div class="bo-row">
                    <div class="bo-row-icon">
                      <bo-icon [name]="item.icon" [size]="16" />
                    </div>
                    <div class="bo-row-body">
                      <div class="bo-row-title">{{ item.label }}</div>
                      <div class="bo-row-meta">{{ item.meta }}</div>
                    </div>
                    <bo-pill [tone]="item.tone">{{ item.count }}</bo-pill>
                    <bo-icon name="chevron-right" [size]="14" />
                  </div>
                }
              </div>
            </bo-panel-card>

            <bo-panel-card pad="sm" title="Status do sistema">
              <span class="status-summary" card-actions>
                <bo-status-dot tone="yellow" [size]="7" />
                Degradado
              </span>
              <div class="list">
                @for (item of systemStatus; track item.name) {
                  <div class="bo-status-row">
                    <bo-status-dot [tone]="item.tone" />
                    <span class="name">{{ item.name }}</span>
                    <span class="state" [class.warn]="item.tone !== 'green'">{{ item.state }}</span>
                    <span class="uptime">{{ item.uptime }}</span>
                  </div>
                }
              </div>
            </bo-panel-card>

            <bo-panel-card pad="sm" title="Atalhos" class="shortcuts-card">
              <div class="shortcuts-grid">
                <div class="bo-shortcut"><bo-icon name="plus" [size]="16" /><span>Nova arena</span></div>
                <div class="bo-shortcut"><bo-icon name="trophy" [size]="16" /><span>Criar torneio</span></div>
                <div class="bo-shortcut"><bo-icon name="mail" [size]="16" /><span>Convidar admin</span></div>
                <div class="bo-shortcut"><bo-icon name="download" [size]="16" /><span>Exportar</span></div>
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

    .kpi-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .main-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 372px;
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

    .list {
      display: flex;
      flex-direction: column;
      margin-top: -6px;
    }

    .status-summary {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-pending);
    }

    .shortcuts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    @media (max-width: 1180px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .kpi-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelHomeComponent {
  private readonly auth = inject(AuthService);

  protected readonly growthData = [4200, 4650, 5100, 5480, 6120, 6900, 7350, 8200, 9100, 10300, 11500, 12482];
  protected readonly growthMonths = ['Ago', 'Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul'];

  protected readonly pending: PendingItem[] = [
    { icon: 'arena', label: 'Arenas aguardando aprovação', meta: 'mais antiga há 2 dias', count: '4', tone: 'orange' },
    { icon: 'cash', label: 'Saques pra revisar', meta: 'R$ 12.400 no total', count: '7', tone: 'orange' },
    { icon: 'flag', label: 'Denúncias abertas', meta: '1 marcada urgente', count: '3', tone: 'red' },
    { icon: 'mail', label: 'Convites de equipe pendentes', meta: 'expiram em 5 dias', count: '2', tone: 'dim' },
  ];

  protected readonly systemStatus: SystemStatusItem[] = [
    { name: 'API core', state: 'Operacional', tone: 'green', uptime: '99,98%' },
    { name: 'App mobile', state: 'Operacional', tone: 'green', uptime: '99,95%' },
    { name: 'Pagamentos', state: 'Lentidão no PSP', tone: 'yellow', uptime: '98,71%' },
    { name: 'Notificações', state: 'Operacional', tone: 'green', uptime: '99,99%' },
  ];

  protected readonly activity: ActivityItem[] = [
    { initials: 'RM', sys: false, text: '<strong>Rafa Martins</strong> aprovou a arena <strong>Society 10</strong> · Recife', time: '14:32' },
    { initials: 'SYS', sys: true, text: 'Repasse de <strong>R$ 8.940</strong> processado pra 12 arenas', time: '13:05' },
    { initials: 'CN', sys: false, text: '<strong>Carla Nunes</strong> suspendeu o atleta <strong>&#64;pedrao.beach</strong> por denúncia', time: '11:48' },
    { initials: 'SYS', sys: true, text: 'Novo torneio publicado: <strong>Copa Verão</strong> — Arena Ipanema', time: '10:22' },
  ];

  protected readonly totalPending = computed(() =>
    this.pending.reduce((sum, item) => sum + Number(item.count), 0),
  );

  protected readonly greetingTitle = computed(() => {
    const source = this.auth.displayName() || this.auth.user()?.email || '';
    const firstName = source.split(/[\s@.]/)[0] || '';
    const greeting = greetingFor(new Date().getHours());
    return firstName ? `${greeting}, ${firstName}.` : `${greeting}.`;
  });

  protected readonly todayLabel = computed(() => {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(now).replace('.', '');
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(now).replace('.', '');
    return `${weekday} · ${date} · GMT-3`;
  });

  protected readonly initials = computed(() => {
    const name = this.auth.displayName() || this.auth.user()?.email || '·';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return '·';
    }
    const first = parts[0]![0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
    return (first + last).toUpperCase();
  });
}

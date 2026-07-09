import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { BarRowComponent } from '../ui/bar-row.component';
import { ChartTabsComponent } from '../ui/chart-tabs.component';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { initialsOf } from '../ui/initials';

type ChartTab = 'Faturamento' | 'Reservas' | 'Ocupação';

interface OccupancyRow {
  label: string;
  sub: string;
  pct: number;
  tone: 'orange' | 'green' | 'yellow' | 'red';
}

type ReservationStatus = 'confirmada' | 'pendente' | 'checkin';

interface ReservationRow {
  time: string;
  court: string;
  client: string;
  sport: string;
  status: ReservationStatus;
}

interface TournamentMini {
  name: string;
  sport: string;
  date: string;
  inscritos: number;
  vagas: number;
}

interface ReviewRow {
  initials: string;
  name: string;
  rating: number;
  text: string;
  time: string;
}

interface Shortcut {
  icon: 'plus' | 'download' | 'trophy' | 'edit';
  label: string;
}

const CHART_DATA: Record<ChartTab, number[]> = {
  Faturamento: [820, 940, 880, 1120, 990, 1340, 1240],
  Reservas: [9, 11, 8, 14, 12, 16, 14],
  Ocupação: [58, 64, 60, 72, 66, 82, 78],
};

const CHART_DAYS = ['Qua', 'Qui', 'Sex', 'Sáb', 'Dom', 'Seg', 'Ter'];

const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  confirmada: 'Confirmada',
  pendente: 'Pendente',
  checkin: 'Check-in',
};

const RESERVATION_STATUS_TONE: Record<ReservationStatus, PillTone> = {
  confirmada: 'green',
  pendente: 'yellow',
  checkin: 'orange',
};

function greetingFor(hour: number): string {
  if (hour < 12) {
    return 'Bom dia';
  }
  if (hour < 18) {
    return 'Boa tarde';
  }
  return 'Boa noite';
}

/** Tela Início do painel (protótipo ArInicioScreen): KPIs, gráfico, ocupação, reservas do dia, torneios e avaliações. */
@Component({
  selector: 'ar-panel-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiCardComponent,
    LineChartComponent,
    ChartTabsComponent,
    PillComponent,
    BarRowComponent,
    IconComponent,
  ],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="greetingTitle()" [subtitle]="subtitleLabel()">
        <div class="header-actions">
          <div class="ar-search-box">
            <ar-icon name="search" [size]="15" />
            <span>Buscar…</span>
            <span class="kbd">⌘K</span>
          </div>
          <button type="button" class="ar-bell-btn" aria-label="Notificações">
            <ar-icon name="bell" [size]="17" />
            <span class="dot" aria-hidden="true"></span>
          </button>
          <div class="avatar" aria-hidden="true">{{ initials() }}</div>
        </div>
      </ar-page-header>

      <div class="body">
        <div class="kpi-row">
          <ar-kpi-card label="Ocupação das quadras" value="78%" delta="6pp" icon="courts" />
          <ar-kpi-card label="Faturamento hoje" value="R$ 1.240" delta="14%" />
          <ar-kpi-card label="Reservas hoje" value="14" delta="2 pendentes" deltaTone="orange" />
          <ar-kpi-card label="Torneios ativos" value="2" delta="38 inscritos" deltaTone="flat" icon="trophy" />
          <ar-kpi-card label="Avaliação média" value="4.8" delta="23 avaliações" deltaTone="flat" icon="star" />
        </div>

        <div class="main-grid">
          <div class="col-left">
            <ar-panel-card kicker="Últimos 7 dias" title="Desempenho da operação" class="chart-card">
              <ar-chart-tabs [tabs]="chartTabs" [active]="chartTab()" (change)="chartTab.set($any($event))" card-actions />
              <ar-line-chart [height]="118" [data]="activeChartData()" [labels]="chartDays" />
            </ar-panel-card>

            <ar-panel-card title="Ocupação por quadra" class="bars-card">
              <button type="button" class="ar-ghost-btn" card-actions>Ver quadras</button>
              <div class="bars">
                @for (row of occupancy; track row.label; let last = $last) {
                  <ar-bar-row [label]="row.label" [sub]="row.sub" [pct]="row.pct" [tone]="row.tone" [last]="last" />
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Reservas de hoje" class="reservations-card">
              <button type="button" class="ar-ghost-btn" card-actions>Ver agenda</button>
              <div class="list">
                @for (r of reservations; track r.time) {
                  <div class="reservation-row">
                    <div class="reservation-time">{{ r.time }}</div>
                    <div class="reservation-body">
                      <div class="reservation-title">{{ r.court }} · {{ r.client }}</div>
                      <div class="reservation-sport">{{ r.sport }}</div>
                    </div>
                    <ar-pill [tone]="statusTone[r.status]">{{ statusLabel[r.status] }}</ar-pill>
                  </div>
                }
              </div>
            </ar-panel-card>
          </div>

          <div class="col-right">
            <ar-panel-card pad="sm" title="Torneios ativos">
              <button type="button" class="ar-ghost-btn" card-actions>Ver todos</button>
              <div class="list">
                @for (t of tournaments; track t.name) {
                  <div class="tournament-row">
                    <div class="tournament-icon">
                      <ar-icon name="trophy" [size]="17" />
                    </div>
                    <div class="tournament-body">
                      <div class="tournament-title">{{ t.name }}</div>
                      <div class="tournament-meta">{{ t.sport }} · {{ t.date }}</div>
                    </div>
                    <div class="tournament-stats">
                      <div class="tournament-count">{{ t.inscritos }}/{{ t.vagas }}</div>
                      <div class="tournament-pct">{{ pctFull(t) }}% cheio</div>
                    </div>
                  </div>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card pad="sm" title="Avaliações recentes" class="reviews-card">
              <ar-pill tone="orange" card-actions>4.8 ★</ar-pill>
              <div class="list">
                @for (rv of reviews; track rv.name) {
                  <div class="review-row">
                    <div class="review-avatar">{{ rv.initials }}</div>
                    <div class="review-body">
                      <div class="review-head">
                        <span class="review-name">{{ rv.name }}</span>
                        <span class="review-stars">
                          @for (i of starIndexes; track i) {
                            <ar-icon name="star" [size]="10" [style.color]="i < rv.rating ? 'var(--nx-orange-500)' : 'var(--nx-line-strong)'" />
                          }
                        </span>
                      </div>
                      <div class="review-text">{{ rv.text }}</div>
                    </div>
                    <span class="review-time">{{ rv.time }}</span>
                  </div>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card pad="sm" title="Atalhos">
              <div class="shortcuts-grid">
                @for (s of shortcuts; track s.label) {
                  <div class="ar-shortcut">
                    <ar-icon [name]="s.icon" [size]="16" />
                    <span>{{ s.label }}</span>
                  </div>
                }
              </div>
            </ar-panel-card>
          </div>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-orange-500);
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
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    .bars-card,
    .chart-card {
      flex: none;
    }

    .reservations-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .reviews-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .bars {
      margin-top: -4px;
    }

    .list {
      display: flex;
      flex-direction: column;
      margin-top: -6px;
    }

    .reservation-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .reservation-row:last-child {
      border-bottom: none;
    }

    .reservation-time {
      width: 50px;
      flex: none;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .reservation-body {
      flex: 1;
      min-width: 0;
    }

    .reservation-title {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }

    .reservation-sport {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .tournament-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .tournament-row:last-child {
      border-bottom: none;
    }

    .tournament-icon {
      width: 38px;
      height: 38px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }

    .tournament-body {
      flex: 1;
      min-width: 0;
    }

    .tournament-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .tournament-meta {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .tournament-stats {
      text-align: right;
      flex: none;
    }

    .tournament-count {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .tournament-pct {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .review-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .review-row:last-child {
      border-bottom: none;
    }

    .review-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      flex: none;
      margin-top: 1px;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 9.5px;
      color: var(--nx-orange-500);
    }

    .review-body {
      flex: 1;
      min-width: 0;
    }

    .review-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .review-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .review-stars {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }

    .review-text {
      font-size: 12px;
      line-height: 1.45;
      color: var(--nx-text-mute);
      margin-top: 3px;
    }

    .review-time {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      flex: none;
      margin-top: 2px;
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

  protected readonly chartTabs: ChartTab[] = ['Faturamento', 'Reservas', 'Ocupação'];
  protected readonly chartTab = signal<ChartTab>('Faturamento');
  protected readonly chartDays = CHART_DAYS;
  protected readonly activeChartData = computed(() => CHART_DATA[this.chartTab()]);

  protected readonly statusLabel = RESERVATION_STATUS_LABEL;
  protected readonly statusTone = RESERVATION_STATUS_TONE;
  protected readonly starIndexes = [0, 1, 2, 3, 4];

  protected readonly occupancy: OccupancyRow[] = [
    { label: 'Quadra 1', sub: 'Beach Tennis', pct: 92, tone: 'green' },
    { label: 'Quadra 2', sub: 'Vôlei de praia', pct: 84, tone: 'orange' },
    { label: 'Quadra 3', sub: 'Beach Soccer · manutenção', pct: 0, tone: 'red' },
  ];

  protected readonly reservations: ReservationRow[] = [
    { time: '09:00', court: 'Quadra 1', client: 'João S.', sport: 'Beach Tennis', status: 'confirmada' },
    { time: '10:00', court: 'Quadra 2', client: 'Maria T.', sport: 'Vôlei de praia', status: 'checkin' },
    { time: '11:30', court: 'Quadra 1', client: 'Enzo R.', sport: 'Beach Tennis', status: 'pendente' },
    { time: '14:00', court: 'Quadra 2', client: 'Camila S.', sport: 'Vôlei de praia', status: 'confirmada' },
  ];

  protected readonly tournaments: TournamentMini[] = [
    { name: 'Etapa garden', sport: 'Beach Tennis', date: '21/07', inscritos: 18, vagas: 24 },
    { name: 'Copa Goiás Beach', sport: 'Vôlei de praia', date: '04/08', inscritos: 20, vagas: 32 },
  ];

  protected readonly reviews: ReviewRow[] = [
    { initials: 'JS', name: 'João S.', rating: 5, text: 'Quadra muito bem cuidada, iluminação ótima à noite.', time: 'Hoje' },
    { initials: 'MT', name: 'Maria T.', rating: 4, text: 'Bom atendimento, só o estacionamento é apertado.', time: 'Ontem' },
    { initials: 'ER', name: 'Enzo R.', rating: 5, text: 'Melhor arena da região, sempre reservo aqui.', time: '2 dias' },
  ];

  protected readonly shortcuts: Shortcut[] = [
    { icon: 'plus', label: 'Nova reserva' },
    { icon: 'download', label: 'Solicitar saque' },
    { icon: 'trophy', label: 'Criar torneio' },
    { icon: 'edit', label: 'Editar perfil' },
  ];

  protected readonly greetingTitle = computed(() => {
    const source = this.auth.displayName() || this.auth.user()?.email || '';
    const firstName = source.split(/[\s@.]/)[0] || '';
    const greeting = greetingFor(new Date().getHours());
    return firstName ? `${greeting}, ${firstName}.` : `${greeting}.`;
  });

  protected readonly subtitleLabel = computed(() => {
    const arenaName = this.auth.displayName() || 'Arena';
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(now).replace('.', '');
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(now).replace('.', '');
    return `${arenaName} · ${weekday} · ${date}`;
  });

  protected readonly initials = computed(() => initialsOf(this.auth.displayName() || this.auth.user()?.email || '·'));

  protected pctFull(t: TournamentMini): number {
    return Math.round((t.inscritos / t.vagas) * 100);
  }
}

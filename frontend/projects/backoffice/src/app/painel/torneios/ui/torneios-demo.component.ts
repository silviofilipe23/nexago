import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BarRowComponent } from '../../ui/bar-row.component';
import { IconComponent, type PanelIconName } from '../../ui/icon.component';
import { LineChartComponent } from '../../ui/line-chart.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PillComponent, type PillTone } from '../../ui/pill.component';
import { StatusDotComponent, type StatusTone } from '../../ui/status-dot.component';

interface AttentionItem {
  name: string;
  problem: string;
  tone: 'red' | 'orange';
}

interface HealthItem {
  score: number;
  name: string;
  reason: string;
}

interface StatusDistItem {
  label: string;
  count: number;
  tone: PillTone;
}

interface RankItem {
  name: string;
  city: string;
  enrolled: number;
}

interface ScheduleGroup {
  label: string;
  items: { time: string; name: string }[];
}

interface LiveStat {
  label: string;
  value: string;
  tone?: 'red';
}

interface AlertItem {
  label: string;
  count: string;
  tone: PillTone;
}

interface CalendarCell {
  day: number;
  total: number;
  dots: CalendarTone[];
}

type CalendarTone = 'green' | 'yellow' | 'orange' | 'red' | 'dim';

const CALENDAR_COUNTS: Record<number, Partial<Record<CalendarTone, number>>> = {
  3: { green: 2 },
  5: { yellow: 2, orange: 1 },
  6: { orange: 1 },
  10: { green: 3, yellow: 1 },
  11: { green: 2 },
  12: { green: 4, yellow: 1 },
  18: { green: 1 },
  28: { dim: 1 },
  30: { red: 1 },
};

function buildCalendar(): (CalendarCell | null)[] {
  const leadDays = 3;
  const cells: (CalendarCell | null)[] = Array.from({ length: leadDays }, () => null);
  for (let day = 1; day <= 31; day++) {
    const counts = CALENDAR_COUNTS[day] ?? {};
    const entries = Object.entries(counts) as [CalendarTone, number][];
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    const dots = entries.filter(([, value]) => value > 0).map(([tone]) => tone).slice(0, 3);
    cells.push({ day, total, dots });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}
function healthTone(score: number): StatusTone {
  if (score >= 90) {
    return 'green';
  }
  if (score >= 50) {
    return 'yellow';
  }
  return 'red';
}

/**
 * Painéis de apoio da tela de Torneios — atenção, status, calendário,
 * crescimento, organizadores, categorias, saúde, alertas, próximos, populares
 * e ao vivo.
 *
 * TUDO AQUI É DADO DE EXEMPLO: nada disso é calculado do Firestore hoje. Fica
 * isolado para não se misturar com a tabela real de torneios.
 */
@Component({
  selector: 'bo-torneios-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelCardComponent,
    LineChartComponent,
    BarRowComponent,
    PillComponent,
    StatusDotComponent,
    IconComponent,
  ],
  template: `
    <bo-panel-card pad="sm" kicker="Priorize por aqui" title="Torneios que precisam de atenção">
      <bo-pill tone="red" card-actions>{{ attention.length }}</bo-pill>
      <div>
        @for (a of attention; track a.name) {
          <div class="attention-row">
            <div class="attention-icon" [class.danger]="a.tone === 'red'">
              <bo-icon name="alert" [size]="14" />
            </div>
            <div class="attention-body">
              <div class="attention-name">{{ a.name }}</div>
              <div class="attention-problem">{{ a.problem }}</div>
            </div>
            <button type="button" class="bo-mini-btn">Resolver</button>
          </div>
        }
      </div>
    </bo-panel-card>

    <div class="secondary-grid">
      <div class="col-left">
        <bo-panel-card kicker="Distribuição atual" title="Status dos torneios">
          <div>
            @for (s of statusDist; track s.label) {
              <div class="status-bar-row">
                <span class="status-bar-label">{{ s.label }}</span>
                <div class="status-bar-track">
                  <div class="status-bar-fill" [class]="'tone-' + s.tone" [style.width.%]="barPct(s.count)"></div>
                </div>
                <span class="status-bar-count">{{ s.count }}</span>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card kicker="Julho · 2026" title="Calendário de torneios">
          <button type="button" class="bo-ghost-btn" card-actions>Ver agenda completa</button>
          <div class="calendar">
            <div class="cal-weekdays">
              @for (w of weekdays; track w) {
                <span>{{ w }}</span>
              }
            </div>
            <div class="cal-grid">
              @for (cell of calendarDays; track $index) {
                @if (cell) {
                  <div class="cal-cell" [class.has-events]="cell.total > 0">
                    <span class="cal-day">{{ cell.day }}</span>
                    @if (cell.total > 0) {
                      <div class="cal-dots">
                        @for (tone of cell.dots; track tone) {
                          <span class="cal-dot" [class]="'tone-' + tone"></span>
                        }
                        <span class="cal-count">{{ cell.total }}</span>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="cal-cell-empty"></div>
                }
              }
            </div>
          </div>
        </bo-panel-card>

        <bo-panel-card kicker="Últimos 5 meses" title="Crescimento">
          <div class="bo-chart-tabs" card-actions>
            <button type="button" class="active">Novos</button>
            <button type="button">Inscrições</button>
            <button type="button">Receita</button>
          </div>
          <bo-line-chart [height]="126" [data]="growthData" [months]="growthMonths" ariaLabel="Crescimento de torneios nos últimos 5 meses" />
        </bo-panel-card>

        <bo-panel-card kicker="Por organizador" title="Organizadores mais ativos">
          <div>
            @for (o of organizers; track o.city; let last = $last) {
              <bo-bar-row [label]="o.city" [count]="o.count" [max]="organizers[0].count" [last]="last" />
            }
          </div>
        </bo-panel-card>

        <bo-panel-card kicker="Por categoria" title="Categorias mais utilizadas">
          <div>
            @for (c of categories; track c.city; let last = $last) {
              <bo-bar-row [label]="c.city" [count]="c.count" [max]="categories[0].count" [last]="last" />
            }
          </div>
        </bo-panel-card>
      </div>

      <div class="col-right">
        <bo-panel-card pad="sm" kicker="Score automático" title="Saúde dos torneios" class="health-card">
          <div>
            @for (h of health; track h.name) {
              <div class="health-row">
                <div class="health-score" [class]="'tone-' + healthToneOf(h.score)">{{ h.score }}</div>
                <div class="health-body">
                  <div class="health-name">{{ h.name }}</div>
                  <div class="health-reason">{{ h.reason }}</div>
                </div>
                <bo-status-dot [tone]="healthToneOf(h.score)" [size]="7" />
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Alertas">
          <bo-pill tone="red" card-actions>7</bo-pill>
          <div>
            @for (item of alerts; track item.label) {
              <div class="bo-row">
                <div class="bo-row-icon" [class.danger]="item.tone === 'red'">
                  <bo-icon name="alert" [size]="14" />
                </div>
                <div class="bo-row-body">
                  <div class="bo-row-title">{{ item.label }}</div>
                </div>
                <bo-pill [tone]="item.tone">{{ item.count }}</bo-pill>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Próximos torneios">
          <button type="button" class="bo-ghost-btn" card-actions>Ver todos</button>
          <div>
            @for (group of schedule; track group.label; let last = $last) {
              <div class="schedule-group" [class.last]="last">
                <div class="schedule-label">{{ group.label }}</div>
                @for (item of group.items; track item.time + item.name) {
                  <div class="schedule-item">
                    <span class="schedule-time">{{ item.time }}</span>
                    <span class="schedule-name">{{ item.name }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Mais populares">
          <button type="button" class="bo-ghost-btn" card-actions>Ver ranking</button>
          <div>
            @for (p of popular; track p.name; let i = $index; let last = $last) {
              <div class="rank-row">
                <div class="rank-badge" [class.top]="i < 3">{{ i + 1 }}</div>
                <div class="rank-body">
                  <div class="rank-name">{{ p.name }}</div>
                  <div class="rank-city">{{ p.city }}</div>
                </div>
                <div class="rank-stats">
                  <div class="rank-value">{{ p.enrolled }}</div>
                  <div class="rank-unit">atletas</div>
                </div>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" kicker="Torneios acontecendo agora" title="Ao vivo">
          <span class="live-summary" card-actions>
            <bo-status-dot tone="red" [size]="7" />
            12 EVENTOS
          </span>
          <div class="live-grid">
            @for (stat of liveStats; track stat.label) {
              <div class="live-stat">
                <div class="live-label">{{ stat.label }}</div>
                <div class="live-value" [class.tone-red]="stat.tone === 'red'">{{ stat.value }}</div>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Ações rápidas">
          <div class="shortcuts-grid">
            <div class="bo-shortcut"><bo-icon name="plus" [size]="16" /><span>Novo torneio</span></div>
            <div class="bo-shortcut"><bo-icon name="swap" [size]="16" /><span>Duplicar</span></div>
            <div class="bo-shortcut"><bo-icon name="download" [size]="16" /><span>Exportar</span></div>
            <div class="bo-shortcut"><bo-icon name="archive" [size]="16" /><span>Importar</span></div>
            <div class="bo-shortcut"><bo-icon name="ban" [size]="16" /><span>Cancelar</span></div>
            <div class="bo-shortcut"><bo-icon name="trash" [size]="16" /><span>Excluir</span></div>
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

    .attention-problem {
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    .status-bar-label {
      width: 156px;
      flex: none;
      font-size: 12.5px;
      font-weight: 500;
      color: var(--nx-text);
    }

    .status-bar-track {
      flex: 1;
      height: 9px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .status-bar-count {
      width: 32px;
      flex: none;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .status-bar-fill {
      height: 100%;
      border-radius: 4px;
      background: var(--nx-text-dim);
    }

    .cal-cell-empty {
      height: 46px;
    }

    .attention-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .secondary-grid {
      display: grid;
      grid-template-columns: 1fr 372px;
      gap: 16px;
      align-items: start;
    }

    .schedule-group {
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .shortcuts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .status-bar-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .attention-icon {
      width: 30px;
      height: 30px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.28);
      display: grid;
      place-items: center;
      color: var(--nx-orange-500);
    }

    .schedule-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
      margin-bottom: 8px;
    }

    .attention-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }

    .schedule-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 5px 0;
    }

    .health-reason {
      font-size: 11.5px;
      line-height: 1.4;
      color: var(--nx-text-dim);
    }

    .schedule-time {
      flex: none;
      width: 48px;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      font-weight: 700;
      color: var(--nx-text-mute);
    }

    .schedule-name {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .attention-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .health-score {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      flex: none;
      margin-top: 1px;
      display: grid;
      place-items: center;
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 12.5px;
    }

    .live-summary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: var(--nx-live);
    }

    .cal-weekdays {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      margin-bottom: 6px;
    }

    .health-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .health-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .health-card {
      box-shadow: 0 0 0 1px rgba(255, 59, 48, 0.14);
    }

    .live-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .live-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
    }

    .health-row {
      display: flex;
      align-items: flex-start;
      gap: 11px;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .rank-stats {
      flex: none;
      text-align: right;
    }

    .rank-value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text);
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

    .rank-city {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .cal-count {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 700;
      color: var(--nx-text-dim);
    }

    .rank-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .rank-unit {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
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

    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .live-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px 12px;
    }

    .live-stat {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .cal-cell {
      height: 46px;
      border-radius: 8px;
      padding: 5px 6px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .rank-row {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .calendar {
      display: flex;
      flex-direction: column;
    }

    .cal-dots {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
    }

    .cal-day {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      color: var(--nx-text-dim);
    }

    .cal-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    @media (max-width: 1180px) {
      .secondary-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class TorneiosDemoComponent {

  protected readonly attention: AttentionItem[] = [
    { name: 'Open Goiás', problem: 'Inscrições encerram hoje', tone: 'red' },
    { name: 'Copa Verão', problem: 'Sem chave gerada', tone: 'orange' },
    { name: 'Master Cup', problem: 'Pagamento pendente', tone: 'orange' },
    { name: 'Arena Sul Open', problem: 'Categorias vazias', tone: 'orange' },
    { name: 'Liga Centro Oeste', problem: 'Partidas atrasadas', tone: 'red' },
  ];

  protected readonly statusDist: StatusDistItem[] = [
    { label: 'Ativos', count: 128, tone: 'green' },
    { label: 'Aguardando inscrições', count: 41, tone: 'yellow' },
    { label: 'Em andamento', count: 24, tone: 'orange' },
    { label: 'Finalizados', count: 84, tone: 'dim' },
    { label: 'Cancelados', count: 3, tone: 'red' },
  ];

  protected readonly growthMonths = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai'];

  protected readonly organizers = [
    { city: 'Beach Sports', count: 15 },
    { city: 'Arena Sunset', count: 12 },
    { city: 'Federação Goiana', count: 8 },
    { city: 'Arena ABC', count: 6 },
    { city: 'Society Vitória', count: 4 },
  ];

  protected readonly categories = [
    { city: 'Masculino A', count: 312 },
    { city: 'Masculino B', count: 280 },
    { city: 'Feminino A', count: 245 },
    { city: 'Misto', count: 180 },
  ];

  protected readonly health: HealthItem[] = [
    { score: 98, name: 'Open Goiás', reason: 'Tudo configurado' },
    { score: 76, name: 'Master Cup', reason: 'Falta gerar chave de 2 categorias' },
    { score: 58, name: 'Copa Verão', reason: 'Muitos pagamentos pendentes' },
    { score: 32, name: 'Arena Sul Open', reason: 'Sem quadras, categorias incompletas e inscrições encerrando hoje' },
    { score: 91, name: 'Arena Sunset Open', reason: 'Operação saudável' },
  ];

  protected readonly alerts: AlertItem[] = [
    { label: 'Torneio sem arena', count: '4', tone: 'orange' },
    { label: 'Categoria sem vagas', count: '6', tone: 'orange' },
    { label: 'Pagamento pendente', count: '9', tone: 'red' },
    { label: 'Sem árbitro', count: '3', tone: 'orange' },
    { label: 'Sem chave gerada', count: '5', tone: 'orange' },
    { label: 'Inscrições encerram hoje', count: '2', tone: 'red' },
    { label: 'Torneio começa amanhã', count: '1', tone: 'orange' },
  ];

  protected readonly popular: RankItem[] = [
    { name: 'Open Goiás', city: 'Goiânia · GO', enrolled: 248 },
    { name: 'Arena Sunset Open', city: 'São Paulo · SP', enrolled: 183 },
    { name: 'Torneio Junho Finais', city: 'Vitória · ES', enrolled: 210 },
  ];

  protected readonly weekdays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

  protected readonly healthToneOf = healthTone;

  protected readonly liveStats: LiveStat[] = [
    { label: 'Jogos acontecendo', value: '12' },
    { label: 'Jogos finalizados', value: '84' },
    { label: 'Jogos atrasados', value: '3', tone: 'red' },
    { label: 'Quadras ocupadas', value: '91%' },
    { label: 'Tempo médio/jogo', value: '34 min' },
  ];

  protected readonly schedule: ScheduleGroup[] = [
    { label: 'Hoje', items: [{ time: '08:00', name: 'Open Goiás' }] },
    { label: 'Amanhã', items: [{ time: '09:00', name: 'Master Cup' }] },
    { label: 'Domingo', items: [{ time: '07:30', name: 'Liga Centro Oeste' }, { time: '14:00', name: 'Copa Verão' }] },
  ];

  protected readonly barPct = (count: number): number => (count / this.statusDist[0]!.count) * 100;

  protected readonly calendarDays = buildCalendar();

  protected readonly growthData = [12, 18, 31, 48, 76];
}

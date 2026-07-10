import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type PeriodKey = '7d' | '30d' | 'month' | 'lastMonth' | 'custom';
type CourtKey = 'all' | 'q1' | 'q2' | 'q3';
type GroupKey = 'day' | 'week' | 'month' | 'court' | 'payment';
type MetricKey = 'revenue' | 'reservations' | 'commands' | 'platformFee' | 'withdrawals';
type ExportFormat = 'pdf' | 'csv';
type PreviewMetric = 'revenue' | 'reservations';

interface ChipOption<T extends string> {
  key: T;
  label: string;
}

interface RecentReport {
  id: number;
  label: string;
  generatedLabel: string;
  format: ExportFormat;
}

const PERIOD_OPTIONS: ChipOption<PeriodKey>[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês passado' },
  { key: 'custom', label: 'Personalizado' },
];

const COURT_OPTIONS: ChipOption<CourtKey>[] = [
  { key: 'all', label: 'Todas' },
  { key: 'q1', label: 'Quadra 1' },
  { key: 'q2', label: 'Quadra 2' },
  { key: 'q3', label: 'Quadra 3' },
];

const GROUP_OPTIONS: ChipOption<GroupKey>[] = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
  { key: 'court', label: 'Quadra' },
  { key: 'payment', label: 'Forma de pagamento' },
];

const METRIC_OPTIONS: ChipOption<MetricKey>[] = [
  { key: 'revenue', label: 'Faturamento' },
  { key: 'reservations', label: 'Reservas' },
  { key: 'commands', label: 'Comandas' },
  { key: 'platformFee', label: 'Taxa da plataforma' },
  { key: 'withdrawals', label: 'Saques' },
];

const EXPORT_OPTIONS: ChipOption<ExportFormat>[] = [
  { key: 'pdf', label: 'PDF' },
  { key: 'csv', label: 'CSV' },
];

const PREVIEW_DAYS = ['Qua', 'Qui', 'Sex', 'Sáb', 'Dom', 'Seg', 'Ter'];
const REVENUE_PREVIEW = [820, 940, 880, 1120, 990, 1340, 1240];
const RESERVATIONS_PREVIEW = [16, 19, 17, 22, 18, 26, 24];

const FORMAT_LABEL: Record<ExportFormat, string> = { pdf: 'PDF', csv: 'CSV' };
const FORMAT_TONE: Record<ExportFormat, PillTone> = { pdf: 'orange', csv: 'dim' };

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/** Tela "Relatórios customizados" do painel (protótipo ArFinanceReportsScreen): monta e exporta relatórios a partir de período/filtros/métricas. */
@Component({
  selector: 'ar-panel-finance-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, LineChartComponent, PillComponent, IconComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Relatórios" [subtitle]="arenaName() + ' · monte um relatório customizado'">
        <a routerLink="/painel/financeiro" class="back-link">
          <ar-icon name="chevron-right" [size]="14" style="transform: rotate(180deg)" />
          Voltar ao Financeiro
        </a>
      </ar-page-header>

      <div class="body">
        <div class="col-left">
          <ar-panel-card title="Período">
            <div class="field-label">Intervalo</div>
            <div class="ar-filter-bar">
              @for (opt of periodOptions; track opt.key) {
                <button type="button" class="ar-chip" [class.active]="period() === opt.key" (click)="period.set(opt.key)">{{ opt.label }}</button>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card title="Filtros">
            <div class="field-label">Quadra</div>
            <div class="ar-filter-bar filter-block">
              @for (opt of courtOptions; track opt.key) {
                <button type="button" class="ar-chip" [class.active]="court() === opt.key" (click)="court.set(opt.key)">{{ opt.label }}</button>
              }
            </div>

            <div class="field-label">Agrupar por</div>
            <div class="ar-filter-bar">
              @for (opt of groupOptions; track opt.key) {
                <button type="button" class="ar-chip" [class.active]="groupBy() === opt.key" (click)="groupBy.set(opt.key)">{{ opt.label }}</button>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card title="Métricas">
            <div class="field-label">Incluir no relatório</div>
            <div class="ar-filter-bar">
              @for (opt of metricOptions; track opt.key) {
                <button type="button" class="ar-chip" [class.active]="metrics().has(opt.key)" (click)="toggleMetric(opt.key)">{{ opt.label }}</button>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card title="Formato de exportação">
            <div class="field-label">Arquivo</div>
            <div class="ar-filter-bar filter-block">
              @for (opt of exportOptions; track opt.key) {
                <button type="button" class="ar-chip" [class.active]="exportFormat() === opt.key" (click)="exportFormat.set(opt.key)">{{ opt.label }}</button>
              }
            </div>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary generate-btn" (click)="generateReport()">
              <ar-icon name="download" [size]="14" />
              Gerar relatório
            </button>
          </ar-panel-card>
        </div>

        <div class="col-right">
          <ar-panel-card [kicker]="previewKicker()" title="Prévia">
            <ar-line-chart [height]="180" [data]="previewData()" [labels]="previewDays" />
            <div class="legend">
              @for (opt of previewMetricOptions; track opt.key) {
                <button type="button" class="ar-chip legend-chip" [class.active]="previewMetric() === opt.key" (click)="previewMetric.set(opt.key)">
                  <span class="dot"></span>
                  {{ opt.label }}
                </button>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card title="Resumo do período">
            <div class="summary-grid">
              @for (s of summary; track s.label) {
                <div class="summary-item">
                  <div class="summary-label">{{ s.label }}</div>
                  <div class="summary-value">{{ s.value }}</div>
                </div>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card [kicker]="recentKicker()" title="Relatórios recentes" class="recent-card">
            <div class="recent-list">
              @for (r of recentReports(); track r.id) {
                <div class="recent-row">
                  <div class="recent-icon">
                    <ar-icon name="download" [size]="14" />
                  </div>
                  <div class="recent-body">
                    <div class="recent-label">{{ r.label }}</div>
                    <div class="recent-date">{{ r.generatedLabel }}</div>
                  </div>
                  <ar-pill [tone]="formatTone[r.format]">{{ formatLabel[r.format] }}</ar-pill>
                </div>
              }
            </div>
          </ar-panel-card>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      text-decoration: none;
      white-space: nowrap;
    }

    .back-link:hover {
      color: var(--nx-text);
    }

    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 373px 1fr;
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

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .filter-block {
      margin-bottom: 18px;
    }

    .generate-btn {
      width: 100%;
      justify-content: center;
      margin-top: 16px;
    }

    .legend {
      display: flex;
      gap: 8px;
      margin-top: 14px;
    }

    .legend-chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .legend-chip .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      flex: none;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 8px;
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .recent-card {
      flex: 1;
      min-height: 0;
    }

    .recent-list {
      display: flex;
      flex-direction: column;
    }

    .recent-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .recent-row:last-child {
      border-bottom: none;
    }

    .recent-icon {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-dim);
    }

    .recent-body {
      flex: 1;
      min-width: 0;
    }

    .recent-label {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .recent-date {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .summary-grid {
        grid-template-columns: repeat(2, 1fr);
        row-gap: 18px;
      }
    }
  `,
})
export class PanelFinanceReportsComponent {
  private readonly auth = inject(AuthService);

  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly courtOptions = COURT_OPTIONS;
  protected readonly groupOptions = GROUP_OPTIONS;
  protected readonly metricOptions = METRIC_OPTIONS;
  protected readonly exportOptions = EXPORT_OPTIONS;
  protected readonly previewDays = PREVIEW_DAYS;
  protected readonly formatLabel = FORMAT_LABEL;
  protected readonly formatTone = FORMAT_TONE;

  protected readonly previewMetricOptions: ChipOption<PreviewMetric>[] = [
    { key: 'revenue', label: 'Faturamento' },
    { key: 'reservations', label: 'Reservas' },
  ];

  protected readonly summary = [
    { label: 'Faturamento', value: formatBRL(7330) },
    { label: 'Reservas', value: '146' },
    { label: 'Comandas', value: '612' },
    { label: 'Ticket médio', value: formatBRL(50.2) },
  ];

  protected readonly period = signal<PeriodKey>('30d');
  protected readonly court = signal<CourtKey>('all');
  protected readonly groupBy = signal<GroupKey>('day');
  protected readonly metrics = signal<Set<MetricKey>>(new Set<MetricKey>(['revenue', 'reservations']));
  protected readonly exportFormat = signal<ExportFormat>('pdf');
  protected readonly previewMetric = signal<PreviewMetric>('revenue');

  protected readonly recentReports = signal<RecentReport[]>([
    { id: 1, label: 'Faturamento por quadra · Jun/2026', generatedLabel: '01 Jul, 08:14', format: 'pdf' },
    { id: 2, label: 'Reservas × Comandas · 30 dias', generatedLabel: '28 Jun, 17:40', format: 'csv' },
    { id: 3, label: 'Extrato completo · Q2 2026', generatedLabel: '30 Jun, 09:00', format: 'pdf' },
  ]);

  protected readonly previewData = computed(() => (this.previewMetric() === 'revenue' ? REVENUE_PREVIEW : RESERVATIONS_PREVIEW));

  protected readonly previewKicker = computed(() => {
    const period = this.periodOptions.find((o) => o.key === this.period())!.label;
    const court = this.courtOptions.find((o) => o.key === this.court())!.label;
    const group = this.groupOptions.find((o) => o.key === this.groupBy())!.label;
    return `${period} · ${court} · Agrupado por ${group.toLowerCase()}`;
  });

  protected readonly recentKicker = computed(() => `${this.recentReports().length} gerados`);

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected toggleMetric(key: MetricKey): void {
    this.metrics.update((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  protected generateReport(): void {
    const metricLabels = this.metricOptions.filter((o) => this.metrics().has(o.key)).map((o) => o.label);
    const periodLabel = this.periodOptions.find((o) => o.key === this.period())!.label;
    const label = `${metricLabels.length ? metricLabels.join(' × ') : 'Relatório'} · ${periodLabel}`;
    const generatedLabel = new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

    this.recentReports.update((current) => [
      { id: Date.now(), label, generatedLabel, format: this.exportFormat() },
      ...current,
    ]);
  }
}

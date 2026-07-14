import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { buildMovementsCsv, downloadCsv } from './finance-csv';
import { buildDailyTotals, filterMovementsByPeriod, mergeFinanceMovements, type FinancePeriodKey } from './finance-movements';
import { formatBRL } from './finance.model';
import { fetchLedgerEntries, fetchWithdrawals } from './finance-repository';

type GroupKey = 'day' | 'week' | 'month' | 'court' | 'payment';
type MetricKey = 'revenue' | 'reservations' | 'commands' | 'platformFee' | 'withdrawals';
type ExportFormat = 'pdf' | 'csv';
type PreviewMetric = 'revenue' | 'reservations';
type PeriodOptionKey = FinancePeriodKey | 'custom';

interface ChipOption<T extends string> {
  key: T;
  label: string;
  disabled?: boolean;
}

interface RecentReport {
  id: number;
  label: string;
  generatedLabel: string;
  format: ExportFormat;
}

const PERIOD_OPTIONS: ChipOption<PeriodOptionKey>[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês passado' },
  { key: 'custom', label: 'Personalizado', disabled: true },
];

const GROUP_OPTIONS: ChipOption<GroupKey>[] = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana', disabled: true },
  { key: 'month', label: 'Mês', disabled: true },
  { key: 'court', label: 'Quadra', disabled: true },
  { key: 'payment', label: 'Forma de pagamento', disabled: true },
];

const METRIC_OPTIONS: ChipOption<MetricKey>[] = [
  { key: 'revenue', label: 'Faturamento' },
  { key: 'reservations', label: 'Reservas' },
  { key: 'commands', label: 'Comandas', disabled: true },
  { key: 'platformFee', label: 'Taxa da plataforma' },
  { key: 'withdrawals', label: 'Saques' },
];

const EXPORT_OPTIONS: ChipOption<ExportFormat>[] = [
  { key: 'pdf', label: 'PDF', disabled: true },
  { key: 'csv', label: 'CSV' },
];

const PREVIEW_METRIC_OPTIONS: ChipOption<PreviewMetric>[] = [
  { key: 'revenue', label: 'Faturamento' },
  { key: 'reservations', label: 'Reservas' },
];

const FORMAT_LABEL: Record<ExportFormat, string> = { pdf: 'PDF', csv: 'CSV' };
const FORMAT_TONE: Record<ExportFormat, PillTone> = { pdf: 'orange', csv: 'dim' };

const LEDGER_HISTORY_TAKE = 200;
const WITHDRAWAL_HISTORY_TAKE = 100;

const CREDIT_METRIC_KEYS: readonly MetricKey[] = ['revenue', 'reservations', 'platformFee'];

/** Tela "Relatórios" do painel: filtra as mesmas movimentações reais do Financeiro (carteira +
 *  saques) por período e exporta em CSV. Filtro por quadra e agrupamento por
 *  semana/mês/forma-de-pagamento ficam desabilitados nesta rodada — não existe registro de
 *  forma de pagamento por reserva, e filtro por quadra foi deixado fora do escopo (ver spec
 *  `docs/superpowers/specs/2026-07-14-arena-financeiro-real-design.md`). */
@Component({
  selector: 'ar-panel-finance-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, LineChartComponent, PillComponent, IconComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Relatórios" [subtitle]="arenaName() + ' · relatório a partir da carteira e dos saques'">
        <a routerLink="/painel/financeiro" class="back-link">
          <ar-icon name="chevron-right" [size]="14" style="transform: rotate(180deg)" />
          Voltar ao Financeiro
        </a>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <div class="state-wrap">
            <ar-panel-card pad="lg">
              <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
            </ar-panel-card>
          </div>
        } @else if (arenaLoading() || loading()) {
          <div class="state-wrap">
            <ar-panel-card pad="lg">
              <p class="state-text">Carregando histórico…</p>
            </ar-panel-card>
          </div>
        } @else if (errorMessage(); as err) {
          <div class="state-wrap">
            <ar-panel-card pad="lg">
              <p class="state-text">{{ err }}</p>
              <button type="button" class="ar-mini-btn" (click)="retry()">Tentar de novo</button>
            </ar-panel-card>
          </div>
        } @else {
          <div class="col-left">
            <ar-panel-card title="Período">
              <div class="field-label">Intervalo</div>
              <div class="ar-filter-bar">
                @for (opt of periodOptions; track opt.key) {
                  <button type="button" class="ar-chip" [class.active]="period() === opt.key" [class.disabled]="opt.disabled" (click)="selectPeriod(opt)">
                    {{ opt.label }}
                  </button>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Filtros">
              <div class="field-label">Quadra</div>
              <p class="state-text filter-note">Filtro por quadra chega em uma próxima versão — o relatório considera todas.</p>

              <div class="field-label">Agrupar por</div>
              <div class="ar-filter-bar">
                @for (opt of groupOptions; track opt.key) {
                  <button type="button" class="ar-chip" [class.active]="groupBy() === opt.key" [class.disabled]="opt.disabled" (click)="selectGroup(opt)">
                    {{ opt.label }}
                  </button>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Métricas">
              <div class="field-label">Incluir no relatório</div>
              <div class="ar-filter-bar">
                @for (opt of metricOptions; track opt.key) {
                  <button type="button" class="ar-chip" [class.active]="metrics().has(opt.key)" [class.disabled]="opt.disabled" (click)="toggleMetric(opt.key)">
                    {{ opt.label }}
                  </button>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Formato de exportação">
              <div class="field-label">Arquivo</div>
              <div class="ar-filter-bar filter-block">
                @for (opt of exportOptions; track opt.key) {
                  <button type="button" class="ar-chip" [class.active]="exportFormat() === opt.key" [class.disabled]="opt.disabled" (click)="selectExportFormat(opt)">
                    {{ opt.label }}
                  </button>
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
              <ar-line-chart [height]="180" [data]="previewData()" [labels]="previewDays()" />
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
                @for (s of summary(); track s.label) {
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
                } @empty {
                  <p class="state-text">Nenhum relatório gerado nesta sessão ainda.</p>
                }
              </div>
            </ar-panel-card>
          </div>
        }
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

    .state-wrap {
      grid-column: 1 / -1;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0 0 12px;
    }

    .filter-note {
      margin-bottom: 18px;
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

    .ar-chip.disabled {
      opacity: 0.4;
      pointer-events: none;
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
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly groupOptions = GROUP_OPTIONS;
  protected readonly metricOptions = METRIC_OPTIONS;
  protected readonly exportOptions = EXPORT_OPTIONS;
  protected readonly previewMetricOptions = PREVIEW_METRIC_OPTIONS;
  protected readonly formatLabel = FORMAT_LABEL;
  protected readonly formatTone = FORMAT_TONE;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly period = signal<FinancePeriodKey>('30d');
  protected readonly groupBy = signal<GroupKey>('day');
  protected readonly metrics = signal<Set<MetricKey>>(new Set<MetricKey>(['revenue', 'reservations']));
  protected readonly exportFormat = signal<ExportFormat>('csv');
  protected readonly previewMetric = signal<PreviewMetric>('revenue');

  private readonly allMovements = signal<ReturnType<typeof mergeFinanceMovements>>([]);
  protected readonly recentReports = signal<RecentReport[]>([]);

  protected readonly periodMovements = computed(() => filterMovementsByPeriod(this.allMovements(), this.period()));

  /** Só entram no relatório (resumo + CSV) os tipos de lançamento cobertos por alguma métrica
   *  selecionada — créditos (reserva) se Faturamento/Reservas/Taxa estiver marcado, débitos
   *  (saque) se Saques estiver marcado. */
  protected readonly reportMovements = computed(() => {
    const selected = this.metrics();
    const includeCredits = CREDIT_METRIC_KEYS.some((k) => selected.has(k));
    const includeDebits = selected.has('withdrawals');
    return this.periodMovements().filter((m) => (m.type === 'credit' ? includeCredits : includeDebits));
  });

  protected readonly summary = computed(() => {
    const selected = this.metrics();
    const rows = this.reportMovements();
    const credits = rows.filter((m) => m.type === 'credit');
    // Só saques concluídos (aprovados) contam como dinheiro que já saiu de fato da carteira —
    // um saque pendente ou rejeitado ainda não moveu saldo real.
    const debits = rows.filter((m) => m.type === 'debit' && m.status === 'ok');
    const revenue = credits.reduce((s, m) => s + m.amountReais, 0);
    const reservations = credits.length;
    const platformFee = credits.reduce((s, m) => s + m.platformFeeReais, 0);
    const withdrawals = debits.reduce((s, m) => s + m.amountReais, 0);

    const cards: { label: string; value: string }[] = [];
    if (selected.has('revenue')) cards.push({ label: 'Faturamento', value: formatBRL(revenue) });
    if (selected.has('reservations')) cards.push({ label: 'Reservas', value: String(reservations) });
    if (selected.has('platformFee')) cards.push({ label: 'Taxa retida', value: formatBRL(platformFee) });
    if (selected.has('revenue') || selected.has('reservations')) {
      cards.push({ label: 'Ticket médio', value: formatBRL(reservations > 0 ? revenue / reservations : 0) });
    }
    if (selected.has('withdrawals')) cards.push({ label: 'Saques no período', value: formatBRL(withdrawals) });
    return cards;
  });

  private readonly dailyTotals = computed(() => buildDailyTotals(this.allMovements(), 7));
  protected readonly previewDays = computed(() => this.dailyTotals().map((d) => d.label));
  protected readonly previewData = computed(() =>
    this.dailyTotals().map((d) => (this.previewMetric() === 'revenue' ? d.revenue : d.reservations)),
  );

  protected readonly previewKicker = computed(() => {
    const period = this.periodOptions.find((o) => o.key === this.period())!.label;
    return `${period} · ${this.periodMovements().length} lançamentos`;
  });

  protected readonly recentKicker = computed(() => `${this.recentReports().length} gerados`);
  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? this.auth.displayName() ?? 'Arena');

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.loadHistory(arenaId);
    });
  }

  protected toggleMetric(key: MetricKey): void {
    const option = this.metricOptions.find((o) => o.key === key);
    if (option?.disabled) return;
    this.metrics.update((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected selectPeriod(option: ChipOption<PeriodOptionKey>): void {
    if (option.disabled) return;
    this.period.set(option.key as FinancePeriodKey);
  }

  protected selectGroup(option: ChipOption<GroupKey>): void {
    if (option.disabled) return;
    this.groupBy.set(option.key);
  }

  protected selectExportFormat(option: ChipOption<ExportFormat>): void {
    if (option.disabled) return;
    this.exportFormat.set(option.key);
  }

  protected retry(): void {
    const arenaId = this.arenaContext.arenaId();
    if (arenaId) void this.loadHistory(arenaId);
  }

  protected generateReport(): void {
    const rows = this.reportMovements();
    const csv = buildMovementsCsv(rows);
    downloadCsv(`relatorio-financeiro-${this.period()}-${new Date().toISOString().slice(0, 10)}.csv`, csv);

    const periodLabel = this.periodOptions.find((o) => o.key === this.period())!.label;
    const generatedLabel = new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    this.recentReports.update((current) => [
      { id: Date.now(), label: `${periodLabel} · ${rows.length} lançamentos`, generatedLabel, format: 'csv' },
      ...current,
    ]);
  }

  private async loadHistory(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const db = arenaFirestore();
      const [ledger, withdrawals] = await Promise.all([
        fetchLedgerEntries(db, arenaId, LEDGER_HISTORY_TAKE),
        fetchWithdrawals(db, arenaId, WITHDRAWAL_HISTORY_TAKE),
      ]);
      this.allMovements.set(mergeFinanceMovements(ledger, withdrawals));
    } catch {
      this.errorMessage.set('Não foi possível carregar o histórico financeiro.');
    } finally {
      this.loading.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, monthKey, monthLabel, todayKey } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import type { ClassSession } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent, SegmentedComponent, StatComponent } from '../../ui/kit';
import { downloadCsv, toCsv } from '../../ui/csv';
import { classRows, compactBRL, delinquency, monthlySeries, periodRange, reportsCsv, sessionStats, type ReportPeriod } from './report-metrics';
import { ReportsService } from './reports.service';

/** W23 — Relatórios. Aulas do período vêm de leitura própria; dinheiro e turmas do store ao vivo. */
@Component({
  selector: 'ct-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, StatComponent, SegmentedComponent, IconComponent],
  templateUrl: './reports.component.html',
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
    .legend { display: flex; gap: 14px; }
    .legend span { display: flex; align-items: center; gap: 6px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .sw { width: 9px; height: 9px; border-radius: 2px; }
    .sw.c { background: var(--nx-surface-2); border: 1px solid var(--nx-line-strong); }
    .sw.r { background: var(--nx-win); }
    .chart { display: flex; align-items: flex-end; gap: clamp(8px, 3vw, 22px); padding: 10px 6px 0; overflow-x: auto; }
    .col { flex: 1; min-width: 36px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .num { font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 600; color: var(--nx-text); white-space: nowrap; }
    .bars { width: 100%; height: 240px; display: flex; align-items: flex-end; gap: 4px; }
    .bar { flex: 1; border-radius: 6px 6px 0 0; min-height: 2px; }
    .bar.c { background: var(--nx-surface-2); border: 1px solid var(--nx-line-strong); }
    .bar.r { background: rgba(43,209,126,0.55); }
    .bar.r.now { background: var(--nx-win); }
    .m { font-family: var(--nx-font-mono); font-size: 11px; font-weight: 700; color: var(--nx-text-dim); }
    .m.now { color: var(--nx-orange-400); }
    .cell { font-family: var(--nx-font-mono); font-size: 11.5px; font-weight: 600; color: var(--nx-text); }
    .cell.low { color: var(--nx-pending); }
  `,
})
export class ReportsComponent {
  readonly centerId = input('');

  private readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly reports = inject(ReportsService);

  protected readonly formatBRL = formatBRL;
  protected readonly compactBRL = compactBRL;
  protected readonly periods = [
    { value: '30d', label: '30 dias' },
    { value: 'quarter', label: 'Trimestre' },
    { value: '6m', label: '6 meses' },
  ];
  protected readonly period = signal('6m');

  protected readonly today = computed(() => todayKey(this.ctx.center()?.timezone));
  protected readonly month = computed(() => monthKey(this.today()));
  protected readonly monthTitle = computed(() => monthLabel(this.month(), true));
  protected readonly range = computed(() => periodRange(this.period() as ReportPeriod, this.today()));
  protected readonly subtitle = computed(() => {
    const r = this.range();
    return `${formatDayKey(r.from, true)} – ${formatDayKey(r.to, true)} · todas as modalidades`;
  });

  protected readonly sessions = signal<ClassSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly stats = computed(() => sessionStats(this.sessions(), this.today()));
  /** Limitação: só existe o saldo ATUAL de reposições por aluno — não há histórico de usadas/expiradas. */
  protected readonly makeups = computed(() => this.store.students().reduce((s, st) => s + st.makeupCredits, 0));
  protected readonly late = computed(() => delinquency(this.store.invoices(), this.month(), this.today()));
  protected readonly series = computed(() => monthlySeries(this.store.invoices(), this.range().months, this.today()));
  protected readonly maxCents = computed(() => Math.max(1, ...this.series().map((p) => Math.max(p.chargedCents, p.receivedCents))));
  protected readonly rows = computed(() =>
    classRows(this.store.classes(), this.sessions(), this.store.enrollments(), this.store.invoices(), this.month(), this.today()),
  );

  constructor() {
    // Releitura das aulas a cada troca de período/centro; resposta antiga é descartada.
    let token = 0;
    effect(() => {
      const id = this.ctx.activeCenterId();
      const { from, to } = this.range();
      if (!id) {
        return;
      }
      const mine = ++token;
      this.loading.set(true);
      this.error.set('');
      this.reports
        .sessionsBetween(id, from, to)
        .then((list) => {
          if (mine === token) {
            this.sessions.set(list);
          }
        })
        .catch(() => {
          if (mine === token) {
            this.sessions.set([]);
            this.error.set('Não foi possível carregar as aulas do período. Tente de novo.');
          }
        })
        .finally(() => {
          if (mine === token) {
            this.loading.set(false);
          }
        });
    });
  }

  height(cents: number): number {
    return (cents / this.maxCents()) * 100;
  }

  fmtPct(n: number | null): string {
    return n == null ? '—' : `${String(n).replace('.', ',')}%`;
  }

  exportCsv(): void {
    downloadCsv(`relatorio-${this.range().from}-${this.range().to}.csv`, toCsv(reportsCsv(this.series(), this.rows(), this.monthTitle())));
  }
}

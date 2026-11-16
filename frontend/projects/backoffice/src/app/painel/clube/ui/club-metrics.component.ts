import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { IconComponent } from '../../ui/icon.component';
import { KpiCardComponent } from '../../ui/kpi-card.component';
import {
  aggregateEvents,
  formatCount,
  formatRate,
  metricsCsv,
  METRICS_PERIODS,
  partnerMetricRows,
  periodStart,
  sourceLabel,
  type BenefitMetrics,
  type MetricsPeriod,
} from '../data/benefit-metrics';
import { clubErrorMessage } from '../data/club-errors';
import { ClubRepository } from '../data/club.repository';
import { csvFileName, downloadCsv } from '../data/csv';
import type { Partner } from '../data/partner';

type LoadState = 'loading' | 'ok' | 'error';

/**
 * Aba Métricas: lê `benefitEvents` do período e agrega no cliente (mesma conta do script
 * `benefits-report.js`). Os KPIs são em atletas únicos: toque repetido não infla.
 */
@Component({
  selector: 'bo-club-metrics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, KpiCardComponent],
  template: `
    <div class="bar">
      <div class="chips" role="group" aria-label="Período">
        @for (p of periods; track p.id) {
          <button type="button" class="bo-chip" [class.active]="period() === p.id" [attr.aria-pressed]="period() === p.id" (click)="setPeriod(p.id)">
            {{ p.label }}
          </button>
        }
      </div>
      <button type="button" class="bo-mini-btn" [disabled]="state() !== 'ok' || metrics().eventCount === 0" (click)="exportCsv()">
        <bo-icon name="download" [size]="13" /> Exportar CSV
      </button>
    </div>

    @if (state() === 'error') {
      <div class="bo-alert" role="alert">
        <bo-icon name="alert" [size]="16" />
        <span>{{ error() }}</span>
        <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button>
      </div>
    }

    <div class="kpis" [class.loading]="state() === 'loading'">
      <bo-kpi-card label="Viram o card" [value]="kpi(metrics().overall.hub_card_view.athletes)" note="atletas únicos no Hub" />
      <bo-kpi-card label="Abriram o clube" [value]="kpi(metrics().overall.club_view.athletes)" note="atletas únicos" />
      <bo-kpi-card label="Viram um parceiro" [value]="kpi(metrics().overall.partner_view.athletes)" note="atletas únicos" />
      <bo-kpi-card label="Cliques no botão" [value]="kpi(metrics().overall.cta_click.athletes)" note="atletas únicos · pedir e contratar" />
      <bo-kpi-card label="Leads" [value]="kpi(metrics().leads)" note="com consentimento" />
    </div>

    <section class="card">
      <div class="head">
        <h2>Por parceiro</h2>
        @if (state() === 'ok') {
          <span class="meta">{{ count(metrics().eventCount) }} eventos no período</span>
        }
      </div>
      @if (state() === 'loading') {
        <div class="skeleton" aria-hidden="true"></div>
      } @else if (rows().length === 0) {
        <p class="empty">Nenhum parceiro ativo e nenhum evento no período.</p>
      } @else {
        <div class="wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Parceiro</th>
                <th scope="col" class="n">Visualizações</th>
                <th scope="col" class="n">Atletas</th>
                <th scope="col" class="n">Cliques</th>
                <th scope="col" class="n">Cupom copiado</th>
                <th scope="col" class="n">Leads</th>
                <th scope="col" class="n" title="Atletas que clicaram ÷ atletas que viram o parceiro">Clique / visita</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.partnerId) {
                <tr>
                  <td class="name">{{ r.name }}</td>
                  <td class="n">{{ count(r.views) }}</td>
                  <td class="n">{{ count(r.viewers) }}</td>
                  <td class="n">{{ count(r.clicks) }}</td>
                  <td class="n">{{ r.couponApplies ? count(r.codeCopies) : '—' }}</td>
                  <td class="n">{{ r.leadApplies ? count(r.leads) : '—' }}</td>
                  <td class="n strong">{{ rate(r.clickRate) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="foot">Visualizações, cliques e cupons são toques (o mesmo atleta em 30 s conta uma vez). Atletas, leads e clique/visita são atletas únicos.</p>
      }
    </section>

    @if (state() === 'ok' && metrics().clickSources.length > 0) {
      <section class="card">
        <div class="head"><h2>Origem dos cliques</h2><span class="meta">por onde o atleta entrou no clube</span></div>
        <ul class="sources">
          @for (s of metrics().clickSources; track s.source) {
            <li>
              <span class="src">{{ source(s.source) }}</span>
              <span class="track"><span class="fill" [style.width.%]="share(s.total)"></span></span>
              <span class="num">{{ count(s.total) }}</span>
              <span class="ath">{{ count(s.athletes) }} atleta{{ s.athletes === 1 ? '' : 's' }}</span>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .bar > .bo-mini-btn { margin-left: auto; }
    .bo-alert { margin: 0; align-items: center; }
    .push { margin-left: auto; flex: none; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
    .kpis.loading { opacity: 0.5; }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .card { background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); padding: 18px 20px; min-width: 0; }
    .head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); }
    .meta { font-size: 12px; color: var(--nx-text-dim); }
    .wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 640px; }
    th { text-align: left; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); padding: 9px 10px; border-bottom: 1px solid var(--nx-line); white-space: nowrap; }
    td { padding: 12px 10px; border-bottom: 1px solid var(--nx-line); font-size: 13px; color: var(--nx-text-mute); }
    tr:last-child td { border-bottom: none; }
    .n { text-align: right; font-family: var(--nx-font-mono); }
    .name { font-family: var(--nx-font-display); font-weight: 600; color: var(--nx-text); }
    .strong { color: var(--nx-text); font-weight: 700; }
    .foot { margin: 10px 0 0; font-size: 11.5px; line-height: 1.5; color: var(--nx-text-dim); }
    .empty { margin: 0; padding: 18px 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .skeleton { height: 96px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); opacity: 0.6; }
    .sources { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
    .sources li { display: grid; grid-template-columns: 200px minmax(0, 1fr) 48px 90px; gap: 12px; align-items: center; font-size: 12.5px; }
    .src { color: var(--nx-text); }
    .track { height: 8px; border-radius: var(--nx-r-pill); background: var(--nx-surface-1); overflow: hidden; }
    .fill { display: block; height: 100%; background: var(--nx-orange-500); border-radius: var(--nx-r-pill); }
    .num { text-align: right; font-family: var(--nx-font-mono); color: var(--nx-text); }
    .ath { font-size: 11.5px; color: var(--nx-text-dim); }
    @media (max-width: 640px) { .sources li { grid-template-columns: minmax(0, 1fr) 48px; } .track, .ath { display: none; } }
  `,
})
export class ClubMetricsComponent {
  private readonly repository = inject(ClubRepository);
  private readonly document = inject(DOCUMENT);

  readonly partners = input.required<readonly Partner[]>();

  protected readonly periods = METRICS_PERIODS;
  protected readonly period = signal<MetricsPeriod>('7d');
  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal('');
  protected readonly metrics = signal<BenefitMetrics>(aggregateEvents([]));
  protected readonly rows = computed(() => partnerMetricRows(this.metrics(), this.partners()));
  private readonly maxSource = computed(() => Math.max(1, ...this.metrics().clickSources.map((s) => s.total)));
  /** Ignora a resposta de um período que já foi trocado. */
  private requestId = 0;

  protected readonly count = formatCount;
  protected readonly rate = formatRate;
  protected readonly source = sourceLabel;

  constructor() {
    void this.load();
  }

  protected setPeriod(period: MetricsPeriod): void {
    if (period === this.period()) return;
    this.period.set(period);
    void this.load();
  }

  async load(): Promise<void> {
    const id = ++this.requestId;
    this.state.set('loading');
    this.error.set('');
    try {
      const events = await this.repository.events(periodStart(this.period(), new Date()));
      if (id !== this.requestId) return;
      this.metrics.set(aggregateEvents(events));
      this.state.set('ok');
    } catch (error) {
      if (id !== this.requestId) return;
      this.error.set(clubErrorMessage(error));
      this.state.set('error');
    }
  }

  protected kpi(value: number): string {
    return this.state() === 'ok' ? formatCount(value) : '—';
  }

  protected share(total: number): number {
    return Math.round((total / this.maxSource()) * 100);
  }

  protected exportCsv(): void {
    const name = csvFileName(`clube-metricas-${this.period()}`, new Date());
    downloadCsv(this.document, name, metricsCsv(this.metrics(), this.rows()));
  }
}

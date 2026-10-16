import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../ui/icon.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import type { StockRow } from '../estoque/data/stock';
import { StockRepository, type TransferDoc } from '../estoque/data/stock.repository';
import { deliveryLabel, downloadText, pillOf, type Order } from '../pedidos/data/order';
import { OrdersRepository } from '../pedidos/data/orders.repository';
import { REASON_LABEL } from '../trocas/data/returns';
import { ReturnsRepository } from '../trocas/data/returns.repository';
import {
  PERIODS,
  alertsOf,
  channelSplit,
  dailyBars,
  deltaPct,
  kpisOf,
  overviewCsv,
  previousRange,
  rangeLabel,
  rangeOf,
  salesIn,
  spDay,
  topProducts,
  transferLate,
  type Alert,
  type PeriodId,
} from './data/overview';
import { RevenueChartComponent } from './ui/revenue-chart.component';

type LoadState = 'loading' | 'ok' | 'error';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Loja › Visão geral (01): KPIs do período, receita por dia, alertas, recentes e mais vendidos. */
@Component({
  selector: 'bo-panel-visao-geral',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PanelShellComponent, PillComponent, RevenueChartComponent, RouterLink],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Loja</div>
          <h1>Visão geral</h1>
        </div>
        <div class="spacer"></div>
        @if (period() === 'custom') {
          <input type="date" class="bo-input date" aria-label="De" [value]="from()" (change)="setCustom('from', $event)" />
          <input type="date" class="bo-input date" aria-label="Até" [value]="to()" (change)="setCustom('to', $event)" />
        }
        <span class="select-wrap">
          <bo-icon name="clock" [size]="13" />
          <select aria-label="Período" (change)="setPeriod($any(val($event)))">
            @for (p of periods; track p.id) { <option [value]="p.id" [selected]="period() === p.id">{{ p.label }}</option> }
          </select>
          <bo-icon name="chevron-down" [size]="12" />
        </span>
        <button type="button" class="bo-mini-btn" [disabled]="state() !== 'ok'" (click)="exportCsv()"><bo-icon name="download" [size]="13" /> Exportar</button>
      </header>

      <div class="body">
        @if (state() === 'error') {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>Não foi possível carregar a visão geral.</span>
            <button type="button" class="bo-mini-btn" (click)="load()">Tentar de novo</button></div>
        }

        <div class="kpis">
          @for (k of kpiCards(); track k.label) {
            <div class="kpi">
              <span class="kpi-label">{{ k.label }}</span>
              @if (state() === 'loading') { <span class="skel"></span> } @else {
                <span class="kpi-value" [class.dim]="k.value === '—'">{{ k.value }}</span>
                <span class="kpi-hint">
                  @if (k.delta !== null) { <b [class.down]="k.delta < 0">{{ k.delta < 0 ? '▼' : '▲' }} {{ abs(k.delta) }}%</b> }
                  {{ k.hint }}
                </span>
              }
            </div>
          }
        </div>

        <div class="row">
          <bo-revenue-chart [bars]="bars()" [kicker]="label()" [today]="today" [split]="split()" />
          <section class="card">
            <div class="kicker">Agora</div>
            <h2>Precisa de atenção</h2>
            @if (state() === 'loading') { <div class="skel block"></div> } @else {
              <ul class="alerts">
                @for (a of alerts(); track a.title) {
                  <li>
                    <span [class]="'dot ' + a.tone" aria-hidden="true"></span>
                    <span class="a-text"><span class="a-title">{{ a.title }}</span><span class="a-detail">{{ a.detail }}</span></span>
                    <a class="a-action" [routerLink]="a.link" [queryParams]="a.query ?? null">{{ a.action }}</a>
                  </li>
                } @empty {
                  <li class="ok"><bo-icon name="check" [size]="16" /> Tudo em dia</li>
                }
              </ul>
            }
          </section>
        </div>

        <div class="row">
          <section class="card">
            <div class="card-head"><h2>Pedidos recentes</h2><a routerLink="/painel/loja/pedidos" class="see-all">Ver todos</a></div>
            <ul class="recent">
              @for (o of recent(); track o.id) {
                <li>
                  <a [routerLink]="['/painel/loja/pedidos', o.id]">
                    <span class="mono">#{{ o.number }}</span>
                    <span class="strong ellipsis">{{ o.customer.name }}</span>
                    <span class="dim ellipsis">{{ place(o) }}</span>
                    <span class="money">{{ money(o.totalCents) }}</span>
                    <span class="pill"><bo-pill [tone]="pill(o).tone">{{ pill(o).label }}</bo-pill></span>
                  </a>
                </li>
              } @empty {
                <li class="empty">{{ state() === 'loading' ? '' : 'Nenhum pedido ainda' }}</li>
              }
            </ul>
          </section>

          <section class="card">
            <div class="kicker">{{ periodKicker() }}</div>
            <h2>Mais vendidos</h2>
            <ol class="top">
              @for (t of top(); track t.productId; let i = $index) {
                <li>
                  <a [routerLink]="['/painel/loja/produtos', t.productId]">
                    <span class="pos">{{ i + 1 }}</span>
                    <span class="thumb" aria-hidden="true">@if (t.imageUrl) { <img [src]="t.imageUrl" alt="" width="34" height="34" /> }</span>
                    <span class="strong ellipsis">{{ t.name }}</span>
                    <span class="dim">{{ t.units }} un.</span>
                    <span class="money">{{ money0(t.revenueCents) }}</span>
                  </a>
                </li>
              } @empty {
                <li class="empty">{{ state() === 'loading' ? '' : 'Nenhuma venda no período' }}</li>
              }
            </ol>
          </section>
        </div>
      </div>
    </bo-panel-shell>
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); }
    .titles { display: flex; flex-direction: column; gap: 4px; }
    .crumb, .kicker, .kpi-label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .spacer { flex: 1; }
    .date { width: 140px; height: 32px; padding: 0 10px; }
    .select-wrap { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2); color: var(--nx-text-mute); }
    .select-wrap select { appearance: none; border: none; background: none; color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; padding-right: 4px; cursor: pointer; outline: none; }
    .select-wrap select option { background: var(--nx-surface-1); }
    .body { padding: 20px 32px 40px; display: flex; flex-direction: column; gap: 16px; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
    .kpi, .card { background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); min-width: 0; }
    .kpi { display: flex; flex-direction: column; gap: 8px; padding: 16px 18px; }
    .kpi-value { font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; letter-spacing: -0.03em; line-height: 1; }
    .kpi-value.dim { color: var(--nx-text-dim); }
    .kpi-hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .kpi-hint b { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-win); margin-right: 4px; }
    .kpi-hint b.down { color: var(--nx-live); }
    .skel { display: block; height: 26px; width: 70%; border-radius: 6px; background: var(--nx-surface-2); opacity: 0.6; }
    .skel.block { height: 140px; width: 100%; }
    .row { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
    .card { padding: 20px 22px; display: flex; flex-direction: column; }
    h2 { margin: 4px 0 10px; font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; }
    .card-head { display: flex; justify-content: space-between; align-items: baseline; }
    .see-all, .a-action { color: var(--nx-orange-500); font-family: var(--nx-font-display); font-weight: 700; font-size: 12px; text-decoration: none; white-space: nowrap; }
    .see-all:hover, .a-action:hover { text-decoration: underline; }
    ul, ol { list-style: none; margin: 0; padding: 0; }
    .alerts li { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--nx-line); }
    .alerts li:first-child { border-top: none; }
    .dot { width: 7px; height: 7px; flex: none; border-radius: 50%; }
    .dot.red { background: var(--nx-live); } .dot.orange { background: var(--nx-orange-500); } .dot.yellow { background: var(--nx-pending); }
    .a-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .a-title { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .a-detail { font-size: 11.5px; color: var(--nx-text-dim); }
    .alerts .ok { justify-content: center; padding: 32px 0; color: var(--nx-win); font-weight: 600; font-size: 13px; gap: 8px; }
    .recent a, .top a { display: grid; align-items: center; gap: 12px; min-height: 46px; border-top: 1px solid var(--nx-line); color: inherit; text-decoration: none; }
    .recent a { grid-template-columns: 76px minmax(90px, 1fr) minmax(80px, 1fr) 96px 140px; }
    .top a { grid-template-columns: 12px 34px minmax(0, 1fr) auto auto; gap: 10px; }
    .recent a:hover, .top a:hover { background: var(--nx-surface-1); }
    .mono { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-mute); }
    .strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .dim { font-size: 12px; color: var(--nx-text-dim); }
    .money { text-align: right; font-family: var(--nx-font-display); font-weight: 800; font-size: 13px; }
    .pill { display: flex; justify-content: flex-end; }
    .ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pos { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); }
    .thumb { width: 34px; height: 34px; border-radius: 8px; overflow: hidden; border: 1px solid var(--nx-line); background: repeating-linear-gradient(-45deg, var(--nx-surface-1), var(--nx-surface-1) 4px, var(--nx-surface-2) 4px, var(--nx-surface-2) 8px); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .empty { padding: 28px 0; text-align: center; font-size: 12.5px; color: var(--nx-text-dim); border-top: 1px solid var(--nx-line); }
    @media (max-width: 1280px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .row { grid-template-columns: 1fr; } }
  `,
})
export class PanelVisaoGeralComponent {
  private readonly orders = inject(OrdersRepository);
  private readonly stock = inject(StockRepository);
  private readonly returns = inject(ReturnsRepository);

  protected readonly periods = PERIODS;
  protected readonly now = new Date();
  protected readonly today = spDay(this.now);

  protected readonly state = signal<LoadState>('loading');
  protected readonly period = signal<PeriodId>('30d');
  protected readonly from = signal(spDay(new Date(this.now.getTime() - 29 * 86_400_000)));
  protected readonly to = signal(this.today);
  protected readonly loaded = signal<Order[]>([]);
  protected readonly recent = signal<Order[]>([]);
  protected readonly alerts = signal<Alert[]>([]);
  /** Desde quando os pedidos já foram lidos: trocar para um período menor não relê. */
  private loadedSince: Date | null = null;

  protected readonly range = computed(() => rangeOf(this.period(), this.now, { from: this.from(), to: this.to() }));
  protected readonly prev = computed(() => previousRange(this.range()));
  protected readonly sales = computed(() => salesIn(this.loaded(), this.range()));
  protected readonly kpis = computed(() => kpisOf(this.sales()));
  protected readonly prevKpis = computed(() => kpisOf(salesIn(this.loaded(), this.prev())));
  protected readonly bars = computed(() => dailyBars(this.sales(), this.range()));
  protected readonly split = computed(() => channelSplit(this.sales()));
  protected readonly top = computed(() => topProducts(this.sales()));
  protected readonly label = computed(() => rangeLabel(this.range()));
  protected readonly periodKicker = computed(() => {
    const p = this.period();
    return p === 'hoje' ? 'Hoje' : p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : p === 'mes' ? 'Mês atual' : this.label();
  });

  protected readonly kpiCards = computed(() => {
    const k = this.kpis();
    const p = this.prevKpis();
    const vs = (d: number | null) => (d === null ? 'sem base no período anterior' : 'vs. período anterior');
    return [
      { label: 'Receita', value: this.money0(k.revenueCents), delta: deltaPct(k.revenueCents, p.revenueCents), hint: vs(deltaPct(k.revenueCents, p.revenueCents)) },
      { label: 'Pedidos', value: String(k.orders), delta: deltaPct(k.orders, p.orders), hint: vs(deltaPct(k.orders, p.orders)) },
      { label: 'Ticket médio', value: k.ticketCents === null ? '—' : this.money(k.ticketCents), delta: deltaPct(k.ticketCents, p.ticketCents), hint: k.ticketCents === null ? 'sem vendas' : vs(deltaPct(k.ticketCents, p.ticketCents)) },
      { label: 'Retirada na arena', value: k.pickupPct === null ? '—' : `${k.pickupPct}%`, delta: null, hint: 'dos pedidos' },
      // Sem sessões da vitrine registradas ainda: sem número inventado.
      { label: 'Conversão', value: '—', delta: null, hint: 'sem dados de visitas' },
    ];
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      const since = this.prev().start;
      const [orders, recent, toPick, hours, snap, transfers, returns] = await Promise.all([
        this.orders.since(since),
        this.orders.recent(4),
        this.orders.byStatus('sep'),
        this.orders.handlingHours(),
        this.stock.load().catch(() => ({ rows: [] as StockRow[], locations: [], movements: [] })),
        this.stock.openTransfers().catch(() => [] as TransferDoc[]),
        this.returns.list().catch(() => []),
      ]);
      this.loaded.set(orders);
      this.loadedSince = since;
      this.recent.set(recent);
      const names = new Map(snap.locations.map((l) => [l.id, l.name]));
      this.alerts.set(alertsOf({
        lowStock: snap.rows.filter((r) => r.threshold > 0 && r.total < r.threshold),
        toPick,
        handlingHours: hours,
        returnsToReview: returns.filter((r) => r.status === 'analisar').map((r) => ({ reasonLabel: REASON_LABEL[r.reason] })),
        lateTransfers: transfers
          .filter((t) => t.status === 'em_transito' && transferLate(t.arriveAt, this.now))
          .map((t) => ({ id: t.id, code: t.code, arenaName: names.get(t.toLocationId) ?? t.toLocationId, orders: t.orderIds?.length ?? 0 })),
        now: this.now,
      }));
      this.state.set('ok');
    } catch {
      this.state.set('error');
    }
  }

  protected setPeriod(p: PeriodId): void {
    this.period.set(p);
    this.reloadIfNeeded();
  }

  protected setCustom(which: 'from' | 'to', e: Event): void {
    const v = this.val(e);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    (which === 'from' ? this.from : this.to).set(v);
    this.reloadIfNeeded();
  }

  private reloadIfNeeded(): void {
    if (!this.loadedSince || this.prev().start < this.loadedSince) void this.load();
  }

  protected exportCsv(): void {
    downloadText(`loja-visao-geral-${this.today}.csv`, overviewCsv(this.label(), this.kpis(), this.bars(), this.top()));
  }

  protected money(c: number): string {
    return BRL.format(c / 100);
  }
  protected money0(c: number): string {
    return BRL0.format(c / 100);
  }
  protected abs(n: number): number {
    return Math.abs(n);
  }
  protected pill(o: Order) {
    return pillOf(o);
  }
  protected place(o: Order): string {
    return deliveryLabel(o);
  }
  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

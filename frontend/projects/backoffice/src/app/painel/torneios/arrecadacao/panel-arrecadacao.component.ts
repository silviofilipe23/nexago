import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { callableErrorMessage } from '../../data/callable-error';
import { SquadKpiComponent } from '../../squad/ui/squad-kpi.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import { STATUS_LABEL, STATUS_TONE } from '../data/tournament-status-label';
import { buildFeeRow } from '../taxas/data/fee-rows';
import { TournamentFeesRepository } from '../taxas/data/tournament-fees.repository';
import { saoPauloToday } from '../taxas/data/tournament-fees';
import { TournamentRevenueRepository } from './data/tournament-revenue.repository';
import {
  PERIODS,
  SORTS,
  commissionByTournament,
  costMoney,
  costsCents,
  feeBadge,
  feeCents,
  hasMoney,
  inPeriod,
  matchesFilter,
  matchesTerm,
  money,
  monthSeries,
  netCents,
  periodLabel,
  rateLabel,
  signedMoney,
  sortRows,
  sumRows,
  takeRate,
  totalsOf,
  type RevenueFilter,
  type RevenuePeriod,
  type RevenueRow,
  type RevenueSort,
} from './data/tournament-revenue';
import { RevenueBreakdownComponent } from './ui/revenue-breakdown.component';
import { RevenueMonthsComponent } from './ui/revenue-months.component';

const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' });

/**
 * Torneios › Arrecadação: quanto a NexaGO ganhou em cada torneio — taxa cobrada no caixa menos o que
 * a plataforma banca (cashback e NexaSquad) — e quanto passou por fora, sem taxa. O período é a data
 * do torneio. Regras do cálculo em `data/tournament-revenue.ts`.
 */
@Component({
  selector: 'bo-panel-arrecadacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PanelCardComponent,
    PillComponent,
    IconComponent,
    SquadKpiComponent,
    RevenueBreakdownComponent,
    RevenueMonthsComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Torneios · receita da NexaGO</div>
          <h1>Arrecadação</h1>
          @if (state() === 'ready') {
            <span class="sub">{{ periodLabel() }} · {{ platformCount() }} com pagamento pela plataforma</span>
          }
        </div>
        <div class="spacer"></div>
        <div class="chips" role="group" aria-label="Período (data do torneio)">
          @for (p of periods; track p.id) {
            <button type="button" class="bo-chip" [class.active]="period() === p.id" [attr.aria-pressed]="period() === p.id" (click)="period.set(p.id)">{{ p.label }}</button>
          }
        </div>
        <div class="search">
          <bo-icon name="search" [size]="15" />
          <input type="search" placeholder="Torneio ou organizador" aria-label="Buscar torneio ou organizador" [value]="term()" (input)="term.set(value($event))" />
        </div>
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="load()"><bo-icon name="swap" [size]="13" /> Atualizar</button>
      </header>

      <div class="body">
        @switch (state()) {
          @case ('loading') {
            <div class="kpis" aria-busy="true" aria-label="Carregando arrecadação">
              @for (s of [0, 1, 2, 3, 4]; track s) { <div class="skel kpi"></div> }
            </div>
            <div class="skel card"></div>
            <div class="skel table"></div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ loadError() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button>
            </div>
          }
          @default {
            <div class="kpis">
              <bo-squad-kpi class="hl" label="Receita líquida NexaGO" [value]="signedMoney(netOf(kpi().totals))" [hint]="rateLabel(rateOf(kpi().totals)) + ' do pago na plataforma'" />
              <bo-squad-kpi label="Taxas cobradas" [value]="money(feeOf(kpi().totals))" [hint]="athleteHint()" />
              <bo-squad-kpi label="Custos bancados" [value]="costMoney(costsOf(kpi().totals))" hint="Cashback e NexaSquad" />
              <bo-squad-kpi label="Pago na plataforma" [value]="money(kpi().totals.grossCents)" [hint]="paidHint()" />
              <bo-squad-kpi label="Recebido por fora" [value]="money(kpi().offPlatformCents)" [hint]="'Sem taxa · ' + offCount() + (offCount() === 1 ? ' torneio' : ' torneios')" />
            </div>

            <div class="charts">
              <bo-revenue-months [bars]="months()" />
              <bo-revenue-breakdown [totals]="kpi().totals" />
            </div>

            <bo-panel-card pad="sm" title="Por torneio">
              <div card-actions class="tools">
                <div class="chips" role="group" aria-label="Canal">
                  @for (f of filterChips(); track f.id) {
                    <button type="button" class="bo-chip" [class.active]="filter() === f.id" [attr.aria-pressed]="filter() === f.id" (click)="filter.set(f.id)">{{ f.label }}</button>
                  }
                </div>
                <label class="sort">Ordenar
                  <select (change)="sort.set(sortValue($event))">
                    @for (s of sorts; track s.id) { <option [value]="s.id" [selected]="sort() === s.id">{{ s.label }}</option> }
                  </select>
                </label>
              </div>

              <div class="scroll">
                <div class="table">
                  <div class="t-head">
                    <span>Torneio</span><span>Status</span><span class="r">Na plataforma</span><span class="r">Por fora</span><span>Taxa</span><span class="r">Custos</span><span class="r">Líquido NexaGO</span><span class="r">%</span><span></span>
                  </div>
                  @for (r of rows(); track r.tournament.id) {
                    <a class="t-row" [routerLink]="['/painel/torneios/arrecadacao', r.tournament.id]">
                      <span class="main">
                        <span class="name">{{ r.tournament.name }}</span>
                        <span class="org">{{ subline(r) }}</span>
                      </span>
                      <span><bo-pill [tone]="statusTone[r.tournament.status]">{{ statusLabel[r.tournament.status] }}</bo-pill></span>
                      <span class="cell-r">
                        <span class="num">{{ r.totals.payments ? money(r.totals.grossCents) : '—' }}</span>
                        @if (r.totals.payments) { <span class="small">{{ paymentsLabel(r.totals.payments) }}</span> }
                      </span>
                      <span class="num dim">{{ r.offPlatformCents ? money(r.offPlatformCents) : '—' }}</span>
                      <span>
                        @if (r.totals.payments) {
                          <bo-pill [tone]="badge(r).tone">{{ badge(r).label }}</bo-pill>
                        } @else {
                          <bo-pill tone="yellow">Só por fora</bo-pill>
                        }
                      </span>
                      <span class="num dim">{{ costMoney(costsOf(r.totals)) }}</span>
                      <span class="num strong" [class.neg]="netOf(r.totals) < 0">{{ r.totals.payments ? signedMoney(netOf(r.totals)) : '—' }}</span>
                      <span class="num dim">{{ rateLabel(rateOf(r.totals)) }}</span>
                      <bo-icon class="chev" name="chevron-right" [size]="14" />
                    </a>
                  } @empty {
                    <p class="status">{{ emptyText() }}</p>
                  }
                  @if (rows().length > 1) {
                    <div class="t-row total">
                      <span>Total da lista</span><span></span>
                      <span class="cell-r">
                        <span class="num">{{ money(shown().totals.grossCents) }}</span>
                        <span class="small">{{ paymentsLabel(shown().totals.payments) }}</span>
                      </span>
                      <span class="num">{{ money(shown().offPlatformCents) }}</span>
                      <span class="mono">{{ money(feeOf(shown().totals)) }}</span>
                      <span class="num">{{ costMoney(costsOf(shown().totals)) }}</span>
                      <span class="num accent">{{ signedMoney(netOf(shown().totals)) }}</span>
                      <span class="num">{{ rateLabel(rateOf(shown().totals)) }}</span>
                      <span></span>
                    </div>
                  }
                </div>
              </div>
              <p class="legend">
                Receita = taxa já creditada no caixa do torneio (Pix na hora; cartão quando o Asaas libera) menos o que a NexaGO banca.
                A tarifa do Asaas no Pix, absorvida pela NexaGO, não fica no extrato e não entra na conta. Por fora = baixa manual do
                organizador, sem taxa. Torneio sem nenhum pagamento não aparece.
              </p>
            </bo-panel-card>
          }
        }
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .sub { font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text-dim); }
    .spacer { flex: 1; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .search { width: 260px; max-width: 100%; height: 34px; padding: 0 12px; box-sizing: border-box; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-2); display: flex; align-items: center; gap: 9px; color: var(--nx-text-dim); }
    .search:focus-within { border-color: rgba(255, 106, 26, 0.5); }
    .search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 13px; }
    .body { flex: 1; padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .push { margin-left: auto; flex: none; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
    .kpis .hl { background: rgba(255, 106, 26, 0.08); border-color: rgba(255, 106, 26, 0.35); }
    .charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .sort { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--nx-text-mute); }
    .sort select { height: 30px; padding: 0 8px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 12.5px; }
    .scroll { overflow-x: auto; margin: 0 -4px; }
    .table { min-width: 1040px; padding: 0 4px; }
    .t-head, .t-row { display: grid; grid-template-columns: minmax(200px, 1fr) 140px 116px 104px 144px 96px 120px 52px 14px; gap: 10px; align-items: center; }
    .cell-r { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 0; }
    .small { font-size: 11px; color: var(--nx-text-dim); white-space: nowrap; }
    .t-head { padding: 4px 10px 10px; border-bottom: 1px solid var(--nx-line); }
    .t-head span { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .r { text-align: right; }
    .t-row { padding: 12px 10px; border-bottom: 1px solid var(--nx-line); border-radius: 8px; color: var(--nx-text); text-decoration: none; }
    .t-row:hover { background: var(--nx-surface-1); }
    .t-row:focus-visible { outline: 2px solid rgba(255, 106, 26, 0.6); outline-offset: -2px; }
    .t-row.total { border-bottom: none; font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .t-row.total:hover { background: transparent; }
    .main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .org { font-size: 11.5px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mono { font-family: var(--nx-font-mono); font-size: 12.5px; }
    .num { font-family: var(--nx-font-mono); font-size: 12.5px; text-align: right; white-space: nowrap; }
    .strong { font-weight: 600; font-size: 13px; }
    .accent { color: var(--nx-orange-400); font-size: 13.5px; }
    .neg { color: var(--nx-live); }
    .dim { color: var(--nx-text-dim); }
    .chev { color: var(--nx-text-dim); }
    .status { margin: 16px 10px 4px; font-size: 12.5px; color: var(--nx-text-dim); }
    .legend { margin: 14px 10px 0; font-size: 11.5px; line-height: 1.45; color: var(--nx-text-dim); }
    .skel { border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .skel.kpi { height: 86px; border-radius: var(--nx-r-3); }
    .skel.card { height: 260px; }
    .skel.table { height: 420px; }
    @media (max-width: 1280px) {
      .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .charts { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
      .search { width: 100%; }
      .kpis { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class PanelArrecadacaoComponent {
  private readonly repo = inject(TournamentRevenueRepository);
  private readonly fees = inject(TournamentFeesRepository);

  protected readonly periods = PERIODS;
  protected readonly sorts = SORTS;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly money = money;
  protected readonly signedMoney = signedMoney;
  protected readonly costMoney = costMoney;
  protected readonly rateLabel = rateLabel;
  protected readonly netOf = netCents;
  protected readonly feeOf = feeCents;
  protected readonly costsOf = costsCents;
  protected readonly rateOf = takeRate;
  protected readonly badge = (r: RevenueRow) => feeBadge(r.fee);
  private readonly today = saoPauloToday();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  private readonly all = signal<readonly RevenueRow[]>([]);
  protected readonly period = signal<RevenuePeriod>('tudo');
  protected readonly filter = signal<RevenueFilter>('todos');
  protected readonly sort = signal<RevenueSort>('receita');
  protected readonly term = signal('');

  private readonly periodRows = computed(() => this.all().filter((r) => inPeriod(r.tournament.startAt, this.period(), this.today)));
  private readonly searched = computed(() => this.periodRows().filter((r) => matchesTerm(r, this.term())));
  protected readonly rows = computed(() => sortRows(this.searched().filter((r) => matchesFilter(r, this.filter())), this.sort()));

  /** Os KPIs resumem o período inteiro; o total da tabela, só o que está na lista. */
  protected readonly kpi = computed(() => sumRows(this.periodRows()));
  protected readonly shown = computed(() => sumRows(this.rows()));
  protected readonly months = computed(() => monthSeries(this.all(), this.today));
  protected readonly periodLabel = computed(() => periodLabel(this.period(), this.today));
  protected readonly platformCount = computed(() => this.periodRows().filter((r) => matchesFilter(r, 'plataforma')).length);
  protected readonly offCount = computed(() => this.periodRows().filter((r) => r.offPlatformCents > 0).length);

  protected readonly filterChips = computed<ReadonlyArray<{ id: RevenueFilter; label: string }>>(() => {
    const n = (f: RevenueFilter) => this.searched().filter((r) => matchesFilter(r, f)).length;
    return [
      { id: 'todos', label: `Todos · ${n('todos')}` },
      { id: 'plataforma', label: `Pela plataforma · ${n('plataforma')}` },
      { id: 'por-fora', label: `Só por fora · ${n('por-fora')}` },
    ];
  });

  protected readonly athleteHint = computed(() => {
    const athlete = this.kpi().totals.athleteFeeCents;
    return athlete > 0 ? `${money(athlete)} pagos pelo atleta` : 'Todas do organizador';
  });

  protected readonly paidHint = computed(() => {
    const { totals, awaitingCents } = this.kpi();
    return awaitingCents > 0 ? `${money(awaitingCents)} a liberar` : this.paymentsLabel(totals.payments);
  });

  protected readonly emptyText = computed(() =>
    this.term().trim()
      ? `Nenhum torneio ou organizador com “${this.term().trim()}” neste período.`
      : 'Nenhum torneio com dinheiro neste período.',
  );

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [wallets, commissions, defaults, overrides] = await Promise.all([
        this.repo.wallets(),
        this.repo.commissions(),
        this.fees.defaults(),
        this.fees.overrides(),
      ]);
      const [tournaments, ledgers] = await Promise.all([
        this.repo.tournamentsWithMoney(wallets.keys()),
        Promise.all([...wallets.keys()].map(async (id) => [id, await this.repo.ledger(id)] as const)),
      ]);
      const organizers = await this.fees.organizers(
        tournaments.map((t) => t.row.managerId).filter((id): id is string => !!id),
      );
      const lines = new Map(ledgers);
      const commission = commissionByTournament(commissions);

      this.all.set(
        tournaments
          .map(({ row, offPlatformCents }): RevenueRow => {
            const organizer = row.managerId ? organizers.get(row.managerId) : undefined;
            return {
              tournament: row,
              organizerName: organizer?.name ?? null,
              fee: buildFeeRow(row, overrides.get(row.id), organizer, defaults.rule, this.today),
              totals: totalsOf(lines.get(row.id) ?? [], commission.get(row.id) ?? 0),
              offPlatformCents,
              awaitingCents: wallets.get(row.id) ?? 0,
            };
          })
          .filter(hasMoney),
      );
      this.state.set('ready');
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  /** "Arena Sol · Goiânia · 22/11/26". */
  protected subline(r: RevenueRow): string {
    return [r.organizerName || 'Organizador sem nome', r.tournament.place, r.tournament.startAt ? DATE.format(r.tournament.startAt) : null]
      .filter(Boolean)
      .join(' · ');
  }

  protected paymentsLabel(n: number): string {
    return `${n} ${n === 1 ? 'pagamento' : 'pagamentos'}`;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected sortValue(event: Event): RevenueSort {
    const v = (event.target as HTMLSelectElement).value;
    return SORTS.some((s) => s.id === v) ? (v as RevenueSort) : 'receita';
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { SquadBadgesService } from '../../data/squad-badges.service';
import { downloadText } from '../../loja/pedidos/data/order';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import {
  applyFilters,
  applyTab,
  brl,
  commissionsCsv,
  dayMonthOfKey,
  includedTotals,
  kpisOf,
  lastDoneKey,
  monthKey,
  openPayoutDate,
  payoutCutoff,
  periodLabel,
  periodPhrase,
  planPayout,
  sortByDate,
  spDateKey,
  tabCounts,
  type Commission,
  type Filters,
  type Period,
  type PlanRow,
  type Tab,
} from './data/commission';
import { CommissionsRepository, type AmbassadorOption, type PayoutState } from './data/commissions.repository';
import { CommissionDrawerComponent } from './ui/commission-drawer.component';
import { CommissionFiltersComponent } from './ui/commission-filters.component';
import { CommissionKpisComponent } from './ui/commission-kpis.component';
import { CommissionsTableComponent } from './ui/commissions-table.component';
import { PayoutDrawerComponent } from './ui/payout-drawer.component';
import { PayoutStripComponent, type StripState } from './ui/payout-strip.component';

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não registro sumido. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

/**
 * Squad › Comissões (tela 05). Tabela pelo período da inscrição; a faixa e o drawer do repasse
 * olham todas as liberadas, independente do período. Escrita só pelas callables do Squad.
 */
@Component({
  selector: 'bo-panel-comissoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    IconComponent,
    ConfirmDialogComponent,
    CommissionKpisComponent,
    PayoutStripComponent,
    CommissionFiltersComponent,
    CommissionsTableComponent,
    CommissionDrawerComponent,
    PayoutDrawerComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Squad</div>
          <h1>Comissões</h1>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn" [disabled]="state() !== 'ready' || rows().length === 0" (click)="exportCsv()">
          <bo-icon name="download" [size]="13" /> Exportar
        </button>
      </header>

      <div class="body">
        @if (error(); as e) {
          <div class="bo-alert" role="alert">
            <bo-icon name="alert" [size]="16" />
            <span>{{ e }}</span>
            <button type="button" class="bo-mini-btn push" (click)="reload()">Recarregar</button>
          </div>
        }

        <bo-commission-kpis
          [kpis]="kpis()"
          [lastPayoutDate]="lastPaid()"
          [periodIsPilot]="period().kind === 'pilot'"
          [loading]="state() === 'loading'"
        />

        <bo-payout-strip
          [state]="stripState()"
          [payoutDate]="openDate()"
          [totalCents]="totals().totalCents"
          [count]="totals().count"
          [failedCount]="openPayout()?.failedCount ?? 0"
          [canApprove]="canApprove()"
          (review)="payoutOpen.set(true)"
          (approve)="confirmApprove.set(true)"
        />

        <bo-commission-filters
          [tab]="tab()"
          [counts]="counts()"
          [filters]="filters()"
          [period]="period()"
          [ambassadors]="ambassadorsInPeriod()"
          [now]="now"
          (tabChange)="setTab($event)"
          (filtersChange)="setFilters($event)"
          (periodChange)="setPeriod($event)"
        />

        @switch (state()) {
          @case ('loading') {
            <div class="skel" aria-busy="true" aria-label="Carregando comissões"></div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ loadError() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="reload()">Tentar de novo</button>
            </div>
          }
          @default {
            @if (rows().length === 0) {
              <div class="empty">
                <bo-icon name="cash" [size]="22" />
                <p>{{ list().length === 0 ? 'Nenhuma comissão ' + periodPhrase() : 'Nenhuma comissão com esses filtros' }}</p>
                <span>As conversões aparecem aqui quando alguém se inscreve com código, link ou QR de um embaixador.</span>
              </div>
            } @else {
              <bo-commissions-table
                [rows]="rows()"
                [page]="page()"
                [selected]="selected()"
                [canHold]="canHold()"
                [now]="now"
                [openDate]="openDate()"
                (open)="openCommission($event)"
                (selectedChange)="selected.set($event)"
                (pageChange)="page.set($event)"
              />
            }
          }
        }

        <footer class="notes">
          <span>Comissão sobre a receita líquida da inscrição, após taxas de pagamento.</span>
          <span>Liberada só com pagamento confirmado · reembolso cancela automaticamente.</span>
        </footer>
      </div>

      @if (selected().size > 0) {
        <div class="batch" role="region" aria-label="Comissões selecionadas">
          <strong>{{ selected().size }} {{ selected().size === 1 ? 'selecionada' : 'selecionadas' }}</strong>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy() || !openDate()" (click)="holdOpen.set(true)">
            Reter no próximo repasse
          </button>
          <button type="button" class="bo-mini-btn" (click)="selected.set(empty)">Limpar</button>
        </div>
      }

      @if (toast(); as t) {
        <div class="toast" role="status"><bo-icon name="check" [size]="15" /> {{ t }}</div>
      }

      @if (current(); as c) {
        <bo-commission-drawer
          [commission]="c"
          [ambassadors]="ambassadorOptions()"
          [canAdmin]="canAdmin()"
          [busy]="busy()"
          [error]="drawerError()"
          (closed)="closeCommission()"
          (needAmbassadors)="loadAmbassadors()"
          (cancelRequested)="cancelCommission(c, $event)"
          (reassign)="reassignCommission(c, $event.ambassadorId, $event.reason)"
        />
      }

      @if (payoutOpen() && openDate(); as date) {
        <bo-payout-drawer
          [payoutDate]="date"
          [rows]="plan()"
          [history]="history()"
          [minNetCents]="minNet()"
          [canApprove]="canApprove() && (stripState() === 'ready' || stripState() === 'partial')"
          [canHold]="canHold()"
          [busy]="busy()"
          [error]="drawerError()"
          (closed)="payoutOpen.set(false)"
          (approve)="confirmApprove.set(true)"
          (hold)="holdRow($event.row, $event.reason)"
          (unhold)="unholdRow($event)"
        />
      }

      <bo-confirm-dialog
        [open]="confirmApprove()"
        [title]="'Aprovar repasse de ' + openDateLabel() + '?'"
        [description]="
          'Creditar ' + brl(totals().totalCents) + ' na carteira de ' + totals().count +
          (totals().count === 1 ? ' embaixador' : ' embaixadores') + '? Essa ação não pode ser desfeita.'
        "
        confirmLabel="Aprovar repasse"
        [busy]="busy()"
        (confirmed)="approve()"
        (dismissed)="confirmApprove.set(false)"
      />

      <bo-confirm-dialog
        [open]="holdOpen()"
        [title]="'Reter ' + selected().size + (selected().size === 1 ? ' comissão' : ' comissões') + ' no repasse de ' + openDateLabel() + '?'"
        description="Elas ficam fora deste repasse e voltam no próximo. O motivo vai para o log de cada comissão."
        confirmLabel="Reter"
        size="md"
        [busy]="busy()"
        [confirmDisabled]="holdReason().trim().length < 3"
        [error]="drawerError()"
        (confirmed)="holdSelected()"
        (dismissed)="holdOpen.set(false)"
      >
        <label class="reason">
          <span>Motivo</span>
          <textarea class="bo-input" rows="3" maxlength="280" placeholder="Ex.: suspeita de fraude, contrato pausado"
            [value]="holdReason()" (input)="holdReason.set(value($event))"></textarea>
        </label>
      </bo-confirm-dialog>
    </bo-panel-shell>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .spacer { flex: 1; }
    .body { flex: 1; padding: 20px 32px 32px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .push { margin-left: auto; flex: none; }
    .skel { height: 420px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 56px 16px; border-radius: var(--nx-r-4); border: 1px dashed var(--nx-line-strong); color: var(--nx-text-dim); text-align: center; }
    .empty p { margin: 6px 0 0; font-family: var(--nx-font-display); font-weight: 600; font-size: 15px; color: var(--nx-text); }
    .empty span { font-size: 12.5px; max-width: 420px; }
    .notes { display: flex; gap: 32px; flex-wrap: wrap; font-size: 12.5px; color: var(--nx-text-dim); }
    .batch { position: fixed; z-index: 30; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 18px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(255, 106, 26, 0.35); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); white-space: nowrap; }
    .batch strong { font-family: var(--nx-font-display); font-size: 13px; }
    .toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .reason { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--nx-text-mute); }
    .reason textarea { height: auto; padding: 10px 12px; resize: vertical; }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
    }
  `,
})
export class PanelComissoesComponent {
  private readonly repo = inject(CommissionsRepository);
  private readonly auth = inject(AuthService);
  private readonly badges = inject(SquadBadgesService);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  /** Fixo na abertura: "Hoje"/"Ontem" e o ciclo do repasse não mudam no meio da sessão. */
  protected readonly now = new Date();
  protected readonly empty: ReadonlySet<string> = new Set();
  protected readonly brl = brl;

  protected readonly period = signal<Period>({ kind: 'month', key: monthKey(this.now) });
  protected readonly tab = signal<Tab>('all');
  protected readonly filters = signal<Filters>({ ambassadorIds: [], origins: [] });
  protected readonly page = signal(0);
  protected readonly selected = signal<ReadonlySet<string>>(this.empty);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly list = signal<Commission[]>([]);
  protected readonly payout = signal<PayoutState | null>(null);
  protected readonly ambassadorOptions = signal<AmbassadorOption[]>([]);

  protected readonly busy = signal(false);
  protected readonly approving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly drawerError = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly confirmApprove = signal(false);
  protected readonly holdOpen = signal(false);
  protected readonly holdReason = signal('');
  protected readonly payoutOpen = signal(false);
  private readonly currentId = signal<string | null>(null);

  private readonly roles = computed(() => new Set(this.auth.roles()));
  /** Admin, Growth e Financeiro operam; aprovar é de Admin e Financeiro; cancelar/reatribuir, só Admin. */
  protected readonly canHold = computed(
    () => this.auth.isSuperAdmin() || ['admin', 'growth', 'financeiro'].some((r) => this.roles().has(r)),
  );
  protected readonly canApprove = computed(
    () => this.auth.isSuperAdmin() || ['admin', 'financeiro'].some((r) => this.roles().has(r)),
  );
  protected readonly canAdmin = computed(() => this.auth.isSuperAdmin() || this.roles().has('admin'));

  private readonly filtered = computed(() => applyFilters(this.list(), this.filters()));
  protected readonly counts = computed(() => tabCounts(this.filtered()));
  protected readonly rows = computed(() => sortByDate(applyTab(this.filtered(), this.tab())));
  protected readonly kpis = computed(() => kpisOf(this.list()));
  protected readonly periodPhrase = computed(() => periodPhrase(this.period()));
  protected readonly ambassadorsInPeriod = computed(() => {
    const seen = new Map<string, string>();
    for (const c of this.list()) seen.set(c.ambassadorId, c.ambassadorName);
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });

  protected readonly history = computed(() => this.payout()?.payouts ?? []);
  protected readonly lastPaid = computed(() => lastDoneKey(this.history()));
  protected readonly openDate = computed(() => {
    const p = this.payout();
    return p ? openPayoutDate(spDateKey(this.now), lastDoneKey(p.payouts), p.config.days) : null;
  });
  protected readonly openDateLabel = computed(() => {
    const d = this.openDate();
    return d ? dayMonthOfKey(d) : '';
  });
  protected readonly openPayout = computed(() => this.history().find((p) => p.id === this.openDate()) ?? null);
  protected readonly plan = computed<PlanRow[]>(() => {
    const p = this.payout();
    const date = this.openDate();
    if (!p || !date) return [];
    return planPayout({
      payoutDate: date,
      cutoff: new Date(Math.min(this.now.getTime(), payoutCutoff(date).getTime())),
      commissions: p.released,
      adjustments: p.adjustments,
      minNetCents: p.config.minNetCents,
    });
  });
  protected readonly totals = computed(() => includedTotals(this.plan()));
  protected readonly minNet = computed(() => this.payout()?.config.minNetCents ?? 0);
  protected readonly stripState = computed<StripState>(() => {
    if (!this.payout()) return 'loading';
    if (this.approving() || this.openPayout()?.status === 'processing') return 'processing';
    if (this.openPayout()?.status === 'partial') return 'partial';
    return this.totals().count === 0 ? 'empty' : 'ready';
  });

  /** A comissão aberta no drawer, relida da lista mais nova depois de cada ação. */
  protected readonly current = computed(() => {
    const id = this.currentId();
    if (!id) return null;
    return this.list().find((c) => c.id === id) ?? this.payout()?.released.find((c) => c.id === id) ?? null;
  });

  constructor() {
    void this.reload();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  /** `silent`: depois de uma ação, relê sem trocar a tabela pelo esqueleto. */
  async reload(silent = false): Promise<void> {
    this.error.set(null);
    await Promise.all([this.loadList(silent), this.loadPayout()]);
  }

  private async loadList(silent = false): Promise<void> {
    if (!silent) this.state.set('loading');
    try {
      this.list.set(await this.repo.load(this.period()));
      this.state.set('ready');
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  private async loadPayout(): Promise<void> {
    try {
      const state = await this.repo.payoutState();
      this.payout.set(state);
      this.badges.set(new Set(state.released.map((c) => c.ambassadorId)).size);
    } catch (error) {
      this.error.set(`Não deu para ler o repasse: ${callableErrorMessage(error)}`);
    }
  }

  protected loadAmbassadors(): void {
    if (this.ambassadorOptions().length > 0) return;
    this.repo
      .ambassadors()
      .then((list) => this.ambassadorOptions.set(list))
      .catch((error) => this.drawerError.set(callableErrorMessage(error)));
  }

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
    this.page.set(0);
  }

  protected setFilters(filters: Filters): void {
    this.filters.set(filters);
    this.page.set(0);
  }

  protected setPeriod(period: Period): void {
    this.period.set(period);
    this.page.set(0);
    this.selected.set(this.empty);
    void this.loadList();
  }

  protected openCommission(c: Commission): void {
    this.drawerError.set(null);
    this.currentId.set(c.id);
  }

  protected closeCommission(): void {
    this.currentId.set(null);
  }

  protected exportCsv(): void {
    const label = periodLabel(this.period()).toLowerCase().replace(/[^a-z0-9à-ú]+/g, '-');
    downloadText(`comissoes-squad-${label}.csv`, commissionsCsv(this.rows()));
  }

  protected async approve(): Promise<void> {
    const date = this.openDate();
    if (!date) return;
    this.busy.set(true);
    this.approving.set(true);
    this.drawerError.set(null);
    try {
      const out = await this.repo.approve(date);
      this.confirmApprove.set(false);
      this.payoutOpen.set(false);
      this.showToast(
        out.status === 'partial'
          ? `${out.failedCount} ${out.failedCount === 1 ? 'crédito falhou' : 'créditos falharam'} · tentar de novo`
          : `Repasse aprovado · ${brl(out.totalCents)} para ${out.creditedCount} ${out.creditedCount === 1 ? 'embaixador' : 'embaixadores'}`,
      );
    } catch (error) {
      this.confirmApprove.set(false);
      this.error.set(errorText(error));
    } finally {
      this.approving.set(false);
      this.busy.set(false);
      await this.reload(true);
    }
  }

  protected async holdSelected(): Promise<void> {
    const date = this.openDate();
    if (!date) return;
    const ids = [...this.selected()];
    const ok = await this.run(() => this.repo.setHold(ids, date, this.holdReason().trim()));
    if (ok) {
      this.holdOpen.set(false);
      this.holdReason.set('');
      this.selected.set(this.empty);
      this.showToast(`${ids.length} ${ids.length === 1 ? 'comissão retida' : 'comissões retidas'} no repasse de ${dayMonthOfKey(date)}`);
    }
  }

  protected async holdRow(row: PlanRow, reason: string): Promise<void> {
    const date = this.openDate();
    if (!date) return;
    if (await this.run(() => this.repo.setHold(row.commissionIds, date, reason))) {
      this.showToast(`${row.ambassadorName} fica fora do repasse de ${dayMonthOfKey(date)}`);
    }
  }

  protected async unholdRow(row: PlanRow): Promise<void> {
    const date = this.openDate();
    if (!date) return;
    if (await this.run(() => this.repo.setHold(row.heldCommissionIds, date, null))) {
      this.showToast(`${row.ambassadorName} volta para o repasse de ${dayMonthOfKey(date)}`);
    }
  }

  protected async cancelCommission(c: Commission, reason: string): Promise<void> {
    if (await this.run(() => this.repo.cancel(c.id, reason))) {
      this.showToast(c.status === 'paid' ? 'Comissão cancelada · ajuste no próximo repasse' : 'Comissão cancelada');
    }
  }

  protected async reassignCommission(c: Commission, ambassadorId: string, reason: string): Promise<void> {
    const to = this.ambassadorOptions().find((a) => a.id === ambassadorId)?.name ?? 'outro embaixador';
    if (await this.run(() => this.repo.reassign(c.id, ambassadorId, reason))) {
      this.showToast(`Comissão reatribuída a ${to}`);
    }
  }

  /** Executa uma ação de escrita, mostra o erro no drawer/diálogo aberto e recarrega no sucesso. */
  private async run(action: () => Promise<void>): Promise<boolean> {
    this.busy.set(true);
    this.drawerError.set(null);
    try {
      await action();
      await this.reload(true);
      return true;
    } catch (error) {
      this.drawerError.set(errorText(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}

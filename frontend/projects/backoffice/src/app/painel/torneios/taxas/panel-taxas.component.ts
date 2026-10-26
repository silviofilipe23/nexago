import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { SquadKpiComponent } from '../../squad/ui/squad-kpi.component';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import { STATUS_LABEL, STATUS_TONE } from '../data/tournament-status-label';
import { TournamentsRepository, type TournamentRow } from '../data/tournaments.repository';
import { isVersionConflict, saveErrorText } from '../planos/data/save-errors';
import { activeOverrideIds, buildFeeRow, rowMode, type FeeFilter, type FeeRow } from './data/fee-rows';
import {
  TournamentFeesRepository,
  type FeeDefaults,
  type FeeLogEntry,
  type FeeOverrideEntry,
  type OrganizerFeeInfo,
  type TournamentRevenue,
} from './data/tournament-fees.repository';
import {
  DEFAULT_FEE_RULE,
  FEE_PAYER_LABEL,
  brl,
  dayLabel,
  pctLabel,
  saoPauloToday,
  type FeeRule,
} from './data/tournament-fees';
import { FeeDefaultCardComponent } from './ui/fee-default-card.component';
import { FeeDrawerComponent, type FeeSaveRequest } from './ui/fee-drawer.component';

const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/**
 * Torneios › Taxas: a comissão da NexaGO sobre as inscrições — padrão da plataforma e exceção
 * por torneio (personalizada ou isento), com o já cobrado e o histórico. A cobrança aplica a
 * mesma cascata no servidor (`functions/src/tournament-fees.ts`).
 */
@Component({
  selector: 'bo-panel-taxas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    PanelShellComponent,
    PanelCardComponent,
    PillComponent,
    IconComponent,
    SquadKpiComponent,
    ConfirmDialogComponent,
    FeeDefaultCardComponent,
    FeeDrawerComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Torneios · comissão sobre inscrições</div>
          <h1>Taxas</h1>
          @if (state() === 'ready') {
            <span class="sub">Taxa padrão {{ pct(defaults().rule.percent) }} · {{ exceptionCount() }} {{ exceptionCount() === 1 ? 'torneio' : 'torneios' }} com exceção</span>
          }
        </div>
        <div class="spacer"></div>
        <div class="search">
          <bo-icon name="search" [size]="15" />
          <input type="search" placeholder="Nome do torneio — Enter para buscar" aria-label="Buscar torneio" [value]="term()" (input)="term.set(value($event))" (keydown.enter)="search()" />
          @if (term()) {
            <button type="button" class="clear" aria-label="Limpar busca" (click)="clearSearch()">✕</button>
          }
        </div>
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="load()"><bo-icon name="swap" [size]="13" /> Atualizar</button>
      </header>

      <div class="body">
        @switch (state()) {
          @case ('loading') {
            <div class="kpis" aria-busy="true" aria-label="Carregando taxas">
              @for (s of [0, 1, 2, 3]; track s) { <div class="skel kpi"></div> }
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
              <bo-squad-kpi label="Taxas cobradas" [value]="revenueReady() ? brl(totals().fee) : '…'" [hint]="scopeHint()" />
              <bo-squad-kpi label="Taxa efetiva" [value]="effectiveRate()" hint="Taxa ÷ valor pago online" />
              <bo-squad-kpi label="Pago online" [value]="revenueReady() ? brl(totals().gross) : '…'" [hint]="totals().payments + ' pagamentos'" />
              <bo-squad-kpi label="Torneios com exceção" [value]="String(exceptionCount())" [hint]="customCount() + ' personalizada · ' + exemptCount() + ' isento'" />
            </div>

            <bo-fee-default-card
              [rule]="defaults().rule"
              [version]="defaults().version"
              [updatedAt]="defaults().updatedAt"
              [updatedBy]="defaults().updatedBy"
              [canEdit]="canEdit()"
              [saving]="defaultSaving()"
              [error]="defaultError()"
              (save)="saveDefault($event)"
            />

            <bo-panel-card pad="sm" title="Taxa por torneio">
              <div card-actions class="chips">
                @for (f of filterChips(); track f.id) {
                  <button type="button" class="bo-chip" [class.active]="filter() === f.id" (click)="setFilter(f.id)">{{ f.label }}</button>
                }
              </div>

              <div class="t-head">
                <span>Torneio</span><span>Data</span><span>Status</span><span class="r">Inscrição</span><span>Taxa</span><span class="r">Receita NexaGO</span><span></span>
              </div>
              <div class="t-body">
              @for (r of rows(); track r.tournament.id) {
                <button type="button" class="t-row" [class.sel]="openId() === r.tournament.id" (click)="open(r.tournament.id)">
                  <span class="main">
                    <span class="name">{{ r.tournament.name }}</span>
                    <span class="org">{{ r.organizerName || 'Organizador sem nome' }}{{ paymentsLabel(r) }}</span>
                  </span>
                  <span class="mono dim">{{ r.tournament.startAt ? date(r.tournament.startAt) : '—' }}</span>
                  <span><bo-pill [tone]="statusTone[r.tournament.status]">{{ statusLabel[r.tournament.status] }}</bo-pill></span>
                  <span class="mono r">{{ priceLabel(r.tournament) }}</span>
                  <span class="fee">
                    @switch (rowMode(r)) {
                      @case ('isento') { <bo-pill tone="green">Isento</bo-pill> }
                      @case ('custom') { <bo-pill tone="orange">{{ pct(r.rule.percent) }} · personalizada</bo-pill> }
                      @default { <bo-pill tone="dim">{{ pct(r.rule.percent) }} · {{ r.rule.source === 'organizer' ? 'do cadastro' : 'padrão' }}</bo-pill> }
                    }
                    @if (untilLabel(r); as u) { <span class="until">{{ u }}</span> }
                  </span>
                  <span class="mono r" [class.dim]="!revenueOf(r)">{{ revenueLabel(r) }}</span>
                  <span class="edit"><bo-icon name="edit" [size]="13" /> {{ canEdit() ? 'Editar' : 'Ver' }}</span>
                </button>
              } @empty {
                <p class="status">{{ listLoading() ? 'Carregando torneios…' : emptyText() }}</p>
              }
              </div>

              @if (listMode() && hasMore()) {
                <button type="button" class="bo-mini-btn more" [disabled]="listLoading()" (click)="loadMore()">{{ listLoading() ? 'Carregando…' : 'Carregar mais' }}</button>
              }
              <p class="legend">
                {{ listMode() ? 'Ordenado por data de início (mais recentes primeiro). Busque pelo nome para chegar em torneios sem data.' : 'Todas as exceções vigentes, sem paginação.' }}
                Receita = taxa já cobrada nos pagamentos online confirmados no caixa do torneio.
              </p>
            </bo-panel-card>
          }
        }
      </div>

      @if (openRow(); as row) {
        <bo-fee-drawer
          [row]="row"
          [today]="today"
          [revenue]="revenueOf(row)"
          [history]="history()"
          [historyError]="historyError()"
          [canEdit]="canEdit()"
          [saving]="drawerSaving()"
          [error]="drawerError()"
          [conflict]="drawerConflict()"
          (closed)="close()"
          (save)="saveFee(row, $event)"
          (reload)="load()"
        />
      }

      @if (toast(); as t) {
        <div class="toast" role="status"><bo-icon name="check" [size]="15" /> {{ t }}</div>
      }

      <bo-confirm-dialog [open]="leaveOpen()" title="Sair sem salvar?" description="A alteração na taxa será descartada." confirmLabel="Sair sem salvar" tone="danger" (confirmed)="resolveLeave(true)" (dismissed)="resolveLeave(false)" />
    </bo-panel-shell>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .sub { font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text-dim); }
    .spacer { flex: 1; }
    .search { width: 300px; max-width: 100%; height: 34px; padding: 0 12px; box-sizing: border-box; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-2); display: flex; align-items: center; gap: 9px; color: var(--nx-text-dim); }
    .search:focus-within { border-color: rgba(255, 106, 26, 0.5); }
    .search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 13px; }
    .clear { background: transparent; border: none; cursor: pointer; color: var(--nx-text-dim); font: inherit; padding: 0 2px; }
    .body { flex: 1; padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .push { margin-left: auto; flex: none; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .t-head, .t-row { display: grid; grid-template-columns: minmax(0, 1.7fr) 64px 160px 110px 190px 120px 72px; gap: 12px; align-items: center; }
    .t-head { padding: 4px 10px 10px; border-bottom: 1px solid var(--nx-line); }
    .t-head span { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .r { text-align: right; }
    .t-row { width: 100%; padding: 12px 10px; border: none; border-bottom: 1px solid var(--nx-line); border-radius: 8px; background: transparent; color: var(--nx-text); text-align: left; font: inherit; cursor: pointer; }
    .t-row:last-child { border-bottom: none; }
    .t-row:hover, .t-row.sel { background: var(--nx-surface-1); }
    .t-row:focus-visible { outline: 2px solid rgba(255, 106, 26, 0.6); outline-offset: -2px; }
    .main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .org { font-size: 11.5px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mono { font-family: var(--nx-font-mono); font-size: 12.5px; }
    .dim { color: var(--nx-text-dim); }
    .fee { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
    .until { font-size: 10.5px; color: var(--nx-text-dim); }
    .edit { display: flex; align-items: center; justify-content: flex-end; gap: 6px; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text-mute); }
    .t-row:hover .edit { color: var(--nx-text); }
    .status { margin: 16px 10px 4px; font-size: 12.5px; color: var(--nx-text-dim); }
    .more { align-self: flex-start; margin-top: 14px; }
    .legend { margin: 14px 10px 0; font-size: 11.5px; line-height: 1.45; color: var(--nx-text-dim); }
    .skel { border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .skel.kpi { height: 86px; border-radius: var(--nx-r-3); }
    .skel.card { height: 150px; }
    .skel.table { height: 420px; }
    .toast { position: fixed; left: 50%; top: 24px; transform: translateX(-50%); z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .toast bo-icon { color: var(--nx-win); }
    @media (max-width: 1280px) {
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .t-head { display: none; }
      .t-row { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'main fee' 'meta rev'; row-gap: 8px; }
      .t-row > :nth-child(2), .t-row > :nth-child(3), .t-row > :nth-child(4), .t-row > :nth-child(7) { display: none; }
      .t-row .main { grid-area: main; }
      .t-row .fee { grid-area: fee; align-items: flex-end; }
      .t-row > :nth-child(6) { grid-area: rev; }
    }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
      .search { width: 100%; }
      .kpis { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class PanelTaxasComponent {
  private readonly repo = inject(TournamentFeesRepository);
  private readonly tournaments = inject(TournamentsRepository);
  private readonly auth = inject(AuthService);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private cursor: QueryDocumentSnapshot<DocumentData> | null = null;

  private readonly defaultCard = viewChild(FeeDefaultCardComponent);
  private readonly drawer = viewChild(FeeDrawerComponent);

  protected readonly String = String;
  protected readonly brl = brl;
  protected readonly pct = pctLabel;
  protected readonly rowMode = rowMode;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly today = saoPauloToday();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly defaults = signal<FeeDefaults>({ rule: DEFAULT_FEE_RULE, version: 1, updatedAt: null, updatedBy: null });
  private readonly overrides = signal<ReadonlyMap<string, FeeOverrideEntry>>(new Map());
  private readonly listRows = signal<readonly TournamentRow[]>([]);
  private readonly idRows = signal<readonly TournamentRow[]>([]);
  private readonly organizers = signal<ReadonlyMap<string, OrganizerFeeInfo>>(new Map());
  private readonly revenue = signal<ReadonlyMap<string, TournamentRevenue | null>>(new Map());
  protected readonly hasMore = signal(false);
  protected readonly listLoading = signal(false);
  protected readonly term = signal('');
  protected readonly filter = signal<FeeFilter>('todos');

  protected readonly openId = signal<string | null>(null);
  protected readonly history = signal<FeeLogEntry[] | null>(null);
  protected readonly historyError = signal<string | null>(null);
  protected readonly drawerSaving = signal(false);
  protected readonly drawerError = signal<string | null>(null);
  protected readonly drawerConflict = signal(false);
  protected readonly defaultSaving = signal(false);
  protected readonly defaultError = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly leaveOpen = signal(false);
  private leaveResolver: ((ok: boolean) => void) | null = null;

  protected readonly canEdit = computed(() => this.auth.isSuperAdmin() || this.auth.roles().includes('admin'));
  protected readonly listMode = computed(() => this.filter() === 'todos' || this.filter() === 'padrao');

  protected readonly customCount = computed(() => activeOverrideIds(this.overrides(), 'custom', this.today).length);
  protected readonly exemptCount = computed(() => activeOverrideIds(this.overrides(), 'isento', this.today).length);
  protected readonly exceptionCount = computed(() => this.customCount() + this.exemptCount());
  protected readonly filterChips = computed<ReadonlyArray<{ id: FeeFilter; label: string }>>(() => [
    { id: 'todos', label: 'Todos' },
    { id: 'padrao', label: 'Padrão' },
    { id: 'custom', label: `Personalizada · ${this.customCount()}` },
    { id: 'isento', label: `Isento · ${this.exemptCount()}` },
  ]);

  private readonly allRows = computed<FeeRow[]>(() => {
    const source = this.listMode() ? this.listRows() : this.idRows();
    const overrides = this.overrides();
    const organizers = this.organizers();
    const rule = this.defaults().rule;
    return source.map((t) =>
      buildFeeRow(t, overrides.get(t.id), t.managerId ? organizers.get(t.managerId) : undefined, rule, this.today),
    );
  });

  protected readonly rows = computed<FeeRow[]>(() => {
    const f = this.filter();
    const term = this.term().trim().toLowerCase();
    return this.allRows().filter((r) => {
      if (f !== 'todos' && rowMode(r) !== f) {
        return false;
      }
      // Na lista paginada a busca vai ao Firestore; nas exceções (lidas por id), filtra aqui.
      return this.listMode() || !term || r.tournament.name.toLowerCase().includes(term);
    });
  });

  protected readonly openRow = computed(() => this.allRows().find((r) => r.tournament.id === this.openId()) ?? null);

  protected readonly totals = computed(() => {
    let fee = 0;
    let gross = 0;
    let payments = 0;
    for (const r of this.rows()) {
      const rev = this.revenue().get(r.tournament.id);
      if (rev) {
        fee += rev.feeReais;
        gross += rev.grossReais;
        payments += rev.payments;
      }
    }
    return { fee, gross, payments };
  });
  protected readonly revenueReady = computed(() => this.rows().every((r) => this.revenue().has(r.tournament.id)));
  protected readonly effectiveRate = computed(() => {
    if (!this.revenueReady()) {
      return '…';
    }
    const { fee, gross } = this.totals();
    return gross > 0 ? `${((fee / gross) * 100).toFixed(1).replace('.', ',')}%` : '—';
  });
  protected readonly scopeHint = computed(() => {
    const n = this.rows().length;
    return `Nos ${n} ${n === 1 ? 'torneio' : 'torneios'} da lista`;
  });
  protected readonly emptyText = computed(() => {
    if (this.filter() === 'custom') {
      return 'Nenhum torneio com taxa personalizada vigente.';
    }
    if (this.filter() === 'isento') {
      return 'Nenhum torneio isento vigente.';
    }
    return this.term() ? `Nenhum torneio cujo nome comece com “${this.term()}”.` : 'Nenhum torneio com data de início neste projeto.';
  });

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.drawerError.set(null);
    this.drawerConflict.set(false);
    this.defaultError.set(null);
    this.revenue.set(new Map());
    try {
      const [defaults, overrides] = await Promise.all([this.repo.defaults(), this.repo.overrides()]);
      this.defaults.set(defaults);
      this.overrides.set(overrides);
      await this.loadRows(false);
      this.state.set('ready');
      if (this.openId()) {
        void this.loadHistory(this.openId()!);
      }
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  /** Lista paginada (Todos/Padrão) ou as exceções vigentes por id (Personalizada/Isento). */
  private async loadRows(append: boolean): Promise<void> {
    this.listLoading.set(true);
    try {
      let fresh: readonly TournamentRow[];
      if (this.listMode()) {
        const page = await this.tournaments.listTournaments(this.term(), append ? this.cursor : null);
        this.cursor = page.cursor;
        this.hasMore.set(page.hasMore);
        fresh = page.rows;
        this.listRows.set(append ? [...this.listRows(), ...page.rows] : page.rows);
      } else {
        const mode = this.filter() === 'custom' ? 'custom' : 'isento';
        fresh = await this.tournaments.byIds(activeOverrideIds(this.overrides(), mode, this.today));
        this.idRows.set(fresh);
      }
      await this.loadOrganizers(fresh);
      void this.loadRevenue(fresh);
    } finally {
      this.listLoading.set(false);
    }
  }

  private async loadOrganizers(rows: readonly TournamentRow[]): Promise<void> {
    const known = this.organizers();
    const missing = rows.map((t) => t.managerId).filter((id): id is string => !!id && !known.has(id));
    if (missing.length === 0) {
      return;
    }
    const found = await this.repo.organizers(missing);
    this.organizers.update((m) => new Map([...m, ...found]));
  }

  /** Uma agregação por torneio; falha vira `null` (célula "—"), não derruba a tela. */
  private async loadRevenue(rows: readonly TournamentRow[]): Promise<void> {
    const ids = rows.map((t) => t.id).filter((id) => !this.revenue().has(id));
    await Promise.all(
      ids.map(async (id) => {
        const value = await this.repo.revenue(id).catch(() => null);
        this.revenue.update((m) => new Map(m).set(id, value));
      }),
    );
  }

  protected async setFilter(f: FeeFilter): Promise<void> {
    const wasList = this.listMode();
    this.filter.set(f);
    if (!this.listMode()) {
      await this.loadRows(false);
    } else if (!wasList) {
      // Voltou para a lista: a página já carregada continua valendo.
      void this.loadRevenue(this.listRows());
    }
  }

  protected search(): void {
    if (this.listMode()) {
      void this.loadRows(false);
    }
  }

  protected clearSearch(): void {
    this.term.set('');
    this.search();
  }

  protected loadMore(): void {
    if (this.hasMore() && !this.listLoading()) {
      void this.loadRows(true);
    }
  }

  protected async open(id: string): Promise<void> {
    this.openId.set(id);
    this.drawerError.set(null);
    this.drawerConflict.set(false);
    await this.loadHistory(id);
  }

  private async loadHistory(id: string): Promise<void> {
    this.history.set(null);
    this.historyError.set(null);
    try {
      const entries = await this.repo.log(id);
      if (this.openId() === id) {
        this.history.set(entries);
      }
    } catch (error) {
      this.historyError.set(callableErrorMessage(error));
    }
  }

  protected close(): void {
    this.openId.set(null);
  }

  protected async saveDefault(rule: FeeRule): Promise<void> {
    this.defaultSaving.set(true);
    this.defaultError.set(null);
    try {
      await this.repo.saveDefault(rule, this.defaults().version);
      this.defaults.set(await this.repo.defaults());
      this.defaultCard()?.finishEdit();
      this.showToast(
        `Taxa padrão atualizada para ${pctLabel(rule.percent)} · mínimo ${brl(rule.floorReais)} · ` +
          `quem paga: ${FEE_PAYER_LABEL[rule.payer]}`,
      );
    } catch (error) {
      this.defaultError.set(saveErrorText(error));
      if (isVersionConflict(error)) {
        this.defaults.set(await this.repo.defaults().catch(() => this.defaults()));
      }
    } finally {
      this.defaultSaving.set(false);
    }
  }

  protected async saveFee(row: FeeRow, req: FeeSaveRequest): Promise<void> {
    const { draft, notify } = req;
    this.drawerSaving.set(true);
    this.drawerError.set(null);
    this.drawerConflict.set(false);
    try {
      const out = await this.repo.saveTournamentFee({
        tournamentId: row.tournament.id,
        mode: draft.mode,
        ...(draft.mode === 'custom' ? { percent: draft.percent, floorReais: draft.floorReais, payer: draft.payer } : {}),
        ...(draft.mode !== 'padrao' ? { reason: draft.reason, until: draft.until || null } : {}),
        notify,
        version: row.version,
      });
      this.overrides.update((m) =>
        new Map(m).set(row.tournament.id, { tournamentId: row.tournament.id, override: out.override, version: out.version }),
      );
      this.openId.set(null);
      this.showToast(`Taxa de ${row.tournament.name} atualizada${out.notified ? ' · organizador avisado' : ''}`);
    } catch (error) {
      this.drawerError.set(saveErrorText(error));
      this.drawerConflict.set(isVersionConflict(error));
    } finally {
      this.drawerSaving.set(false);
    }
  }

  protected revenueOf(r: FeeRow): TournamentRevenue | null {
    return this.revenue().get(r.tournament.id) ?? null;
  }

  protected revenueLabel(r: FeeRow): string {
    if (!this.revenue().has(r.tournament.id)) {
      return '…';
    }
    const rev = this.revenueOf(r);
    return rev ? brl(rev.feeReais) : '—';
  }

  protected paymentsLabel(r: FeeRow): string {
    const rev = this.revenueOf(r);
    return rev && rev.payments > 0 ? ` · ${rev.payments} ${rev.payments === 1 ? 'pagamento' : 'pagamentos'}` : '';
  }

  protected priceLabel(t: TournamentRow): string {
    const p = t.entryFeeReais;
    if (!p) {
      return 'Grátis';
    }
    return p.min === p.max ? brl(p.min) : `${brl(p.min)}+`;
  }

  protected untilLabel(r: FeeRow): string | null {
    const until = r.override?.until;
    if (!until) {
      return null;
    }
    return r.expired ? `exceção venceu em ${dayLabel(until)}` : `até ${dayLabel(until)}`;
  }

  protected date(d: Date): string {
    return DATE.format(d);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.hasUnsaved()) {
      return true;
    }
    this.leaveOpen.set(true);
    return new Promise<boolean>((resolve) => (this.leaveResolver = resolve));
  }

  protected resolveLeave(ok: boolean): void {
    this.leaveOpen.set(false);
    this.leaveResolver?.(ok);
    this.leaveResolver = null;
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsaved()) {
      event.preventDefault();
    }
  }

  private hasUnsaved(): boolean {
    return !!(this.defaultCard()?.isDirty() || this.drawer()?.isDirty());
  }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}

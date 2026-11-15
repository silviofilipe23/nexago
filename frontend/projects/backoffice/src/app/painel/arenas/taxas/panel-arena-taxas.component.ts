import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { isVersionConflict, saveErrorText } from '../../torneios/planos/data/save-errors';
import { dayLabel, pctLabel, saoPauloToday } from '../../torneios/taxas/data/tournament-fees';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import { ArenasRepository, type ArenaRow } from '../data/arenas.repository';
import {
  ARENA_FEE_PRODUCTS,
  DEFAULT_ARENA_FEE_DEFAULTS,
  PRODUCT_LABEL,
  TIER_LABEL,
  draftProducts,
  feeTierOf,
  isOverrideActive,
  resolveArenaFee,
  type ArenaFeeDefaults,
  type ArenaFeeDraft,
  type ArenaFeeOverride,
  type ArenaFeeProduct,
  type ArenaFeeTier,
} from './data/arena-fees';
import {
  ArenaFeesRepository,
  type ArenaFeeDefaultsEntry,
  type ArenaFeeLogEntry,
  type ArenaFeeOverrideEntry,
} from './data/arena-fees.repository';
import { ArenaFeeDefaultCardComponent } from './ui/arena-fee-default-card.component';
import { ArenaFeeDrawerComponent } from './ui/arena-fee-drawer.component';

type Filter = 'todas' | 'excecao';

interface Row {
  arena: ArenaRow;
  tier: ArenaFeeTier;
  override: ArenaFeeOverride | null;
  version: number;
  active: boolean;
  cells: Record<ArenaFeeProduct, { percent: number; fromArena: boolean }>;
}

/**
 * Arenas › Taxas: o % da NexaGO sobre o que a arena recebe online — padrão por plano (reservas,
 * planos de horário, aulas, CRM) e do clubinho, e exceção por arena e produto. A cobrança aplica a
 * mesma cascata no servidor (`functions/src/arena-fees.ts`).
 */
@Component({
  selector: 'bo-panel-arena-taxas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    PanelShellComponent,
    PanelCardComponent,
    PillComponent,
    IconComponent,
    ConfirmDialogComponent,
    ArenaFeeDefaultCardComponent,
    ArenaFeeDrawerComponent,
  ],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Arenas · taxa sobre pagamentos online</div>
          <h1>Taxas</h1>
          @if (state() === 'ready') {
            <span class="sub">{{ exceptionCount() }} {{ exceptionCount() === 1 ? 'arena' : 'arenas' }} com exceção</span>
          }
        </div>
        <div class="spacer"></div>
        <div class="search">
          <bo-icon name="search" [size]="15" />
          <input type="search" placeholder="Nome ou cidade da arena" aria-label="Buscar arena" [value]="term()" (input)="term.set(value($event))" />
          @if (term()) {
            <button type="button" class="clear" aria-label="Limpar busca" (click)="term.set('')">✕</button>
          }
        </div>
        <button type="button" class="bo-mini-btn" [disabled]="state() === 'loading'" (click)="load()"><bo-icon name="swap" [size]="13" /> Atualizar</button>
      </header>

      <div class="body">
        @switch (state()) {
          @case ('loading') {
            <div class="skel card" aria-busy="true" aria-label="Carregando taxas"></div>
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
            <bo-arena-fee-default-card
              [defaults]="defaults().defaults"
              [version]="defaults().version"
              [updatedAt]="defaults().updatedAt"
              [updatedBy]="defaults().updatedBy"
              [canEdit]="canEdit()"
              [saving]="defaultSaving()"
              [error]="defaultError()"
              (save)="saveDefault($event)"
            />

            <bo-panel-card pad="sm" title="Taxa por arena">
              <div card-actions class="chips">
                <button type="button" class="bo-chip" [class.active]="filter() === 'todas'" (click)="filter.set('todas')">Todas</button>
                <button type="button" class="bo-chip" [class.active]="filter() === 'excecao'" (click)="filter.set('excecao')">Com exceção · {{ exceptionCount() }}</button>
              </div>

              <div class="t-head">
                <span>Arena</span><span>Plano</span>
                @for (p of products; track p) { <span class="r">{{ productLabel[p] }}</span> }
                <span></span>
              </div>
              <div class="t-body">
                @for (r of rows(); track r.arena.id) {
                  <button type="button" class="t-row" [class.sel]="openId() === r.arena.id" (click)="open(r.arena.id)">
                    <span class="main">
                      <span class="name">{{ r.arena.name }}</span>
                      <span class="org">{{ r.arena.city || 'Sem cidade' }}{{ untilLabel(r) }}</span>
                    </span>
                    <span><bo-pill [tone]="r.tier === 'none' ? 'dim' : 'orange'">{{ tierLabel[r.tier] }}</bo-pill></span>
                    @for (p of products; track p) {
                      <span class="mono r" [class.hl]="r.cells[p].fromArena" [class.dim]="!r.cells[p].fromArena" [attr.data-label]="productLabel[p]">{{ pct(r.cells[p].percent) }}</span>
                    }
                    <span class="edit"><bo-icon name="edit" [size]="13" /> {{ canEdit() ? 'Editar' : 'Ver' }}</span>
                  </button>
                } @empty {
                  <p class="status">{{ filter() === 'excecao' ? 'Nenhuma arena com exceção vigente.' : 'Nenhuma arena encontrada.' }}</p>
                }
              </div>
              <p class="legend">
                Em laranja, o % vem da exceção da arena; o resto segue o padrão. Plano = plano do cadastro com assinatura
                ativa, em atraso ou cancelando; a cobrança confere também o fim do período pago.
              </p>
            </bo-panel-card>
          }
        }
      </div>

      @if (openRow(); as row) {
        <bo-arena-fee-drawer
          [arenaName]="row.arena.name"
          [tier]="row.tier"
          [defaults]="defaults().defaults"
          [override]="row.override"
          [today]="today"
          [history]="history()"
          [historyError]="historyError()"
          [canEdit]="canEdit()"
          [saving]="drawerSaving()"
          [error]="drawerError()"
          [conflict]="drawerConflict()"
          (closed)="openId.set(null)"
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
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .t-head, .t-row { display: grid; grid-template-columns: minmax(0, 1.6fr) 96px repeat(5, minmax(64px, 0.7fr)) 72px; gap: 12px; align-items: center; }
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
    .hl { color: var(--nx-orange-500); font-weight: 700; }
    .edit { display: flex; align-items: center; justify-content: flex-end; gap: 6px; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text-mute); }
    .t-row:hover .edit { color: var(--nx-text); }
    .status { margin: 16px 10px 4px; font-size: 12.5px; color: var(--nx-text-dim); }
    .legend { margin: 14px 10px 0; font-size: 11.5px; line-height: 1.45; color: var(--nx-text-dim); }
    .skel { border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .skel.card { height: 170px; }
    .skel.table { height: 420px; }
    .toast { position: fixed; left: 50%; top: 24px; transform: translateX(-50%); z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .toast bo-icon { color: var(--nx-win); }
    @media (max-width: 1100px) {
      .t-head { display: none; }
      .t-row { grid-template-columns: repeat(5, minmax(0, 1fr)); row-gap: 8px; }
      .t-row .main { grid-column: 1 / 5; }
      .t-row > :nth-child(2) { grid-column: 5; justify-self: end; }
      .t-row .edit { display: none; }
      .t-row .mono { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; }
      .t-row .mono::before { content: attr(data-label); font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--nx-text-dim); font-weight: 500; }
    }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
      .search { width: 100%; }
      .t-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .t-row .main { grid-column: 1 / 3; }
      .t-row > :nth-child(2) { grid-column: 3; }
    }
  `,
})
export class PanelArenaTaxasComponent {
  private readonly repo = inject(ArenaFeesRepository);
  private readonly arenasRepo = inject(ArenasRepository);
  private readonly auth = inject(AuthService);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly defaultCard = viewChild(ArenaFeeDefaultCardComponent);
  private readonly drawer = viewChild(ArenaFeeDrawerComponent);

  protected readonly pct = pctLabel;
  protected readonly products = ARENA_FEE_PRODUCTS;
  protected readonly productLabel = PRODUCT_LABEL;
  protected readonly tierLabel = TIER_LABEL;
  protected readonly today = saoPauloToday();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly defaults = signal<ArenaFeeDefaultsEntry>({
    defaults: DEFAULT_ARENA_FEE_DEFAULTS,
    version: 1,
    updatedAt: null,
    updatedBy: null,
  });
  private readonly arenas = signal<readonly ArenaRow[]>([]);
  private readonly overrides = signal<ReadonlyMap<string, ArenaFeeOverrideEntry>>(new Map());
  protected readonly term = signal('');
  protected readonly filter = signal<Filter>('todas');

  protected readonly openId = signal<string | null>(null);
  protected readonly history = signal<ArenaFeeLogEntry[] | null>(null);
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

  private readonly allRows = computed<Row[]>(() => {
    const defaults = this.defaults().defaults;
    const overrides = this.overrides();
    return this.arenas()
      .filter((a) => !a.unclaimed)
      .map((arena) => {
        const entry = overrides.get(arena.id);
        const override = entry?.override ?? null;
        const tier = feeTierOf(arena.planTier, arena.planStatus);
        const cells = {} as Row['cells'];
        for (const p of ARENA_FEE_PRODUCTS) cells[p] = resolveArenaFee(defaults, tier, override, p, this.today);
        return {
          arena,
          tier,
          override,
          version: entry?.version ?? 0,
          active: !!override && isOverrideActive(override, this.today),
          cells,
        };
      });
  });

  protected readonly exceptionCount = computed(() => this.allRows().filter((r) => r.active).length);

  protected readonly rows = computed<Row[]>(() => {
    const term = this.term().trim().toLowerCase();
    const onlyExceptions = this.filter() === 'excecao';
    return this.allRows().filter(
      (r) =>
        (!onlyExceptions || r.active) &&
        (!term || r.arena.name.toLowerCase().includes(term) || (r.arena.city ?? '').toLowerCase().includes(term)),
    );
  });

  protected readonly openRow = computed(() => this.allRows().find((r) => r.arena.id === this.openId()) ?? null);

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.drawerError.set(null);
    this.drawerConflict.set(false);
    this.defaultError.set(null);
    try {
      const [defaults, overrides, arenas] = await Promise.all([
        this.repo.defaults(),
        this.repo.overrides(),
        this.arenasRepo.listAll(),
      ]);
      this.defaults.set(defaults);
      this.overrides.set(overrides);
      this.arenas.set(arenas);
      this.state.set('ready');
      if (this.openId()) {
        void this.loadHistory(this.openId()!);
      }
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
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

  protected async saveDefault(defaults: ArenaFeeDefaults): Promise<void> {
    this.defaultSaving.set(true);
    this.defaultError.set(null);
    try {
      await this.repo.saveDefault(defaults, this.defaults().version);
      this.defaults.set(await this.repo.defaults());
      this.defaultCard()?.finishEdit();
      this.showToast('Taxa padrão das arenas atualizada');
    } catch (error) {
      this.defaultError.set(saveErrorText(error));
      if (isVersionConflict(error)) {
        this.defaults.set(await this.repo.defaults().catch(() => this.defaults()));
      }
    } finally {
      this.defaultSaving.set(false);
    }
  }

  protected async saveFee(row: Row, draft: ArenaFeeDraft): Promise<void> {
    this.drawerSaving.set(true);
    this.drawerError.set(null);
    this.drawerConflict.set(false);
    try {
      const out = await this.repo.saveArenaFee({
        arenaId: row.arena.id,
        mode: draft.mode,
        ...(draft.mode === 'custom'
          ? { products: draftProducts(draft), reason: draft.reason, until: draft.until || null }
          : {}),
        version: row.version,
      });
      this.overrides.update((m) => new Map(m).set(row.arena.id, out));
      this.openId.set(null);
      this.showToast(`Taxa de ${row.arena.name} atualizada`);
    } catch (error) {
      this.drawerError.set(saveErrorText(error));
      this.drawerConflict.set(isVersionConflict(error));
    } finally {
      this.drawerSaving.set(false);
    }
  }

  protected untilLabel(r: Row): string {
    const until = r.override?.until;
    if (!until) {
      return '';
    }
    return r.active ? ` · exceção até ${dayLabel(until)}` : ` · exceção venceu em ${dayLabel(until)}`;
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

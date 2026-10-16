import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { callableErrorMessage } from '../../data/callable-error';
import { StoreBadgesService } from '../../data/store-badges.service';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { FieldComponent } from '../../ui/field.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import {
  ORDER_TABS,
  applyFilters,
  downloadText,
  filtersFromParams,
  filtersToParams,
  hasActiveFilters,
  ordersCsv,
  pageList,
  pageOf,
  rowsForTab,
  separateBlock,
  sortOrders,
  tabCounts,
  transferBlock,
  type Order,
  type OrderFilters,
} from './data/order';
import { ORDERS_CAP, OrdersRepository } from './data/orders.repository';
import { printLabels } from './data/print';
import { OrderFiltersComponent } from './ui/order-filters.component';
import { OrdersTableComponent, type RowMenuAction } from './ui/orders-table.component';

type LoadState = 'loading' | 'ok' | 'error';

/** Loja › Pedidos (02): abas por status, filtros na URL, seleção em massa e a tabela. */
@Component({
  selector: 'bo-panel-pedidos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent, FieldComponent, IconComponent, OrderFiltersComponent, OrdersTableComponent, PanelShellComponent],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Loja</div>
          <div class="title-row">
            <h1>Pedidos</h1>
            @if (state() === 'ok') { <span class="count-pill">{{ monthCount() }} no mês</span> }
          </div>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn" [disabled]="state() !== 'ok' || filtered().length === 0" (click)="exportCsv()">
          <bo-icon name="download" [size]="13" /> Exportar CSV
        </button>
      </header>

      <div class="tabs" role="tablist">
        @for (t of tabs; track t.id) {
          <button type="button" role="tab" [class.active]="filters().tab === t.id" [attr.aria-selected]="filters().tab === t.id" (click)="patch({ tab: t.id })">
            {{ t.label }} <span class="tab-count">{{ counts()[t.id] }}</span>
          </button>
        }
      </div>

      <div class="body">
        @if (toast(); as t) { <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ t }}</span></div> }
        @if (error(); as e) { <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div> }
        @if (state() === 'error') {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>Não foi possível carregar os pedidos.</span>
            <button type="button" class="bo-mini-btn" (click)="load()">Tentar de novo</button></div>
        }
        @if (capped()) { <p class="note">Mostrando os {{ cap }} pedidos mais recentes.</p> }

        <bo-order-filters [filters]="filters()" [arenas]="arenas()" (changed)="patch($event)" />

        @if (selection().length > 0) {
          <div class="bulk" role="region" aria-label="Ações em massa">
            <span class="bulk-count">{{ selection().length }} {{ selection().length === 1 ? 'selecionado' : 'selecionados' }}</span>
            <button type="button" class="link" (click)="selected.set(empty)">Limpar</button>
            <div class="spacer"></div>
            <span class="act">
              <button type="button" class="ghost" (click)="print(selection())"><bo-icon name="printer" [size]="14" /> Imprimir etiquetas</button>
            </span>
            @if (sameArena()) {
              <span class="act" [title]="transferWhy() ?? ''">
                <button type="button" class="ghost" [disabled]="transferWhy() !== null" (click)="createTransfer()">
                  <bo-icon name="swap" [size]="14" /> Criar remessa p/ arena</button>
              </span>
            }
            <span class="act" [title]="separateWhy() ?? ''">
              <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="separateWhy() !== null || busy()" (click)="markSeparated()">
                <bo-icon name="check" [size]="13" /> Marcar como separado</button>
            </span>
          </div>
        }

        <bo-orders-table [rows]="page().rows" [selected]="selected()" [loading]="state() === 'loading'" [now]="now"
          [emptyLabel]="emptyLabel()" [canClear]="hasFilters()"
          (toggle)="toggle($event.id, $event.checked)" (toggleAll)="toggleAll($event)" (open)="openOrder($event)"
          (action)="onRowAction($event.order, $event.action)" (clear)="clearFilters()" />

        @if (state() === 'ok' && filtered().length > 0) {
          <footer class="pager">
            <span>Mostrando {{ page().from }}–{{ page().to }} de {{ tabRows().length }}</span>
            <nav aria-label="Páginas">
              <button type="button" [disabled]="page().page === 1" (click)="patch({ page: page().page - 1 })" aria-label="Página anterior">‹</button>
              @for (p of pages(); track $index) {
                @if (p === null) { <span>…</span> } @else {
                  <button type="button" [class.on]="p === page().page" [attr.aria-current]="p === page().page ? 'page' : null" (click)="patch({ page: p })">{{ p }}</button>
                }
              }
              <button type="button" [disabled]="page().page === page().pages" (click)="patch({ page: page().page + 1 })" aria-label="Próxima página">›</button>
            </nav>
          </footer>
        }
      </div>
    </bo-panel-shell>

    <bo-confirm-dialog [open]="cancelTarget() !== null" [title]="'Cancelar pedido #' + (cancelTarget()?.number ?? '') + '?'"
      confirmLabel="Cancelar pedido" tone="danger" size="md" [busy]="busy()" [confirmDisabled]="!cancelReason().trim()"
      description="A reserva volta para o estoque. Se já foi pago, o reembolso fica registrado como pendente no Financeiro."
      [error]="dialogError()" (confirmed)="confirmCancel()" (dismissed)="closeCancel()">
      <bo-field label="Motivo"><textarea class="bo-input area" [value]="cancelReason()" (input)="cancelReason.set(val($event))"></textarea></bo-field>
    </bo-confirm-dialog>
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); }
    .titles { display: flex; flex-direction: column; gap: 4px; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .title-row { display: flex; align-items: center; gap: 10px; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .count-pill { height: 22px; padding: 0 9px; display: inline-flex; align-items: center; border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-pill); font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-mute); }
    .spacer { flex: 1; }
    .tabs { display: flex; gap: 6px; padding: 10px 32px 0; overflow-x: auto; }
    .tabs button { display: inline-flex; align-items: center; gap: 7px; height: 40px; padding: 0 12px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; cursor: pointer; white-space: nowrap; }
    .tabs button.active { color: var(--nx-text); border-bottom-color: var(--nx-orange-500); font-weight: 700; }
    .tab-count { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); }
    .tabs button.active .tab-count { color: var(--nx-orange-500); }
    .body { padding: 16px 32px 40px; display: flex; flex-direction: column; gap: 14px; border-top: 1px solid var(--nx-line); }
    .note { margin: 0; font-size: 12px; color: var(--nx-text-dim); }
    .bulk { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 6px 8px 6px 16px; border: 1px solid var(--nx-orange-500); border-radius: var(--nx-r-3); background: var(--nx-orange-tint); }
    .bulk-count { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .link { border: none; background: none; color: var(--nx-text-mute); font-size: 12px; cursor: pointer; text-decoration: underline; }
    .act { display: inline-flex; }
    .ghost { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 10px; border: none; border-radius: var(--nx-r-2); background: none; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .ghost:hover:not(:disabled) { color: var(--nx-text); background: rgba(255, 255, 255, 0.04); }
    .ghost:disabled, .act .bo-mini-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .pager { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--nx-text-dim); }
    .pager nav { display: flex; align-items: center; gap: 2px; }
    .pager button { min-width: 26px; height: 26px; border: none; border-radius: 6px; background: none; color: var(--nx-text-mute); font: inherit; font-size: 12px; cursor: pointer; }
    .pager button.on { color: var(--nx-text); background: var(--nx-surface-1); font-weight: 700; }
    .pager button:disabled { opacity: 0.35; cursor: default; }
    .area { height: 80px; padding: 9px 12px; resize: vertical; }
  `,
})
export class PanelPedidosComponent {
  private readonly repo = inject(OrdersRepository);
  private readonly badges = inject(StoreBadgesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly tabs = ORDER_TABS;
  protected readonly cap = ORDERS_CAP;
  protected readonly empty: ReadonlySet<string> = new Set();
  protected readonly now = new Date();

  protected readonly state = signal<LoadState>('loading');
  protected readonly all = signal<Order[]>([]);
  protected readonly selected = signal<ReadonlySet<string>>(this.empty);
  protected readonly busy = signal(false);
  protected readonly toast = signal<string | null>(
    (this.router.getCurrentNavigation()?.extras.state?.['toast'] as string | undefined) ?? null,
  );
  protected readonly error = signal<string | null>(null);
  protected readonly cancelTarget = signal<Order | null>(null);
  protected readonly cancelReason = signal('');
  protected readonly dialogError = signal<string | null>(null);

  private readonly params = toSignal(
    this.route.queryParamMap.pipe(map((p) => Object.fromEntries(p.keys.map((k) => [k, p.get(k) ?? undefined])))),
    { initialValue: {} as Record<string, string | undefined> },
  );
  protected readonly filters = computed(() => filtersFromParams(this.params()));
  protected readonly hasFilters = computed(() => hasActiveFilters(this.filters()));

  protected readonly filtered = computed(() => applyFilters(this.all(), this.filters()));
  protected readonly counts = computed(() => tabCounts(this.filtered()));
  protected readonly tabRows = computed(() => sortOrders(rowsForTab(this.filtered(), this.filters().tab), this.filters().ordem));
  protected readonly page = computed(() => pageOf(this.tabRows(), this.filters().page));
  protected readonly pages = computed(() => pageList(this.page().page, this.page().pages));
  protected readonly capped = computed(() => this.all().length >= ORDERS_CAP);

  protected readonly monthCount = computed(() => {
    const key = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
    const month = key(this.now);
    return this.all().filter((o) => o.createdAt && key(o.createdAt) === month).length;
  });
  /** Arenas que aparecem nos pedidos: o filtro não oferece arena sem pedido. */
  protected readonly arenas = computed(() => {
    const by = new Map<string, string>();
    for (const o of this.all()) if (o.delivery.type === 'arena' && o.delivery.locationId) by.set(o.delivery.locationId, o.delivery.placeName);
    return [...by].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });

  protected readonly selection = computed(() => this.all().filter((o) => this.selected().has(o.id)));
  protected readonly separateWhy = computed(() => {
    const bad = this.selection().find((o) => separateBlock(o) !== null);
    return bad ? `#${bad.number}: ${separateBlock(bad)}` : null;
  });
  protected readonly sameArena = computed(() => {
    const s = this.selection();
    return s.length > 0 && s.every((o) => o.delivery.type === 'arena' && o.delivery.locationId === s[0]!.delivery.locationId);
  });
  protected readonly transferWhy = computed(() => transferBlock(this.selection()));
  protected readonly emptyLabel = computed(() => (this.hasFilters() ? 'Nenhum pedido encontrado com esses filtros' : 'Nenhum pedido aqui'));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      const list = await this.repo.list();
      this.all.set(list);
      this.state.set('ok');
      this.badges.setOrders(list.filter((o) => o.status === 'sep').length);
      // Seleção só sobrevive para pedidos que ainda existem.
      this.selected.update((s) => new Set([...s].filter((id) => list.some((o) => o.id === id))));
    } catch {
      this.state.set('error');
    }
  }

  protected patch(p: Partial<OrderFilters>): void {
    // Mudar filtro ou aba volta para a página 1; trocar de página não mexe no resto.
    const next: OrderFilters = { ...this.filters(), ...p, page: p.page ?? 1 };
    // Filtro ou aba novos escondem linhas: a seleção não pode agir sobre o que não se vê.
    if (p.page === undefined) this.selected.set(this.empty);
    void this.router.navigate([], { relativeTo: this.route, queryParams: filtersToParams(next), replaceUrl: true });
  }

  protected clearFilters(): void {
    this.patch({ q: '', entrega: 'todas', arenas: [], pagamento: null, canal: null });
  }

  protected toggle(id: string, checked: boolean): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected toggleAll(checked: boolean): void {
    const ids = this.page().rows.map((o) => o.id);
    this.selected.update((s) => {
      const next = new Set(s);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  protected openOrder(id: string): void {
    void this.router.navigate(['/painel/loja/pedidos', id]);
  }

  protected onRowAction(o: Order, action: RowMenuAction): void {
    if (action === 'ver') this.openOrder(o.id);
    if (action === 'imprimir') this.print([o]);
    if (action === 'cancelar') {
      this.cancelReason.set('');
      this.dialogError.set(null);
      this.cancelTarget.set(o);
    }
  }

  protected print(orders: Order[]): void {
    if (!printLabels(orders)) this.error.set('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
  }

  protected createTransfer(): void {
    void this.router.navigate(['/painel/loja/estoque/transferencia/nova'], { queryParams: { pedidos: this.selection().map((o) => o.id).join(',') } });
  }

  protected async markSeparated(): Promise<void> {
    const orders = this.selection();
    this.busy.set(true);
    this.error.set(null);
    const results = await Promise.allSettled(
      orders.map((o) => this.repo.act({ orderId: o.id, version: o.version, action: 'marcar_separado' })),
    );
    const failed = results.map((r, i) => ({ r, o: orders[i]! })).filter((x) => x.r.status === 'rejected');
    const ok = orders.length - failed.length;
    if (ok > 0) this.toast.set(`${ok} ${ok === 1 ? 'pedido separado' : 'pedidos separados'}`);
    if (failed.length > 0) {
      const first = failed[0]!;
      this.error.set(`#${first.o.number}: ${callableErrorMessage((first.r as PromiseRejectedResult).reason)}${failed.length > 1 ? ` (e mais ${failed.length - 1})` : ''}`);
    }
    this.selected.set(new Set(failed.map((f) => f.o.id)));
    this.busy.set(false);
    await this.load();
  }

  protected async confirmCancel(): Promise<void> {
    const o = this.cancelTarget();
    if (!o) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await this.repo.act({ orderId: o.id, version: o.version, action: 'cancelar', reason: this.cancelReason().trim() });
      this.cancelTarget.set(null);
      this.toast.set(`Pedido #${o.number} cancelado`);
      await this.load();
    } catch (err) {
      this.dialogError.set(callableErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected closeCancel(): void {
    if (!this.busy()) this.cancelTarget.set(null);
  }

  protected exportCsv(): void {
    const day = this.now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    downloadText(`pedidos-${day}.csv`, ordersCsv(this.tabRows()));
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}


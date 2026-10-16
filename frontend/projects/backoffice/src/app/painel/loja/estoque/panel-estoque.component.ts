import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { StoreBadgesService } from '../../data/store-badges.service';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../../ui/pill.component';
import { PRODUCT_CATEGORY_LABELS } from '../produtos/data/products.repository';
import {
  filterRows,
  kpisOf,
  qtyTone,
  relativeStamp,
  rowAction,
  type MovementType,
  type StockLocation,
  type StockMovement,
  type StockRow,
} from './data/stock';
import { StockRepository } from './data/stock.repository';

type LoadState = 'loading' | 'ok' | 'error';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const INT = new Intl.NumberFormat('pt-BR');

const MOVEMENT_PILL: Record<MovementType, { tone: PillTone; label: string }> = {
  entrada: { tone: 'green', label: 'Entrada' },
  transferencia: { tone: 'dim', label: 'Transferência' },
  saida: { tone: 'orange', label: 'Saída' },
  ajuste: { tone: 'yellow', label: 'Ajuste' },
};

/** Entradas e transferências têm tela própria (06a/06b), que ainda não existe. */
const SOON = 'Em breve: chega com a tela de entrada/transferência';

/** Loja › Estoque: saldo por SKU e local, KPIs e as últimas movimentações. */
@Component({
  selector: 'bo-panel-estoque',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PanelCardComponent, PanelShellComponent, PillComponent],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Loja</div>
          <div class="title-row">
            <h1>Estoque</h1>
            @if (state() === 'ok' && kpis().lowCount > 0) {
              <bo-pill tone="yellow">{{ kpis().lowCount }} {{ kpis().lowCount === 1 ? 'SKU baixo' : 'SKUs baixos' }}</bo-pill>
            }
          </div>
        </div>
        <div class="spacer"></div>
        <button type="button" class="bo-mini-btn" disabled [title]="soon">
          <bo-icon name="swap" [size]="13" /> Nova transferência
        </button>
        <button type="button" class="bo-mini-btn bo-mini-btn-primary" disabled [title]="soon">
          <bo-icon name="plus" [size]="13" /> Registrar entrada
        </button>
      </header>

      <div class="body">
        @if (state() === 'error') {
          <div class="bo-alert" role="alert">
            <bo-icon name="alert" [size]="16" />
            <span>{{ errorMessage() }}</span>
            <button type="button" class="bo-mini-btn" (click)="reload()">Tentar de novo</button>
          </div>
        }

        <div class="kpis">
          <div class="kpi">
            <span class="kpi-label">Unidades em estoque</span>
            @if (state() === 'loading') { <span class="kpi-skel"></span> } @else {
              <span class="kpi-value">{{ int(kpis().units) }}</span>
              <span class="kpi-hint">{{ kpis().skuCount }} {{ kpis().skuCount === 1 ? 'SKU' : 'SKUs' }}</span>
            }
          </div>
          <div class="kpi">
            <span class="kpi-label">Valor em custo</span>
            @if (state() === 'loading') { <span class="kpi-skel"></span> } @else {
              @if (kpis().costValueCents !== null) {
                <span class="kpi-value">{{ money(kpis().costValueCents!) }}</span>
                <span class="kpi-hint">custo do produto × saldo</span>
              } @else {
                <span class="kpi-value dim">—</span>
                <span class="kpi-hint">nenhum custo informado</span>
              }
            }
          </div>
          <div class="kpi">
            <span class="kpi-label">Em trânsito p/ arenas</span>
            @if (state() === 'loading') { <span class="kpi-skel"></span> } @else {
              <span class="kpi-value">0 un.</span>
              <span class="kpi-hint">0 remessas</span>
            }
          </div>
          <div class="kpi">
            <span class="kpi-label">Giro médio</span>
            @if (state() === 'loading') { <span class="kpi-skel"></span> } @else {
              <span class="kpi-value dim">—</span>
              <span class="kpi-hint">sem saídas em 30 dias</span>
            }
          </div>
        </div>

        <div class="filters">
          <label class="search">
            <bo-icon name="search" [size]="14" />
            <input type="search" placeholder="Buscar SKU" aria-label="Buscar por nome, SKU ou código de barras"
              [value]="q()" (input)="q.set(val($event))" />
          </label>
          <button type="button" class="chip" [class.active]="lowFirst()" [attr.aria-pressed]="lowFirst()" (click)="lowFirst.set(!lowFirst())">
            Estoque baixo primeiro
          </button>
          <span class="select-wrap">
            <select aria-label="Local" (change)="location.set(val($event) || null)">
              <option value="" [selected]="location() === null">Local</option>
              @for (l of locations(); track l.id) {
                <option [value]="l.id" [selected]="location() === l.id">{{ l.name }}</option>
              }
            </select>
            <bo-icon name="chevron-down" [size]="12" />
          </span>
          <span class="select-wrap">
            <select aria-label="Categoria" (change)="category.set(val($event) || null)">
              <option value="" [selected]="category() === null">Categoria</option>
              @for (c of categories; track c.id) {
                <option [value]="c.id" [selected]="category() === c.id">{{ c.label }}</option>
              }
            </select>
            <bo-icon name="chevron-down" [size]="12" />
          </span>
        </div>

        <bo-panel-card pad="sm">
          <div class="table" role="table" aria-label="Saldo por SKU e local">
            <div class="row head-row" role="row" [style.grid-template-columns]="columns()">
              <span role="columnheader">SKU</span>
              @for (l of visibleLocations(); track l.id) { <span role="columnheader" class="num">{{ l.name }}</span> }
              <span role="columnheader" class="num">Total</span>
              <span role="columnheader" class="num">Reservado</span>
              <span></span>
            </div>
            @if (state() === 'loading') {
              @for (s of skeleton; track s) { <div class="skeleton-row"></div> }
            } @else if (rows().length === 0) {
              <div class="empty">
                <bo-icon name="archive" [size]="20" />
                @if (all().length === 0) {
                  <p>Nenhum SKU cadastrado</p>
                  <span>Cadastre produtos e variações em Loja › Produtos.</span>
                } @else {
                  <p>Nenhum SKU com essa busca</p>
                  <button type="button" class="bo-mini-btn" (click)="clear()">Limpar filtros</button>
                }
              </div>
            } @else {
              @for (r of rows(); track r.skuId + r.productId) {
                <div class="row" role="row" [style.grid-template-columns]="columns()">
                  <span class="sku" role="cell">
                    <span class="thumb" aria-hidden="true">
                      @if (r.imageUrl) { <img [src]="r.imageUrl" alt="" loading="lazy" width="26" height="26" /> }
                    </span>
                    <span class="who">
                      <span class="name">{{ r.productName }}</span>
                      <span class="variant">{{ r.variantLabel }}</span>
                    </span>
                  </span>
                  @for (l of visibleLocations(); track l.id) {
                    <span role="cell" class="num qty" [class]="'num qty tone-' + tone(qtyAt(r, l.id), r)">{{ qtyAt(r, l.id) }}</span>
                  }
                  <span role="cell" class="num total" [class.tone-zero]="r.total === 0">{{ r.total }}</span>
                  <span role="cell" class="num reserved">{{ r.reserved }}</span>
                  <span role="cell" class="action">
                    @if (action(r) === 'repor') {
                      <button type="button" class="bo-mini-btn bo-mini-btn-primary small" disabled [title]="soon">Repor</button>
                    } @else {
                      <button type="button" class="ghost-btn" disabled [title]="soon"><bo-icon name="swap" [size]="12" /> Transferir</button>
                    }
                  </span>
                </div>
              }
            }
          </div>
        </bo-panel-card>

        <bo-panel-card title="Movimentações">
          <span card-actions class="history-link" [title]="'Em breve: histórico completo'">Ver histórico</span>
          <div class="moves">
            @if (state() === 'loading') {
              @for (s of skeletonShort; track s) { <div class="skeleton-row short"></div> }
            } @else if (movements().length === 0) {
              <p class="moves-empty">Nenhuma movimentação ainda. Ajustes feitos na grade de um produto aparecem aqui.</p>
            } @else {
              @for (m of movements(); track m.id) {
                <div class="move">
                  <span class="move-type"><bo-pill [tone]="pillOf(m).tone">{{ pillOf(m).label }}</bo-pill></span>
                  <span class="move-title">{{ m.title }}</span>
                  <span class="move-items">{{ m.itemsLabel }}</span>
                  <span class="move-place">{{ m.placeLabel }}</span>
                  <span class="move-at">{{ stamp(m) }}</span>
                </div>
              }
            }
          </div>
        </bo-panel-card>
      </div>
    </bo-panel-shell>
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .title-row { display: flex; align-items: center; gap: 10px; }
    h1 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 21px; letter-spacing: -0.02em; }
    .spacer { flex: 1; }
    .body { padding: 20px 32px 40px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }

    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .kpi { display: flex; flex-direction: column; gap: 8px; padding: 18px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-3); min-width: 0; }
    .kpi-label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .kpi-value { font-family: var(--nx-font-display); font-weight: 800; font-size: 22px; letter-spacing: -0.02em; line-height: 1.1; }
    .kpi-value.dim { color: var(--nx-text-dim); }
    .kpi-hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .kpi-skel { height: 40px; border-radius: 8px; background: var(--nx-surface-1); }

    .filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .search { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 11px; width: 264px; border-radius: var(--nx-r-2); background: var(--nx-surface-0); border: 1px solid var(--nx-line); color: var(--nx-text-dim); }
    .search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--nx-text); font-family: var(--nx-font-display); font-size: 12.5px; }
    .search input::placeholder { color: var(--nx-text-dim); }
    .chip { height: 32px; padding: 0 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .chip.active { background: var(--nx-orange-tint); border-color: rgba(255, 106, 26, 0.45); color: var(--nx-text); }
    .select-wrap { position: relative; display: inline-flex; align-items: center; color: var(--nx-text-mute); }
    .select-wrap select { appearance: none; height: 32px; padding: 0 30px 0 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .select-wrap bo-icon { position: absolute; right: 10px; pointer-events: none; }

    .table { display: flex; flex-direction: column; overflow-x: auto; }
    .row { display: grid; align-items: center; gap: 10px; min-height: 49px; padding: 0 4px; border-top: 1px solid var(--nx-line); }
    .head-row { min-height: 0; padding: 4px 4px 12px; border-top: none; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .num { text-align: center; }
    .sku { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .thumb { width: 26px; height: 26px; flex: none; border-radius: 6px; overflow: hidden; border: 1px solid var(--nx-line); background: repeating-linear-gradient(-45deg, var(--nx-surface-1), var(--nx-surface-1) 4px, var(--nx-surface-2) 4px, var(--nx-surface-2) 8px); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .variant { font-size: 11px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qty, .total { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .tone-low { color: var(--nx-pending); }
    .tone-zero { color: var(--nx-live); }
    .reserved { font-size: 12px; color: var(--nx-text-dim); }
    .action { display: flex; justify-content: flex-end; }
    .bo-mini-btn.small { height: 28px; padding: 0 12px; }
    .bo-mini-btn:disabled { cursor: default; }
    .ghost-btn { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; background: none; border: none; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; }
    .ghost-btn:disabled { cursor: default; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 0; color: var(--nx-text-dim); border-top: 1px solid var(--nx-line); }
    .empty p { margin: 0; color: var(--nx-text-mute); font-weight: 600; }
    .empty span { font-size: 12px; }
    .skeleton-row { height: 49px; border-top: 1px solid var(--nx-line); background: linear-gradient(90deg, var(--nx-surface-1) 25%, var(--nx-surface-2) 37%, var(--nx-surface-1) 63%); background-size: 400% 100%; animation: shimmer 1.3s ease-in-out infinite; }
    .skeleton-row.short { height: 38px; }
    @keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
    @media (prefers-reduced-motion: reduce) { .skeleton-row { animation: none; } }

    .history-link { font-family: var(--nx-font-display); font-weight: 600; font-size: 12px; color: var(--nx-orange-500); opacity: 0.55; cursor: default; }
    .moves { display: flex; flex-direction: column; margin-top: 10px; }
    .moves-empty { margin: 4px 0 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .move { display: grid; grid-template-columns: 115px minmax(0, 1.5fr) minmax(0, 1.2fr) minmax(0, 1fr) 110px; align-items: center; gap: 12px; min-height: 39px; border-top: 1px solid var(--nx-line); }
    .move:first-child { border-top: none; }
    .move-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .move-items { font-size: 12.5px; color: var(--nx-text-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .move-place, .move-at { font-size: 11.5px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .move-at { text-align: right; }

    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) {
      .kpis { grid-template-columns: 1fr; }
      .search { width: 100%; }
      .move { grid-template-columns: 1fr auto; }
      .move-items, .move-place { display: none; }
    }
  `,
})
export class PanelEstoqueComponent {
  private readonly repo = inject(StockRepository);
  private readonly badges = inject(StoreBadgesService);

  protected readonly soon = SOON;
  protected readonly categories = Object.entries(PRODUCT_CATEGORY_LABELS).map(([id, label]) => ({ id, label }));
  protected readonly skeleton = [0, 1, 2, 3, 4, 5];
  protected readonly skeletonShort = [0, 1, 2, 3];

  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly all = signal<StockRow[]>([]);
  protected readonly locations = signal<StockLocation[]>([]);
  protected readonly movements = signal<StockMovement[]>([]);

  protected readonly q = signal('');
  protected readonly lowFirst = signal(true);
  protected readonly location = signal<string | null>(null);
  protected readonly category = signal<string | null>(null);

  protected readonly rows = computed(() =>
    filterRows(this.all(), { q: this.q(), category: this.category(), lowFirst: this.lowFirst() }),
  );
  protected readonly kpis = computed(() => kpisOf(this.all()));
  /** O filtro de local mostra só a coluna dele; o total segue somando todos. */
  protected readonly visibleLocations = computed(() => {
    const id = this.location();
    return id === null ? this.locations() : this.locations().filter((l) => l.id === id);
  });
  protected readonly columns = computed(
    () => `minmax(220px, 2fr) repeat(${this.visibleLocations().length}, minmax(84px, 1fr)) 70px 80px 110px`,
  );

  private readonly now = new Date();

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    try {
      const snap = await this.repo.load();
      this.all.set(snap.rows);
      this.locations.set(snap.locations);
      this.movements.set(snap.movements);
      this.state.set('ok');
      // A contagem daqui sai direto dos SKUs: corrige o badge da sidebar.
      this.badges.set(kpisOf(snap.rows).lowCount);
    } catch (err) {
      this.errorMessage.set(callableErrorMessage(err));
      this.state.set('error');
    }
  }

  protected clear(): void {
    this.q.set('');
    this.category.set(null);
    this.location.set(null);
  }

  protected val(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }
  protected int(n: number): string {
    return INT.format(n);
  }
  protected money(cents: number): string {
    return BRL.format(cents / 100);
  }
  /** Local sem chave no mapa é saldo zero (o SKU nunca passou por ali). */
  protected qtyAt(row: StockRow, locationId: string): number {
    return row.byLocation[locationId] ?? 0;
  }
  protected tone(qty: number, row: StockRow): string {
    return qtyTone(qty, row.threshold);
  }
  protected action(row: StockRow): 'repor' | 'transferir' {
    return rowAction(row);
  }
  protected pillOf(m: StockMovement): { tone: PillTone; label: string } {
    return MOVEMENT_PILL[m.type];
  }
  protected stamp(m: StockMovement): string {
    return relativeStamp(m.createdAt, this.now);
  }
}

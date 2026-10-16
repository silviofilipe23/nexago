import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CheckboxComponent } from '../../../ui/checkbox.component';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent } from '../../../ui/pill.component';
import { cancelBlock, deliveryLabel, paymentLabel, pillOf, relativeDate, type Order } from '../data/order';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export type RowMenuAction = 'ver' | 'imprimir' | 'cancelar';

/** Tabela da tela 02: seleção, linhas clicáveis e o menu ⋯ de cada pedido. */
@Component({
  selector: 'bo-orders-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CheckboxComponent, IconComponent, PillComponent],
  host: { '(document:click)': 'onDocClick($event)', '(document:keydown.escape)': 'menuFor.set(null)' },
  template: `
    <div class="tr th" role="row">
      <span class="cell-check">
        <bo-checkbox ariaLabel="Selecionar todos da página" [checked]="allChecked()" [indeterminate]="someChecked()"
          [disabled]="rows().length === 0" (checkedChange)="toggleAll.emit($event.checked)" />
      </span>
      <span>Pedido</span><span>Cliente</span><span class="num">Itens</span><span>Entrega</span><span>Pagamento</span>
      <span class="num">Total</span><span>Status</span><span>Data</span><span></span>
    </div>
    @if (loading()) {
      @for (s of skeleton; track s) { <div class="skeleton-row"><span></span><span></span><span></span></div> }
    } @else {
      @for (o of rows(); track o.id) {
        <div class="tr" role="row" [class.selected]="selected().has(o.id)" (click)="open.emit(o.id)">
          <span class="cell-check" (click)="$event.stopPropagation()">
            <bo-checkbox [ariaLabel]="'Selecionar pedido ' + o.number" [checked]="selected().has(o.id)"
              (checkedChange)="toggle.emit({ id: o.id, checked: $event.checked })" />
          </span>
          <span class="mono code">#{{ o.number }}</span>
          <span class="strong ellipsis">{{ o.customer.name }}</span>
          <span class="num dim">{{ o.units }}</span>
          <span class="delivery ellipsis">
            @if (o.delivery.type === 'arena') { <bo-icon name="pin" [size]="14" class="pin" /> } @else { <bo-icon name="truck" [size]="14" class="truck" /> }
            <span class="ellipsis">{{ delivery(o) }}</span>
          </span>
          <span class="dim ellipsis" [title]="payment(o)">{{ payment(o) }}</span>
          <span class="num money">{{ money(o.totalCents) }}</span>
          <span><bo-pill [tone]="pill(o).tone">{{ pill(o).label }}</bo-pill></span>
          <span class="dim">{{ date(o) }}</span>
          <span class="more-wrap" (click)="$event.stopPropagation()">
            <button type="button" class="more" [attr.aria-label]="'Ações do pedido ' + o.number" [attr.aria-expanded]="menuFor() === o.id"
              (click)="menuFor.set(menuFor() === o.id ? null : o.id)"><bo-icon name="more" [size]="16" /></button>
            @if (menuFor() === o.id) {
              <div class="menu" role="menu">
                <button type="button" role="menuitem" (click)="pick(o, 'ver')">Ver pedido</button>
                <button type="button" role="menuitem" (click)="pick(o, 'imprimir')">Imprimir etiqueta</button>
                <button type="button" role="menuitem" class="danger" [disabled]="cancelReason(o) !== null"
                  [title]="cancelReason(o) ?? ''" (click)="pick(o, 'cancelar')">Cancelar pedido</button>
              </div>
            }
          </span>
        </div>
      } @empty {
        <div class="empty">
          <span>{{ emptyLabel() }}</span>
          @if (canClear()) { <button type="button" class="bo-mini-btn" (click)="clear.emit()">Limpar filtros</button> }
        </div>
      }
    }
  `,
  styles: `
    :host { display: block; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); }
    .tr { display: grid; grid-template-columns: 44px 96px minmax(120px, 1.2fr) 48px minmax(150px, 1.5fr) 118px 104px 150px 84px 36px; gap: 10px; align-items: center; min-height: 54px; padding: 0 12px; border-top: 1px solid var(--nx-line); cursor: pointer; }
    .tr:hover { background: var(--nx-surface-1); }
    .tr.selected { background: rgba(255, 106, 26, 0.06); }
    .th { min-height: 0; padding: 14px 12px 12px; border-top: none; cursor: default; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .th:hover { background: none; }
    .cell-check { display: grid; place-items: center; align-self: stretch; }
    .mono { font-family: var(--nx-font-mono); font-size: 11px; }
    .code { font-weight: 600; }
    .strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 12.5px; }
    .dim { font-size: 12px; color: var(--nx-text-mute); }
    .num { text-align: right; }
    .money { font-family: var(--nx-font-display); font-weight: 800; font-size: 13px; }
    .ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .delivery { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
    .pin { color: var(--nx-orange-500); display: inline-flex; }
    .truck { color: var(--nx-text-mute); display: inline-flex; }
    .more-wrap { position: relative; display: grid; place-items: center; }
    .more { width: 28px; height: 28px; display: grid; place-items: center; border: none; border-radius: 8px; background: none; color: var(--nx-text-dim); cursor: pointer; }
    .more:hover { background: var(--nx-surface-2); color: var(--nx-text); }
    .menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 20; min-width: 170px; padding: 6px; border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-3); background: var(--nx-surface-1); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); display: flex; flex-direction: column; cursor: default; }
    .menu button { height: 32px; padding: 0 10px; border: none; border-radius: 8px; background: none; color: var(--nx-text); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; white-space: nowrap; }
    .menu button:hover:not(:disabled) { background: var(--nx-surface-2); }
    .menu button:disabled { opacity: 0.45; cursor: not-allowed; }
    .menu .danger { color: var(--nx-live); }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px 16px; border-top: 1px solid var(--nx-line); font-size: 12.5px; color: var(--nx-text-dim); }
    .skeleton-row { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 24px; align-items: center; height: 54px; padding: 0 56px; border-top: 1px solid var(--nx-line); }
    .skeleton-row span { height: 10px; border-radius: 5px; background: var(--nx-surface-2); opacity: 0.7; }
  `,
})
export class OrdersTableComponent {
  readonly rows = input.required<Order[]>();
  readonly selected = input.required<ReadonlySet<string>>();
  readonly loading = input(false);
  readonly now = input.required<Date>();
  readonly emptyLabel = input('Nenhum pedido aqui');
  readonly canClear = input(false);

  readonly toggle = output<{ id: string; checked: boolean }>();
  readonly toggleAll = output<boolean>();
  readonly open = output<string>();
  readonly action = output<{ order: Order; action: RowMenuAction }>();
  readonly clear = output<void>();

  protected readonly skeleton = [0, 1, 2, 3, 4, 5];
  protected readonly menuFor = signal<string | null>(null);
  protected readonly allChecked = computed(() => this.rows().length > 0 && this.rows().every((o) => this.selected().has(o.id)));
  protected readonly someChecked = computed(() => !this.allChecked() && this.rows().some((o) => this.selected().has(o.id)));

  protected money(c: number): string {
    return BRL.format(c / 100);
  }
  protected delivery(o: Order): string {
    return deliveryLabel(o);
  }
  protected payment(o: Order): string {
    return paymentLabel(o);
  }
  protected pill(o: Order) {
    return pillOf(o);
  }
  protected date(o: Order): string {
    return relativeDate(o.createdAt, this.now());
  }
  protected cancelReason(o: Order): string | null {
    return cancelBlock(o);
  }
  protected pick(order: Order, action: RowMenuAction): void {
    this.menuFor.set(null);
    this.action.emit({ order, action });
  }
  protected onDocClick(e: MouseEvent): void {
    if (this.menuFor() && !e.composedPath().some((n) => (n as HTMLElement).classList?.contains('more-wrap'))) this.menuFor.set(null);
  }
}

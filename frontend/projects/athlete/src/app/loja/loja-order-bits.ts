import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ORDER_STATUS_LABEL, orderTone, type StoreOrderItem, type StoreOrderStatus, type StoreOrderView } from '../data/store-checkout-model';
import type { LojaVitrineStore } from './loja-vitrine.store';

/** Selo de status do pedido (cor por momento: esperando, andando, pronto, concluído, cancelado). */
@Component({
  selector: 'app-loja-order-pill',
  template: `<span class="op-dot" aria-hidden="true"></span>{{ label() }}`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 26px;
      padding: 0 10px;
      border-radius: 999px;
      font-family: var(--nx-font-display);
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      color: var(--op-c);
      background: var(--op-bg);
    }
    .op-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--op-c);
    }
    :host(.op--wait) { --op-c: var(--nx-pending); --op-bg: rgba(244, 197, 67, 0.12); }
    :host(.op--progress),
    :host(.op--transit) { --op-c: var(--nx-text); --op-bg: rgba(255, 255, 255, 0.08); }
    :host(.op--ready) { --op-c: var(--nx-orange-400); --op-bg: rgba(255, 106, 26, 0.14); }
    :host(.op--done) { --op-c: var(--nx-win); --op-bg: rgba(43, 209, 126, 0.12); }
    :host(.op--canceled) { --op-c: #ff5a4f; --op-bg: rgba(255, 59, 48, 0.12); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'op--' + tone()" },
})
export class LojaOrderPillComponent {
  readonly status = input.required<StoreOrderStatus>();
  protected readonly label = computed(() => ORDER_STATUS_LABEL[this.status()]);
  protected readonly tone = computed(() => orderTone(this.status()));
}

/** Barra de etapas: feitas em verde, a em curso em laranja. */
@Component({
  selector: 'app-loja-order-progress',
  template: `
    <div class="pg-bars">
      @for (s of steps(); track s; let i = $index) {
        <span class="pg-bar" [class.pg-bar--done]="i < step()" [class.pg-bar--now]="i === step()"></span>
      }
    </div>
    <ol class="pg-labels">
      @for (s of steps(); track s; let i = $index) {
        <li [class.pg-now]="i === step()" [attr.aria-current]="i === step() ? 'step' : null">{{ s }}</li>
      }
    </ol>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; }
    .pg-bars, .pg-labels { display: flex; gap: 4px; }
    .pg-bar { flex: 1; height: 4px; border-radius: 999px; background: var(--nx-line-strong); }
    .pg-bar--done { background: var(--nx-win); }
    .pg-bar--now { background: var(--nx-orange-500); }
    .pg-labels { margin: 0; padding: 0; list-style: none; }
    .pg-labels li { flex: 1; min-width: 0; font-family: var(--nx-font-ui); font-size: 11px; color: var(--nx-text-dim); }
    .pg-labels li.pg-now { color: var(--nx-text); font-weight: 600; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LojaOrderProgressComponent {
  readonly steps = input.required<string[]>();
  readonly step = input.required<number>();
}

/** Algum item do pedido é personalizado (selo "Personalizado" do desenho). */
export function orderPersonalized(o: Pick<StoreOrderView, 'items'>): boolean {
  return o.items.some((i) => i.personalized);
}

/**
 * "Comprar de novo": põe no carrinho as peças comuns que seguem à venda (personalizada pede a arte
 * de novo, então fica de fora). Devolve quantas linhas entraram.
 */
export async function rebuyItems(store: LojaVitrineStore, items: readonly StoreOrderItem[]): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const item of items) {
    const p = store.products().find((x) => x.id === item.productId);
    const v = p?.variants.find((x) => x.id === item.skuId);
    if (item.personalized || !p || !v || !v.inStock) {
      skipped++;
      continue;
    }
    const n = await store.addToCart({ productId: p.id, skuId: v.id, qty: item.qty, maxQty: v.maxQty });
    if (n && n > 0) added++;
    else skipped++;
  }
  return { added, skipped };
}

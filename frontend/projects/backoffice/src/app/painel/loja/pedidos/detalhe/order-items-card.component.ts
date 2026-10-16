import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Order } from '../data/order';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const ART_STATUS: Record<string, string> = { aprovar: 'Arte para aprovar', aprovada: 'Arte aprovada', recusada: 'Arte recusada', producao: 'Em produção' };

/** Itens + totais do pedido (03). Cancelado mostra o reembolso registrado. */
@Component({
  selector: 'bo-order-items-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="kicker">{{ order().units }} {{ order().units === 1 ? 'unidade' : 'unidades' }}</div>
    <h2>Itens</h2>
    <ul class="items">
      @for (i of order().items; track $index) {
        <li>
          <span class="thumb" aria-hidden="true">
            @if (i.customization?.artUrl) { <img [src]="i.customization!.artUrl" alt="" width="52" height="52" /> }
            @else if (i.imageUrl) { <img [src]="i.imageUrl" alt="" width="52" height="52" /> }
          </span>
          <span class="who">
            <span class="name">{{ i.productName }}</span>
            <span class="variant">{{ i.variantLabel || 'único' }} · <span class="mono">{{ i.skuCode }}</span></span>
            @if (i.customization) {
              <span class="art">{{ i.customization.name }} · {{ artStatus(i.customization.status) }}</span>
            }
          </span>
          <span class="unit">{{ i.qty }} × {{ money(i.unitCents) }}</span>
          <span class="line">{{ money(i.totalCents) }}</span>
        </li>
      }
    </ul>
    <dl class="totals">
      <div><dt>Subtotal</dt><dd>{{ money(order().subtotalCents) }}</dd></div>
      @if (order().couponDiscountCents > 0) {
        <div class="minus"><dt>Cupom ({{ order().couponCode }})</dt><dd>– {{ money(order().couponDiscountCents) }}</dd></div>
      }
      @if (order().pixDiscountCents > 0) {
        <div class="minus"><dt>Desconto Pix ({{ pixPct() }}%)</dt><dd>– {{ money(order().pixDiscountCents) }}</dd></div>
      }
      @if (order().walletCents > 0) {
        <div class="minus"><dt>Saldo da carteira</dt><dd>– {{ money(order().walletCents) }}</dd></div>
      }
      <div>
        <dt>{{ order().delivery.type === 'arena' ? 'Retirada na arena' : 'Frete · ' + order().delivery.modeName }}</dt>
        <dd>{{ order().shippingCents > 0 ? money(order().shippingCents) : 'Grátis' }}</dd>
      </div>
      <div class="total"><dt>{{ order().status === 'pag' ? 'Total a pagar' : 'Total pago' }}</dt><dd>{{ money(order().totalCents) }}</dd></div>
      @for (r of order().refunds; track $index) {
        <div class="refund"><dt>Reembolso {{ r.status === 'pendente' ? 'pendente' : '' }} · {{ r.destination === 'saldo' ? 'saldo' : 'meio original' }}</dt>
          <dd>– {{ money(r.amountCents) }}</dd></div>
      }
    </dl>
  `,
  styles: `
    :host { display: block; padding: 20px 22px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); }
    .kicker { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h2 { margin: 4px 0 8px; font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; }
    .items { list-style: none; margin: 0; padding: 0; }
    .items li { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto 110px; gap: 14px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--nx-line); }
    .thumb { width: 52px; height: 52px; border-radius: 10px; overflow: hidden; border: 1px solid var(--nx-line); background: repeating-linear-gradient(-45deg, var(--nx-surface-1), var(--nx-surface-1) 5px, var(--nx-surface-2) 5px, var(--nx-surface-2) 10px); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .who { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; }
    .variant { font-size: 11.5px; color: var(--nx-text-dim); }
    .mono { font-family: var(--nx-font-mono); font-size: 10.5px; letter-spacing: 0.04em; }
    .art { font-size: 11px; color: var(--nx-orange-500); }
    .unit { font-size: 12px; color: var(--nx-text-dim); white-space: nowrap; }
    .line { text-align: right; font-family: var(--nx-font-display); font-weight: 800; font-size: 14px; }
    .totals { margin: 14px 0 0; display: flex; flex-direction: column; gap: 8px; }
    .totals div { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; }
    .totals dt { color: var(--nx-text-mute); }
    .totals dd { margin: 0; font-weight: 700; }
    .totals .minus dd { color: var(--nx-win); }
    .totals .total { margin-top: 6px; align-items: baseline; }
    .totals .total dt { color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; }
    .totals .total dd { font-family: var(--nx-font-display); font-weight: 800; font-size: 22px; letter-spacing: -0.02em; }
    .totals .refund dd, .totals .refund dt { color: var(--nx-live); }
  `,
})
export class OrderItemsCardComponent {
  readonly order = input.required<Order>();

  /** O percentual vem do valor gravado (a regra pode ter mudado depois da compra). */
  protected readonly pixPct = computed(() => {
    const o = this.order();
    const base = o.subtotalCents - o.couponDiscountCents;
    return base > 0 ? Math.round((o.pixDiscountCents / base) * 100) : 0;
  });

  protected money(c: number): string {
    return BRL.format(c / 100);
  }
  protected artStatus(s: string): string {
    return ART_STATUS[s] ?? s;
  }
}

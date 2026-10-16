import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent } from '../../../ui/pill.component';
import { deadlineLabel, initials, maskCpf, pickupState, stamp, type Order } from '../data/order';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const METHOD: Record<string, string> = { pix: 'Pix', cartao: 'Cartão', saldo: 'Saldo usado' };

/** Coluna lateral da 03: cliente, retirada/entrega e pagamento. */
@Component({
  selector: 'bo-order-side',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PillComponent],
  template: `
    <section class="card">
      <h2>Cliente</h2>
      <div class="who">
        <span class="avatar" aria-hidden="true">{{ initialsOf() }}</span>
        <span>
          <span class="name">{{ order().customer.name }}</span>
          <span class="sub">{{ customerSub() }}</span>
        </span>
      </div>
      <ul class="contact">
        @if (order().customer.email) { <li><a [href]="'mailto:' + order().customer.email">{{ order().customer.email }}</a></li> }
        @if (order().customer.phone) { <li>{{ order().customer.phone }}</li> }
        <li>CPF {{ cpf() }}</li>
      </ul>
    </section>

    @if (order().delivery.type === 'arena') {
      <section class="card">
        <div class="row"><h2>Retirada</h2><bo-pill [tone]="pickup().tone">{{ pickup().label }}</bo-pill></div>
        <div class="place">
          <bo-icon name="pin" [size]="15" />
          <span>
            <span class="name">{{ order().delivery.placeName }}{{ order().delivery.counter ? ' · ' + order().delivery.counter : '' }}</span>
            @if (order().delivery.address) { <span class="sub">{{ order().delivery.address }}</span> }
          </span>
        </div>
        @if (order().delivery.pickupCode && order().status !== 'can' && order().status !== 'pag') {
          <div class="code-box">
            <span>
              <span class="kicker">Código de retirada</span>
              <span class="code">{{ order().delivery.pickupCode }}</span>
            </span>
            <button type="button" class="ghost" [disabled]="order().status !== 'ret' || busy()"
              [title]="order().status !== 'ret' ? 'O código vai ao cliente quando o pedido chega na arena' : 'Push ao cliente'"
              (click)="resendCode.emit()">Reenviar</button>
          </div>
        }
        @if (order().status === 'ret' && order().delivery.pickupDeadline) {
          <p class="sub">Prazo até {{ deadline() }}</p>
        }
      </section>
    } @else {
      <section class="card">
        <div class="row"><h2>Entrega</h2><bo-pill tone="dim">{{ order().delivery.modeName || 'Entrega' }}</bo-pill></div>
        <dl class="lines">
          <div><dt>Transportadora</dt><dd>{{ order().delivery.carrier ?? '—' }}</dd></div>
          <div><dt>Rastreio</dt><dd>
            @if (order().delivery.trackingUrl) { <a [href]="order().delivery.trackingUrl" target="_blank" rel="noopener">{{ order().delivery.tracking ?? 'abrir' }}</a> }
            @else { {{ order().delivery.tracking ?? '—' }} }
          </dd></div>
          @if (order().delivery.eta) { <div><dt>Previsão</dt><dd>{{ eta() }}</dd></div> }
        </dl>
        <p class="address">{{ order().delivery.address }}<br />{{ order().delivery.city }} - {{ order().delivery.uf }} · {{ order().delivery.zip }}</p>
      </section>
    }

    <section class="card">
      <h2>Pagamento</h2>
      <dl class="lines">
        <div><dt>Método</dt><dd>{{ methodLabel() }}</dd></div>
        @for (p of order().payments; track $index) {
          <div><dt>{{ method(p.method) }}{{ p.installments && p.installments > 1 ? ' ' + p.installments + '×' : '' }}</dt><dd>{{ money(p.amountCents) }}</dd></div>
        }
        @if (fee() > 0) { <div><dt>Taxa intermediador</dt><dd class="neg">– {{ money(fee()) }}</dd></div> }
      </dl>
      @if (order().status === 'pag' && order().pix) {
        <div class="pix">
          <span class="kicker">Pix copia e cola</span>
          <code>{{ order().pix!.copyPaste }}</code>
          @if (order().pix!.expiresAt) { <span class="sub">Expira {{ when(order().pix!.expiresAt) }}</span> }
        </div>
      }
      <div class="actions">
        <button type="button" class="bo-mini-btn" [disabled]="!canRefund() || busy()"
          [title]="canRefund() ? '' : order().status === 'pag' ? 'Pedido ainda não foi pago' : 'Nada a reembolsar'" (click)="refund.emit()">Reembolsar</button>
        <span title="O Financeiro ainda não registra transações da Loja">
          <button type="button" class="bo-mini-btn" disabled>Ver no financeiro</button>
        </span>
      </div>
    </section>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 14px; }
    .card { padding: 18px 20px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); display: flex; flex-direction: column; gap: 12px; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 14px; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .who { display: flex; align-items: center; gap: 12px; }
    .who > span:last-child { display: flex; flex-direction: column; gap: 2px; }
    .avatar { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 50%; border: 1px solid rgba(255, 106, 26, 0.45); background: var(--nx-orange-tint); color: var(--nx-orange-500); font-family: var(--nx-font-display); font-weight: 800; font-size: 12px; }
    .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; }
    .sub { display: block; font-size: 11.5px; color: var(--nx-text-dim); margin: 0; }
    .contact { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--nx-text-mute); }
    .contact a, .lines a { color: inherit; text-decoration: none; }
    .contact a:hover, .lines a:hover { color: var(--nx-orange-500); text-decoration: underline; }
    .place { display: flex; gap: 10px; color: var(--nx-orange-500); }
    .place > span { display: flex; flex-direction: column; gap: 2px; color: var(--nx-text); }
    .code-box { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); }
    .code-box > span { display: flex; flex-direction: column; gap: 4px; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .code { font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; letter-spacing: 0.04em; }
    .ghost { border: none; background: none; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .ghost:hover:not(:disabled) { color: var(--nx-text); }
    .ghost:disabled { opacity: 0.4; cursor: not-allowed; }
    .lines { margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .lines div { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; }
    .lines dt { color: var(--nx-text-mute); }
    .lines dd { margin: 0; font-weight: 700; text-align: right; }
    .lines .neg { color: var(--nx-text-mute); }
    .address { margin: 0; font-size: 12px; color: var(--nx-text-mute); line-height: 1.5; }
    .pix { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); }
    .pix code { font-family: var(--nx-font-mono); font-size: 10.5px; word-break: break-all; color: var(--nx-text-mute); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .actions .bo-mini-btn:disabled { cursor: not-allowed; }
  `,
})
export class OrderSideComponent {
  readonly order = input.required<Order>();
  readonly busy = input(false);
  readonly resendCode = output<void>();
  readonly refund = output<void>();

  protected readonly initialsOf = computed(() => initials(this.order().customer.name));
  protected readonly cpf = computed(() => maskCpf(this.order().customer.cpf));
  protected readonly pickup = computed(() => pickupState(this.order()));
  protected readonly fee = computed(() => this.order().payments.reduce((n, p) => n + p.feeCents, 0));
  protected readonly canRefund = computed(() => {
    const o = this.order();
    return o.status !== 'pag' && o.totalCents + o.walletCents - o.refundedCents > 0;
  });
  protected readonly customerSub = computed(() => {
    const c = this.order().customer;
    const parts = [c.level !== null ? `Atleta nível ${c.level}` : 'Cliente', c.orderIndex !== null ? `${c.orderIndex}º pedido` : null];
    return parts.filter(Boolean).join(' · ');
  });
  protected readonly methodLabel = computed(() => {
    const ms = [...new Set(this.order().payments.map((p) => (p.method === 'saldo' ? 'saldo carteira' : METHOD[p.method])))];
    return ms.join(' + ') || '—';
  });
  protected readonly deadline = computed(() => (this.order().delivery.pickupDeadline ? deadlineLabel(this.order().delivery.pickupDeadline!) : ''));
  protected readonly eta = computed(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.order().delivery.eta ?? '');
    return m ? `${m[3]}/${m[2]}` : (this.order().delivery.eta ?? '');
  });

  protected money(c: number): string {
    return BRL.format(c / 100);
  }
  protected method(m: string): string {
    return METHOD[m] ?? m;
  }
  protected when(d: Date | null): string {
    return stamp(d);
  }
}

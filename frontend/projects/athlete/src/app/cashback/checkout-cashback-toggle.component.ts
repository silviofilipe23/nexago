import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { formatCentsBRL, formatRatePercent, type CashbackConfig } from '../data/cashback-model';
import { checkoutCashbackState } from '../data/cashback-preview';

let nextId = 0;

/** "Usar meu cashback" nos três checkouts, ANTES de gerar a cobrança — o pai some com ele
 *  quando a cobrança existe. Três estados (`checkoutCashbackState`): switch com saldo usável,
 *  só "Ganhe até X%" sem saldo usável, nada com o recurso desligado. Começa DESLIGADO: o atleta
 *  escolhe gastar. O que vai para a callable é decisão do pai (`appliedPreviewCents`). */
@Component({
  selector: 'app-checkout-cashback-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (redeem()) {
      <button
        type="button"
        class="cbt-switch"
        role="switch"
        [attr.aria-checked]="use()"
        aria-label="Usar meu cashback"
        [attr.aria-describedby]="subId"
        (click)="toggle()"
      >
        <span class="cbt-copy">
          <span class="cbt-title">Usar meu cashback</span>
          <span class="cbt-sub" [id]="subId">{{ subLabel() }}</span>
        </span>
        <span class="cbt-track" [class.cbt-track--on]="use()" aria-hidden="true"><span class="cbt-knob"></span></span>
      </button>
    } @else if (earnRate(); as rate) {
      <p class="cbt-earn">Ganhe até {{ rate }}% de volta neste pagamento</p>
    }
  `,
  styles: `
    :host {
      display: block;
      /* Os blocos de PIX centralizam os filhos (align-items: center): o toggle ocupa a largura. */
      align-self: stretch;
    }

    .cbt-switch {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      min-height: 56px;
      padding: 10px 14px;
      border-radius: var(--nx-r-3);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: border-color var(--nx-d-fast) var(--nx-ease-out), background var(--nx-d-fast) var(--nx-ease-out);
    }

    .cbt-switch[aria-checked='true'] {
      border-color: rgba(255, 106, 26, 0.4);
      background: var(--nx-orange-tint);
    }

    .cbt-switch:focus-visible {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }

    .cbt-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .cbt-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
    }

    .cbt-sub {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.4;
      color: var(--nx-text-mute);
    }

    .cbt-track {
      flex: none;
      width: 44px;
      height: 24px;
      padding: 2px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line-strong);
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }

    .cbt-track--on {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
    }

    .cbt-knob {
      display: block;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--nx-text);
      transition: transform var(--nx-d-fast) var(--nx-ease-out);
    }

    .cbt-track--on .cbt-knob {
      transform: translateX(20px);
    }

    .cbt-earn {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    @media (prefers-reduced-motion: reduce) {
      .cbt-switch,
      .cbt-track,
      .cbt-knob {
        transition: none;
      }
    }
  `,
})
export class CheckoutCashbackToggleComponent {
  /** Id único da sublinha — `aria-describedby` do switch, uma instância por checkout. */
  protected readonly subId = `cbt-sub-${nextId++}`;

  /** PREÇO da cobrança que vai ser gerada (parcela, valor de agora da reserva, vaga). */
  readonly priceReais = input.required<number>();
  readonly availableCents = input.required<number>();
  readonly config = input.required<CashbackConfig>();
  /** Como a cobrança chama o restante: "PIX" (padrão) ou "cartão". */
  readonly chargeLabel = input<string>('PIX');
  readonly use = model(false);

  private readonly state = computed(() =>
    checkoutCashbackState({
      priceReais: this.priceReais(),
      availableCents: this.availableCents(),
      config: this.config(),
    }),
  );

  protected readonly redeem = computed(() => {
    const s = this.state();
    return s.kind === 'redeem' ? s : null;
  });

  protected readonly earnRate = computed(() => {
    const s = this.state();
    return s.kind === 'earn' && s.ratePercent > 0 ? formatRatePercent(s.ratePercent) : null;
  });

  protected readonly subLabel = computed(() => {
    const r = this.redeem();
    if (!r) return '';
    if (!this.use()) return `${formatCentsBRL(r.availableCents)} disponível`;
    const using = `Usando ${formatCentsBRL(r.redeemableCents)}`;
    return r.capped ? `${using} (o mínimo de ${formatCentsBRL(r.minCashCents)} vai no ${this.chargeLabel()})` : using;
  });

  protected toggle(): void {
    this.use.update((on) => !on);
  }
}

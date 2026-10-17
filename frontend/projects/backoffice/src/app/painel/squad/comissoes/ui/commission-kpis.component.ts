import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { brlShort, dayMonthOfKey, type Kpis } from '../data/commission';

interface Card {
  label: string;
  value: string;
  hint: string;
}

/** Os 4 KPIs do topo. Seguem o período; as abas não mexem neles. */
@Component({
  selector: 'bo-commission-kpis',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (c of cards(); track c.label) {
      <div class="card" [class.skel]="loading()">
        <span class="label">{{ c.label }}</span>
        @if (loading()) {
          <span class="bar"></span>
        } @else {
          <strong class="value">{{ c.value }}</strong>
          <span class="hint">{{ c.hint }}</span>
        }
      </div>
    }
  `,
  styles: `
    :host { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .card { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 18px 20px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .value { font-family: var(--nx-font-display); font-weight: 800; font-size: 28px; letter-spacing: -0.02em; color: var(--nx-text); }
    .hint { font-size: 12.5px; color: var(--nx-text-dim); }
    .bar { height: 54px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); }
    @media (max-width: 1100px) {
      :host { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
})
export class CommissionKpisComponent {
  readonly kpis = input.required<Kpis>();
  readonly lastPayoutDate = input<string | null>(null);
  readonly periodIsPilot = input(false);
  readonly loading = input(false);

  protected readonly cards = computed<Card[]>(() => {
    const k = this.kpis();
    const last = this.lastPayoutDate();
    return [
      { label: 'Aguardando pagamento', value: brlShort(k.pendingCents), hint: 'webhook ainda não confirmou' },
      {
        label: 'Liberadas · a repassar',
        value: brlShort(k.releasedCents),
        hint: `${k.releasedAmbassadors} ${k.releasedAmbassadors === 1 ? 'embaixador' : 'embaixadores'}`,
      },
      {
        label: this.periodIsPilot() ? 'Pagas no piloto' : 'Pagas no período',
        value: brlShort(k.paidCents),
        hint: last ? `repasse de ${dayMonthOfKey(last)}` : 'nenhum repasse aprovado',
      },
      {
        label: 'Canceladas',
        value: brlShort(k.canceledCents),
        hint: `${k.refundCount} ${k.refundCount === 1 ? 'reembolso' : 'reembolsos'}`,
      },
    ];
  });
}

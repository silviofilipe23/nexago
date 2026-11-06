import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { costMoney, money, netCents, signedMoney, type RevenueTotals } from '../data/tournament-revenue';

/** "Como chega o líquido": as duas taxas que entram e os três custos que a NexaGO banca. */
@Component({
  selector: 'bo-revenue-breakdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent],
  template: `
    <bo-panel-card title="Como chega o líquido">
      <dl class="lines">
        <div class="line"><dt>Taxa descontada do organizador</dt><dd>{{ money(totals().organizerFeeCents) }}</dd></div>
        <div class="line"><dt>Taxa paga pelo atleta</dt><dd [class.dim]="!totals().athleteFeeCents">{{ totals().athleteFeeCents ? money(totals().athleteFeeCents) : '—' }}</dd></div>
        <div class="line cost"><dt>Cashback usado pelo atleta</dt><dd>{{ costMoney(totals().cashbackCents) }}</dd></div>
        <div class="line cost"><dt>Desconto NexaSquad</dt><dd>{{ costMoney(totals().squadDiscountCents) }}</dd></div>
        <div class="line cost last"><dt>Comissão dos embaixadores</dt><dd>{{ costMoney(totals().squadCommissionCents) }}</dd></div>
        <div class="line total"><dt>Receita líquida</dt><dd [class.neg]="net() < 0">{{ signedMoney(net()) }}</dd></div>
      </dl>
    </bo-panel-card>
  `,
  styles: `
    .lines { margin: 4px 0 0; display: flex; flex-direction: column; }
    .line { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--nx-line); font-size: 13px; }
    dt { margin: 0; }
    dd { margin: 0; font-family: var(--nx-font-mono); font-size: 12.5px; white-space: nowrap; }
    .cost { color: var(--nx-text-mute); }
    .last { border-bottom-color: var(--nx-line-strong); }
    .total { border-bottom: none; padding-top: 11px; font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; }
    .total dd { font-family: var(--nx-font-display); font-size: 14px; color: var(--nx-orange-400); }
    .total dd.neg { color: var(--nx-live); }
    .dim { color: var(--nx-text-dim); }
  `,
})
export class RevenueBreakdownComponent {
  readonly totals = input.required<RevenueTotals>();

  protected readonly net = computed(() => netCents(this.totals()));
  protected readonly money = money;
  protected readonly costMoney = costMoney;
  protected readonly signedMoney = signedMoney;
}

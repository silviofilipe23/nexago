import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { brl } from '../../planos/data/tournament-plans';
import { PlanSpecsComponent } from '../../planos/ui/plan-specs.component';
import { CANCEL_LABEL, type PlanContract } from '../data/plan-contracts';

/** O plano como ficou congelado no pedido: mudar a tabela depois não mexe neste evento. */
@Component({
  selector: 'bo-contract-plan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlanSpecsComponent],
  template: `
    @let c = contract();
    <div class="kicker">Plano congelado no pedido</div>
    <div class="title-row">
      <h2>{{ c.plan.name }}</h2>
      @if (c.planVersion !== null) { <span class="ver">v{{ c.planVersion }}</span> }
      <span class="spacer"></span>
      <b class="price">{{ brl(c.priceCents) }}</b>
    </div>
    @if (c.plan.description) { <p class="desc">{{ c.plan.description }}</p> }
    <div class="cols">
      <bo-plan-specs [plan]="c.plan" />
      <dl>
        <dt>Sinal</dt><dd>{{ c.plan.depositPct }}% no pedido</dd>
        <dt>Saldo</dt><dd>{{ c.plan.balanceDays }} dias antes do evento</dd>
        <dt>Cancelamento</dt><dd>{{ cancel(c) }}</dd>
        <dt>Hora extra</dt><dd>{{ c.plan.extraHourCents > 0 ? brl(c.plan.extraHourCents) + '/h' : 'Não cobrada' }}</dd>
        <dt>Antecedência</dt><dd>{{ c.plan.leadDays }} dias</dd>
        <dt>Cidades</dt><dd>{{ c.plan.cities.length ? c.plan.cities.join(', ') : 'Todas' }}</dd>
      </dl>
    </div>
  `,
  styles: `
    :host { display: block; padding: 20px 22px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); }
    .kicker { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .title-row { display: flex; align-items: baseline; gap: 8px; margin-top: 4px; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 17px; }
    .ver { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .spacer { flex: 1; }
    .price { font-family: var(--nx-font-display); font-weight: 800; font-size: 17px; }
    .desc { margin: 6px 0 0; font-size: 12.5px; color: var(--nx-text-mute); }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 20px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--nx-line); }
    dl { margin: 0; display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 8px 12px; font-size: 12.5px; }
    dt { color: var(--nx-text-dim); }
    dd { margin: 0; }
    @media (max-width: 760px) { .cols { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class ContractPlanCardComponent {
  readonly contract = input.required<PlanContract>();
  protected readonly brl = brl;

  protected cancel(c: PlanContract): string {
    return CANCEL_LABEL[c.plan.cancelPolicy];
  }
}

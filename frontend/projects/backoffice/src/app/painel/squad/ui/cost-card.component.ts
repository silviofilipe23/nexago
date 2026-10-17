import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { brl } from '../comissoes/data/commission';
import type { CostLine } from '../visao-geral/data/overview';

/** Custo do programa (Visão geral) ou do embaixador (Perfil): o que já tem fonte e, em "—", o que ainda não tem. */
@Component({
  selector: 'bo-cost-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent],
  template: `
    <bo-panel-card [title]="title()">
      @for (l of lines(); track l.label) {
        <div class="line">
          <div class="top">
            <span>{{ l.label }}</span>
            @if (l.cents === null) {
              <span class="mono none" title="Ainda sem fonte no NexaGO">—</span>
            } @else {
              <span class="mono">{{ money(l.cents) }}</span>
            }
          </div>
          @if (bars() && l.cents !== null) {
            <span class="bar" aria-hidden="true"><i [style.width.%]="l.pct"></i></span>
          }
        </div>
      }
      <div class="total"><span>Total</span><span>{{ money(totalCents()) }}</span></div>
    </bo-panel-card>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .line { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; }
    .top { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; color: var(--nx-text-mute); }
    .mono { font-family: var(--nx-font-mono); font-size: 13px; font-weight: 500; color: var(--nx-text); }
    .mono.none { color: var(--nx-text-dim); }
    .bar { height: 5px; border-radius: 99px; background: rgba(255, 255, 255, 0.07); overflow: hidden; }
    .bar i { display: block; height: 100%; border-radius: 99px; background: var(--nx-orange-500); }
    .total { display: flex; justify-content: space-between; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--nx-line); font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; }
  `,
})
export class CostCardComponent {
  readonly title = input('Custo no piloto');
  readonly lines = input.required<CostLine[]>();
  readonly totalCents = input.required<number>();
  /** Barras proporcionais (Visão geral); o perfil mostra só a lista. */
  readonly bars = input(true);

  protected money(cents: number): string {
    return brl(cents, false);
  }
}

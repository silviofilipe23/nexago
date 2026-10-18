import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import type { AmendmentLine, ContractLine } from '../data/profile';

/** "Contrato": período, comissão, regras congeladas, pausa/encerramento e o histórico de aditivos. */
@Component({
  selector: 'bo-contract-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent],
  template: `
    <bo-panel-card title="Contrato">
      @for (l of lines(); track l.label) {
        <div class="line"><span>{{ l.label }}</span><span class="v">{{ l.value }}</span></div>
      }
      @if (amendments().length) {
        <div class="sub">Aditivos de nível</div>
        @for (a of amendments(); track $index) {
          <div class="line"><span>{{ a.label }}</span><span class="v" [class]="'v ' + a.tone">{{ a.status }}</span></div>
        }
      }
    </bo-panel-card>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .line { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; font-size: 12.5px; }
    .line > span:first-child { color: var(--nx-text-dim); }
    .v { text-align: right; }
    .v.orange { color: var(--nx-orange-500); }
    .v.green { color: var(--nx-win); }
    .v.dim { color: var(--nx-text-dim); }
    .sub { margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--nx-line); font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
  `,
})
export class ContractCardComponent {
  readonly lines = input.required<ContractLine[]>();
  readonly amendments = input<AmendmentLine[]>([]);
}

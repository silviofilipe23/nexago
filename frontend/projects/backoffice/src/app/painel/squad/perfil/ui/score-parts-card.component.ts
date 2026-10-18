import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import type { ScorePart } from '../data/profile';

/**
 * "Composição do Score": os 8 componentes com o peso das regras. O recálculo diário ainda não grava
 * a nota de cada componente, então o valor aparece "—" até lá; o peso já é o vigente.
 */
@Component({
  selector: 'bo-score-parts-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent],
  template: `
    <bo-panel-card title="Composição do Score">
      @for (p of parts(); track p.key) {
        <div class="part">
          <span class="label">{{ p.label }}</span>
          <span class="bar" aria-hidden="true"><i></i></span>
          <span class="mono"><b>—</b>/{{ p.max }}</span>
        </div>
      }
      <p class="note">Os pesos vêm de Níveis &amp; regras. A nota por componente entra com o recálculo diário do Score.</p>
    </bo-panel-card>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .part { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) 48px; gap: 12px; align-items: center; height: 30px; font-size: 12.5px; }
    .label { color: var(--nx-text-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar { height: 5px; border-radius: 99px; background: rgba(255, 255, 255, 0.07); }
    .mono { font-family: var(--nx-font-mono); font-size: 12px; text-align: right; color: var(--nx-text-dim); }
    .mono b { font-weight: 500; }
    .note { margin: 10px 0 0; font-size: 11.5px; line-height: 1.45; color: var(--nx-text-dim); }
  `,
})
export class ScorePartsCardComponent {
  readonly parts = input.required<ScorePart[]>();
}

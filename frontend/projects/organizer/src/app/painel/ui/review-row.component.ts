import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { OgIconComponent } from './icon.component';

/** Linha rótulo/valor + "Editar" — tela de revisão final dos wizards. */
@Component({
  selector: 'og-review-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgIconComponent],
  host: { class: 'og-review-row' },
  template: `
    <div class="og-review-label">{{ label() }}</div>
    <div class="og-review-value">{{ value() }}</div>
    <button type="button" class="og-ghost-btn"><og-icon name="edit" [size]="12" />Editar</button>
  `,
})
export class OgReviewRowComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
}

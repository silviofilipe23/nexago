import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Rótulo mono uppercase + conteúdo — usado para envolver inputs/seletores estáticos do wizard. */
@Component({
  selector: 'og-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'og-field' },
  template: `
    <label class="og-field-label">{{ label() }}</label>
    <ng-content />
  `,
})
export class OgFormFieldComponent {
  readonly label = input.required<string>();
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { OgIconComponent } from './icon.component';

/** Campo numérico com botões +/- — valor fixo (mockado), reproduz o protótipo. */
@Component({
  selector: 'og-stepper-static',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgIconComponent],
  host: { class: 'og-field' },
  template: `
    <label class="og-field-label">{{ label() }}</label>
    <div class="og-stepper">
      <span class="og-stepper-btn">–</span>
      <div class="og-stepper-value">{{ value() }}<span>{{ suffix() }}</span></div>
      <span class="og-stepper-btn"><og-icon name="plus" [size]="16" /></span>
    </div>
  `,
})
export class OgStepperStaticComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly suffix = input<string>('');
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { OgIconComponent } from './icon.component';

/** Campo numérico com botões +/-. Os botões emitem `bump` (+1/−1) — telas mock antigas que
 *  não escutam o output continuam visuais como antes. */
@Component({
  selector: 'og-stepper-static',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgIconComponent],
  host: { class: 'og-field' },
  template: `
    <label class="og-field-label">{{ label() }}</label>
    <div class="og-stepper">
      <span class="og-stepper-btn" style="cursor:pointer" (click)="bump.emit(-1)">–</span>
      <div class="og-stepper-value">{{ value() }}<span>{{ suffix() }}</span></div>
      <span class="og-stepper-btn" style="cursor:pointer" (click)="bump.emit(1)"><og-icon name="plus" [size]="16" /></span>
    </div>
  `,
})
export class OgStepperStaticComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly suffix = input<string>('');
  readonly bump = output<number>();
}

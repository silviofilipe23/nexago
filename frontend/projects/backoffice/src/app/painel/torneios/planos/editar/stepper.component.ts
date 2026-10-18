import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** − valor + com limites (quadras, árbitros, horas). */
@Component({
  selector: 'bo-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="step" role="group" [attr.aria-label]="label()">
      <button type="button" [disabled]="disabled() || value() <= min()" [attr.aria-label]="'Diminuir ' + label()" (click)="valueChange.emit(value() - 1)">−</button>
      <output [attr.aria-label]="label()">{{ value() }}{{ suffix() }}</output>
      <button type="button" [disabled]="disabled() || value() >= max()" [attr.aria-label]="'Aumentar ' + label()" (click)="valueChange.emit(value() + 1)">+</button>
    </div>
  `,
  styles: `
    .step { display: flex; align-items: center; gap: 10px; }
    button { width: 34px; height: 34px; border-radius: 9px; background: var(--nx-surface-2); border: 1px solid var(--nx-line-strong); color: var(--nx-text); cursor: pointer; font-size: 16px; font-family: var(--nx-font-mono); }
    button:disabled { opacity: 0.4; cursor: default; }
    button:hover:not(:disabled) { border-color: rgba(255, 106, 26, 0.5); }
    output { min-width: 54px; text-align: center; font-family: var(--nx-font-mono); font-weight: 700; font-size: 14px; }
  `,
})
export class StepperComponent {
  readonly value = input.required<number>();
  readonly label = input.required<string>();
  readonly min = input(0);
  readonly max = input(99);
  readonly suffix = input('');
  readonly disabled = input(false);

  readonly valueChange = output<number>();
}

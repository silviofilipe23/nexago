import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const TONE_CLASSES = ['', 'is-fraca', 'is-razoavel', 'is-boa', 'is-forte'];
const LABELS = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];

@Component({
  selector: 'app-password-strength-meter',
  standalone: true,
  template: `
    <div class="nx-strength">
      <div class="nx-strength-bars">
        @for (bar of [1, 2, 3, 4]; track bar) {
          <span [class]="bar <= score() ? toneClass() : ''"></span>
        }
      </div>
      <div class="nx-strength-label" [class]="toneClass()">
        {{ password() ? label() : 'Mín. 8 caracteres, 1 maiúscula, 1 número' }}
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordStrengthMeterComponent {
  readonly password = input('');

  protected readonly score = computed(() => {
    const value = this.password();
    return [value.length >= 8, /[A-Z]/.test(value), /[0-9]/.test(value), /[^A-Za-z0-9]/.test(value)]
      .filter(Boolean).length;
  });

  protected readonly toneClass = computed(() => TONE_CLASSES[this.score()] ?? '');
  protected readonly label = computed(() => LABELS[this.score()] || 'Fraca');
}

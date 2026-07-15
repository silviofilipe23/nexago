import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const LABELS = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];
const COLORS = [
  'var(--nx-line)',
  'var(--nx-live)',
  'var(--nx-pending)',
  'var(--nx-pending)',
  'var(--nx-win)',
];

/** Medidor de força de senha (protótipo CoStrengthMeter/BoStrengthMeter). */
@Component({
  selector: 'og-strength-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="meter">
      <div class="bars" aria-hidden="true">
        @for (bar of [1, 2, 3, 4]; track bar) {
          <div class="bar" [style.background]="bar <= score() ? COLORS[score()] : 'var(--nx-line)'"></div>
        }
      </div>
      <div class="label" [style.color]="score() === 0 ? 'var(--nx-text-dim)' : COLORS[score()]" aria-live="polite">
        {{ password() ? LABELS[score()] : 'Mín. 8 caracteres, 1 maiúscula, 1 número' }}
      </div>
    </div>
  `,
  styles: `
    .meter {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bars {
      display: flex;
      gap: 6px;
    }

    .bar {
      flex: 1;
      height: 4px;
      border-radius: 2px;
      transition: background 200ms var(--nx-ease-out);
    }

    .label {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      min-height: 12px;
    }
  `,
})
export class StrengthMeterComponent {
  readonly password = input('');

  protected readonly LABELS = LABELS;
  protected readonly COLORS = COLORS;

  protected readonly score = computed(() => {
    const pw = this.password();
    return [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(
      Boolean,
    ).length;
  });
}

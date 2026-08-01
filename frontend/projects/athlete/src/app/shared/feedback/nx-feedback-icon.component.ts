import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { NxFeedbackTone } from './nx-feedback.types';

/** Glifo do tom, em `currentColor` — quem pinta é a superfície que o hospeda.
 *  Decorativo (`aria-hidden`): o texto da mensagem é que carrega o significado,
 *  e o tom nunca é o único indicador (regra `color-not-only`). */
@Component({
  selector: 'app-nx-feedback-icon',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (tone()) {
        @case ('success') {
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12.3 2.7 2.7L16 9.7" />
        }
        @case ('error') {
          <path d="M8.6 3h6.8L20.9 8.6v6.8L15.4 21H8.6L3.1 15.4V8.6z" />
          <path d="M12 7.6v5.1M12 16.4h.01" />
        }
        @case ('warning') {
          <path d="M12 3.6 21.4 20H2.6z" />
          <path d="M12 9.6v4.3M12 17.2h.01" />
        }
        @default {
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16.4v-4.9M12 7.9h.01" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      flex: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxFeedbackIconComponent {
  readonly tone = input<NxFeedbackTone>('info');
  readonly size = input(16);
}

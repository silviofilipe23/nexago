import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type StatusTone = 'green' | 'yellow' | 'red';

/** Indicador de status pontual (protótipo BoStatusDot). */
@Component({
  selector: 'ar-status-dot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="dot" [class]="'tone-' + tone()" [style.width.px]="size()" [style.height.px]="size()"></span>`,
  styles: `
    .dot {
      display: inline-block;
      border-radius: 50%;
      flex: none;
    }

    .tone-green {
      background: var(--nx-win);
      box-shadow: 0 0 8px rgba(43, 209, 126, 0.5);
    }

    .tone-yellow {
      background: var(--nx-pending);
      box-shadow: 0 0 8px rgba(244, 197, 67, 0.5);
    }

    .tone-red {
      background: var(--nx-live);
      box-shadow: 0 0 8px rgba(255, 59, 48, 0.5);
    }
  `,
})
export class StatusDotComponent {
  readonly tone = input<StatusTone>('green');
  readonly size = input(8);
}

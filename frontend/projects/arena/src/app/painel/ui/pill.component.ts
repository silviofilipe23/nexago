import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PillTone = 'orange' | 'green' | 'yellow' | 'red' | 'dim';

/** Pill de status (protótipo BoPill/ArPill). */
@Component({
  selector: 'ar-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="pill" [class]="'tone-' + tone()">
      <ng-content />
    </span>
  `,
  styles: `
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 22px;
      padding: 0 9px;
      border-radius: var(--nx-r-pill);
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      white-space: nowrap;
      border: 1px solid transparent;
    }

    .tone-orange {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
      color: var(--nx-orange-500);
    }

    .tone-green {
      background: rgba(43, 209, 126, 0.1);
      border-color: rgba(43, 209, 126, 0.28);
      color: var(--nx-win);
    }

    .tone-yellow {
      background: rgba(244, 197, 67, 0.1);
      border-color: rgba(244, 197, 67, 0.28);
      color: var(--nx-pending);
    }

    .tone-red {
      background: rgba(255, 59, 48, 0.1);
      border-color: rgba(255, 59, 48, 0.28);
      color: var(--nx-live);
    }

    .tone-dim {
      background: var(--nx-surface-1);
      border-color: var(--nx-line-strong);
      color: var(--nx-text-mute);
    }
  `,
})
export class PillComponent {
  readonly tone = input<PillTone>('orange');
}

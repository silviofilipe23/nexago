import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BarRowTone = 'orange' | 'green' | 'yellow' | 'red';

/** Barra de progresso horizontal com label + subtítulo (protótipo ArBarRow). */
@Component({
  selector: 'ar-bar-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row" [class.last]="last()">
      <div class="head">
        <div class="labels">
          <span class="label">{{ label() }}</span>
          @if (sub()) {
            <span class="sub">{{ sub() }}</span>
          }
        </div>
        <span class="pct" [class]="'tone-' + tone()">{{ pct() }}%</span>
      </div>
      <div class="track">
        <div class="fill" [class]="'tone-' + tone()" [style.width.%]="pct()"></div>
      </div>
    </div>
  `,
  styles: `
    .row {
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .row.last {
      border-bottom: none;
    }

    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 7px;
    }

    .labels {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
    }

    .label {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }

    .sub {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }

    .pct {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
    }

    .pct.tone-orange,
    .fill.tone-orange {
      color: var(--nx-orange-500);
    }

    .pct.tone-green,
    .fill.tone-green {
      color: var(--nx-win);
    }

    .pct.tone-yellow,
    .fill.tone-yellow {
      color: var(--nx-pending);
    }

    .pct.tone-red,
    .fill.tone-red {
      color: var(--nx-live);
    }

    .track {
      height: 7px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .fill {
      height: 100%;
      border-radius: 4px;
      background: currentColor;
    }
  `,
})
export class BarRowComponent {
  readonly label = input.required<string>();
  readonly sub = input('');
  readonly pct = input.required<number>();
  readonly tone = input<BarRowTone>('orange');
  readonly last = input(false);
}

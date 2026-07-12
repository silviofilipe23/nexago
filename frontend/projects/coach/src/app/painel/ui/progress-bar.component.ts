import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ProgressTone = 'green' | 'yellow' | 'red' | 'orange';

const TONE_COLOR: Record<ProgressTone, string> = {
  green: 'var(--nx-win)',
  yellow: 'var(--nx-pending)',
  red: 'var(--nx-live)',
  orange: 'var(--nx-orange-500)',
};

@Component({
  selector: 'co-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track" [style.height.px]="height()">
      <div class="fill" [style.width.%]="pct()" [style.background]="color()"></div>
    </div>
  `,
  styles: `
    .track {
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }
    .fill {
      height: 100%;
      border-radius: 4px;
    }
  `,
})
export class ProgressBarComponent {
  readonly pct = input.required<number>();
  readonly tone = input<ProgressTone>('orange');
  readonly height = input(7);

  protected readonly color = computed(() => TONE_COLOR[this.tone()]);
}

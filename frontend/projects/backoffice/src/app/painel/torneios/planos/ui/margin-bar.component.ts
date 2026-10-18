import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { marginTone } from '../data/tournament-plans';

/** Barra da margem com o traço da mínima. 62,5% de margem enche a barra. */
@Component({
  selector: 'bo-margin-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track" role="img" [attr.aria-label]="'Margem de ' + pct() + '%, mínima ' + min() + '%'">
      <div class="fill" [class]="tone()" [style.width.%]="width(pct())"></div>
      <div class="min" [style.left.%]="width(min())"></div>
    </div>
  `,
  styles: `
    .track { position: relative; height: 6px; border-radius: 3px; background: var(--nx-surface-2); }
    .fill { height: 100%; border-radius: 3px; }
    .fill.green { background: var(--nx-win); }
    .fill.yellow { background: var(--nx-pending); }
    .fill.red { background: var(--nx-live); }
    .min { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--nx-text-mute); }
  `,
})
export class MarginBarComponent {
  readonly pct = input.required<number>();
  readonly min = input.required<number>();

  protected readonly tone = computed(() => marginTone(this.pct(), this.min()));
  protected width(v: number): number {
    return Math.max(0, Math.min(100, v * 1.6));
  }
}

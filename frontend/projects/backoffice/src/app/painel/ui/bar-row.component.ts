import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Linha de ranking com barra horizontal (protótipo BoaCityRow), reutilizada por distribuições diversas. */
@Component({
  selector: 'bo-bar-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row" [class.last]="last()">
      <span class="label">{{ label() }}</span>
      <div class="track">
        <div class="fill" [style.width.%]="pct()"></div>
      </div>
      <span class="count">{{ count() }}</span>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 7px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .row.last {
      border-bottom: none;
    }

    .label {
      width: 108px;
      flex: none;
      font-size: 12.5px;
      font-weight: 500;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .track {
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .fill {
      height: 100%;
      border-radius: 4px;
      background: var(--nx-orange-500);
    }

    .count {
      width: 30px;
      flex: none;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text-mute);
    }
  `,
})
export class BarRowComponent {
  readonly label = input.required<string>();
  readonly count = input.required<number>();
  readonly max = input.required<number>();
  readonly last = input(false);

  protected readonly pct = computed(() => (this.count() / this.max()) * 100);
}

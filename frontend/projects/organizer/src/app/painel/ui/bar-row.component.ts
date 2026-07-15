import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Linha de barra de progresso horizontal — usada em Financeiro (arrecadação por evento). */
@Component({
  selector: 'og-bar-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'og-bar-row',
    '[class.last]': 'last()',
  },
  template: `
    <div class="og-bar-row-top">
      <div class="og-bar-row-label">
        <span class="name">{{ label() }}</span>
        @if (sub()) {
          <span class="sub">{{ sub() }}</span>
        }
      </div>
      <span class="pct" [style.color]="color()">{{ pct() }}%</span>
    </div>
    <div class="og-bar-row-track">
      <span [style.width.%]="pct()" [style.background]="color()"></span>
    </div>
  `,
  styles: `
    .og-bar-row {
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-bar-row.last {
      border-bottom: none;
    }
    .og-bar-row-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 7px;
    }
    .og-bar-row-label {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
    }
    .og-bar-row-label .name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-bar-row-label .sub {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }
    .og-bar-row-top .pct {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
    }
    .og-bar-row-track {
      height: 7px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }
    .og-bar-row-track span {
      display: block;
      height: 100%;
      border-radius: 4px;
    }
  `,
})
export class OgBarRowComponent {
  readonly label = input.required<string>();
  readonly sub = input<string>('');
  readonly pct = input.required<number>();
  readonly tone = input<'orange' | 'green' | 'yellow' | 'red'>('orange');
  readonly last = input(false);

  protected readonly color = computed(() => {
    const tones = { orange: 'var(--nx-orange-500)', green: 'var(--nx-win)', yellow: 'var(--nx-pending)', red: 'var(--nx-live)' };
    return tones[this.tone()];
  });
}

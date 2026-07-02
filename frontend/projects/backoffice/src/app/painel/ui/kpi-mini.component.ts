import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type KpiMiniTone = 'neutral' | 'green' | 'yellow' | 'red';

/** Indicador compacto pra grids densos de KPI (protótipo BoaKpiMini). */
@Component({
  selector: 'bo-kpi-mini',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tile">
      <div class="label">{{ label() }}</div>
      <div class="value" [class]="'tone-' + tone()">{{ value() }}</div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .tile {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 23px;
      letter-spacing: -0.02em;
      line-height: 1;
      color: var(--nx-text);
    }

    .value.tone-green {
      color: var(--nx-win);
    }

    .value.tone-yellow {
      color: var(--nx-pending);
    }

    .value.tone-red {
      color: var(--nx-live);
    }
  `,
})
export class KpiMiniComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly tone = input<KpiMiniTone>('neutral');
}

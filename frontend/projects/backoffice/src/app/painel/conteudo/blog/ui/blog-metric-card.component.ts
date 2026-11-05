import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { MetricCard } from '../data/blog-metrics';

/** Card de métrica da lista (protótipo Blog-bo-01): rótulo, número e a linha de baixo. */
@Component({
  selector: 'bo-blog-metric-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card" [attr.aria-busy]="loading()">
      <div class="label">{{ card().label }}</div>
      <div class="value" [class.loading]="loading()">{{ card().value }}</div>
      @if (card().note) {
        <div class="note" [class]="'trend-' + (card().trend ?? 'none')">{{ card().note }}</div>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .card { height: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 16px 18px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: var(--nx-surface-0); }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .value { font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; letter-spacing: -0.02em; line-height: 1.1; color: var(--nx-text); }
    .value.loading { color: var(--nx-text-dim); }
    .note { font-size: 12px; color: var(--nx-text-dim); }
    .note.trend-up { font-family: var(--nx-font-mono); font-weight: 700; font-size: 11.5px; color: var(--nx-win); }
    .note.trend-down { font-family: var(--nx-font-mono); font-weight: 700; font-size: 11.5px; color: var(--nx-live); }
  `,
})
export class BlogMetricCardComponent {
  readonly card = input.required<MetricCard>();
  readonly loading = input(false);
}

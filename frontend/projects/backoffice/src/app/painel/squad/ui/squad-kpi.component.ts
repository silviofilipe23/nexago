import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** KPI do Squad (protótipo LbKpi): rótulo mono, valor grande e, embaixo, variação verde ou dica. */
@Component({
  selector: 'bo-squad-kpi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="label">{{ label() }}</span>
    <strong class="value" [class.none]="value() === '—'">{{ value() }}</strong>
    @if (delta(); as d) {
      <span class="delta">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        {{ d }}
      </span>
    } @else if (hint()) {
      <span class="hint">{{ hint() }}</span>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 18px 20px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .value { font-family: var(--nx-font-display); font-weight: 800; font-size: 28px; letter-spacing: -0.02em; line-height: 1.1; color: var(--nx-text); white-space: nowrap; }
    .value.none { color: var(--nx-text-dim); }
    .delta { display: inline-flex; align-items: center; gap: 4px; font-family: var(--nx-font-mono); font-size: 11px; font-weight: 700; color: var(--nx-win); }
    .hint { font-size: 12px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `,
})
export class SquadKpiComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  /** "41 na semana" — só quando houve movimento. */
  readonly delta = input<string | null>(null);
  readonly hint = input<string | null>(null);
}

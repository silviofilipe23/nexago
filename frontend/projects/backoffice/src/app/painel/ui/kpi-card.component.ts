import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PanelCardComponent } from './panel-card.component';

/** Card de indicador (protótipo BoKpiCard): valor grande + variação vs período anterior. */
@Component({
  selector: 'bo-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent],
  template: `
    <bo-panel-card pad="sm">
      <div class="label">{{ label() }}</div>
      <div class="value" [class.empty]="empty()">{{ value() }}</div>
      @if (empty()) {
        <div class="empty-hint">sem dados ainda</div>
      } @else {
        <div class="delta">
          <span class="delta-value" [class.down]="deltaTone() === 'red'">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" [style.transform]="deltaTone() === 'red' ? 'rotate(180deg)' : 'none'" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            {{ delta() }}
          </span>
          <span class="delta-label">vs mês anterior</span>
        </div>
      }
    </bo-panel-card>
  `,
  styles: `
    :host {
      display: block;
      flex: 1;
      min-width: 0;
    }

    .label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
      letter-spacing: -0.03em;
      line-height: 1;
      color: var(--nx-text);
      margin-bottom: 8px;
    }

    .value.empty {
      color: var(--nx-text-dim);
    }

    .empty-hint {
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    .delta {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .delta-value {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--nx-win);
    }

    .delta-value.down {
      color: var(--nx-live);
    }

    .delta-label {
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
  `,
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly delta = input('');
  readonly deltaTone = input<'green' | 'red'>('green');
  readonly empty = input(false);
}

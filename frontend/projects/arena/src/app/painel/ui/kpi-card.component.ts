import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, type PanelIconName } from './icon.component';
import { PanelCardComponent } from './panel-card.component';

export type KpiDeltaTone = 'green' | 'red' | 'orange' | 'flat';

/** Card de indicador (protótipo ArKpiCard): valor grande + variação vs semana anterior, com ícone opcional. */
@Component({
  selector: 'ar-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent],
  template: `
    <ar-panel-card pad="sm">
      <div class="head">
        <div class="label">{{ label() }}</div>
        @if (icon()) {
          <ar-icon [name]="icon()!" [size]="14" style="color: var(--nx-text-dim)" />
        }
      </div>
      <div class="value">{{ value() }}</div>
      @if (delta()) {
        <div class="delta">
          <span class="delta-value" [class]="'tone-' + deltaTone()">
            @if (deltaTone() === 'green' || deltaTone() === 'red') {
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" [style.transform]="deltaTone() === 'red' ? 'rotate(180deg)' : 'none'" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            }
            {{ delta() }}
          </span>
          <span class="delta-label">vs semana anterior</span>
        </div>
      }
    </ar-panel-card>
  `,
  styles: `
    :host {
      display: block;
      flex: 1;
      min-width: 0;
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.03em;
      line-height: 1;
      color: var(--nx-text);
      margin-bottom: 8px;
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
    }

    .delta-value.tone-green {
      color: var(--nx-win);
    }

    .delta-value.tone-red {
      color: var(--nx-live);
    }

    .delta-value.tone-orange {
      color: var(--nx-orange-500);
    }

    .delta-value.tone-flat {
      color: var(--nx-text-dim);
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
  readonly deltaTone = input<KpiDeltaTone>('green');
  readonly icon = input<PanelIconName | null>(null);
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, type PanelIconName } from './icon.component';

export type KpiTone = 'green' | 'orange' | 'red' | 'flat';

/** Card de indicador (protótipo TrKpiCard) — usado em Início, Presença, Avaliações e Torneios. */
@Component({
  selector: 'co-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="card">
      <div class="head">
        <div class="label">{{ label() }}</div>
        @if (icon(); as ic) {
          <co-icon [name]="ic" [size]="14" style="color: var(--nx-text-dim)" />
        }
      </div>
      <div class="value">{{ value() }}</div>
      @if (delta()) {
        <div class="delta" [class]="'tone-' + deltaTone()">{{ delta() }}</div>
      }
    </div>
  `,
  styles: `
    .card {
      flex: 1;
      min-width: 0;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 18px;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
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
      font-size: 27px;
      letter-spacing: -0.03em;
      line-height: 1;
      color: var(--nx-text);
      margin-bottom: 8px;
    }
    .delta {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--nx-text-dim);
    }
    .delta.tone-green { color: var(--nx-win); }
    .delta.tone-orange { color: var(--nx-orange-500); }
    .delta.tone-red { color: var(--nx-live); }
  `,
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly delta = input('');
  readonly deltaTone = input<KpiTone>('green');
  readonly icon = input<PanelIconName | null>(null);
}

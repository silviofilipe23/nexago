import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import type { AthletePoints, RulesIssues } from '../data/squad-rules';
import { NumFieldComponent } from './num-field.component';

type ActionKey = 'perConversion' | 'perEvent' | 'perContent';

const ACTIONS: ReadonlyArray<{ key: ActionKey; label: string }> = [
  { key: 'perConversion', label: 'por conversão paga' },
  { key: 'perEvent', label: 'por presença em evento' },
  { key: 'perContent', label: 'por conteúdo aprovado' },
];

/**
 * Card "Pontos e níveis do atleta": a gamificação que o atleta vê. Limites estritamente
 * crescentes a partir de 0; conversão cancelada por reembolso devolve os pontos.
 */
@Component({
  selector: 'bo-athlete-points-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, NumFieldComponent],
  template: `
    <bo-panel-card title="Pontos e níveis do atleta" pad="lg">
      <div class="levels">
        @for (level of value().levels; track level.name; let i = $index) {
          <div class="level" [class.bad]="!!issue('points.levels.' + i)">
            <strong>{{ level.name }}</strong>
            @if (i === 0) {
              <span class="fixed" title="O primeiro nível começa em 0">0+ pts</span>
            } @else {
              <bo-num-field
                size="sm"
                suffix="+ pts"
                [grouping]="true"
                [value]="level.min"
                [label]="'Pontos para ' + level.name"
                [invalid]="!!issue('points.levels.' + i)"
                [disabled]="readonly()"
                (valueChange)="setLevel(i, $event)"
              />
            }
          </div>
        }
      </div>
      @for (level of value().levels; track level.name; let i = $index) {
        @if (issue('points.levels.' + i); as m) {
          <p class="err">{{ level.name }}: {{ m }}</p>
        }
      }

      <ul class="actions">
        @for (a of actions; track a.key) {
          <li>
            <bo-num-field
              class="n"
              size="sm"
              prefix="+"
              [value]="value()[a.key]"
              [label]="'Pontos ' + a.label"
              [invalid]="!!issue('points.' + a.key)"
              [disabled]="readonly()"
              (valueChange)="setAction(a.key, $event)"
            />
            <span>pts {{ a.label }}</span>
          </li>
        }
      </ul>
      <p class="foot">Conversão cancelada por reembolso tira os pontos. Visível no app; o Score fica só no backoffice.</p>
    </bo-panel-card>
  `,
  styles: `
    :host { display: block; container-type: inline-size; }
    .levels { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .level { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 10px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .level.bad { border-color: rgba(255, 59, 48, 0.5); }
    strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; }
    .fixed { display: flex; align-items: center; height: 30px; font-family: var(--nx-font-mono); font-size: 12px; color: var(--nx-text-dim); }
    .err { margin: 8px 0 0; font-size: 12px; color: var(--nx-live); }
    .actions { margin: 14px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .actions li { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--nx-text-mute); }
    .n { width: 76px; flex: none; }
    .foot { margin: 14px 0 0; font-size: 11.5px; line-height: 1.5; color: var(--nx-text-dim); }
    @container (max-width: 600px) {
      .levels { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
})
export class AthletePointsCardComponent {
  readonly value = input.required<AthletePoints>();
  readonly issues = input.required<RulesIssues>();
  readonly readonly = input(false);

  readonly valueChange = output<AthletePoints>();

  protected readonly actions = ACTIONS;

  protected issue(path: string): string | undefined {
    return this.issues()[path];
  }

  protected setLevel(index: number, v: number | [number, number] | null): void {
    const min = v === null || Array.isArray(v) ? NaN : v;
    this.valueChange.emit({
      ...this.value(),
      levels: this.value().levels.map((l, i) => (i === index ? { ...l, min } : l)),
    });
  }

  protected setAction(key: ActionKey, v: number | [number, number] | null): void {
    this.valueChange.emit({ ...this.value(), [key]: v === null || Array.isArray(v) ? NaN : v });
  }
}

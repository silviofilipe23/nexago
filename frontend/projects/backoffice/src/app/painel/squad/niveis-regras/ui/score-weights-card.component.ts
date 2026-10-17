import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import {
  SCORE_COMPONENTS,
  SCORE_LABELS,
  scoreTotal,
  type RulesIssues,
  type ScoreComponent,
} from '../data/squad-rules';
import { NumFieldComponent } from './num-field.component';

/**
 * Card "Pesos do NexaGO Score". Cada componente é normalizado de 0 a 1 contra o melhor do
 * ciclo e multiplicado pelo peso; a soma precisa dar 100. O Score é interno (só backoffice).
 */
@Component({
  selector: 'bo-score-weights-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, NumFieldComponent],
  template: `
    <bo-panel-card title="Pesos do NexaGO Score" pad="lg">
      <span card-actions class="total" [class.bad]="!!totalIssue()" role="status" aria-live="polite">
        {{ totalIssue() ?? 'Total ' + total() }}
      </span>
      <ul class="rows">
        @for (row of rows(); track row.key) {
          <li class="row" [attr.title]="row.source">
            <span class="name">{{ row.label }}</span>
            <span class="bar" aria-hidden="true"><i [style.width.%]="row.bar"></i></span>
            <bo-num-field
              class="n"
              size="sm"
              [value]="row.weight"
              [label]="'Peso de ' + row.label"
              [invalid]="row.invalid"
              [disabled]="readonly()"
              (valueChange)="set(row.key, $event)"
            />
          </li>
        }
      </ul>
      <p class="foot">Recalculado todo dia às 03:00. Não aparece no portal, no app nem na página pública.</p>
    </bo-panel-card>
  `,
  styles: `
    .total { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-orange-500); }
    .total.bad { color: var(--nx-live); }
    .rows { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(60px, 34%) 56px; gap: 14px; align-items: center; min-height: 34px; }
    .name { font-size: 13px; color: var(--nx-text-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar { height: 4px; border-radius: 2px; background: var(--nx-surface-2); overflow: hidden; }
    .bar i { display: block; height: 100%; border-radius: 2px; background: var(--nx-orange-500); transition: width 160ms var(--nx-ease-out); }
    .foot { margin: 14px 0 0; font-size: 11.5px; color: var(--nx-text-dim); }
  `,
})
export class ScoreWeightsCardComponent {
  readonly weights = input.required<Record<ScoreComponent, number>>();
  readonly issues = input.required<RulesIssues>();
  readonly readonly = input(false);

  readonly weightsChange = output<Record<ScoreComponent, number>>();

  protected readonly total = computed(() => scoreTotal(this.weights()));
  protected readonly totalIssue = computed(() => this.issues()['scoreWeights.total'] ?? null);

  /** Barra proporcional ao maior peso, como no desenho (o maior enche a trilha). */
  protected readonly rows = computed(() => {
    const w = this.weights();
    const max = Math.max(1, ...SCORE_COMPONENTS.map((c) => (Number.isFinite(w[c]) ? w[c] : 0)));
    return SCORE_COMPONENTS.map((key) => ({
      key,
      ...SCORE_LABELS[key],
      weight: w[key],
      bar: Number.isFinite(w[key]) ? Math.max(0, Math.min(100, (w[key] / max) * 100)) : 0,
      invalid: this.issues()[`scoreWeights.${key}`] !== undefined || this.totalIssue() !== null,
    }));
  });

  protected set(key: ScoreComponent, v: number | [number, number] | null): void {
    this.weightsChange.emit({ ...this.weights(), [key]: v === null || Array.isArray(v) ? NaN : v });
  }
}

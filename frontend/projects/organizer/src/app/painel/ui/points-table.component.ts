import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Tabela de pontuação por colocação (ranking) — usada em Regulamento e nos wizards de liga. */
@Component({
  selector: 'og-points-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'og-points-table' },
  template: `
    @for (row of pts(); track row[0]) {
      <div class="og-points-row">
        <span class="k">{{ row[0] }}</span>
        <span class="v">{{ row[1] }} <em>pts</em></span>
      </div>
    }
  `,
})
export class OgPointsTableComponent {
  readonly pts = input.required<[string, number][]>();
}

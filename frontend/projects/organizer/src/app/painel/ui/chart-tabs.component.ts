import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Seletor de abas em segmento único (usado para filtros de listas e séries de gráfico). */
@Component({
  selector: 'og-chart-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'og-chart-tabs' },
  template: `
    @for (t of tabs(); track t) {
      <button type="button" [class.active]="t === active()" (click)="changed.emit(t)">{{ t }}</button>
    }
  `,
})
export class OgChartTabsComponent {
  readonly tabs = input.required<string[]>();
  readonly active = input<string>('');
  readonly changed = output<string>();
}

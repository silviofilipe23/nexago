import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Abas de alternância de dado exibido (protótipo ArChartTabs) — usa a classe global .ar-chart-tabs. */
@Component({
  selector: 'ar-chart-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ar-chart-tabs">
      @for (t of tabs(); track t) {
        <button type="button" [class.active]="t === active()" (click)="change.emit(t)">{{ t }}</button>
      }
    </div>
  `,
})
export class ChartTabsComponent {
  readonly tabs = input.required<string[]>();
  readonly active = input.required<string>();
  readonly change = output<string>();
}

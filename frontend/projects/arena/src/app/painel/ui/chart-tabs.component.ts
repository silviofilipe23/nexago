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
  // A aparência vem da classe global .ar-chart-tabs (styles.scss); aqui só o
  // comportamento no celular: as abas rolam na horizontal em vez de estourar
  // o card, e cada aba vira um alvo de toque de 36px.
  styles: `
    @use 'breakpoints' as ar;

    @include ar.below(sm) {
      :host {
        display: block;
        min-width: 0;
        max-width: 100%;
      }

      .ar-chart-tabs {
        max-width: 100%;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: none;
      }

      .ar-chart-tabs button {
        flex: none;
        height: 36px;
        white-space: nowrap;
      }
    }
  `,
})
export class ChartTabsComponent {
  readonly tabs = input.required<string[]>();
  readonly active = input.required<string>();
  readonly change = output<string>();
}

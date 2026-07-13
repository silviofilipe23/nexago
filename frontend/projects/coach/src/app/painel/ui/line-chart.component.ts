import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { lineChartPoints, pointsToPolylineAttr } from './line-chart-geometry';

export interface LineChartPoint {
  label: string;
  value: number;
}

/** Gráfico de linha simples (protótipo ArLineChart) — sem lib externa, mesmo espírito do co-radar-chart. */
@Component({
  selector: 'co-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="width()" [attr.height]="height()" [attr.viewBox]="'0 0 ' + width() + ' ' + height()">
      <polyline [attr.points]="polylineAttr()" fill="none" [attr.stroke]="accent()" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      @for (p of points(); track $index) {
        <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" [attr.fill]="accent()" />
        <text [attr.x]="p.x" [attr.y]="height() - 4" text-anchor="middle" font-family="var(--nx-font-mono)" font-size="9.5" fill="var(--nx-text-dim)">{{ data()[$index].label }}</text>
      }
    </svg>
  `,
})
export class LineChartComponent {
  readonly data = input.required<LineChartPoint[]>();
  readonly width = input(320);
  readonly height = input(140);
  readonly accent = input('#FF6A1A');

  protected readonly points = computed(() =>
    lineChartPoints(this.data().map((d) => d.value), this.width(), this.height() - 16),
  );

  protected polylineAttr(): string {
    return pointsToPolylineAttr(this.points());
  }
}

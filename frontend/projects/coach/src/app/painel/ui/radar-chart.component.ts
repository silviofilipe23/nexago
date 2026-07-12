import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  pointsToSvgAttr,
  radarAxisLinePoints,
  radarDataPoints,
  radarLabelPoints,
  radarRingPoints,
  type RadarAxis,
} from './radar-geometry';

export type { RadarAxis };

/** Radar de fundamentos técnicos (protótipo TrRadarChart) — usado em Avaliações e Comparação. */
@Component({
  selector: 'co-radar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" [attr.viewBox]="'0 0 ' + size() + ' ' + size()">
      @for (ring of rings; track ring) {
        <polygon [attr.points]="ringPointsAttr(ring)" fill="none" stroke="var(--nx-line)" stroke-width="1" />
      }
      @for (line of axisLines(); track $index) {
        <line [attr.x1]="center()" [attr.y1]="center()" [attr.x2]="line.x" [attr.y2]="line.y" stroke="var(--nx-line)" stroke-width="1" />
      }
      <polygon [attr.points]="dataPointsAttr()" [attr.fill]="accent()" fill-opacity="0.18" [attr.stroke]="accent()" stroke-width="2" stroke-linejoin="round" />
      @for (p of dataPoints(); track $index) {
        <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" [attr.fill]="accent()" />
      }
      @for (label of labelPoints(); track $index; let i = $index) {
        <text [attr.x]="label.x" [attr.y]="label.y" text-anchor="middle" dominant-baseline="middle"
          font-family="var(--nx-font-mono)" font-size="9.5" font-weight="600" fill="var(--nx-text-dim)"
          style="text-transform: uppercase;">{{ axes()[i].label }}</text>
      }
    </svg>
  `,
})
export class RadarChartComponent {
  readonly axes = input.required<RadarAxis[]>();
  readonly size = input(260);
  readonly accent = input('#FF6A1A');

  protected readonly rings = [0.25, 0.5, 0.75, 1];

  protected readonly center = computed(() => this.size() / 2);
  protected readonly radius = computed(() => this.size() / 2 - 34);

  protected ringPointsAttr(fraction: number): string {
    return pointsToSvgAttr(radarRingPoints(this.axes(), this.center(), this.radius(), fraction));
  }

  protected readonly axisLines = computed(() =>
    radarAxisLinePoints(this.axes(), this.center(), this.radius()),
  );

  protected readonly dataPoints = computed(() =>
    radarDataPoints(this.axes(), this.center(), this.radius()),
  );

  protected dataPointsAttr(): string {
    return pointsToSvgAttr(this.dataPoints());
  }

  protected readonly labelPoints = computed(() =>
    radarLabelPoints(this.axes(), this.center(), this.radius(), 22),
  );
}

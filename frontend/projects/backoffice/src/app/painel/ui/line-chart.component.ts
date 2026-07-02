import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Gráfico de linha simples via SVG (protótipo BoLineChart), sem dependência de charting lib. */
@Component({
  selector: 'bo-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart">
      <svg width="100%" [attr.height]="height()" [attr.viewBox]="'0 0 ' + width() + ' ' + height()" preserveAspectRatio="none" role="img" [attr.aria-label]="ariaLabel()">
        <defs>
          <linearGradient id="boChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#FF6A1A" stop-opacity="0.22" />
            <stop offset="100%" stop-color="#FF6A1A" stop-opacity="0" />
          </linearGradient>
        </defs>
        @for (f of gridLines; track f) {
          <line x1="0" [attr.y1]="height() * f" [attr.x2]="width()" [attr.y2]="height() * f" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3 5" />
        }
        <path [attr.d]="areaPath()" fill="url(#boChartFill)" />
        <path [attr.d]="linePath()" fill="none" stroke="var(--nx-orange-500)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
        <circle [attr.cx]="lastPoint().x" [attr.cy]="lastPoint().y" r="4.5" fill="var(--nx-orange-500)" stroke="#0B0B0C" stroke-width="2.5" />
      </svg>
      <div class="axis">
        @for (m of months(); track m) {
          <span>{{ m }}</span>
        }
      </div>
    </div>
  `,
  styles: `
    .chart {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    svg {
      display: block;
      overflow: visible;
    }

    .axis {
      display: flex;
      justify-content: space-between;
    }

    .axis span {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
  `,
})
export class LineChartComponent {
  readonly data = input.required<number[]>();
  readonly months = input.required<string[]>();
  readonly width = input(802);
  readonly height = input(168);
  readonly ariaLabel = input('Gráfico de tendência');

  protected readonly gridLines = [0.25, 0.5, 0.75];

  private readonly bounds = computed(() => {
    const data = this.data();
    return { max: Math.max(...data) * 1.12, min: Math.min(...data) * 0.82 };
  });

  private px(i: number): number {
    const data = this.data();
    return (i / (data.length - 1)) * this.width();
  }

  private py(v: number): number {
    const { max, min } = this.bounds();
    return this.height() - ((v - min) / (max - min)) * this.height();
  }

  protected readonly linePath = computed(() => {
    const pts = this.data().map((v, i) => `${this.px(i).toFixed(1)},${this.py(v).toFixed(1)}`);
    return 'M' + pts.join(' L');
  });

  protected readonly areaPath = computed(() => {
    const w = this.width();
    const h = this.height();
    return `${this.linePath()} L${w},${h} L0,${h} Z`;
  });

  protected readonly lastPoint = computed(() => {
    const data = this.data();
    const i = data.length - 1;
    return { x: this.px(i), y: this.py(data[i]!) };
  });
}

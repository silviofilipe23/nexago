import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Gráfico de linha com área — reutilizado em Início e Financeiro (série mensal). */
@Component({
  selector: 'og-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="og-line-chart">
      <svg
        width="100%"
        [attr.height]="h()"
        [attr.viewBox]="'0 0 ' + w() + ' ' + h()"
        preserveAspectRatio="none"
        style="display:block;overflow:visible"
      >
        <defs>
          <linearGradient [attr.id]="gradientId()" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" [attr.stop-color]="accent()" stop-opacity="0.22" />
            <stop offset="100%" [attr.stop-color]="accent()" stop-opacity="0" />
          </linearGradient>
        </defs>
        @for (f of gridLines; track f) {
          <line x1="0" [attr.y1]="h() * f" [attr.x2]="w()" [attr.y2]="h() * f" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3 5" />
        }
        <path [attr.d]="area()" [attr.fill]="'url(#' + gradientId() + ')'" />
        <path [attr.d]="line()" fill="none" [attr.stroke]="accent()" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
        <circle [attr.cx]="lastPoint().x" [attr.cy]="lastPoint().y" r="4.5" [attr.fill]="accent()" stroke="#0B0B0C" stroke-width="2.5" />
      </svg>
      @if (labels().length) {
        <div class="og-line-chart-labels">
          @for (m of labels(); track m) {
            <span>{{ m }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .og-line-chart {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .og-line-chart-labels {
      display: flex;
      justify-content: space-between;
    }
    .og-line-chart-labels span {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
  `,
})
export class OgLineChartComponent {
  readonly data = input.required<number[]>();
  readonly labels = input<string[]>([]);
  readonly w = input(802);
  readonly h = input(126);
  readonly accent = input('#FF6A1A');

  protected readonly gridLines = [0.25, 0.5, 0.75];
  protected readonly gradientId = computed(() => `og-line-${Math.random().toString(36).slice(2, 9)}`);

  private readonly bounds = computed(() => {
    const data = this.data();
    const max = Math.max(...data) * 1.15;
    const min = Math.min(...data) * 0.75;
    return { max, min: min === max ? min - 1 : min };
  });

  private px(i: number): number {
    const data = this.data();
    return (i / (data.length - 1)) * this.w();
  }

  private py(v: number): number {
    const { max, min } = this.bounds();
    return this.h() - ((v - min) / (max - min || 1)) * this.h();
  }

  protected readonly line = computed(() => {
    const pts = this.data().map((v, i) => `${this.px(i).toFixed(1)},${this.py(v).toFixed(1)}`);
    return 'M' + pts.join(' L');
  });

  protected readonly area = computed(() => `${this.line()} L${this.w()},${this.h()} L0,${this.h()} Z`);

  protected readonly lastPoint = computed(() => {
    const data = this.data();
    return { x: this.px(data.length - 1), y: this.py(data[data.length - 1]) };
  });
}

import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { shortDay, type DayBar } from '../data/overview';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Receita por dia (01): uma barra por dia; hoje em laranja sólido, o resto a 28%. */
@Component({
  selector: 'bo-revenue-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="top">
      <div>
        <div class="kicker">{{ kicker() }}</div>
        <h2>Receita por dia</h2>
      </div>
      @if (split(); as s) {
        <div class="split"><span>Web <b>{{ s.web }}%</b></span><span>App <b>{{ s.app }}%</b></span></div>
      }
    </div>
    @if (empty()) {
      <div class="empty">Nenhuma venda no período</div>
    } @else {
      <div class="plot" role="img" [attr.aria-label]="summary()" (mouseleave)="hover.set(null)">
        @for (b of bars(); track b.day; let i = $index) {
          <div class="col" (mouseenter)="hover.set(i)" (focus)="hover.set(i)" tabindex="0" [attr.aria-label]="label(b)">
            <div class="bar" [class.today]="b.day === today()" [style.height.%]="height(b)"></div>
          </div>
        }
        @if (hovered(); as h) {
          <div class="tip" [style.left.%]="tipLeft()">
            <span class="tip-day">{{ day(h.day) }}</span>
            <span class="tip-value">{{ money(h.revenueCents) }}</span>
            <span class="tip-orders">{{ h.orders }} {{ h.orders === 1 ? 'pedido' : 'pedidos' }}</span>
          </div>
        }
      </div>
      <div class="axis">
        <span>{{ ticks()[0] }}</span><span>{{ ticks()[1] }}</span><span>{{ ticks()[2] }}</span>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 14px; padding: 20px 22px; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); min-width: 0; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h2 { margin: 4px 0 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; }
    .split { display: flex; gap: 14px; font-size: 12px; color: var(--nx-text-mute); }
    .split b { color: var(--nx-text); }
    .plot { position: relative; height: 180px; display: flex; align-items: flex-end; gap: 6px; }
    .col { flex: 1; height: 100%; display: flex; align-items: flex-end; cursor: default; outline: none; }
    .bar { width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; background: rgba(255, 106, 26, 0.28); transition: background 120ms; }
    .col:hover .bar, .col:focus-visible .bar { background: rgba(255, 106, 26, 0.5); }
    .bar.today { background: var(--nx-orange-500); }
    .tip { position: absolute; top: 0; transform: translateX(-50%); display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2); background: var(--nx-surface-1); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); pointer-events: none; white-space: nowrap; }
    .tip-day { font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.12em; color: var(--nx-text-dim); }
    .tip-value { font-family: var(--nx-font-display); font-weight: 800; font-size: 14px; }
    .tip-orders { font-size: 11px; color: var(--nx-text-mute); }
    .axis { display: flex; justify-content: space-between; font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.12em; color: var(--nx-text-dim); }
    .empty { height: 180px; display: grid; place-items: center; font-size: 12.5px; color: var(--nx-text-dim); border: 1px dashed var(--nx-line-strong); border-radius: var(--nx-r-3); }
  `,
})
export class RevenueChartComponent {
  readonly bars = input.required<DayBar[]>();
  readonly kicker = input('');
  readonly today = input.required<string>();
  readonly split = input<{ web: number; app: number } | null>(null);

  protected readonly hover = signal<number | null>(null);
  protected readonly max = computed(() => Math.max(1, ...this.bars().map((b) => b.revenueCents)));
  protected readonly empty = computed(() => this.bars().every((b) => b.revenueCents === 0));
  protected readonly hovered = computed(() => (this.hover() === null ? null : (this.bars()[this.hover()!] ?? null)));
  protected readonly tipLeft = computed(() => {
    const n = this.bars().length;
    const i = this.hover() ?? 0;
    return Math.min(88, Math.max(12, ((i + 0.5) / n) * 100));
  });
  /** Início · meio · fim ("HOJE" quando o período termina hoje). */
  protected readonly ticks = computed(() => {
    const b = this.bars();
    const last = b.at(-1)?.day ?? '';
    return [
      b.length > 1 ? shortDay(b[0]!.day) : '',
      b.length > 2 ? shortDay(b[Math.floor((b.length - 1) / 2)]!.day) : '',
      last === this.today() ? 'HOJE' : shortDay(last),
    ];
  });
  protected readonly summary = computed(() => {
    const total = this.bars().reduce((n, b) => n + b.revenueCents, 0);
    return `Receita por dia, ${this.bars().length} dias, total ${BRL.format(total / 100)}`;
  });

  protected height(b: DayBar): number {
    return (b.revenueCents / this.max()) * 100;
  }
  protected money(c: number): string {
    return BRL.format(c / 100);
  }
  protected day(d: string): string {
    return d === this.today() ? 'HOJE' : shortDay(d);
  }
  protected label(b: DayBar): string {
    return `${shortDay(b.day)}: ${BRL.format(b.revenueCents / 100)}, ${b.orders} pedidos`;
  }
}

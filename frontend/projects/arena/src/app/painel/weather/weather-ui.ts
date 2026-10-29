import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output } from '@angular/core';
import { formatMm, hourOf, isRainyHour, RAIN_PROBABILITY_THRESHOLD, type WeatherHour } from './weather.model';

export type WxIconName = 'rain' | 'credit' | 'swap' | 'refund' | 'bolt' | 'send';

/** Ícones do cancelamento por chuva (átomos `WxIc*` do design). */
@Component({
  selector: 'ar-wx-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: inline-flex; flex: none;' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('rain') {
          <path d="M7 15.5a4.5 4.5 0 1 1 1.1-8.9A5.5 5.5 0 0 1 18.5 8a3.8 3.8 0 0 1-.5 7.5H7z" /><path d="M8 18.5 7 21M12 18.5 11 21M16 18.5 15 21" />
        }
        @case ('credit') {
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /><circle cx="16.5" cy="14.5" r="1.6" />
        }
        @case ('swap') {
          <path d="M4 8h13l-3-3M20 16H7l3 3" />
        }
        @case ('refund') {
          <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" />
          <path d="M12 8v8M9.5 10.2c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7-1.1 1.4-2.5 1.8-2.5.8-2.5 1.8 1.1 1.7 2.5 1.7 2.5-.7 2.5-1.7" />
        }
        @case ('bolt') {
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
        }
        @case ('send') {
          <path d="M21 3 10 14" /><path d="M21 3 14 21l-4-7-7-4 18-7z" />
        }
      }
    </svg>
  `,
})
export class WxIconComponent {
  readonly name = input.required<WxIconName>();
  readonly size = input(18);
  readonly strokeWidth = input(1.8);
}

interface HourBar {
  hour: number;
  time: string;
  probability: number | null;
  mm: string;
  heightPx: number;
  rainy: boolean;
  likely: boolean;
  selected: boolean;
}

const BAR_MAX_PX = 88;

/** Barras de chuva por hora (átomo `WxHourly`): % no topo, barra em mm, hora embaixo. Rola na
 *  horizontal quando não cabe; a faixa selecionada fica azul e entra em vista. Clicar numa hora
 *  emite `hourClick` (a tela decide o que fazer com o período). */
@Component({
  selector: 'ar-wx-hourly',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hourly" role="group" aria-label="Previsão de chuva por hora">
      @for (b of bars(); track b.hour) {
        <button
          type="button"
          class="hour"
          [class.selected]="b.selected"
          [attr.data-hour]="b.hour"
          [attr.aria-pressed]="b.selected"
          [attr.aria-label]="b.time + ': ' + (b.probability ?? '—') + '% de chance, ' + b.mm + ' mm'"
          (click)="hourClick.emit(b.hour)"
        >
          <span class="pct" [class.likely]="b.likely">{{ b.probability == null ? '—' : b.probability + '%' }}</span>
          <span class="bar-area"><span class="bar" [class.rainy]="b.rainy" [style.height.px]="b.heightPx"></span></span>
          <span class="mm">{{ b.mm }} mm</span>
          <span class="time">{{ b.time }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .hourly {
      position: relative;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(54px, 1fr);
      gap: 6px;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scroll-snap-type: x proximity;
      scrollbar-width: thin;
      padding-bottom: 4px;
    }

    .hour {
      scroll-snap-align: start;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      padding: 10px 6px 8px;
      border-radius: 10px;
      background: transparent;
      border: 1px solid transparent;
      cursor: pointer;
      font: inherit;
      color: inherit;
    }

    .hour:hover {
      background: var(--nx-surface-1);
    }

    .hour.selected {
      background: rgba(90, 169, 255, 0.1);
      border-color: rgba(90, 169, 255, 0.3);
    }

    .pct,
    .mm {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      text-align: center;
      white-space: nowrap;
    }

    .pct {
      font-weight: 700;
      color: var(--nx-text-dim);
    }

    .pct.likely {
      color: #5aa9ff;
    }

    .mm {
      color: var(--nx-text-mute);
    }

    .bar-area {
      height: ${BAR_MAX_PX}px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .bar {
      width: 58%;
      border-radius: 4px;
      background: rgba(90, 169, 255, 0.35);
    }

    .bar.rainy {
      background: #5aa9ff;
    }

    .time {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text-mute);
      text-align: center;
    }

    .hour.selected .time {
      color: var(--nx-text);
    }
  `,
})
export class WxHourlyComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly hours = input.required<WeatherHour[]>();
  /** Período selecionado: `[startHour, endHour)`. */
  readonly startHour = input<number | null>(null);
  readonly endHour = input<number | null>(null);
  readonly hourClick = output<number>();

  protected readonly bars = computed<HourBar[]>(() => {
    const hours = this.hours();
    const max = Math.max(1, ...hours.map((h) => h.precipitationMm ?? 0));
    const start = this.startHour();
    const end = this.endHour();
    return hours.map((h) => {
      const hour = hourOf(h.time);
      const mm = h.precipitationMm ?? 0;
      return {
        hour,
        time: h.time.slice(0, 5),
        probability: h.probability,
        mm: formatMm(h.precipitationMm),
        heightPx: Math.max(3, (mm / max) * BAR_MAX_PX),
        rainy: isRainyHour(h),
        likely: (h.probability ?? 0) >= RAIN_PROBABILITY_THRESHOLD,
        selected: start != null && end != null && hour >= start && hour < end,
      };
    });
  });

  constructor() {
    // Traz o período para a vista quando ele muda (06:00 fica à esquerda e a chuva da noite
    // ficaria escondida). Só a faixa rola, a página não se mexe, e sempre parando na borda de
    // uma hora: no fim da faixa, rolar "até o alvo" deixava a hora da esquerda cortada ("2:00").
    effect(() => {
      const start = this.startHour();
      const bars = this.bars();
      if (start == null || bars.length === 0) return;
      setTimeout(() => {
        const root = this.host.nativeElement as HTMLElement;
        const strip = root.querySelector('.hourly') as HTMLElement | null;
        const items = root.querySelectorAll<HTMLElement>('.hour');
        const index = bars.findIndex((b) => b.hour === start);
        if (!strip || items.length < 2 || index < 0) return;
        const step = items[1]!.offsetLeft - items[0]!.offsetLeft;
        const maxScroll = strip.scrollWidth - strip.clientWidth;
        if (step <= 0 || maxScroll <= 0) return;
        const target = items[index]!;
        const inView = target.offsetLeft >= strip.scrollLeft && target.offsetLeft + target.offsetWidth <= strip.scrollLeft + strip.clientWidth;
        if (inView) return; // clique numa hora visível não pode fazer a faixa pular
        // Uma hora de contexto antes do período, sem passar do último encaixe inteiro.
        const first = Math.min(Math.max(0, index - 1), Math.floor(maxScroll / step));
        strip.scrollLeft = first * step;
      });
    });
  }
}

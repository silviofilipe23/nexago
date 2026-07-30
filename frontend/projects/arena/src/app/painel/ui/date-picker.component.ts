import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { IconComponent } from './icon.component';
import { MONTH_LABELS_PT, buildMonthGrid, formatDateKeyPtBr, shiftMonth } from './date-range-picker-math';

function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

/** Calendário de data única (protótipo ArDatePicker) — irmão de DateRangePickerComponent,
 *  reaproveitando a mesma matemática de grid de mês, sem estado de range/"sem término". */
@Component({
  selector: 'ar-date-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <button type="button" class="trigger" (click)="toggle()">
      <ar-icon name="calendar" [size]="14" />
      <span>{{ triggerLabel() }}</span>
    </button>

    @if (open()) {
      <div class="popover" (click)="$event.stopPropagation()">
        <div class="nav">
          <button type="button" class="nav-btn" (click)="changeMonth(-1)" aria-label="Mês anterior">
            <ar-icon name="chevron-left" [size]="16" />
          </button>
          <span class="nav-label">{{ monthLabel() }}</span>
          <button type="button" class="nav-btn" (click)="changeMonth(1)" aria-label="Próximo mês">
            <ar-icon name="chevron-right" [size]="16" />
          </button>
        </div>

        <div class="weekdays">
          <span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span>
        </div>

        <div class="grid">
          @for (d of grid(); track d.dateKey) {
            <button
              type="button"
              class="day"
              [class.out]="!d.inMonth"
              [class.selected]="d.dateKey === selected()"
              [attr.aria-label]="d.dateKey"
              (click)="selectDay(d.dateKey)"
            >
              {{ d.day }}
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }

    .trigger {
      height: 34px;
      padding: 0 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      cursor: pointer;
      white-space: nowrap;
    }

    .trigger:hover {
      border-color: var(--nx-line-strong);
    }

    .popover {
      position: absolute;
      z-index: 40;
      top: calc(100% + 6px);
      left: 0;
      width: 292px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-3);
      padding: 14px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
    }

    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .nav-btn {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: none;
      color: var(--nx-text-mute);
      cursor: pointer;
    }

    .nav-btn:hover {
      background: var(--nx-surface-2);
      color: var(--nx-text);
    }

    .nav-label {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .weekdays,
    .grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
    }

    .weekdays span {
      text-align: center;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      padding-bottom: 6px;
    }

    .day {
      height: 32px;
      border: none;
      background: transparent;
      color: var(--nx-text);
      font-size: 12.5px;
      cursor: pointer;
      border-radius: var(--nx-r-1);
    }

    .day:hover {
      background: var(--nx-surface-2);
    }

    .day.out {
      color: var(--nx-text-dim);
      opacity: 0.5;
    }

    .day.selected {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-weight: 700;
    }
  `,
})
export class DatePickerComponent {
  readonly selected = input.required<string | null>();
  readonly dateChange = output<string>();

  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);
  protected readonly viewYear = signal(new Date().getFullYear());
  protected readonly viewMonth = signal(new Date().getMonth() + 1);

  protected readonly grid = computed(() => buildMonthGrid(this.viewYear(), this.viewMonth()));
  protected readonly monthLabel = computed(() => `${MONTH_LABELS_PT[this.viewMonth() - 1]} ${this.viewYear()}`);
  protected readonly triggerLabel = computed(() => {
    const s = this.selected();
    return s ? formatDateKeyPtBr(s) : 'Selecionar data';
  });

  constructor() {
    effect(() => {
      if (this.open()) return;
      // Sincroniza o mês exibido com o input sempre que o popover está fechado (evita
      // reabrir com um mês desatualizado depois de navegar por outra via, ex.: setas).
      const seed = this.selected() ?? todayDateKey();
      const [y, m] = seed.split('-').map(Number);
      if (y && m) {
        this.viewYear.set(y);
        this.viewMonth.set(m);
      }
    });
  }

  protected toggle(): void {
    this.open.set(!this.open());
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  protected changeMonth(delta: number): void {
    const next = shiftMonth(this.viewYear(), this.viewMonth(), delta);
    this.viewYear.set(next.year);
    this.viewMonth.set(next.month);
  }

  protected selectDay(dateKey: string): void {
    this.dateChange.emit(dateKey);
    this.close();
  }
}

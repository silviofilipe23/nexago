import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { IconComponent } from './icon.component';
import { MONTH_LABELS_PT, buildMonthGrid, formatDateKeyPtBr, shiftMonth } from './date-range-picker-math';

function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

/** Calendário de intervalo de datas (protótipo pra data de início/término de horário
 *  fixo, reutilizável em qualquer outra tela que precise de um range de datas). */
@Component({
  selector: 'ar-date-range-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <button type="button" class="input-box trigger" (click)="toggle()">
      <span>{{ triggerLabel() }}</span>
      <ar-icon name="calendar" [size]="16" />
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
              [class.selected-start]="d.dateKey === draftStart()"
              [class.selected-end]="d.dateKey === draftEnd()"
              [class.in-range]="isInRange(d.dateKey)"
              [attr.aria-label]="d.dateKey"
              (click)="selectDay(d.dateKey)"
            >
              {{ d.day }}
            </button>
          }
        </div>

        @if (allowOpenEnd()) {
          <label class="open-end">
            <input type="checkbox" [checked]="draftOpenEnd()" (change)="toggleOpenEnd($any($event.target).checked)" />
            Sem data de término
          </label>
        }

        <div class="footer">
          <button type="button" class="ar-ghost-btn" (click)="cancel()">Cancelar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!draftStart()" (click)="apply()">Aplicar</button>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      color: var(--nx-text);
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

    .day.in-range {
      background: var(--nx-orange-tint);
    }

    .day.selected-start,
    .day.selected-end {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-weight: 700;
    }

    .open-end {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 0 4px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
      cursor: pointer;
    }

    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 12px;
    }
  `,
})
export class DateRangePickerComponent {
  readonly startDate = input<string | null>(null);
  readonly endDate = input<string | null>(null);
  readonly allowOpenEnd = input(true);
  readonly rangeChange = output<{ startDate: string; endDate: string | null }>();

  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);
  protected readonly viewYear = signal(new Date().getFullYear());
  protected readonly viewMonth = signal(new Date().getMonth() + 1);
  protected readonly draftStart = signal<string | null>(null);
  protected readonly draftEnd = signal<string | null>(null);
  protected readonly draftOpenEnd = signal(true);

  protected readonly grid = computed(() => buildMonthGrid(this.viewYear(), this.viewMonth()));
  protected readonly monthLabel = computed(() => `${MONTH_LABELS_PT[this.viewMonth() - 1]} ${this.viewYear()}`);

  protected readonly triggerLabel = computed(() => {
    const start = this.startDate();
    if (!start) return 'Selecionar datas';
    const end = this.endDate();
    return `${formatDateKeyPtBr(start)} – ${end ? formatDateKeyPtBr(end) : 'sem término'}`;
  });

  constructor() {
    effect(() => {
      if (this.open()) return;
      // Sincroniza o rótulo do gatilho e o mês exibido com os inputs sempre
      // que o popover está fechado (evita reabrir com um mês desatualizado).
      const seed = this.startDate() ?? todayDateKey();
      const [y, m] = seed.split('-').map(Number);
      if (y && m) {
        this.viewYear.set(y);
        this.viewMonth.set(m);
      }
    });
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.draftStart.set(this.startDate());
    this.draftEnd.set(this.endDate());
    this.draftOpenEnd.set(this.endDate() == null);
    this.open.set(true);
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
    const start = this.draftStart();
    const end = this.draftEnd();
    if (!start || (start && end)) {
      this.draftStart.set(dateKey);
      this.draftEnd.set(null);
      return;
    }
    if (dateKey < start) {
      this.draftEnd.set(start);
      this.draftStart.set(dateKey);
      return;
    }
    this.draftEnd.set(dateKey);
  }

  protected isInRange(dateKey: string): boolean {
    const start = this.draftStart();
    const end = this.draftEnd();
    if (!start || !end) return false;
    return dateKey > start && dateKey < end;
  }

  protected toggleOpenEnd(checked: boolean): void {
    this.draftOpenEnd.set(checked);
    if (checked) this.draftEnd.set(null);
  }

  protected apply(): void {
    const start = this.draftStart();
    if (!start) return;
    this.rangeChange.emit({ startDate: start, endDate: this.draftOpenEnd() ? null : this.draftEnd() });
    this.close();
  }

  protected cancel(): void {
    this.close();
  }
}

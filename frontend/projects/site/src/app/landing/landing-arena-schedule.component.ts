import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface TimeSlot {
  time: string;
  available: boolean;
}

interface DaySchedule {
  key: string;
  dayLabel: string;
  date: number;
  slots: TimeSlot[];
}

@Component({
  selector: 'app-landing-arena-schedule',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing-arena-schedule.component.html',
  styleUrls: ['./landing-arena-schedule.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingArenaScheduleComponent {
  readonly days = signal<DaySchedule[]>(this.generateDays(30));

  readonly selectedDay = signal(0);
  readonly selectedTime = signal<string | null>(null);

  readonly activeSlots = computed(() => this.days()[this.selectedDay()]?.slots ?? []);
  readonly canConfirm = computed(() => this.selectedTime() !== null);
  readonly selectedDateIso = computed(() => this.days()[this.selectedDay()]?.key ?? '');
  readonly selectedDateLabel = computed(() => {
    const d = this.days()[this.selectedDay()];
    if (!d) {
      return '';
    }
    return `${d.dayLabel}, ${String(d.date).padStart(2, '0')}`;
  });

  selectDay(index: number): void {
    this.selectedDay.set(index);
    this.selectedTime.set(null);
  }

  selectTime(time: string, available: boolean): void {
    if (!available) {
      return;
    }
    this.selectedTime.set(time);
  }

  onSlotPointerMove(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement | null;
    if (!el || !el.classList.contains('schedule-slot--available')) {
      return;
    }
    const r = el.getBoundingClientRect();
    el.style.setProperty('--slot-glow-x', `${event.clientX - r.left}px`);
    el.style.setProperty('--slot-glow-y', `${event.clientY - r.top}px`);
  }

  onSlotPointerLeave(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement | null;
    if (!el) {
      return;
    }
    el.style.removeProperty('--slot-glow-x');
    el.style.removeProperty('--slot-glow-y');
  }

  private generateDays(total: number): DaySchedule[] {
    const base = new Date();
    const weekdayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

    return Array.from({ length: total }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const raw = weekdayFmt.format(d).replace('.', '').trim();
      const dayLabel = raw.charAt(0).toUpperCase() + raw.slice(1, 3);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        key,
        dayLabel,
        date: d.getDate(),
        slots: this.generateSlots(),
      };
    });
  }

  private generateSlots(): TimeSlot[] {
    const blockedHours = new Set<number>([]);
    const slots: TimeSlot[] = [];
    for (let hour = 6; hour <= 23; hour += 1) {
      const time = `${String(hour).padStart(2, '0')}:00`;
      slots.push({
        time,
        available: !blockedHours.has(hour),
      });
    }
    return slots;
  }
}

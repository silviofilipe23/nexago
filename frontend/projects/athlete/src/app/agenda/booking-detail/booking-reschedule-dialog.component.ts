import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  type OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  COURT_BOOKING_ALLOCATION,
  capacityCandidateCourts,
  capacityPriceFor,
  fetchArenaRangeSlotsMerged,
  fetchCourts,
  slotsQueryDateKey,
  type ArenaCourtDoc,
  type ArenaListItem,
  type ArenaSlot,
} from '@nexago/arena-discovery';
import { environment } from '../../../environments/environment';
import {
  rescheduleMyBooking,
  type ArenaBookingDoc,
  type RescheduleMyBookingResult,
} from '../../data/arena-bookings-repository';
import { athleteFunctions } from '../../data/functions';
import { MAX_HORIZON_DAYS, addDays, dateOnly } from '../../reservar/booking-dates';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import {
  ATHLETE_RESCHEDULE_HOURS_BEFORE,
  bookingDurationMinutes,
  buildRescheduleTimes,
  shortDayLabel,
  type RescheduleTimeOption,
} from './booking-reschedule';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface DayChip {
  key: string;
  date: Date;
  weekday: string;
  dayMonth: string;
  /** Horários que o atleta pode escolher nesse dia (os mais caros ficam de fora). */
  openCount: number;
}

/** "Remarcar reserva" do detalhe: o atleta escolhe outro dia (hoje..+34) e um início livre com a
 *  mesma duração. Quadra fixa: os horários livres dela; reserva sem quadra definida (a arena
 *  define): os horários em que alguma quadra do esporte está livre — o servidor escolhe a quadra.
 *  O valor não muda; horário mais caro aparece, mas não dá para escolher pelo app. */
@Component({
  selector: 'app-booking-reschedule-dialog',
  imports: [NxSpinnerComponent],
  templateUrl: './booking-reschedule-dialog.component.html',
  styleUrl: './booking-reschedule-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'dismiss()',
    '(keydown.tab)': 'onTabKey($event, false)',
    '(keydown.shift.tab)': 'onTabKey($event, true)',
  },
})
export class BookingRescheduleDialogComponent implements OnInit {
  private readonly firestore = createFirestore();
  private readonly hostElement: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly triggerElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  readonly booking = input.required<ArenaBookingDoc>();
  /** Arena já carregada pelo detalhe (modo de alocação e preço do horário por esporte). */
  readonly arena = input<ArenaListItem | null>(null);
  readonly rescheduled = output<RescheduleMyBookingResult>();
  readonly dismissed = output<void>();

  private readonly today = dateOnly(new Date());
  private readonly courts = signal<ArenaCourtDoc[]>([]);
  private readonly slotsByDateKey = signal<Record<string, ArenaSlot[]>>({});

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly selectedKey = signal<string>('');
  protected readonly pickedStart = signal<string | null>(null);

  protected readonly noteText =
    `O valor da reserva não muda. Você pode remarcar uma vez, até ${ATHLETE_RESCHEDULE_HOURS_BEFORE}h antes do horário.`;

  protected readonly currentLabel = computed(() => {
    const b = this.booking();
    return `${shortDayLabel(b.dateKey)} · ${b.startTime}–${b.endTime}`;
  });

  private readonly durationMinutes = computed(() => {
    const b = this.booking();
    return bookingDurationMinutes(b.startTime, b.endTime) ?? 0;
  });

  /** Reserva sem quadra definida: o servidor escolhe a quadra no horário novo. */
  private readonly floating = computed(() => this.booking().allocationStatus === 'unassigned');

  private readonly courtIds = computed(() => {
    const b = this.booking();
    if (!this.floating()) return b.courtId ? [b.courtId] : [];
    const allocation = this.arena()?.bookingAllocation ?? COURT_BOOKING_ALLOCATION;
    const ids = capacityCandidateCourts(allocation, this.courts(), b.sport).map((c) => c.id);
    // A provisória atual também serve (o servidor a inclui por último).
    if (b.courtId && !ids.includes(b.courtId)) ids.push(b.courtId);
    return ids;
  });

  /** Preço do horário por esporte (arena que define a quadra); fora disso, o dos slots. */
  private readonly fixedPrice = computed(() => {
    const allocation = this.arena()?.bookingAllocation;
    const sport = this.booking().sport;
    if (!this.floating() || !allocation?.isCapacity || !sport) return null;
    return capacityPriceFor(allocation, sport, this.durationMinutes());
  });

  private timesFor(date: Date): RescheduleTimeOption[] {
    const b = this.booking();
    return buildRescheduleTimes({
      daySlots: this.slotsByDateKey()[slotsQueryDateKey(date)] ?? [],
      day: date,
      courtIds: this.courtIds(),
      durationMinutes: this.durationMinutes(),
      now: new Date(),
      current: { dateKey: b.dateKey, courtId: b.courtId, startTime: b.startTime, endTime: b.endTime },
      tablePriceReais: b.tablePriceReais ?? 0,
      fixedPriceReais: this.fixedPrice(),
    });
  }

  protected readonly days = computed<DayChip[]>(() => {
    const out: DayChip[] = [];
    for (let i = 0; i <= MAX_HORIZON_DAYS; i++) {
      const date = addDays(this.today, i);
      const key = slotsQueryDateKey(date);
      const [weekday, dayMonth] = shortDayLabel(key).split(', ');
      const openCount = this.loading() ? 0 : this.timesFor(date).filter((t) => !t.pricier).length;
      out.push({ key, date, weekday: weekday ?? '', dayMonth: dayMonth ?? '', openCount });
    }
    return out;
  });

  protected readonly times = computed(() => {
    const day = this.days().find((d) => d.key === this.selectedKey());
    return day && !this.loading() ? this.timesFor(day.date) : [];
  });

  protected readonly picked = computed(
    () => this.times().find((t) => t.startTime === this.pickedStart() && !t.pricier) ?? null,
  );

  protected readonly confirmLabel = computed(() => {
    if (this.submitting()) return 'Remarcando…';
    const t = this.picked();
    return t ? `Remarcar para ${shortDayLabel(this.selectedKey())} às ${t.startTime}` : 'Escolha um horário';
  });

  constructor() {
    this.selectedKey.set(slotsQueryDateKey(this.today));
    inject(DestroyRef).onDestroy(() => this.triggerElement?.focus());
  }

  ngOnInit(): void {
    // Abre no dia atual da reserva, se ele está na janela.
    const current = this.booking().dateKey;
    if (this.days().some((d) => d.key === current)) this.selectedKey.set(current);
    void this.load();
  }

  private async load(): Promise<void> {
    const db = this.firestore;
    const b = this.booking();
    if (!db || !b.arenaId) {
      this.loadError.set('Não foi possível carregar os horários agora.');
      this.loading.set(false);
      return;
    }
    try {
      const [courts, slots] = await Promise.all([
        fetchCourts(db, b.arenaId),
        fetchArenaRangeSlotsMerged(db, b.arenaId, this.today, MAX_HORIZON_DAYS + 1),
      ]);
      this.courts.set(courts);
      this.slotsByDateKey.set(slots);
    } catch (err) {
      if (!environment.production) console.error('[booking-reschedule] load error', err);
      this.loadError.set('Não foi possível carregar os horários agora.');
    } finally {
      this.loading.set(false);
    }
  }

  protected selectDay(key: string): void {
    if (this.submitting() || key === this.selectedKey()) return;
    this.selectedKey.set(key);
    this.pickedStart.set(null);
    this.error.set(null);
  }

  protected selectTime(t: RescheduleTimeOption): void {
    if (this.submitting() || t.pricier) return;
    this.pickedStart.set(t.startTime);
    this.error.set(null);
  }

  protected timePriceLabel(t: RescheduleTimeOption): string | null {
    if (t.pricier) return 'Mais caro · fale com a arena';
    return t.priceReais != null ? formatBRL(t.priceReais) : null;
  }

  protected async confirm(): Promise<void> {
    const t = this.picked();
    if (!t || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const result = await rescheduleMyBooking(athleteFunctions(), {
        bookingId: this.booking().id,
        date: this.selectedKey(),
        startTime: t.startTime,
      });
      this.rescheduled.emit(result);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível remarcar a reserva.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected dismiss(): void {
    if (!this.submitting()) this.dismissed.emit();
  }

  /** Tab preso no diálogo — mesmo padrão do `BookingInviteDialogComponent`. */
  protected onTabKey(event: Event, backward: boolean): void {
    const root = this.hostElement.nativeElement;
    const focusable = Array.from(root.querySelectorAll<HTMLElement>('button, input, a[href]')).filter(
      (el) => !el.hasAttribute('disabled'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (backward && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!backward && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

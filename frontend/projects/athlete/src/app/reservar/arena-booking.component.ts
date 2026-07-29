import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  arenaSlotIsAvailable,
  arenaSlotIsBlocked,
  arenaSlotIsBooked,
  fetchArenaById,
  fetchArenaRangeSlotsMerged,
  fetchCourts,
  isPastSlot,
  slotsQueryDateKey,
  type ArenaCourtDoc,
  type ArenaListItem,
  type ArenaSlot,
} from '@nexago/arena-discovery';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import {
  MAX_HORIZON_DAYS,
  addDays,
  buildDateStrip,
  clampPickedDate,
  dateOnly,
  shouldShowMonth,
} from './booking-dates';

const WEEKDAY_ABBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const;
const MONTH_ABBR = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const;
const DURATION_MULTIPLIERS = [1, 2, 3] as const;

export interface CourtOptionView {
  id: string;
  name: string;
  sportLabel: string;
  availableCount: number;
  isFull: boolean;
}

export interface SlotView {
  slot: ArenaSlot;
  isAvailable: boolean;
  isPast: boolean;
  isBooked: boolean;
  isBlocked: boolean;
  isLast: boolean;
  isSelectedStart: boolean;
  isInChain: boolean;
  priceReais: number | null;
}

export interface DurationOption {
  slots: number;
  minutes: number;
  label: string;
  enabled: boolean;
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  return local ? titleCase(local) : 'Atleta';
}

/** Lê o esporte de um doc de quadra (`sport` ou `courtType`, mesmo schema usado pelo site público). */
function courtSportLabel(data: Record<string, unknown>): string {
  const raw = data['sport'] ?? data['courtType'];
  return typeof raw === 'string' && raw.trim().length > 0 ? titleCase(raw.trim()) : 'Esporte não informado';
}

/** Duração-base do slot da quadra (minutos), mesma regra do gerador de slots virtuais. */
function slotDurationMinutesOf(data: Record<string, unknown> | null | undefined): number {
  const v = data?.['slotDurationMinutes'];
  const n = typeof v === 'number' ? v : 60;
  return n < 15 || n > 240 ? 60 : n;
}

function formatDurationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

@Component({
  selector: 'app-arena-booking',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './arena-booking.component.html',
  styleUrl: './arena-booking.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArenaBookingComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly arenaId = computed(() => this.route.snapshot.paramMap.get('arenaId') ?? '');

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly arena = signal<ArenaListItem | null>(null);
  protected readonly courts = signal<ArenaCourtDoc[]>([]);
  protected readonly slotsByDateKey = signal<Record<string, ArenaSlot[]>>({});

  private readonly today = dateOnly(new Date());

  /** Última data selecionável, no formato do `<input type="date">`. */
  protected readonly minDateKey = slotsQueryDateKey(this.today);
  protected readonly maxDateKey = slotsQueryDateKey(addDays(this.today, MAX_HORIZON_DAYS));

  protected readonly selectedDate = signal<Date>(
    clampPickedDate(this.route.snapshot.queryParamMap.get('date') ?? '', this.today) ?? this.today,
  );

  /** 30 chips a partir de hoje, estendendo até a data selecionada quando ela cai além
   *  do strip padrão (limite de MAX_HORIZON_DAYS). */
  protected readonly stripDates = computed<Date[]>(() =>
    buildDateStrip(this.today, this.selectedDate()),
  );
  protected readonly selectedCourtId = signal<string | null>(null);
  protected readonly selectedStartSlot = signal<ArenaSlot | null>(null);
  protected readonly durationSlots = signal(1);

  protected readonly selectedDateKey = computed(() => slotsQueryDateKey(this.selectedDate()));
  protected readonly selectedDateSlots = computed(
    () => this.slotsByDateKey()[this.selectedDateKey()] ?? [],
  );

  protected readonly courtViews = computed<CourtOptionView[]>(() => {
    const slots = this.selectedDateSlots();
    const date = this.selectedDate();
    return this.courts().map((c) => {
      const availableCount = slots.filter(
        (s) => s.courtId === c.id && arenaSlotIsAvailable(s) && !isPastSlot(date, s.startTime),
      ).length;
      return {
        id: c.id,
        name: c.name,
        sportLabel: courtSportLabel(c.data),
        availableCount,
        isFull: availableCount === 0,
      };
    });
  });

  protected readonly selectedCourt = computed(
    () => this.courts().find((c) => c.id === this.selectedCourtId()) ?? null,
  );

  protected readonly selectedCourtSlots = computed<ArenaSlot[]>(() => {
    const courtId = this.selectedCourtId();
    if (!courtId) return [];
    return this.selectedDateSlots()
      .filter((s) => s.courtId === courtId)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  protected readonly lastAvailableSlotId = computed(() => {
    const date = this.selectedDate();
    const available = this.selectedCourtSlots().filter(
      (s) => arenaSlotIsAvailable(s) && !isPastSlot(date, s.startTime),
    );
    return available.length > 0 ? available[available.length - 1]!.id : null;
  });

  protected readonly baseSlotMinutes = computed(() => slotDurationMinutesOf(this.selectedCourt()?.data));

  protected readonly durationOptions = computed<DurationOption[]>(() => {
    const base = this.baseSlotMinutes();
    return DURATION_MULTIPLIERS.map((n) => ({
      slots: n,
      minutes: base * n,
      label: formatDurationLabel(base * n),
      enabled: this.chainForDuration(n) != null,
    }));
  });

  protected readonly selectedChain = computed<ArenaSlot[] | null>(() =>
    this.chainForDuration(this.durationSlots()),
  );

  protected readonly canContinue = computed(() => this.selectedChain() != null);

  protected readonly totalPrice = computed(() => {
    const chain = this.selectedChain();
    if (!chain || chain.length === 0) return 0;
    const arenaFallback = this.arena()?.pricePerHourReais ?? 0;
    return chain.reduce((sum, s) => sum + (s.priceReais ?? arenaFallback), 0);
  });

  protected readonly durationLabel = computed(() =>
    formatDurationLabel(this.baseSlotMinutes() * this.durationSlots()),
  );

  protected readonly slotGroups = computed(() => {
    const slots = this.selectedCourtSlots();
    const date = this.selectedDate();
    const lastId = this.lastAvailableSlotId();
    const startId = this.selectedStartSlot()?.id ?? null;
    const chainIds = new Set((this.selectedChain() ?? []).map((s) => s.id));

    const buckets: { manha: SlotView[]; tarde: SlotView[]; noite: SlotView[] } = {
      manha: [],
      tarde: [],
      noite: [],
    };
    for (const s of slots) {
      const view: SlotView = {
        slot: s,
        isAvailable: arenaSlotIsAvailable(s),
        isPast: isPastSlot(date, s.startTime),
        isBooked: arenaSlotIsBooked(s),
        isBlocked: arenaSlotIsBlocked(s),
        isLast: s.id === lastId,
        isSelectedStart: s.id === startId,
        isInChain: chainIds.has(s.id),
        priceReais: s.priceReais,
      };
      const hour = Number.parseInt(s.startTime.split(':')[0] ?? '0', 10);
      if (hour < 12) buckets.manha.push(view);
      else if (hour < 18) buckets.tarde.push(view);
      else buckets.noite.push(view);
    }

    const groups: { label: string; slots: SlotView[] }[] = [];
    if (buckets.manha.length > 0) groups.push({ label: 'MANHÃ', slots: buckets.manha });
    if (buckets.tarde.length > 0) groups.push({ label: 'TARDE', slots: buckets.tarde });
    if (buckets.noite.length > 0) groups.push({ label: 'NOITE', slots: buckets.noite });
    return groups;
  });

  protected readonly dateAvailability = computed<Record<string, 'high' | 'low' | 'none'>>(() => {
    const map = this.slotsByDateKey();
    const result: Record<string, 'high' | 'low' | 'none'> = {};
    for (const d of this.stripDates()) {
      const key = slotsQueryDateKey(d);
      const slots = map[key] ?? [];
      const availableCount = slots.filter(
        (s) => arenaSlotIsAvailable(s) && !isPastSlot(d, s.startTime),
      ).length;
      result[key] = availableCount === 0 ? 'none' : availableCount <= 4 ? 'low' : 'high';
    }
    return result;
  });

  protected readonly backLabel = computed(() => `Voltar à ${this.arena()?.name ?? 'arena'}`);
  protected readonly weekdayAbbr = WEEKDAY_ABBR;
  protected readonly monthAbbr = MONTH_ABBR;

  constructor() {
    void this.load();
  }

  private chainForDuration(n: number): ArenaSlot[] | null {
    const start = this.selectedStartSlot();
    if (!start) return null;
    const courtSlots = this.selectedCourtSlots();
    const startIdx = courtSlots.findIndex((s) => s.id === start.id);
    if (startIdx === -1) return null;
    const chain: ArenaSlot[] = [courtSlots[startIdx]!];
    let cursor = chain[0]!;
    for (let i = 1; i < n; i++) {
      const next = courtSlots[startIdx + i];
      if (!next || next.startTime !== cursor.endTime || !arenaSlotIsAvailable(next)) {
        return null;
      }
      chain.push(next);
      cursor = next;
    }
    return chain;
  }

  private async load(): Promise<void> {
    const id = this.arenaId();
    if (!id || !this.firestore) {
      this.error.set('Arena não disponível no momento.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const arena = await fetchArenaById(this.firestore, id);
      if (!arena) {
        this.error.set('Arena não encontrada.');
        this.loading.set(false);
        return;
      }
      this.arena.set(arena);

      const courts = await fetchCourts(this.firestore, id);
      this.courts.set(courts);

      const requestedCourtId = this.route.snapshot.queryParamMap.get('courtId');
      const initialCourtId =
        requestedCourtId && courts.some((c) => c.id === requestedCourtId)
          ? requestedCourtId
          : (courts[0]?.id ?? null);
      this.selectedCourtId.set(initialCourtId);

      // Uma leitura só cobre todo o horizonte: qualquer data selecionável já chega com
      // slots e bolinha de disponibilidade em memória, sem carga sob demanda.
      const slotsMap = await fetchArenaRangeSlotsMerged(
        this.firestore!,
        id,
        this.today,
        MAX_HORIZON_DAYS + 1,
      );
      this.slotsByDateKey.set(slotsMap);
    } catch (err) {
      if (!environment.production) {
        console.error('[arena-booking] load error', err);
      }
      this.error.set('Não foi possível carregar os horários agora.');
    } finally {
      this.loading.set(false);
    }
  }

  protected selectDate(date: Date): void {
    if (slotsQueryDateKey(date) === this.selectedDateKey()) return;
    this.selectedDate.set(date);
    this.selectedStartSlot.set(null);
    this.durationSlots.set(1);
  }

  protected selectCourt(courtId: string): void {
    if (this.selectedCourtId() === courtId) return;
    this.selectedCourtId.set(courtId);
    this.selectedStartSlot.set(null);
    this.durationSlots.set(1);
  }

  protected selectStartSlot(view: SlotView): void {
    if (!view.isAvailable || view.isPast) return;
    this.selectedStartSlot.set(view.slot);
  }

  protected selectDuration(n: number): void {
    if (!this.chainForDuration(n)) return;
    this.durationSlots.set(n);
  }

  protected continueBooking(): void {
    const chain = this.selectedChain();
    const courtId = this.selectedCourtId();
    if (!chain || chain.length === 0 || !courtId) return;
    void this.router.navigate(['/reservar', this.arenaId(), 'agendar', 'pagamento'], {
      queryParams: {
        courtId,
        date: this.selectedDateKey(),
        time: chain[0]!.startTime,
        duration: this.durationSlots(),
      },
    });
  }

  protected courtSportOf(court: ArenaCourtDoc): string {
    return courtSportLabel(court.data);
  }

  protected slotPrice(view: SlotView): number {
    return view.priceReais ?? this.arena()?.pricePerHourReais ?? 0;
  }

  protected dateKeyOf(date: Date): string {
    return slotsQueryDateKey(date);
  }

  protected isSelectedDate(date: Date): boolean {
    return slotsQueryDateKey(date) === this.selectedDateKey();
  }

  /** Abreviação do mês para o chip, só no início do strip e em toda virada de mês. */
  protected monthLabelFor(date: Date, index: number): string | null {
    return shouldShowMonth(date, index) ? MONTH_ABBR[date.getMonth()]!.toUpperCase() : null;
  }
}

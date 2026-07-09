import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  arenaSlotIsAvailable,
  fetchArenaById,
  fetchArenaDaySlotsMerged,
  fetchCourts,
  type ArenaCourtDoc,
  type ArenaListItem,
  type ArenaSlot,
} from '@nexago/arena-discovery';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';

export type PaymentMethod = 'pix' | 'card' | 'split';

const WEEKDAY_ABBR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const MONTH_ABBR = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const;

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

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function reconstructChain(slots: ArenaSlot[], startTime: string, count: number): ArenaSlot[] | null {
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const startIdx = sorted.findIndex((s) => s.startTime === startTime);
  if (startIdx === -1) return null;
  const chain: ArenaSlot[] = [sorted[startIdx]!];
  let cursor = chain[0]!;
  for (let i = 1; i < count; i++) {
    const next = sorted[startIdx + i];
    if (!next || next.startTime !== cursor.endTime || !arenaSlotIsAvailable(next)) {
      return null;
    }
    chain.push(next);
    cursor = next;
  }
  return chain;
}

@Component({
  selector: 'app-arena-payment',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './arena-payment.component.html',
  styleUrl: './arena-payment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArenaPaymentComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly arenaId = computed(() => this.route.snapshot.paramMap.get('arenaId') ?? '');
  protected readonly bookingQueryParams = computed(() => {
    const qp = this.route.snapshot.queryParamMap;
    return {
      courtId: qp.get('courtId'),
      date: qp.get('date'),
      time: qp.get('time'),
      duration: Number.parseInt(qp.get('duration') ?? '1', 10) || 1,
    };
  });

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly arena = signal<ArenaListItem | null>(null);
  protected readonly court = signal<ArenaCourtDoc | null>(null);
  protected readonly chain = signal<ArenaSlot[]>([]);
  protected readonly selectedDate = signal<Date>(new Date());

  protected readonly selectedMethod = signal<PaymentMethod>('pix');
  protected readonly notice = signal<string | null>(null);

  protected readonly courtSportLabel = computed(() => {
    const c = this.court();
    return c ? courtSportLabel(c.data) : '';
  });

  protected readonly timeRangeLabel = computed(() => {
    const chain = this.chain();
    if (chain.length === 0) return '—';
    return `${chain[0]!.startTime} - ${chain[chain.length - 1]!.endTime}`;
  });

  protected readonly dateLabel = computed(() => {
    const d = this.selectedDate();
    return `${WEEKDAY_ABBR[d.getDay()]}, ${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
  });

  protected readonly totalPrice = computed(() => {
    const chain = this.chain();
    const arenaFallback = this.arena()?.pricePerHourReais ?? 0;
    return chain.reduce((sum, s) => sum + (s.priceReais ?? arenaFallback), 0);
  });

  protected readonly backQueryParams = computed(() => {
    const p = this.bookingQueryParams();
    return { courtId: p.courtId, date: p.date };
  });

  constructor() {
    void this.load();
    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimeout));
  }

  private async load(): Promise<void> {
    const id = this.arenaId();
    const params = this.bookingQueryParams();
    const date = parseDateParam(params.date);

    if (!id || !this.firestore || !params.courtId || !date || !params.time) {
      this.error.set('Dados da reserva incompletos. Volte e selecione o horário novamente.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.selectedDate.set(date);

    try {
      const arena = await fetchArenaById(this.firestore, id);
      if (!arena) {
        this.error.set('Arena não encontrada.');
        this.loading.set(false);
        return;
      }
      this.arena.set(arena);

      const courts = await fetchCourts(this.firestore, id);
      const court = courts.find((c) => c.id === params.courtId) ?? null;
      if (!court) {
        this.error.set('Quadra não encontrada.');
        this.loading.set(false);
        return;
      }
      this.court.set(court);

      const daySlots = await fetchArenaDaySlotsMerged(this.firestore, id, date);
      const courtSlots = daySlots.filter((s) => s.courtId === court.id);
      const chain = reconstructChain(courtSlots, params.time, params.duration);
      if (!chain) {
        this.error.set('Este horário não está mais disponível. Volte e escolha outro.');
        this.loading.set(false);
        return;
      }
      this.chain.set(chain);
    } catch (err) {
      if (!environment.production) {
        console.error('[arena-payment] load error', err);
      }
      this.error.set('Não foi possível carregar os dados da reserva agora.');
    } finally {
      this.loading.set(false);
    }
  }

  protected selectMethod(method: PaymentMethod): void {
    this.selectedMethod.set(method);
  }

  protected confirmPayment(): void {
    const p = this.bookingQueryParams();
    void this.router.navigate(['/reservar', this.arenaId(), 'agendar', 'pagamento', 'confirmada'], {
      queryParams: { courtId: p.courtId, date: p.date, time: p.time, duration: p.duration },
    });
  }

  protected copyPixCode(): void {
    this.showNotice('O código Pix ainda não está disponível — em breve por aqui.');
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}

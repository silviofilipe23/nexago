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
import { athleteFunctions } from '../data/functions';
import {
  ArenaBookingError,
  cancelPendingBookingPayment,
  createArenaBooking,
  createBookingPixPayment,
  findResumablePixBooking,
  quoteArenaBooking,
  watchArenaBooking,
  type ArenaBookingArgs,
  type ArenaBookingPixPayment,
} from '../data/arena-bookings-repository';

/** Métodos reais do backend: PIX (Asaas, 100% ou 50% agora) e pagamento no local.
 *  **Não existe pagamento por cartão em lugar nenhum do fluxo real** — a aba "cartão"
 *  e o "dividir com amigos" do mock foram removidos, igual à decisão já tomada no
 *  pagamento de inscrição de torneio. */
export type PaymentMethod = 'pix' | 'onsite';

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

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
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
  private countdownInterval: ReturnType<typeof setInterval> | undefined;
  private unwatchBooking: (() => void) | undefined;

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
  protected readonly pixFraction = signal<1 | 0.5>(1);
  protected readonly cpf = signal('');
  protected readonly processing = signal(false);
  protected readonly notice = signal<string | null>(null);

  /** Preço autoritativo do servidor (mesma cota do app Flutter); enquanto não chega,
   *  a soma dos slots serve de estimativa — o servidor recalcula ao criar de qualquer forma. */
  protected readonly quotedTotal = signal<number | null>(null);

  protected readonly pixPayment = signal<ArenaBookingPixPayment | null>(null);
  protected readonly pixBookingId = signal<string | null>(null);
  protected readonly pixCountdown = signal<string>('');
  protected readonly pixExpired = signal(false);

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
    const quoted = this.quotedTotal();
    if (quoted != null) return quoted;
    const chain = this.chain();
    const arenaFallback = this.arena()?.pricePerHourReais ?? 0;
    return chain.reduce((sum, s) => sum + (s.priceReais ?? arenaFallback), 0);
  });

  protected readonly pixAmountNow = computed(() => {
    const generated = this.pixPayment();
    if (generated) return generated.amountToPayNowReais;
    return Math.round(this.totalPrice() * this.pixFraction() * 100) / 100;
  });

  protected readonly pixAmountOnsite = computed(() =>
    Math.max(0, Math.round((this.totalPrice() - this.pixAmountNow()) * 100) / 100),
  );

  protected readonly pixAvailable = computed(() => this.arena()?.onlinePaymentEnabled ?? true);
  protected readonly onsiteAvailable = computed(() => this.arena()?.onsitePaymentEnabled ?? true);

  protected readonly backQueryParams = computed(() => {
    const p = this.bookingQueryParams();
    return { courtId: p.courtId, date: p.date };
  });

  protected readonly formatBRL = formatBRL;

  constructor() {
    void this.load();
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.noticeTimeout);
      this.stopPixWatchers();
      // Reserva PIX pendente fica no ar de propósito: ao voltar pra esta tela o
      // mesmo horário é retomado (findResumablePixBooking), igual ao app.
    });
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
      if (!arena.onlinePaymentEnabled && arena.onsitePaymentEnabled) {
        this.selectedMethod.set('onsite');
      }

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
      void this.loadQuote();
    } catch (err) {
      if (!environment.production) {
        console.error('[arena-payment] load error', err);
      }
      this.error.set('Não foi possível carregar os dados da reserva agora.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadQuote(): Promise<void> {
    try {
      const quote = await quoteArenaBooking(athleteFunctions(), this.bookingArgs());
      this.quotedTotal.set(quote.amountReais);
    } catch (err) {
      if (!environment.production) {
        console.error('[arena-payment] quote error', err);
      }
      // Sem cota, a soma dos slots segue como estimativa; createArenaBooking recalcula.
    }
  }

  private bookingArgs(): ArenaBookingArgs {
    const chain = this.chain();
    return {
      arenaId: this.arenaId(),
      arenaName: this.arena()?.name ?? 'Arena',
      courtId: this.court()?.id ?? '',
      courtName: this.court()?.name ?? 'Quadra',
      dateKey: this.bookingQueryParams().date ?? '',
      startTime: chain[0]?.startTime ?? '',
      endTime: chain[chain.length - 1]?.endTime ?? '',
      selectedSlotStartTimes: chain.map((s) => s.startTime),
    };
  }

  protected selectMethod(method: PaymentMethod): void {
    if (method === 'pix' && !this.pixAvailable()) return;
    if (method === 'onsite' && !this.onsiteAvailable()) return;
    this.selectedMethod.set(method);
  }

  protected selectFraction(fraction: number): void {
    if (this.pixPayment() || (fraction !== 1 && fraction !== 0.5)) return;
    this.pixFraction.set(fraction as 1 | 0.5);
  }

  protected onCpfInput(value: string): void {
    this.cpf.set(onlyDigits(value).slice(0, 11));
  }

  /** Cria (ou retoma) a reserva `pending_payment` e gera o QR PIX. */
  protected async generatePix(): Promise<void> {
    if (this.processing() || this.pixPayment()) return;
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.showNotice('Faça login para confirmar a reserva.');
      return;
    }
    const cpf = this.cpf();
    if (cpf.length > 0 && cpf.length !== 11) {
      this.showNotice('CPF incompleto — preencha os 11 dígitos ou deixe em branco.');
      return;
    }
    if (!this.firestore) return;

    this.processing.set(true);
    try {
      const args = this.bookingArgs();
      const resumable = await findResumablePixBooking(this.firestore, uid, args);
      const bookingId =
        resumable?.id ??
        (
          await createArenaBooking(athleteFunctions(), args, {
            clientAmountReais: this.totalPrice(),
            paymentMode: 'pix',
            paymentFraction: this.pixFraction(),
          })
        ).bookingId;

      const pix = await createBookingPixPayment(athleteFunctions(), {
        bookingId,
        cpfCnpj: cpf,
        paymentFraction: this.pixFraction(),
      });

      this.pixBookingId.set(bookingId);
      this.pixPayment.set(pix);
      this.pixExpired.set(false);
      this.startCountdown(pix.expiresAt);
      this.startBookingWatch(bookingId);
    } catch (err) {
      this.showNotice(err instanceof ArenaBookingError ? err.message : 'Não foi possível gerar o Pix agora.');
    } finally {
      this.processing.set(false);
    }
  }

  protected async confirmOnsite(): Promise<void> {
    if (this.processing()) return;
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.showNotice('Faça login para confirmar a reserva.');
      return;
    }

    this.processing.set(true);
    try {
      const result = await createArenaBooking(athleteFunctions(), this.bookingArgs(), {
        clientAmountReais: this.totalPrice(),
        paymentMode: 'onsite',
      });
      void this.router.navigate(['/reservar', this.arenaId(), 'agendar', 'pagamento', 'confirmada'], {
        queryParams: { bookingId: result.bookingId },
      });
    } catch (err) {
      this.showNotice(err instanceof ArenaBookingError ? err.message : 'Não foi possível concluir a reserva.');
      this.processing.set(false);
    }
  }

  protected async cancelPix(): Promise<void> {
    const bookingId = this.pixBookingId();
    if (!bookingId) return;
    try {
      await cancelPendingBookingPayment(athleteFunctions(), bookingId);
      this.resetPixState();
      this.showNotice('Pix cancelado — o horário foi liberado.');
    } catch (err) {
      this.showNotice(err instanceof ArenaBookingError ? err.message : 'Não foi possível cancelar.');
    }
  }

  /** Pix expirado: solta a reserva antiga (se ainda existir) e recomeça do zero. */
  protected async regeneratePix(): Promise<void> {
    const bookingId = this.pixBookingId();
    this.resetPixState();
    if (bookingId) {
      try {
        await cancelPendingBookingPayment(athleteFunctions(), bookingId);
      } catch {
        // expirou/cancelou sozinha — seguir para gerar outra
      }
    }
    await this.generatePix();
  }

  protected async copyPixCode(): Promise<void> {
    const code = this.pixPayment()?.qrCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.showNotice('Código Pix copiado.');
    } catch {
      this.showNotice('Não foi possível copiar — selecione o código manualmente.');
    }
  }

  private startBookingWatch(bookingId: string): void {
    this.unwatchBooking?.();
    if (!this.firestore) return;
    this.unwatchBooking = watchArenaBooking(this.firestore, bookingId, (booking) => {
      if (!booking) return;
      if (booking.status === 'confirmed' || booking.paymentStatus === 'paid' || booking.paymentStatus === 'partial') {
        this.stopPixWatchers();
        void this.router.navigate(['/reservar', this.arenaId(), 'agendar', 'pagamento', 'confirmada'], {
          queryParams: { bookingId },
        });
        return;
      }
      if (booking.status === 'canceled' || booking.status === 'cancelled') {
        this.resetPixState();
        this.showNotice('O Pix não foi pago a tempo e a reserva expirou. Gere um novo código.');
      }
    });
  }

  private startCountdown(expiresAtIso: string): void {
    clearInterval(this.countdownInterval);
    const expiresAt = new Date(expiresAtIso).getTime();
    const tick = () => {
      const remaining = Math.floor((expiresAt - Date.now()) / 1000);
      if (remaining <= 0) {
        this.pixCountdown.set('00:00');
        this.pixExpired.set(true);
        clearInterval(this.countdownInterval);
        return;
      }
      const mm = `${Math.floor(remaining / 60)}`.padStart(2, '0');
      const ss = `${remaining % 60}`.padStart(2, '0');
      this.pixCountdown.set(`${mm}:${ss}`);
    };
    tick();
    this.countdownInterval = setInterval(tick, 1000);
  }

  private stopPixWatchers(): void {
    clearInterval(this.countdownInterval);
    this.unwatchBooking?.();
    this.unwatchBooking = undefined;
  }

  private resetPixState(): void {
    this.stopPixWatchers();
    this.pixPayment.set(null);
    this.pixBookingId.set(null);
    this.pixCountdown.set('');
    this.pixExpired.set(false);
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}

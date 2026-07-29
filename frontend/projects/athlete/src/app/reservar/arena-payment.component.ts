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
import { resolvePixQrSrc } from '../data/pix-qr';
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
import {
  ArenaBookingSplitError,
  SPLIT_MAX_SHARES,
  splitArenaBookingPayment,
  splitEvenlyReais,
  splitSharesSumMatches,
  watchArenaBookingPaymentShares,
  type ArenaBookingPaymentShare,
  type ArenaBookingPaymentShareStatus,
  type SplitShareInput,
} from '../data/arena-booking-split-repository';
import { searchAthleteDirectory, type AthletePublicProfile } from '../data/public-profiles-repository';
import { clampPickedDate, dateOnly } from './booking-dates';

/** Métodos reais do backend: PIX (Asaas, 100% ou 50% agora) e pagamento no local.
 *  **Não existe pagamento por cartão em lugar nenhum do fluxo real** — a aba "cartão"
 *  do mock foi removida, igual à decisão já tomada no pagamento de inscrição de torneio.
 *  "Dividir com amigos" (split de PIX) é real, ver `arena-booking-split-repository.ts`. */
export type PaymentMethod = 'pix' | 'onsite';

/** Participante da divisão de pagamento — sempre inclui "Você" por padrão (removível). */
interface SplitParticipantVM {
  athleteId: string;
  name: string;
  avatarUrl: string | null;
  isSelf: boolean;
  amountReais: number;
}

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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AT';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
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
  private readonly today = dateOnly(new Date());
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

  /** Cupom de desconto (código digitado) — opcional, não acumula com promoção automática
   *  (vale o maior desconto). Erro de cupom nunca trava a reserva: o atleta corrige o
   *  código ou segue sem cupom. */
  protected readonly couponCodeInput = signal('');
  protected readonly couponApplying = signal(false);
  protected readonly couponError = signal<string | null>(null);
  protected readonly appliedCouponCode = signal<string | null>(null);
  protected readonly couponDiscountReais = signal(0);

  protected readonly pixPayment = signal<ArenaBookingPixPayment | null>(null);
  protected readonly pixBookingId = signal<string | null>(null);
  protected readonly pixCountdown = signal<string>('');
  protected readonly pixExpired = signal(false);
  /** QR vetorial do Pix — ver `data/pix-qr.ts` (raster redimensionado sai ilegível). */
  protected readonly pixQrSrc = signal<string | null>(null);

  // ── Dividir com amigos (split de PIX) ─────────────────────────
  protected readonly splitMode = signal(false);
  protected readonly splitParticipants = signal<SplitParticipantVM[]>([]);
  protected readonly splitFriendQuery = signal('');
  protected readonly splitFriendResults = signal<AthletePublicProfile[]>([]);
  protected readonly splitSearching = signal(false);
  protected readonly splitSubmitting = signal(false);
  protected readonly splitBookingId = signal<string | null>(null);
  protected readonly splitShares = signal<ArenaBookingPaymentShare[]>([]);
  private splitParticipantNames = new Map<string, string>();
  private splitFriendDebounce: ReturnType<typeof setTimeout> | undefined;
  private unwatchSplitShares: (() => void) | undefined;
  private unwatchSplitBooking: (() => void) | undefined;

  protected readonly splitSum = computed(() =>
    Math.round(this.splitParticipants().reduce((acc, p) => acc + p.amountReais, 0) * 100) / 100,
  );

  protected readonly splitSumMatches = computed(() =>
    splitSharesSumMatches(
      this.splitParticipants().map((p) => ({ athleteId: p.athleteId, amountReais: p.amountReais })),
      this.pixAmountNow(),
    ),
  );

  protected readonly splitCanSubmit = computed(() => {
    const participants = this.splitParticipants();
    return (
      participants.length > 0 &&
      participants.some((p) => !p.isSelf) &&
      participants.every((p) => p.amountReais > 0) &&
      this.splitSumMatches()
    );
  });

  protected readonly splitMaxShares = SPLIT_MAX_SHARES;
  protected readonly initialsOf = initialsOf;

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
      clearTimeout(this.splitFriendDebounce);
      this.stopPixWatchers();
      this.stopSplitWatchers();
      // Reserva PIX pendente fica no ar de propósito: ao voltar pra esta tela o
      // mesmo horário é retomado (findResumablePixBooking), igual ao app.
    });
  }

  private async load(): Promise<void> {
    const id = this.arenaId();
    const params = this.bookingQueryParams();
    const date = clampPickedDate(params.date ?? '', this.today);

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

  /** Revalida o código digitado contra a cotação — não bloqueia a reserva se der errado
   *  (código inválido/expirado/esgotado): mostra o erro perto do campo e a cotação volta
   *  a valer sem cupom, deixando o atleta corrigir ou seguir em frente. */
  protected async applyCoupon(): Promise<void> {
    const code = this.couponCodeInput().trim();
    if (!code || this.couponApplying()) return;

    this.couponApplying.set(true);
    this.couponError.set(null);
    try {
      const quote = await quoteArenaBooking(athleteFunctions(), this.bookingArgs(), code);
      this.quotedTotal.set(quote.amountReais);
      if (quote.couponApplied) {
        this.appliedCouponCode.set(code.toUpperCase());
        this.couponDiscountReais.set(quote.couponDiscountReais);
      } else {
        this.appliedCouponCode.set(null);
        this.couponDiscountReais.set(0);
        this.couponError.set('Este cupom não é mais vantajoso do que a promoção já aplicada nesta quadra.');
      }
    } catch (err) {
      this.appliedCouponCode.set(null);
      this.couponDiscountReais.set(0);
      this.couponError.set(err instanceof ArenaBookingError ? err.message : 'Não foi possível validar o cupom agora.');
      void this.loadQuote();
    } finally {
      this.couponApplying.set(false);
    }
  }

  protected removeCoupon(): void {
    this.couponCodeInput.set('');
    this.appliedCouponCode.set(null);
    this.couponDiscountReais.set(0);
    this.couponError.set(null);
    void this.loadQuote();
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
            couponCode: this.appliedCouponCode() ?? undefined,
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
      this.pixQrSrc.set(await resolvePixQrSrc(pix));
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
        couponCode: this.appliedCouponCode() ?? undefined,
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

  // ── Dividir com amigos (split de PIX) ───────────────────────────

  protected toggleSplitMode(on: boolean): void {
    if (this.splitMode() === on) return;
    this.splitMode.set(on);
    if (on && this.splitParticipants().length === 0) {
      const liveUser = this.auth.user();
      const uid = liveUser?.uid;
      if (!uid) return;
      this.splitParticipants.set([
        {
          athleteId: uid,
          name: this.accountLabel(),
          avatarUrl: liveUser?.photoURL ?? null,
          isSelf: true,
          amountReais: this.pixAmountNow(),
        },
      ]);
    }
  }

  /** Divide o total igualmente entre os participantes atuais — atalho editável depois. */
  protected divideEqually(): void {
    const participants = this.splitParticipants();
    if (participants.length === 0) return;
    const amounts = splitEvenlyReais(this.pixAmountNow(), participants.length);
    this.splitParticipants.set(participants.map((p, i) => ({ ...p, amountReais: amounts[i] ?? 0 })));
  }

  protected onFriendQueryInput(value: string): void {
    this.splitFriendQuery.set(value);
    clearTimeout(this.splitFriendDebounce);
    const term = value.trim();
    if (!term) {
      this.splitFriendResults.set([]);
      this.splitSearching.set(false);
      return;
    }
    this.splitSearching.set(true);
    this.splitFriendDebounce = setTimeout(() => void this.runFriendSearch(term), 300);
  }

  private async runFriendSearch(term: string): Promise<void> {
    if (!this.firestore) return;
    try {
      const results = await searchAthleteDirectory(this.firestore, term);
      const excluded = new Set(this.splitParticipants().map((p) => p.athleteId));
      const uid = this.auth.user()?.uid;
      if (uid) excluded.add(uid);
      this.splitFriendResults.set(results.filter((r) => !excluded.has(r.id)));
    } catch {
      this.splitFriendResults.set([]);
    } finally {
      this.splitSearching.set(false);
    }
  }

  protected addParticipant(profile: AthletePublicProfile): void {
    if (this.splitParticipants().some((p) => p.athleteId === profile.id)) return;
    if (this.splitParticipants().length >= SPLIT_MAX_SHARES) {
      this.showNotice(`Máximo de ${SPLIT_MAX_SHARES} pessoas por divisão.`);
      return;
    }
    this.splitParticipants.update((list) => [
      ...list,
      { athleteId: profile.id, name: profile.displayName, avatarUrl: profile.avatarUrl, isSelf: false, amountReais: 0 },
    ]);
    this.splitFriendQuery.set('');
    this.splitFriendResults.set([]);
    this.divideEqually();
  }

  protected removeParticipant(athleteId: string): void {
    this.splitParticipants.update((list) => list.filter((p) => p.athleteId !== athleteId));
    this.divideEqually();
  }

  protected onParticipantAmountInput(athleteId: string, raw: string): void {
    const value = Number(raw.replace(',', '.'));
    this.splitParticipants.update((list) =>
      list.map((p) => (p.athleteId === athleteId ? { ...p, amountReais: Number.isFinite(value) ? Math.max(0, value) : 0 } : p)),
    );
  }

  protected async submitSplit(): Promise<void> {
    if (this.splitSubmitting() || !this.splitCanSubmit()) return;
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.showNotice('Faça login para dividir o pagamento.');
      return;
    }
    if (!this.firestore) return;

    this.splitSubmitting.set(true);
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

      const participants = this.splitParticipants();
      const shares: SplitShareInput[] = participants.map((p) => ({ athleteId: p.athleteId, amountReais: p.amountReais }));
      this.splitParticipantNames = new Map(participants.map((p) => [p.athleteId, p.isSelf ? 'Você' : p.name]));

      await splitArenaBookingPayment(athleteFunctions(), { bookingId, shares });

      this.splitBookingId.set(bookingId);
      this.startSplitWatch(bookingId);
    } catch (err) {
      this.showNotice(err instanceof ArenaBookingSplitError ? err.message : 'Não foi possível dividir o pagamento agora.');
    } finally {
      this.splitSubmitting.set(false);
    }
  }

  protected splitShareName(payerAthleteId: string): string {
    return this.splitParticipantNames.get(payerAthleteId) ?? `Atleta …${payerAthleteId.slice(-6)}`;
  }

  protected splitStatusLabel(status: ArenaBookingPaymentShareStatus): string {
    switch (status) {
      case 'paid':
        return 'Pago';
      case 'expired':
        return 'Expirado';
      case 'covered_by_organizer':
        return 'Virou sua conta';
      case 'pending':
      default:
        return 'Aguardando pagamento';
    }
  }

  private startSplitWatch(bookingId: string): void {
    this.stopSplitWatchers();
    if (!this.firestore) return;
    this.unwatchSplitShares = watchArenaBookingPaymentShares(this.firestore, bookingId, (shares) =>
      this.splitShares.set(shares),
    );
    this.unwatchSplitBooking = watchArenaBooking(this.firestore, bookingId, (booking) => {
      if (!booking) return;
      if (booking.paymentStatus === 'paid' || booking.paymentStatus === 'partial') {
        this.stopSplitWatchers();
        void this.router.navigate(['/reservar', this.arenaId(), 'agendar', 'pagamento', 'confirmada'], {
          queryParams: { bookingId },
        });
      }
    });
  }

  private stopSplitWatchers(): void {
    this.unwatchSplitShares?.();
    this.unwatchSplitShares = undefined;
    this.unwatchSplitBooking?.();
    this.unwatchSplitBooking = undefined;
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
    this.pixQrSrc.set(null);
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { fetchArenaById, arenaListItemImageUrl, courtSportLabel, type ArenaListItem } from '@nexago/arena-discovery';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { cancelBooking, fetchArenaBooking, watchArenaBooking, type ArenaBookingDoc } from '../../data/arena-bookings-repository';
import { REVIEW_ALREADY_SENT_MESSAGE } from '../../data/arena-reviews-repository';
import { BOOKING_MAX_PLAYERS, type BookingInvite } from '../../data/booking-invite-model';
import {
  cancelArenaBookingInvite,
  fetchAcceptedBookingInviteGuestUids,
  leaveArenaBooking,
  watchBookingInvitesOfBooking,
} from '../../data/booking-invites-repository';
import { athleteFunctions } from '../../data/functions';
import { bookingIsReviewCandidate } from '../../data/pending-arena-review';
import { PendingArenaReviewService } from '../../data/pending-arena-review.service';
import { fetchPublicProfilesByIds, type AthletePublicProfile } from '../../data/public-profiles-repository';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { NxToastService } from '../../shared/feedback';
import { LocationMapComponent } from '../../shared/location-map/location-map.component';
import { ArenaReviewDialogComponent } from '../review/arena-review-dialog.component';
import { BookingInviteDialogComponent } from './booking-invite-dialog.component';
import { buildBookingTeam, initialsOf, viewerIsBookingOwner, type BookingTeamMember, type LegacyBookingGuest } from './booking-team';

/** Vagas fixas por reserva (organizador + convidados) — espelha `kBookingTeamSlots` (Flutter). */
const TEAM_SLOTS = BOOKING_MAX_PLAYERS;

export type BookingLifecycle = 'future' | 'current' | 'past' | 'canceled';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
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

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const WEEKDAY_FULL = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado',
] as const;
const MONTH_FULL = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

function formatDateEyebrow(d: Date): string {
  return `${WEEKDAY_FULL[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} de ${MONTH_FULL[d.getMonth()]}`;
}

function formatDurationLabel(minutes: number): string {
  if (minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/** `NX-XXXXXX` a partir dos últimos caracteres alfanuméricos do id — só apresentação,
 *  não é um código separado gravado em lugar nenhum. */
function bookingDisplayCode(bookingId: string): string {
  const alnum = bookingId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!alnum) return 'NX-------';
  return `NX-${alnum.slice(-6)}`;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function bookingLifecycle(now: Date, start: Date, end: Date, rawStatus: string): BookingLifecycle {
  const s = rawStatus.trim().toLowerCase();
  if (s === 'canceled' || s === 'cancelled') return 'canceled';
  if (now >= start && now < end) return 'current';
  if (now < start) return 'future';
  return 'past';
}

/** Tela de detalhe de uma reserva a partir da Agenda — lê a reserva REAL
 *  (`arenaBookings/{bookingId}`, ao vivo), a arena (endereço/rota) e a equipe: `participants`
 *  gravados pelas callables de convite, mais o legado (`guestAthleteId` e convites aceitos do
 *  app 1.0.1). Quem vê pode ser o dono ou um convidado: pagamento, cancelamento e avaliação são
 *  do dono; o convidado vê o dono pelo nome e pode sair do jogo. */
@Component({
  selector: 'app-athlete-booking-detail',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, LocationMapComponent, ArenaReviewDialogComponent, BookingInviteDialogComponent],
  templateUrl: './athlete-booking-detail.component.html',
  styleUrl: './athlete-booking-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteBookingDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  private readonly reviewStore = inject(PendingArenaReviewService);
  private readonly toasts = inject(NxToastService);
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;
  private stopWatching: (() => void)[] = [];
  private destroyed = false;

  protected readonly reviewDialogOpen = signal(false);
  /** Marcado no envio desta sessão — evita depender de um `refresh()` do store pra trocar o
   *  botão por "Avaliação enviada". */
  protected readonly reviewSentHere = signal(false);

  /** A avaliação é uma por reserva (`arena_reviews` por `bookingId`): fica com o dono — a do
   *  convidado bloquearia a dele. */
  protected readonly canReview = computed(() => {
    const b = this.booking();
    if (!b || this.reviewSentHere() || !this.isOwner()) return false;
    if (this.reviewStore.isReviewed(b.id)) return false;
    return bookingIsReviewCandidate(b, this.now());
  });

  protected readonly reviewAlreadySent = computed(() => {
    const b = this.booking();
    if (!b) return false;
    return this.reviewSentHere() || this.reviewStore.isReviewed(b.id);
  });

  protected readonly googleMapsApiKey = environment.googleMapsApiKey;

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly bookingId = computed(() => this.route.snapshot.paramMap.get('bookingId') ?? '');

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly booking = signal<ArenaBookingDoc | null>(null);
  protected readonly arena = signal<ArenaListItem | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly confirmingCancel = signal(false);
  protected readonly canceling = signal(false);

  protected readonly now = signal(new Date());

  protected readonly startAt = computed(() => {
    const b = this.booking();
    if (!b) return null;
    const d = parseDateKey(b.dateKey);
    if (!d) return null;
    const [h, m] = b.startTime.split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  });

  protected readonly endAt = computed(() => {
    const b = this.booking();
    const start = this.startAt();
    if (!b || !start) return null;
    const [h, m] = b.endTime.split(':').map(Number);
    const end = new Date(start);
    end.setHours(h || 0, m || 0, 0, 0);
    if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
    return end;
  });

  protected readonly lifecycle = computed<BookingLifecycle>(() => {
    const b = this.booking();
    const start = this.startAt();
    const end = this.endAt();
    if (!b || !start || !end) return 'past';
    return bookingLifecycle(this.now(), start, end, b.status);
  });

  protected readonly isRecurring = computed(() => this.booking()?.recurringBookingId != null);

  private readonly viewerUid = computed(() => this.auth.user()?.uid ?? null);

  /** Dono da reserva (sem dono gravado ou sem sessão, a tela segue como antes: é o dono). */
  protected readonly isOwner = computed(() =>
    viewerIsBookingOwner(this.booking()?.ownerAthleteId ?? null, this.viewerUid()),
  );

  /** Entrou por convite (`participantUids`) — pode sair do jogo. */
  protected readonly isParticipant = computed(() => {
    const uid = this.viewerUid();
    return !this.isOwner() && uid != null && (this.booking()?.participantUids.includes(uid) ?? false);
  });

  protected readonly canCancel = computed(
    () => this.isOwner() && this.lifecycle() === 'future' && !this.isRecurring(),
  );

  /** Entrar, sair, tirar e convidar valem até o FIM do horário (futura ou em andamento). */
  protected readonly gameOpen = computed(() => {
    const life = this.lifecycle();
    return life === 'future' || life === 'current';
  });

  /** Reserva aguardando PIX não convida (a callable recusa com a mesma frase). */
  protected readonly awaitingPayment = computed(() => this.booking()?.status === 'pending_payment');

  protected readonly canInvite = computed(
    () => this.isOwner() && this.gameOpen() && !this.awaitingPayment() && this.openSlots() > 0,
  );

  /** Exportar ICS só enquanto o horário ainda não passou / não foi cancelado. */
  protected readonly canAddToAgenda = computed(() => this.gameOpen());

  /** Nome e foto de quem reservou — só buscados quando quem vê é convidado. */
  private readonly ownerProfile = signal<{ name: string; avatarUrl: string | null } | null>(null);
  /** Convidados de reserva antiga (sem `participants`), com o nome já resolvido. */
  private readonly legacyGuests = signal<LegacyBookingGuest[]>([]);
  /** Convites da reserva, ao vivo (só o dono assina). */
  private readonly invites = signal<BookingInvite[]>([]);

  protected readonly team = computed<BookingTeamMember[]>(() => {
    const b = this.booking();
    if (!b) return [];
    const owner = this.ownerProfile();
    return buildBookingTeam({
      ownerUid: b.ownerAthleteId,
      viewerUid: this.viewerUid(),
      viewerName: this.accountLabel(),
      ownerName: owner?.name ?? null,
      ownerAvatarUrl: owner?.avatarUrl ?? null,
      ownerPaid: b.paymentStatus === 'paid' || b.amountPaidOnlineReais > 0.02,
      participants: b.participants,
      legacyGuests: this.legacyGuests(),
      canRemove: this.isOwner() && this.gameOpen(),
    });
  });

  /** Convites diretos sem resposta de quem ainda não entrou (o link multiuso fica de fora). */
  protected readonly pendingInvites = computed(() => {
    const playing = new Set(this.booking()?.participantUids ?? []);
    return this.invites().filter((i) => i.status === 'pending' && i.inviteeUid != null && !playing.has(i.inviteeUid));
  });

  protected readonly pendingInviteeUids = computed(() => this.pendingInvites().map((i) => i.inviteeUid!));

  protected readonly inviteDialogOpen = signal(false);
  /** Uid (ou id do convite) com ação em andamento — desliga o botão da linha. */
  protected readonly busy = signal<ReadonlySet<string>>(new Set());
  protected readonly confirmingRemoveUid = signal<string | null>(null);
  protected readonly confirmingLeave = signal(false);

  protected readonly statusBadgeLabel = computed(() => {
    const b = this.booking();
    if (!b) return '';
    switch (this.lifecycle()) {
      case 'canceled':
        return 'CANCELADA';
      case 'past':
        return 'FINALIZADA';
      case 'current':
        return 'EM ANDAMENTO';
      case 'future':
        break;
    }
    // Pagamento é assunto do dono; o convidado só precisa saber que o jogo está de pé.
    if (!this.isOwner()) return 'CONFIRMADA';
    if (b.status === 'pending_payment') return 'AGUARDANDO PAGAMENTO';
    if (b.paymentChannel === 'pix' || b.paymentChannel === 'card') {
      const isFull = (b.paymentFraction ?? 1) >= 0.99 || b.amountDueOnsiteReais <= 0.02;
      if (b.paymentStatus === 'paid' && isFull) return 'PAGO E CONFIRMADO';
      if (b.paymentStatus === 'paid' || b.paymentStatus === 'partial') return '50% PAGO · RESTANTE NA ARENA';
    }
    return 'CONFIRMADA · PAGA NA ARENA';
  });

  protected readonly statusTone = computed<'confirmed' | 'warning' | 'neutral' | 'live'>(() => {
    switch (this.lifecycle()) {
      case 'canceled':
        return 'neutral';
      case 'past':
        return 'neutral';
      case 'current':
        return 'live';
      case 'future': {
        const b = this.booking();
        if (b?.status === 'pending_payment' && this.isOwner()) return 'warning';
        return 'confirmed';
      }
    }
  });

  protected readonly countdownLabel = computed(() => {
    switch (this.lifecycle()) {
      case 'canceled':
        return 'Cancelada';
      case 'past':
        return 'Finalizada';
      case 'current':
        return 'Em andamento';
      case 'future':
        break;
    }
    const start = this.startAt();
    if (!start) return '';
    const diffMs = start.getTime() - this.now().getTime();
    const hours = Math.max(0, Math.round(diffMs / 3_600_000));
    if (hours < 1) return 'Começa em instantes';
    const sameDay = start.toDateString() === this.now().toDateString();
    if (sameDay) return `Hoje · daqui a ${hours}h`;
    const tomorrow = new Date(this.now());
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (start.toDateString() === tomorrow.toDateString()) return `Amanhã · daqui a ${hours}h`;
    const days = Math.ceil(diffMs / 86_400_000);
    return `Em ${days} dias · daqui a ${hours}h`;
  });

  protected readonly dateEyebrow = computed(() => {
    const start = this.startAt();
    return start ? formatDateEyebrow(start) : '—';
  });

  protected readonly timeRangeLabel = computed(() => {
    const b = this.booking();
    return b ? `${b.startTime} – ${b.endTime}` : '—';
  });

  protected readonly durationLabel = computed(() => {
    const start = this.startAt();
    const end = this.endAt();
    if (!start || !end) return '—';
    return formatDurationLabel(Math.round((end.getTime() - start.getTime()) / 60_000));
  });

  protected readonly displayCode = computed(() => bookingDisplayCode(this.bookingId()));

  /** Esporte escolhido na reserva; reserva antiga (sem `sport`) cai no 1º esporte da arena. */
  protected readonly sportLabel = computed(
    () => courtSportLabel(this.booking()?.sport ?? this.arena()?.courtTypes[0]) || null,
  );

  /** Capa da arena pro hero — null enquanto a arena não carregou. */
  protected readonly coverUrl = computed(() => {
    const a = this.arena();
    return a ? arenaListItemImageUrl(a) : null;
  });

  protected readonly addressLabel = computed(() => {
    const a = this.arena();
    if (!a) return 'Local a confirmar';
    return a.locationLabel;
  });

  protected readonly mapsUrl = computed(() => {
    const a = this.arena();
    const b = this.booking();
    const q =
      a?.lat != null && a?.lng != null ? `${a.lat},${a.lng}` : `${b?.arenaName ?? ''}, ${a?.locationLabel ?? ''}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });

  protected readonly openSlots = computed(() => Math.max(0, TEAM_SLOTS - this.team().filter((m) => !m.isEmptySlot).length));

  protected readonly showSplitCard = computed(() => {
    const b = this.booking();
    if (!b || !this.isOwner()) return false;
    const ps = b.paymentStatus.toLowerCase();
    return ps === 'partial' || b.amountPaidOnlineReais > 0.02;
  });

  protected readonly splitPerPersonLabel = computed(() => {
    const b = this.booking();
    if (!b || b.amountReais <= 0) return null;
    return formatBRL(b.amountReais / TEAM_SLOTS);
  });

  protected readonly paymentMethodLabel = computed(() => {
    const b = this.booking();
    if (!b) return '—';
    if (b.paymentChannel === 'pix') return 'Via PIX';
    if (b.paymentChannel === 'card') return 'Cartão de crédito';
    if (b.paymentChannel === 'onsite') return 'No local';
    if (b.paymentChannel === 'weather_credit') return 'Crédito de chuva';
    return 'A confirmar';
  });

  protected readonly formatBRL = formatBRL;

  constructor() {
    void this.load();
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.noticeTimeout);
      for (const stop of this.stopWatching) stop();
    });
  }

  private async load(): Promise<void> {
    const bookingId = this.bookingId();
    const db = this.firestore;
    if (!bookingId || !db) {
      this.error.set('Reserva não encontrada.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const booking = await fetchArenaBooking(db, bookingId);
      if (!booking) {
        this.error.set('Reserva não encontrada. Ela pode ter sido removida.');
        this.loading.set(false);
        return;
      }
      this.booking.set(booking);
      this.now.set(new Date());

      const arenaPromise = booking.arenaId ? fetchArenaById(db, booking.arenaId) : Promise.resolve(null);
      const teamPromise = this.loadTeamExtras(db, booking);
      const [arena] = await Promise.all([arenaPromise, teamPromise]);
      this.arena.set(arena);
      this.watchLive(db, bookingId);
      void this.reviewStore.refresh();
    } catch (err) {
      if (!environment.production) {
        console.error('[booking-detail] load error', err);
      }
      this.error.set('Não foi possível carregar os dados da reserva agora.');
    } finally {
      this.loading.set(false);
    }
  }

  /** O que a equipe precisa além do doc: o nome de quem reservou (para o convidado) e os
   *  convidados de reserva antiga. Reserva nova traz tudo em `participants`. */
  private async loadTeamExtras(db: Firestore, booking: ArenaBookingDoc): Promise<void> {
    const ownerId = booking.ownerAthleteId;
    const lookups = new Set<string>();
    if (ownerId && !this.isOwner()) lookups.add(ownerId);

    // Legado: o par `guestAthleteId`/`guestAthleteName` (app 1.0.1) e, se ainda faltar gente
    // para o `confirmedParticipants`, os convites aceitos — como o app faz. Quem também está em
    // `participants` sai repetido daqui e o `buildBookingTeam` descarta.
    const legacyUids = new Set<string>();
    if (booking.guestAthleteId && booking.guestAthleteId !== ownerId) legacyUids.add(booking.guestAthleteId);
    if (booking.participants.length + legacyUids.size < booking.confirmedParticipants - 1) {
      for (const uid of await fetchAcceptedBookingInviteGuestUids(db, booking.id)) {
        if (uid !== ownerId) legacyUids.add(uid);
      }
    }
    for (const uid of legacyUids) {
      if (!booking.participantUids.includes(uid)) lookups.add(uid);
    }

    const profiles = lookups.size > 0 ? await fetchPublicProfilesByIds(db, [...lookups]) : new Map<string, AthletePublicProfile>();
    if (ownerId && !this.isOwner()) {
      const owner = profiles.get(ownerId);
      this.ownerProfile.set(owner ? { name: owner.displayName, avatarUrl: owner.avatarUrl } : null);
    }
    const legacy: LegacyBookingGuest[] = [...legacyUids].map((uid) => ({
      uid,
      name: profiles.get(uid)?.displayName ?? booking.guestAthleteName ?? 'Jogador confirmado',
    }));
    // Convidado sem uid resolvido (nome só, veio direto do doc da reserva).
    if (legacyUids.size === 0 && booking.guestAthleteName) legacy.push({ uid: null, name: booking.guestAthleteName });
    this.legacyGuests.set(legacy);
  }

  /** Mantém a lista viva: alguém aceita o link enquanto o dono está com a tela aberta. */
  private watchLive(db: Firestore, bookingId: string): void {
    // A carga é assíncrona: fechada a tela antes, ninguém mais desligaria o listener.
    if (this.destroyed) return;
    this.stopWatching.push(
      watchArenaBooking(db, bookingId, (booking) => {
        if (booking) this.booking.set(booking);
      }),
    );
    if (this.isOwner()) {
      this.stopWatching.push(watchBookingInvitesOfBooking(db, bookingId, (list) => this.invites.set(list)));
    }
  }

  protected openInviteDialog(): void {
    if (this.canInvite()) this.inviteDialogOpen.set(true);
  }

  protected closeInviteDialog(): void {
    this.inviteDialogOpen.set(false);
  }

  protected onPlayerInvited(name: string): void {
    this.showNotice(`Convite enviado para ${name}.`);
  }

  protected askRemove(member: BookingTeamMember): void {
    this.confirmingRemoveUid.set(member.uid);
  }

  protected cancelRemove(): void {
    this.confirmingRemoveUid.set(null);
  }

  protected async confirmRemove(member: BookingTeamMember): Promise<void> {
    const b = this.booking();
    const uid = member.uid;
    if (!b || !uid) return;
    await this.runBusy(uid, async () => {
      await leaveArenaBooking(athleteFunctions(), { bookingId: b.id, participantUid: uid });
      this.confirmingRemoveUid.set(null);
      this.showNotice(`${member.displayName} saiu do jogo.`);
    });
  }

  protected async cancelInvite(invite: BookingInvite): Promise<void> {
    await this.runBusy(invite.id, async () => {
      await cancelArenaBookingInvite(athleteFunctions(), invite.id);
      this.showNotice('Convite cancelado.');
    });
  }

  protected async leaveGame(): Promise<void> {
    const b = this.booking();
    if (!b) return;
    await this.runBusy('leave', async () => {
      await leaveArenaBooking(athleteFunctions(), { bookingId: b.id });
      this.toasts.success('Você saiu do jogo.', 'Avisamos quem reservou.');
      void this.router.navigate(['/agenda']);
    });
  }

  private async runBusy(key: string, action: () => Promise<void>): Promise<void> {
    if (this.busy().has(key)) return;
    this.busy.update((s) => new Set(s).add(key));
    try {
      await action();
    } catch (err) {
      this.showNotice(err instanceof Error ? err.message : 'Não foi possível concluir agora.');
    } finally {
      this.busy.update((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  }

  protected isBusy(key: string | null): boolean {
    return key != null && this.busy().has(key);
  }

  protected readonly initialsOf = initialsOf;

  protected addToAgenda(): void {
    const b = this.booking();
    const start = this.startAt();
    const end = this.endAt();
    if (!b || !start || !end) return;
    const ics = buildSingleEventIcs({
      uid: b.id,
      start,
      end,
      summary: `${b.arenaName} · ${b.courtName}`,
      description: `Reserva ${this.displayCode()}`,
      location: this.addressLabel(),
    });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reserva-${b.id}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    this.showNotice('Evento adicionado — abra o arquivo baixado no seu calendário.');
  }

  protected async chargeSplit(): Promise<void> {
    const b = this.booking();
    const perPerson = this.splitPerPersonLabel();
    if (!b || !perPerson) return;
    const text = `Ei! Sua parte da reserva na ${b.arenaName} (${this.dateEyebrow()}, ${this.timeRangeLabel()}) é de ${perPerson}. Combina o PIX comigo?`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        this.showNotice('Cobrança copiada — cole numa conversa com quem falta pagar.');
        return;
      }
      this.showNotice('Copie a cobrança manualmente: ' + text);
    } catch {
      // usuário bloqueou a área de transferência — nada a fazer
    }
  }

  protected startCancelConfirmation(): void {
    this.confirmingCancel.set(true);
  }

  protected cancelCancelConfirmation(): void {
    this.confirmingCancel.set(false);
  }

  protected async confirmCancel(): Promise<void> {
    const uid = this.auth.user()?.uid;
    const b = this.booking();
    const db = this.firestore;
    if (!uid || !b || !db || this.canceling()) return;
    this.canceling.set(true);
    try {
      await cancelBooking(db, b.id, uid);
      this.booking.set({ ...b, status: 'canceled' });
      this.confirmingCancel.set(false);
      this.showNotice('Reserva cancelada.');
      void this.router.navigate(['/agenda']);
    } catch (err) {
      this.showNotice(err instanceof Error ? err.message : 'Não foi possível cancelar a reserva.');
    } finally {
      this.canceling.set(false);
    }
  }

  protected openReviewDialog(): void {
    this.reviewDialogOpen.set(true);
  }

  protected onReviewSubmitted(bookingId: string): void {
    this.reviewStore.markReviewed(bookingId);
    this.reviewSentHere.set(true);
    this.reviewDialogOpen.set(false);
    this.showNotice('Obrigado! +10 XP no seu progresso.');
  }

  /** Backend recusou por "já avaliada" — sem XP, então sem a notícia de +10 XP; só
   *  sincroniza o store (`canReview`/`reviewAlreadySent` reagem sozinhos) e fecha o modal. */
  protected onReviewAlreadyReviewed(bookingId: string): void {
    this.reviewStore.markReviewed(bookingId);
    this.reviewDialogOpen.set(false);
    this.showNotice(REVIEW_ALREADY_SENT_MESSAGE);
  }

  protected onReviewDismissed(): void {
    this.reviewDialogOpen.set(false);
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}

function icsDate(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

function icsEscape(text: string): string {
  return text.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
}

function buildSingleEventIcs(ev: { uid: string; start: Date; end: Date; summary: string; description: string; location: string }): string {
  const stamp = icsDate(new Date());
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//nexaGO//Agenda//PT-BR',
    'BEGIN:VEVENT',
    `UID:${ev.uid}@nexago.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(ev.end)}`,
    `SUMMARY:${icsEscape(ev.summary)}`,
    `DESCRIPTION:${icsEscape(ev.description)}`,
    `LOCATION:${icsEscape(ev.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

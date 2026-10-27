import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { watchArenaBooking, type ArenaBookingDoc } from '../data/arena-bookings-repository';
import {
  BOOKING_MAX_PLAYERS,
  bookingInviteIsShareLink,
  bookingInviteWhenLabel,
  resolveBookingInviteGate,
  type BookingInvite,
  type BookingInviteGateResult,
} from '../data/booking-invite-model';
import { respondArenaBookingInvite, watchBookingInvite } from '../data/booking-invites-repository';
import { athleteFunctions } from '../data/functions';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** `/convite/:inviteId` — o link do WhatsApp (`link_{bookingId}`) ou o push de um convite
 *  direto (`{bookingId}_{uid}`), aberto no navegador ou no iPhone sem o app.
 *
 *  Convite e reserva são lidos ao vivo: aceitar grava `participantUids` na reserva e a tela vira
 *  "Você está no jogo!" sozinha, como no app. Os estados vêm de `resolveBookingInviteGate`
 *  (espelho do app); a callable revalida tudo e a mensagem dela aparece quando recusa. */
@Component({
  selector: 'app-booking-invite-page',
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './booking-invite-page.component.html',
  styleUrl: './invite-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingInvitePageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(NxToastService);
  private readonly firestore = createFirestore();

  /** Parâmetro de rota — `withComponentInputBinding()` alimenta `input()`, nunca `signal()`. */
  readonly inviteId = input('');

  protected readonly invite = signal<BookingInvite | null>(null);
  protected readonly booking = signal<ArenaBookingDoc | null>(null);
  private readonly inviteLoaded = signal(false);
  private readonly bookingLoaded = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly responding = signal<'accept' | 'decline' | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');

  /** Computed de string: o efeito da reserva só reassina quando o id muda, não a cada snapshot. */
  private readonly bookingId = computed(() => this.invite()?.bookingId ?? '');

  protected readonly loading = computed(
    () => !this.inviteLoaded() || (this.bookingId() !== '' && !this.bookingLoaded()),
  );

  protected readonly gate = computed<BookingInviteGateResult | null>(() => {
    const invite = this.invite();
    if (!invite) return null;
    // Reserva que sumiu antes de o convite carregar = cancelada; erro de leitura não é isso.
    if (!this.bookingId()) return { gate: 'blocked', message: 'Este convite não está mais disponível.' };
    const b = this.booking();
    return resolveBookingInviteGate({
      invite,
      booking: b ? { status: b.status, ownerUid: b.ownerAthleteId, participantUids: b.participantUids } : null,
      viewerUid: this.auth.user()?.uid ?? null,
    });
  });

  protected readonly isShareLink = computed(() => {
    const invite = this.invite();
    return invite != null && bookingInviteIsShareLink(invite);
  });

  protected readonly inviterName = computed(() => this.invite()?.invitedByName.trim() || 'Um atleta');

  protected readonly whenLabel = computed(() => {
    const invite = this.invite();
    return invite ? bookingInviteWhenLabel(invite.date, invite.startTime) : '';
  });

  protected readonly hourLabel = computed(() => {
    const invite = this.invite();
    if (!invite) return '';
    return invite.endTime ? `${invite.startTime} – ${invite.endTime}` : invite.startTime;
  });

  protected readonly playersLabel = computed(() => {
    const b = this.booking();
    const players = b ? Math.max(b.confirmedParticipants, 1 + b.participantUids.length) : 1;
    return `${Math.min(Math.max(players, 1), BOOKING_MAX_PLAYERS)}/${BOOKING_MAX_PLAYERS} jogadores confirmados`;
  });

  protected readonly signInLink = computed(() => `/convite/${this.inviteId()}`);

  constructor() {
    effect((onCleanup) => {
      const id = this.inviteId().trim();
      const db = this.firestore;
      this.invite.set(null);
      this.inviteLoaded.set(false);
      this.loadError.set(null);
      if (!id || !db) {
        // Sem id ou sem Firebase a tela tem de sair do "carregando" e dizer algo.
        this.inviteLoaded.set(true);
        return;
      }
      const stop = watchBookingInvite(
        db,
        id,
        (invite) => {
          this.invite.set(invite);
          this.inviteLoaded.set(true);
        },
        () => {
          this.loadError.set('Não foi possível carregar o convite.');
          this.inviteLoaded.set(true);
        },
      );
      onCleanup(stop);
    });

    effect((onCleanup) => {
      const bookingId = this.bookingId();
      const db = this.firestore;
      this.booking.set(null);
      this.bookingLoaded.set(false);
      if (!bookingId || !db) return;
      const stop = watchArenaBooking(db, bookingId, (booking) => {
        this.booking.set(booking);
        this.bookingLoaded.set(true);
      });
      onCleanup(stop);
    });
  }

  protected async respond(accept: boolean): Promise<void> {
    const invite = this.invite();
    if (!invite || this.responding()) return;
    this.responding.set(accept ? 'accept' : 'decline');
    this.error.set(null);
    try {
      const result = await respondArenaBookingInvite(athleteFunctions(), { inviteId: invite.id, accept });
      if (result.status === 'declined') {
        this.toasts.info('Convite recusado', 'Avisamos quem te chamou.');
        void this.router.navigate(['/painel']);
        return;
      }
      // Aceite: a reserva ao vivo traz o seu uid em `participantUids` e a tela vira "joined".
      this.toasts.success('Tudo certo!', 'Você está no jogo.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível responder agora.');
    } finally {
      this.responding.set(null);
    }
  }

  /** "Agora não" do link multiuso: não há o que gravar (a callable também não grava). */
  protected dismissLink(): void {
    void this.router.navigate(['/painel']);
  }
}

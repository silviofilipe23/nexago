import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  guestShareStatusLabel,
  watchArenaBookingPaymentShare,
  type ArenaBookingPaymentShare,
} from '../data/arena-booking-split-repository';
import { watchArenaBooking, type ArenaBookingDoc } from '../data/arena-bookings-repository';
import { bookingInviteWhenLabel } from '../data/booking-invite-model';
import { resolvePixQrSrc } from '../data/pix-qr';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDeadline(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} às ${hh}:${min}`;
}

/** `/reservas/:bookingId/parcela/:shareId` — o CONVIDADO de uma reserva dividida paga a sua fatia
 *  (o `url` do push `arena_booking_share_payment_pending`). Espelho da `BookingSharePaymentPage` do
 *  app.
 *
 *  Lê só a fatia dele e o resumo da reserva, ao vivo: o webhook do Asaas marca `paid` e a tela vira
 *  "Pago" sozinha; fatia não paga até o prazo vira `covered_by_organizer` (soma ao que quem reservou
 *  paga na arena). */
@Component({
  selector: 'app-booking-share-payment',
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './booking-share-payment.component.html',
  styleUrls: ['../convite/invite-card.scss', './booking-share-payment.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingSharePaymentComponent {
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(NxToastService);
  private readonly firestore = createFirestore();

  /** Parâmetros de rota — `withComponentInputBinding()` alimenta `input()`. */
  readonly bookingId = input('');
  readonly shareId = input('');

  protected readonly share = signal<ArenaBookingPaymentShare | null>(null);
  protected readonly booking = signal<ArenaBookingDoc | null>(null);
  protected readonly loaded = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly qrSrc = signal<string | null>(null);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');

  /** Computed de string: o QR só é refeito quando o código muda, não a cada snapshot. */
  private readonly pixCode = computed(() => this.share()?.pixCopyPaste ?? '');
  private readonly pixBase64 = computed(() => this.share()?.qrCodeBase64 ?? '');

  protected readonly amountLabel = computed(() => formatBRL(this.share()?.amountReais ?? 0));
  protected readonly statusLabel = computed(() => {
    const share = this.share();
    return share ? guestShareStatusLabel(share.status) : '';
  });

  protected readonly deadlineLabel = computed(() => {
    const expiresAt = this.share()?.expiresAt;
    return expiresAt ? formatDeadline(expiresAt) : '';
  });

  protected readonly whenLabel = computed(() => {
    const b = this.booking();
    return b ? bookingInviteWhenLabel(b.dateKey, b.startTime) : '';
  });

  protected readonly hourLabel = computed(() => {
    const b = this.booking();
    if (!b) return '';
    return b.endTime ? `${b.startTime} – ${b.endTime}` : b.startTime;
  });

  constructor() {
    effect((onCleanup) => {
      const bookingId = this.bookingId().trim();
      const shareId = this.shareId().trim();
      const db = this.firestore;
      this.share.set(null);
      this.loaded.set(false);
      this.loadError.set(null);
      if (!bookingId || !shareId || !db) {
        // Sem ids ou sem Firebase a tela tem de sair do "carregando" e dizer algo.
        this.loaded.set(true);
        return;
      }
      const stop = watchArenaBookingPaymentShare(
        db,
        bookingId,
        shareId,
        (share) => {
          this.share.set(share);
          this.loaded.set(true);
        },
        () => {
          this.loadError.set('Não foi possível abrir a sua parte da reserva. Tente de novo em instantes.');
          this.loaded.set(true);
        },
      );
      onCleanup(stop);
    });

    effect((onCleanup) => {
      const bookingId = this.bookingId().trim();
      const db = this.firestore;
      this.booking.set(null);
      if (!bookingId || !db) return;
      const stop = watchArenaBooking(db, bookingId, (booking) => this.booking.set(booking));
      onCleanup(stop);
    });

    effect(() => {
      const qrCode = this.pixCode();
      const qrCodeBase64 = this.pixBase64();
      if (!qrCode && !qrCodeBase64) {
        this.qrSrc.set(null);
        return;
      }
      void resolvePixQrSrc({ qrCode, qrCodeBase64 }).then((src) => {
        // Descarta resposta de um código que já foi trocado.
        if (this.pixCode() === qrCode) this.qrSrc.set(src);
      });
    });
  }

  protected async copyPixCode(): Promise<void> {
    const code = this.pixCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.toasts.success('Código Pix copiado', 'Cole no app do seu banco para concluir o pagamento.');
    } catch {
      this.toasts.error('Não foi possível copiar', 'Selecione o código na tela e copie manualmente.');
    }
  }
}

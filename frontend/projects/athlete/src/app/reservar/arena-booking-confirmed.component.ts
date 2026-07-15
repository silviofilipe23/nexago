import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { fetchArenaById, type ArenaListItem } from '@nexago/arena-discovery';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { fetchArenaBooking, type ArenaBookingDoc } from '../data/arena-bookings-repository';

const WEEKDAY_FULL = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado',
] as const;
const MONTH_FULL = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

/** Situação de pagamento da reserva, já traduzida pra UI. */
export type BookingStatusKind = 'paid' | 'partial' | 'onsite' | 'pending' | 'canceled';

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

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDurationLabel(minutes: number): string {
  if (minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Tela de sucesso pós-reserva: lê a reserva REAL (`arenaBookings/{bookingId}`) em vez de
 *  reconstruir a cadeia de slots da grade — depois da reserva os slots ficam ocupados e a
 *  reconstrução falharia sempre. */
@Component({
  selector: 'app-arena-booking-confirmed',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './arena-booking-confirmed.component.html',
  styleUrl: './arena-booking-confirmed.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArenaBookingConfirmedComponent {
  private readonly route = inject(ActivatedRoute);
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
  protected readonly bookingId = computed(() => this.route.snapshot.queryParamMap.get('bookingId') ?? '');

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly booking = signal<ArenaBookingDoc | null>(null);
  protected readonly arena = signal<ArenaListItem | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly statusKind = computed<BookingStatusKind>(() => {
    const b = this.booking();
    if (!b) return 'pending';
    const status = b.status.toLowerCase();
    if (status === 'canceled' || status === 'cancelled') return 'canceled';
    if (status === 'pending_payment') return 'pending';
    if (b.paymentChannel === 'pix') {
      return b.paymentStatus === 'partial' ? 'partial' : 'paid';
    }
    return 'onsite';
  });

  protected readonly statusLabel = computed(() => {
    switch (this.statusKind()) {
      case 'paid':
        return 'Pago e confirmado';
      case 'partial':
        return '50% pago · restante na arena';
      case 'onsite':
        return 'Confirmada · pague na arena';
      case 'pending':
        return 'Aguardando pagamento';
      case 'canceled':
        return 'Cancelada';
    }
  });

  protected readonly dateLabel = computed(() => {
    const b = this.booking();
    const d = b ? parseDateKey(b.dateKey) : null;
    if (!d) return '—';
    return `${WEEKDAY_FULL[d.getDay()]}, ${d.getDate()} de ${MONTH_FULL[d.getMonth()]} de ${d.getFullYear()}`;
  });

  protected readonly timeRangeLabel = computed(() => {
    const b = this.booking();
    if (!b || !b.startTime) return '—';
    return `${b.startTime} - ${b.endTime}`;
  });

  protected readonly durationLabel = computed(() => {
    const b = this.booking();
    if (!b || !b.startTime || !b.endTime) return '—';
    const [sh, sm] = b.startTime.split(':').map(Number);
    const [eh, em] = b.endTime.split(':').map(Number);
    let minutes = (eh! * 60 + (em ?? 0)) - (sh! * 60 + (sm ?? 0));
    if (minutes <= 0) minutes += 24 * 60;
    return formatDurationLabel(minutes);
  });

  protected readonly mapsUrl = computed(() => {
    const a = this.arena();
    const b = this.booking();
    const q =
      a?.lat != null && a?.lng != null
        ? `${a.lat},${a.lng}`
        : `${b?.arenaName ?? ''}, ${a?.locationLabel ?? ''}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });

  protected readonly formatBRL = formatBRL;

  constructor() {
    void this.load();
    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimeout));
  }

  private async load(): Promise<void> {
    const bookingId = this.bookingId();
    if (!bookingId || !this.firestore) {
      this.error.set('Reserva não encontrada. Volte e refaça a reserva.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const booking = await fetchArenaBooking(this.firestore, bookingId);
      if (!booking) {
        this.error.set('Reserva não encontrada. Volte e refaça a reserva.');
        this.loading.set(false);
        return;
      }
      this.booking.set(booking);

      // Endereço/rota vêm da arena; a reserva em si já basta pro resto da tela.
      if (booking.arenaId) {
        this.arena.set(await fetchArenaById(this.firestore, booking.arenaId));
      }
    } catch (err) {
      if (!environment.production) {
        console.error('[arena-booking-confirmed] load error', err);
      }
      this.error.set('Não foi possível carregar os dados da reserva agora.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async inviteToPlay(): Promise<void> {
    const b = this.booking();
    if (!b) return;
    const text = `Bora jogar comigo na ${b.arenaName}, ${this.dateLabel()} às ${b.startTime}?`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ text });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        this.showNotice('Convite copiado — cole numa conversa para chamar parceiros.');
        return;
      }
      this.showNotice('Copie o convite manualmente: ' + text);
    } catch {
      // usuário cancelou o compartilhamento nativo — nada a fazer
    }
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}

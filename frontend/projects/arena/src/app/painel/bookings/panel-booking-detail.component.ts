import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { fetchCourtsList } from '../courts/courts-repository';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  attendanceLabel,
  bookingCanCancel,
  bookingShowsCheckInAction,
  bookingStatusLabel,
  displayBookingCode,
  enrichCourtName,
  formatBRL,
  type ArenaBooking,
} from './arena-booking.model';
import { cancelBookingByManager, checkInBookingByManager, resolveAthleteLabel, restoreBookingByManager, watchBooking } from './bookings-repository';

const ATTENDANCE_TONE: Record<string, PillTone | undefined> = {
  checked_in: 'green',
  confirmed: 'orange',
  no_show: 'red',
  pending: 'dim',
};

const UNDO_WINDOW_SECONDS = 60;

/** Detalhe de uma reserva (`arenaBookings`) pro gestor: check-in manual (front desk) e
 *  cancelamento com 60s pra desfazer — espelha `ArenaBookingDetailsPage` (Flutter), sem as
 *  ações de bloqueio/contato de atleta (fora do escopo desta 1ª leva). */
@Component({
  selector: 'ar-panel-booking-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="headerTitle()" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-ghost-btn" (click)="back()">Voltar</button>
      </ar-page-header>

      <div class="body">
        @if (loading()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando reserva…</p>
          </ar-panel-card>
        } @else if (!booking()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Reserva não encontrada.</p>
          </ar-panel-card>
        } @else {
          @if (errorMessage(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          @if (undoSecondsLeft(); as secs) {
            <div class="undo-banner">
              Reserva cancelada. <button type="button" class="undo-link" (click)="restore()">Desfazer</button> ({{ secs }}s)
            </div>
          }

          <div class="grid">
            <ar-panel-card title="Cliente" class="card-span">
              <div class="row"><span class="label">Nome</span><span class="value">{{ customerLabel() }}</span></div>
              <div class="row"><span class="label">Participantes</span><span class="value">{{ booking()!.confirmedParticipants }}</span></div>
              @if (booking()!.isRecurring) {
                <div class="row"><span class="label">Tipo</span><span class="value">Horário fixo (mensalista)</span></div>
              }
            </ar-panel-card>

            <ar-panel-card title="Horário">
              <div class="row"><span class="label">Data</span><span class="value">{{ booking()!.dateKey }}</span></div>
              <div class="row"><span class="label">Quadra</span><span class="value">{{ booking()!.courtName }}</span></div>
              <div class="row"><span class="label">Horário</span><span class="value">{{ booking()!.startTime }}–{{ booking()!.endTime }}</span></div>
              <div class="row"><span class="label">Código</span><span class="value">{{ displayBookingCode(booking()!.id) }}</span></div>
            </ar-panel-card>

            <ar-panel-card title="Pagamento">
              <div class="row"><span class="label">Valor</span><span class="value">{{ formatBRL(booking()!.amountReais) }}</span></div>
              <div class="row"><span class="label">Canal</span><span class="value">{{ booking()!.paymentChannel ?? 'Direto (sem link)' }}</span></div>
              <div class="row"><span class="label">Situação</span><span class="value">{{ booking()!.paymentStatus ?? '—' }}</span></div>
            </ar-panel-card>

            <ar-panel-card title="Status" class="card-span">
              <div class="status-row">
                <ar-pill tone="dim">{{ statusLabel(booking()!.status) }}</ar-pill>
                <ar-pill [tone]="attendanceTone[booking()!.attendanceStatus] ?? 'dim'">{{ attendanceLabel(booking()!.attendanceStatus) }}</ar-pill>
              </div>

              <div class="actions">
                @if (showCheckIn()) {
                  <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="checkingIn()" (click)="checkIn()">
                    <ar-icon name="check" [size]="14" />
                    {{ checkingIn() ? 'Registrando…' : 'Fazer check-in' }}
                  </button>
                }
                @if (canCancel()) {
                  <button type="button" class="ar-ghost-btn danger-link" (click)="showCancelConfirm.set(true)">
                    <ar-icon name="alert-triangle" [size]="14" />
                    Cancelar reserva
                  </button>
                }
              </div>
            </ar-panel-card>
          </div>
        }
      </div>

      @if (showCancelConfirm()) {
        <ar-modal (close)="showCancelConfirm.set(false)">
          <h2 class="confirm-title">Cancelar reserva?</h2>
          <p class="confirm-body">O horário volta a ficar disponível na agenda. Você pode desfazer nos 60s seguintes ao cancelamento.</p>

          <div class="field-label">Motivo (opcional)</div>
          <input
            type="text"
            class="input-box"
            placeholder="Ex.: cliente pediu por WhatsApp"
            [value]="cancelReason()"
            (input)="cancelReason.set($any($event.target).value)"
          />

          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="canceling()" (click)="showCancelConfirm.set(false)">Voltar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="canceling()" (click)="cancel()">
              {{ canceling() ? 'Cancelando…' : 'Confirmar cancelamento' }}
            </button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .error-banner,
    .undo-banner {
      border-radius: var(--nx-r-2);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .error-banner {
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
    }

    .undo-banner {
      border: 1px solid rgba(244, 197, 67, 0.3);
      background: rgba(244, 197, 67, 0.1);
      color: var(--nx-text);
    }

    .undo-link {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nx-orange-500);
      font-weight: 700;
      text-decoration: underline;
      padding: 0;
      font-size: inherit;
      font-family: inherit;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .card-span {
      grid-column: 1 / -1;
    }

    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--nx-line);
      font-size: 13px;
    }

    .row:last-child {
      border-bottom: none;
    }

    .label {
      color: var(--nx-text-dim);
    }

    .value {
      color: var(--nx-text);
      font-weight: 600;
      text-align: right;
    }

    .status-row {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }

    .danger-link {
      color: var(--nx-live);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .confirm-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin: 0 0 10px;
    }

    .confirm-body {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 16px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .input-box {
      width: 100%;
      height: 44px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
      margin-bottom: 22px;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .confirm-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .danger-btn {
      height: 44px;
      padding: 0 20px;
      background: var(--nx-live);
      color: #fff;
      border: none;
    }

    .danger-btn:hover:not(:disabled) {
      background: #ff564c;
    }

    @media (max-width: 900px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelBookingDetailComponent {
  private readonly router = inject(Router);
  private readonly arenaContext = inject(ArenaContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  protected readonly attendanceTone = ATTENDANCE_TONE;
  protected readonly formatBRL = formatBRL;
  protected readonly attendanceLabel = attendanceLabel;
  protected readonly statusLabel = bookingStatusLabel;
  protected readonly displayBookingCode = displayBookingCode;

  protected readonly loading = signal(true);
  protected readonly booking = signal<ArenaBooking | null>(null);
  protected readonly courtNames = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly athleteLabel = signal<string | null>(null);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly checkingIn = signal(false);
  protected readonly canceling = signal(false);
  protected readonly showCancelConfirm = signal(false);
  protected readonly cancelReason = signal('');

  protected readonly undoDeadlineMs = signal<number | null>(null);
  protected readonly nowTick = signal(Date.now());

  private unsubscribeBooking: (() => void) | null = null;
  private undoInterval: ReturnType<typeof setInterval> | null = null;

  protected readonly resolvedBooking = computed(() => {
    const b = this.booking();
    if (!b) return null;
    return enrichCourtName(b, this.courtNames());
  });

  protected readonly showCheckIn = computed(() => {
    const b = this.resolvedBooking();
    return b != null && bookingShowsCheckInAction(b);
  });

  protected readonly canCancel = computed(() => {
    const b = this.resolvedBooking();
    return b != null && bookingCanCancel(b) && this.undoDeadlineMs() == null;
  });

  protected readonly undoSecondsLeft = computed(() => {
    const deadline = this.undoDeadlineMs();
    if (deadline == null) return null;
    const left = Math.ceil((deadline - this.nowTick()) / 1000);
    return left > 0 ? left : null;
  });

  protected readonly headerTitle = computed(() => {
    const b = this.resolvedBooking();
    return b ? `Reserva ${this.displayBookingCode(b.id)}` : 'Reserva';
  });

  protected readonly headerSubtitle = computed(() => {
    const b = this.resolvedBooking();
    return b ? `${b.courtName} · ${b.dateKey} · ${b.startTime}–${b.endTime}` : '';
  });

  protected readonly customerLabel = computed(() => {
    const b = this.resolvedBooking();
    if (!b) return '';
    if (b.customerName) return b.customerName;
    if (!b.athleteId) return 'Cliente';
    return this.athleteLabel() ?? 'Carregando…';
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const bookingId = this.id();
      this.unsubscribeBooking?.();
      this.unsubscribeBooking = null;
      this.booking.set(null);
      this.loading.set(true);
      if (!arenaId || !bookingId) return;

      const db = arenaFirestore();
      void fetchCourtsList(db, arenaId).then((courts) => {
        this.courtNames.set(new Map(courts.map((c) => [c.id, c.name])));
      });
      this.unsubscribeBooking = watchBooking(db, bookingId, (booking) => {
        this.booking.set(booking);
        this.loading.set(false);
        if (booking?.athleteId) {
          void resolveAthleteLabel(db, booking.athleteId).then((label) => this.athleteLabel.set(label));
        }
        if (booking?.canceledAt && (booking.status === 'canceled' || booking.status === 'cancelled')) {
          const deadline = booking.canceledAt.getTime() + UNDO_WINDOW_SECONDS * 1000;
          this.undoDeadlineMs.set(deadline > Date.now() ? deadline : null);
        } else {
          this.undoDeadlineMs.set(null);
        }
      });
    });

    this.undoInterval = setInterval(() => this.nowTick.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => {
      this.unsubscribeBooking?.();
      if (this.undoInterval) clearInterval(this.undoInterval);
    });
  }

  protected back(): void {
    void this.router.navigate(['/painel/reservas']);
  }

  protected async checkIn(): Promise<void> {
    const b = this.booking();
    if (!b) return;
    this.checkingIn.set(true);
    this.errorMessage.set(null);
    try {
      await checkInBookingByManager(arenaFirestore(), b.id);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível fazer check-in.');
    } finally {
      this.checkingIn.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    const b = this.booking();
    const arenaId = this.arenaContext.arenaId();
    if (!b || !arenaId) return;
    this.canceling.set(true);
    this.errorMessage.set(null);
    try {
      await cancelBookingByManager(arenaFirestore(), b.id, arenaId, this.cancelReason().trim() || undefined);
      this.showCancelConfirm.set(false);
      this.cancelReason.set('');
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível cancelar a reserva.');
    } finally {
      this.canceling.set(false);
    }
  }

  protected async restore(): Promise<void> {
    const b = this.booking();
    const arenaId = this.arenaContext.arenaId();
    if (!b || !arenaId) return;
    this.errorMessage.set(null);
    try {
      await restoreBookingByManager(arenaFirestore(), b.id, arenaId);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível desfazer o cancelamento.');
    }
  }
}

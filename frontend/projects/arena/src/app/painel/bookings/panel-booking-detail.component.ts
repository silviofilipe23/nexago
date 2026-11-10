import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { fetchCourtsList } from '../courts/courts-repository';
import type { ArenaCourt } from '../courts/court.model';
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
  professorBookingLabel,
  professorDiscountLabel,
  type ArenaBooking,
} from './arena-booking.model';
import { bookingCanChangeCourt, changeBookingCourt, courtChangeOptions } from './booking-court-change';
import { cancelBookingByManager, checkInBookingByManager, resolveAthleteLabel, restoreBookingByManager, watchBooking } from './bookings-repository';

const ATTENDANCE_TONE: Record<string, PillTone | undefined> = {
  checked_in: 'green',
  confirmed: 'orange',
  no_show: 'red',
  pending: 'dim',
};

const UNDO_WINDOW_SECONDS = 60;

/** Canal da reserva para o gestor: o valor cru do doc (`pix`, `card`, `onsite`) em português. */
export function bookingChannelLabel(channel: string | null): string {
  switch (channel) {
    case 'pix':
      return 'PIX';
    case 'card':
      return 'Cartão de crédito';
    case 'onsite':
      return 'No local';
    case null:
      return 'Direto (sem link)';
    default:
      return channel;
  }
}

/** Detalhe de uma reserva (`arenaBookings`) pro gestor: check-in manual (front desk) e
 *  cancelamento com 60s pra desfazer — espelha `ArenaBookingDetailsPage` (Flutter), sem as
 *  ações de bloqueio/contato de atleta (fora do escopo desta 1ª leva). */
@Component({
  selector: 'ar-panel-booking-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent, RouterLink],
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
          @if (successMessage(); as ok) {
            <div class="success-banner">{{ ok }}</div>
          }
          @if (undoSecondsLeft(); as secs) {
            <div class="undo-banner">
              Reserva cancelada. <button type="button" class="undo-link" [disabled]="readOnly()" (click)="restore()">Desfazer</button> ({{ secs }}s)
            </div>
          }

          <div class="grid">
            <ar-panel-card title="Cliente" class="card-span">
              <div class="row"><span class="label">Nome</span><span class="value">{{ customerLabel() }}</span></div>
              <div class="row"><span class="label">Participantes</span><span class="value">{{ booking()!.confirmedParticipants }}</span></div>
              @if (booking()!.isRecurring) {
                <div class="row"><span class="label">Tipo</span><span class="value">Horário fixo (mensalista)</span></div>
              }
              @if (booking()!.classSessionId; as classSessionId) {
                <div class="row"><span class="label">Tipo</span><span class="value">Aula (bloqueio da quadra)</span></div>
              }
              @if (professorLabel(); as professor) {
                <!-- Reserva feita como professor (vínculo com "Reservar quadras"): o horário é de aula dele. -->
                <div class="row"><span class="label">Reservou como</span><span class="value"><ar-pill tone="blue">{{ professor }}</ar-pill></span></div>
              }
            </ar-panel-card>

            <ar-panel-card title="Horário">
              <div class="row"><span class="label">Data</span><span class="value">{{ booking()!.dateKey }}</span></div>
              <div class="row"><span class="label">Quadra</span><span class="value">{{ booking()!.courtName }}</span></div>
              @if (booking()!.sportLabel; as sport) {
                <div class="row"><span class="label">Esporte</span><span class="value">{{ sport }}</span></div>
              }
              <div class="row"><span class="label">Horário</span><span class="value">{{ booking()!.startTime }}–{{ booking()!.endTime }}</span></div>
              <div class="row"><span class="label">Código</span><span class="value">{{ displayBookingCode(booking()!.id) }}</span></div>
            </ar-panel-card>

            <ar-panel-card title="Pagamento">
              <div class="row"><span class="label">Valor</span><span class="value">{{ formatBRL(booking()!.amountReais) }}</span></div>
              <div class="row"><span class="label">Canal</span><span class="value">{{ channelLabel(booking()!.paymentChannel) }}</span></div>
              <div class="row"><span class="label">Situação</span><span class="value">{{ booking()!.paymentStatus ?? '—' }}</span></div>
              @if (professorDiscount(); as discount) {
                <!-- Desconto do vínculo do professor: substitui promoção e cupom (vale o menor preço). -->
                <div class="row">
                  <span class="label">Desconto professor</span>
                  <span class="value">{{ discount }}@if (booking()!.professorDiscountReais; as reais) { (-{{ formatBRL(reais) }})}</span>
                </div>
              }
              @if (booking()!.couponCode; as code) {
                <div class="row"><span class="label">Cupom</span><span class="value">{{ code }} (-{{ formatBRL(booking()!.couponDiscountReais) }})</span></div>
              }
            </ar-panel-card>

            <ar-panel-card title="Status" class="card-span">
              <div class="status-row">
                <ar-pill tone="dim">{{ statusLabel(booking()!.status) }}</ar-pill>
                <ar-pill [tone]="attendanceTone[booking()!.attendanceStatus] ?? 'dim'">{{ attendanceLabel(booking()!.attendanceStatus) }}</ar-pill>
              </div>

              <div class="actions">
                @if (showCheckIn()) {
                  <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="checkingIn() || readOnly()" (click)="checkIn()">
                    <ar-icon name="check" [size]="14" />
                    {{ checkingIn() ? 'Registrando…' : 'Fazer check-in' }}
                  </button>
                }
                @if (canChangeCourt()) {
                  <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="openCourtChange()">
                    <ar-icon name="courts" [size]="14" />
                    Trocar quadra
                  </button>
                }
                @if (booking()!.classSessionId; as classSessionId) {
                  <a class="ar-mini-btn" [routerLink]="['/painel/aulas/aula', classSessionId]">Abrir aula</a>
                }
                @if (canCancel()) {
                  <button type="button" class="ar-ghost-btn danger-link" [disabled]="readOnly()" (click)="showCancelConfirm.set(true)">
                    <ar-icon name="alert-triangle" [size]="14" />
                    Cancelar reserva
                  </button>
                }
              </div>
            </ar-panel-card>
          </div>
        }
      </div>

      @if (showCourtChange()) {
        <ar-modal (close)="closeCourtChange()">
          <h2 class="confirm-title">Trocar quadra</h2>
          <p class="confirm-body">
            A reserva continua a mesma — horário, valor e pagamento. Só a quadra muda@if (booking()!.athleteId) {, e o atleta recebe um aviso}.
          </p>

          @if (courtOptions().length === 0) {
            <p class="confirm-body">Nenhuma outra quadra ativa deste esporte.</p>
          } @else {
            <div class="field-label">Nova quadra</div>
            <div class="court-options" role="radiogroup" aria-label="Nova quadra">
              @for (court of courtOptions(); track court.id) {
                <label class="court-option" [class.selected]="targetCourtId() === court.id">
                  <input
                    type="radio"
                    name="target-court"
                    [value]="court.id"
                    [checked]="targetCourtId() === court.id"
                    (change)="targetCourtId.set(court.id)"
                  />
                  <span>{{ court.name }}</span>
                </label>
              }
            </div>
          }

          <div class="field-label">Motivo (opcional)</div>
          <input
            type="text"
            class="input-box"
            placeholder="Ex.: quadra 3 com a rede quebrada"
            [value]="courtChangeReason()"
            (input)="courtChangeReason.set($any($event.target).value)"
          />

          @if (courtChangeError(); as err) {
            <div class="error-banner modal-error">{{ err }}</div>
          }

          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="changingCourt()" (click)="closeCourtChange()">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="changingCourt() || !targetCourtId()" (click)="changeCourt()">
              {{ changingCourt() ? 'Trocando…' : 'Trocar quadra' }}
            </button>
          </div>
        </ar-modal>
      }

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
    .success-banner,
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

    .success-banner {
      border: 1px solid var(--nx-success);
      background: rgba(47, 179, 107, 0.1);
      color: var(--nx-text);
    }

    .modal-error {
      margin-bottom: 16px;
    }

    .court-options {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
      margin-bottom: 22px;
    }

    .court-option {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      font-size: 13.5px;
      cursor: pointer;
    }

    .court-option.selected {
      border-color: var(--nx-orange-500);
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
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

    .undo-link:disabled {
      opacity: 0.5;
      cursor: default;
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
  private readonly access = inject(ArenaAccessService);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  /** Cargo com leitura mas sem escrita em `agenda` (manutenção): check-in/cancelamento
   *  ficam indisponíveis — só visualizar a reserva segue liberado. */
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));

  protected readonly attendanceTone = ATTENDANCE_TONE;
  protected readonly formatBRL = formatBRL;
  protected readonly attendanceLabel = attendanceLabel;
  protected readonly statusLabel = bookingStatusLabel;
  protected readonly displayBookingCode = displayBookingCode;
  protected readonly channelLabel = bookingChannelLabel;

  protected readonly loading = signal(true);
  protected readonly booking = signal<ArenaBooking | null>(null);
  protected readonly courts = signal<readonly ArenaCourt[]>([]);
  protected readonly courtNames = computed<ReadonlyMap<string, string>>(
    () => new Map(this.courts().map((c) => [c.id, c.name])),
  );
  protected readonly athleteLabel = signal<string | null>(null);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly checkingIn = signal(false);
  protected readonly canceling = signal(false);
  protected readonly showCancelConfirm = signal(false);
  protected readonly cancelReason = signal('');
  protected readonly successMessage = signal<string | null>(null);

  protected readonly showCourtChange = signal(false);
  protected readonly targetCourtId = signal<string | null>(null);
  protected readonly courtChangeReason = signal('');
  protected readonly changingCourt = signal(false);
  protected readonly courtChangeError = signal<string | null>(null);

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

  protected readonly canChangeCourt = computed(() => {
    const b = this.booking();
    return b != null && bookingCanChangeCourt(b) && this.undoDeadlineMs() == null;
  });

  protected readonly courtOptions = computed(() => {
    const b = this.booking();
    return b ? courtChangeOptions(b, this.courts()) : [];
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

  /** Reserva feita como professor: "Professor · equipe da arena" / "Professor · independente". */
  protected readonly professorDiscount = computed(() => {
    const b = this.booking();
    return b ? professorDiscountLabel(b) : null;
  });
  protected readonly professorLabel = computed(() => {
    const b = this.resolvedBooking();
    return b ? professorBookingLabel(b) : null;
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
      void fetchCourtsList(db, arenaId).then((courts) => this.courts.set(courts));
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
    if (!b || this.readOnly()) return;
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
    if (!b || !arenaId || this.readOnly()) return;
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

  protected openCourtChange(): void {
    if (this.readOnly()) return;
    const options = this.courtOptions();
    this.targetCourtId.set(options.length === 1 ? options[0]!.id : null);
    this.courtChangeReason.set('');
    this.courtChangeError.set(null);
    this.successMessage.set(null);
    this.showCourtChange.set(true);
  }

  protected closeCourtChange(): void {
    if (this.changingCourt()) return;
    this.showCourtChange.set(false);
  }

  protected async changeCourt(): Promise<void> {
    const b = this.booking();
    const toCourtId = this.targetCourtId();
    if (!b || !toCourtId || this.readOnly()) return;
    this.changingCourt.set(true);
    this.courtChangeError.set(null);
    try {
      const result = await changeBookingCourt(arenaFunctions(), {
        bookingId: b.id,
        toCourtId,
        reason: this.courtChangeReason().trim() || null,
      });
      this.showCourtChange.set(false);
      this.successMessage.set(
        b.athleteId ? `Reserva movida para ${result.courtName}. O atleta foi avisado.` : `Reserva movida para ${result.courtName}.`,
      );
    } catch (err) {
      this.courtChangeError.set(err instanceof Error ? err.message : 'Não foi possível trocar a quadra.');
    } finally {
      this.changingCourt.set(false);
    }
  }

  protected async restore(): Promise<void> {
    const b = this.booking();
    const arenaId = this.arenaContext.arenaId();
    if (!b || !arenaId || this.readOnly()) return;
    this.errorMessage.set(null);
    try {
      await restoreBookingByManager(arenaFirestore(), b.id, arenaId);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível desfazer o cancelamento.');
    }
  }
}

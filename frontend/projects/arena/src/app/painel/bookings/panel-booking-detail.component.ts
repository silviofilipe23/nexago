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
import { bookingCanChangeCourt, changeBookingCourt, clubSessionDayLabel, courtAssignOptions } from './booking-court-change';
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
              @if (unassigned()) {
                <div class="row"><span class="label">Quadra</span><span class="value"><ar-pill tone="yellow">A definir</ar-pill></span></div>
                <div class="row"><span class="label">Provisória</span><span class="value">{{ resolvedBooking()!.courtName }}</span></div>
              } @else {
                <div class="row"><span class="label">Quadra</span><span class="value">{{ resolvedBooking()!.courtName }}</span></div>
              }
              @if (booking()!.sportLabel; as sport) {
                <div class="row"><span class="label">Esporte</span><span class="value">{{ sport }}</span></div>
              }
              <div class="row"><span class="label">Horário</span><span class="value">{{ booking()!.startTime }}–{{ booking()!.endTime }}</span></div>
              <div class="row"><span class="label">Código</span><span class="value">{{ displayBookingCode(booking()!.id) }}</span></div>
              @if (unassigned()) {
                <p class="notice">
                  <ar-icon name="alert-triangle" [size]="14" />
                  <span>A recepção define a quadra na chegada. Até lá a reserva segura a <strong>{{ resolvedBooking()!.courtName }}</strong> como provisória — o sistema pode trocá-la se uma aula, um plano ou outra reserva precisar dela.</span>
                </p>
              }
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
              @if (booking()!.athletePricingLabel; as tierLabel) {
                <!-- Preço por perfil (aluno/professor validado pela arena): não acumula com promoção e cupom. -->
                <div class="row">
                  <span class="label">Preço por perfil</span>
                  <span class="value">{{ tierLabel }}@if (booking()!.athletePricingDiscountReais; as reais) { (-{{ formatBRL(reais) }})}</span>
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
                  <button
                    type="button"
                    class="ar-mini-btn"
                    [class.ar-mini-btn-primary]="unassigned()"
                    [disabled]="readOnly()"
                    (click)="openCourtChange()"
                  >
                    <ar-icon name="courts" [size]="14" />
                    {{ unassigned() ? 'Definir quadra' : 'Trocar quadra' }}
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
          <h2 class="confirm-title">{{ unassigned() ? 'Definir quadra' : 'Trocar quadra' }}</h2>
          <p class="confirm-body modal-sub">
            {{ booking()!.startTime }}–{{ booking()!.endTime }}@if (booking()!.sportLabel; as sport) { · {{ sport }}} · {{ customerLabel() }}
          </p>

          @if (courtOptions().length === 0) {
            <p class="confirm-body">Nenhuma outra quadra ativa deste esporte.</p>
          } @else {
            <div class="field-label">{{ booking()!.sportLabel ? 'Quadras de ' + booking()!.sportLabel : 'Quadras' }}</div>
            <div class="court-grid" role="radiogroup" [attr.aria-label]="unassigned() ? 'Quadra' : 'Nova quadra'">
              @for (option of courtOptions(); track option.court.id) {
                <label
                  class="court-tile"
                  [class.provisional]="option.provisional"
                  [class.selected]="targetCourtId() === option.court.id"
                >
                  <input
                    type="radio"
                    name="target-court"
                    [value]="option.court.id"
                    [checked]="targetCourtId() === option.court.id"
                    (change)="targetCourtId.set(option.court.id)"
                  />
                  <span class="tile-name">{{ option.court.name }}</span>
                  <span class="tile-tag">{{ targetCourtId() === option.court.id ? 'selecionada' : option.provisional ? 'provisória' : '' }}</span>
                </label>
              }
            </div>
            <p class="modal-hint">
              Se a quadra estiver ocupada nesse horário, o sistema avisa ao confirmar. Outra reserva sem quadra definida que estiver nela vai para uma quadra livre.
            </p>
            @if (booking()!.clubSessionId) {
              <p class="notice club-scope" data-testid="club-court-change-scope">
                <ar-icon name="alert-triangle" [size]="14" />
                <span>Muda só a sessão de <strong>{{ clubDay() }}</strong>. As próximas seguem nas quadras do clubinho.</span>
              </p>
            }
          }

          <div class="field-label">Motivo (opcional)</div>
          <input
            type="text"
            class="input-box"
            placeholder="Ex.: quadra 3 com a rede quebrada"
            [value]="courtChangeReason()"
            (input)="courtChangeReason.set($any($event.target).value)"
          />

          @if (booking()!.clubSessionId && targetCourtName(); as name) {
            <p class="notice notice-info">
              <ar-icon name="bell" [size]="14" />
              <span>Os participantes do clubinho recebem um aviso: “{{ booking()!.courtName }} mudou para {{ name }}”.</span>
            </p>
          }
          @if (booking()!.athleteId && targetCourtName(); as name) {
            <p class="notice notice-info">
              <ar-icon name="bell" [size]="14" />
              <span>O atleta recebe um aviso: “Sua quadra: {{ name }}”.</span>
            </p>
          }

          @if (courtChangeError(); as err) {
            <div class="error-banner modal-error">{{ err }}</div>
          }

          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="changingCourt()" (click)="closeCourtChange()">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="changingCourt() || !targetCourtId()" (click)="changeCourt()">
              <ar-icon name="check" [size]="14" />
              {{ changingCourt() ? 'Salvando…' : targetCourtName() ? 'Confirmar ' + targetCourtName() : 'Confirmar' }}
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
      border: 1px solid var(--nx-win);
      background: rgba(47, 179, 107, 0.1);
      color: var(--nx-text);
    }

    .modal-error {
      margin-bottom: 16px;
    }

    .modal-sub {
      margin-bottom: 18px;
    }

    .court-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
      gap: 8px;
    }

    .court-tile {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      min-height: 56px;
      padding: 0 12px;
      border-radius: 12px;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      cursor: pointer;
    }

    .court-tile input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
    }

    .court-tile:focus-within {
      outline: 2px solid var(--nx-orange-500);
      outline-offset: 2px;
    }

    .tile-name {
      font-size: 13px;
      font-weight: 600;
    }

    .tile-tag {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .court-tile.provisional {
      border-style: dashed;
      border-color: rgba(244, 197, 67, 0.55);
    }

    .court-tile.provisional .tile-tag {
      color: #f4c543;
    }

    .court-tile.selected {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
      color: #0a0a0a;
    }

    .court-tile.selected .tile-tag {
      color: rgba(10, 10, 10, 0.7);
    }

    .modal-hint {
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
      margin: 10px 0 18px;
    }

    .notice {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin: 14px 0 0;
      padding: 12px 14px;
      border-radius: var(--nx-r-2);
      border: 1px solid rgba(244, 197, 67, 0.3);
      background: rgba(244, 197, 67, 0.06);
      color: var(--nx-text-mute);
      font-size: 12.5px;
      line-height: 1.5;
    }

    .notice strong {
      color: var(--nx-text);
    }

    .club-scope {
      margin: 0 0 14px;
    }

    .notice-info {
      margin: 0 0 18px;
      border-color: var(--nx-line);
      background: var(--nx-surface-1);
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

  /** Reserva no modo "a arena define a quadra" ainda sem quadra definida. */
  protected readonly unassigned = computed(() => this.booking()?.allocationStatus === 'unassigned');
  /** Dia da sessão do clubinho ("sex, 14/11"): a troca vale só para ela. */
  protected readonly clubDay = computed(() => clubSessionDayLabel(this.booking()?.dateKey ?? ''));

  protected readonly courtOptions = computed(() => {
    const b = this.booking();
    return b ? courtAssignOptions(b, this.courts()) : [];
  });

  protected readonly targetCourtName = computed(() => {
    const id = this.targetCourtId();
    return this.courtOptions().find((o) => o.court.id === id)?.court.name ?? null;
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
    if (!b) return '';
    const court = b.allocationStatus === 'unassigned' ? 'Quadra a definir' : b.courtName;
    return `${court} · ${b.dateKey} · ${b.startTime}–${b.endTime}`;
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
    this.targetCourtId.set(options.length === 1 ? options[0]!.court.id : null);
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
      const done = result.assigned ? `Quadra definida: ${result.courtName}.` : `Reserva movida para ${result.courtName}.`;
      this.successMessage.set(b.athleteId && result.changed ? `${done} O atleta foi avisado.` : done);
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

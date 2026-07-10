import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { initialsOf } from '../ui/initials';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type ReservationStatus = 'confirmada' | 'pendente' | 'cancelada';
type PaymentStatus = 'pago' | 'pendente';

interface TimelineEvent {
  time: string;
  date: string;
  description: string;
}

interface ReservationDetail {
  code: string;
  status: ReservationStatus;
  sport: string;
  court: string;
  dateLabel: string;
  timeStart: string;
  timeEnd: string;
  clientName: string;
  clientVisitLabel: string;
  participants: string[];
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  slotValue: number;
  timeline: TimelineEvent[];
  createdLabel: string;
}

const STATUS_LABEL: Record<ReservationStatus, string> = {
  confirmada: 'Confirmada',
  pendente: 'Pendente',
  cancelada: 'Cancelada',
};

const STATUS_TONE: Record<ReservationStatus, PillTone> = {
  confirmada: 'green',
  pendente: 'yellow',
  cancelada: 'dim',
};

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pago: 'Pago',
  pendente: 'Pendente',
};

const PAYMENT_TONE: Record<PaymentStatus, PillTone> = {
  pago: 'green',
  pendente: 'yellow',
};

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

const MOCK_RESERVATIONS: Record<string, ReservationDetail> = {
  r1: {
    code: 'NXG-04296',
    status: 'confirmada',
    sport: 'Beach Tennis',
    court: 'Quadra 1',
    dateLabel: 'Ter · 07 Jul 2026',
    timeStart: '09:00',
    timeEnd: '10:00',
    clientName: 'João Silveira',
    clientVisitLabel: '7ª reserva nesta arena',
    participants: ['Pedro Alves'],
    paymentStatus: 'pago',
    paymentMethod: 'Cartão de crédito',
    slotValue: 98,
    timeline: [
      { time: '08:02', date: '02 Jul', description: 'Reserva criada pelo cliente' },
      { time: '08:05', date: '02 Jul', description: 'Pagamento confirmado · Cartão' },
      { time: '09:00', date: '07 Jul', description: 'Lembrete enviado ao cliente' },
    ],
    createdLabel: 'Criada em 02 Jul, 08:02 pelo app',
  },
  r2: {
    code: 'NXG-04297',
    status: 'confirmada',
    sport: 'Vôlei de praia',
    court: 'Quadra 2',
    dateLabel: 'Ter · 07 Jul 2026',
    timeStart: '10:00',
    timeEnd: '11:00',
    clientName: 'Maria Tavares',
    clientVisitLabel: '5ª reserva nesta arena',
    participants: ['Ana Beatriz', 'Lucas Prado', 'Diego Farias'],
    paymentStatus: 'pago',
    paymentMethod: 'Pix',
    slotValue: 60,
    timeline: [
      { time: '19:40', date: '04 Jul', description: 'Reserva criada pelo cliente' },
      { time: '19:41', date: '04 Jul', description: 'Pagamento confirmado · Pix' },
    ],
    createdLabel: 'Criada em 04 Jul, 19:40 pelo app',
  },
  r3: {
    code: 'NXG-04298',
    status: 'confirmada',
    sport: 'Beach Tennis',
    court: 'Quadra 1',
    dateLabel: 'Ter · 07 Jul 2026',
    timeStart: '11:30',
    timeEnd: '12:30',
    clientName: 'Enzo Ribeiro',
    clientVisitLabel: '3ª reserva nesta arena',
    participants: ['Rafael Souza'],
    paymentStatus: 'pago',
    paymentMethod: 'Pix',
    slotValue: 60,
    timeline: [
      { time: '14:20', date: '05 Jul', description: 'Reserva criada pelo cliente' },
      { time: '14:21', date: '05 Jul', description: 'Pagamento confirmado · Pix' },
      { time: '09:00', date: '07 Jul', description: 'Lembrete enviado ao cliente' },
    ],
    createdLabel: 'Criada em 05 Jul, 14:20 pelo app',
  },
  r4: {
    code: 'NXG-04299',
    status: 'confirmada',
    sport: 'Vôlei de praia',
    court: 'Quadra 2',
    dateLabel: 'Ter · 07 Jul 2026',
    timeStart: '14:00',
    timeEnd: '15:00',
    clientName: 'Camila Santoro',
    clientVisitLabel: '2ª reserva nesta arena',
    participants: [],
    paymentStatus: 'pago',
    paymentMethod: 'Cartão de crédito',
    slotValue: 60,
    timeline: [
      { time: '11:10', date: '06 Jul', description: 'Reserva criada pelo cliente' },
      { time: '11:12', date: '06 Jul', description: 'Pagamento confirmado · Cartão' },
    ],
    createdLabel: 'Criada em 06 Jul, 11:10 pelo app',
  },
  r5: {
    code: 'NXG-04300',
    status: 'confirmada',
    sport: 'Beach Tennis',
    court: 'Quadra 1',
    dateLabel: 'Ter · 07 Jul 2026',
    timeStart: '16:00',
    timeEnd: '17:30',
    clientName: 'Bruno Vasconcelos',
    clientVisitLabel: '12ª reserva nesta arena',
    participants: ['Thiago Nunes'],
    paymentStatus: 'pago',
    paymentMethod: 'Pix',
    slotValue: 132,
    timeline: [
      { time: '20:05', date: '01 Jul', description: 'Reserva criada pelo cliente' },
      { time: '20:06', date: '01 Jul', description: 'Pagamento confirmado · Pix' },
    ],
    createdLabel: 'Criada em 01 Jul, 20:05 pelo app',
  },
  r6: {
    code: 'NXG-04301',
    status: 'pendente',
    sport: 'Vôlei de praia',
    court: 'Quadra 2',
    dateLabel: 'Ter · 07 Jul 2026',
    timeStart: '18:00',
    timeEnd: '19:00',
    clientName: 'Júlia Pereira',
    clientVisitLabel: '1ª reserva nesta arena',
    participants: [],
    paymentStatus: 'pendente',
    paymentMethod: 'Pix',
    slotValue: 60,
    timeline: [
      { time: '09:52', date: '07 Jul', description: 'Reserva criada pelo cliente' },
      { time: '09:52', date: '07 Jul', description: 'Aguardando pagamento' },
    ],
    createdLabel: 'Criada em 07 Jul, 09:52 pelo app',
  },
};

/** Tela Detalhe da reserva (protótipo ArReservaDetalhe): horário, cliente, pagamento e linha do tempo. */
@Component({
  selector: 'ar-panel-reservation-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="headerTitle()" [subtitle]="subtitleLabel()">
        @if (reservation(); as r) {
          <div class="header-actions">
            <button type="button" class="cancel-link" [disabled]="status() === 'cancelada'" (click)="cancelReservation()">
              <ar-icon name="alert-triangle" [size]="14" />
              Cancelar reserva
            </button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="status() === 'confirmada'" (click)="confirmReservation()">
              <ar-icon name="check" [size]="14" />
              Confirmar
            </button>
          </div>
        }
      </ar-page-header>

      @if (reservation(); as r) {
        <div class="body">
          <div class="main">
            <ar-panel-card kicker="Horário reservado">
              <div class="time-row">
                <div class="time-value">{{ r.timeStart }}–{{ r.timeEnd }}</div>
                <ar-pill [tone]="statusTone[status()]">{{ statusLabel[status()] }}</ar-pill>
              </div>
              <div class="time-sub">{{ r.court }} · {{ r.sport }}</div>
            </ar-panel-card>

            <ar-panel-card title="Cliente e participantes">
              <div class="client-row">
                <div class="client-avatar" aria-hidden="true"></div>
                <div class="client-body">
                  <div class="client-name">{{ r.clientName }}</div>
                  <div class="client-meta">{{ r.clientVisitLabel }}</div>
                </div>
              </div>
              @if (r.participants.length) {
                <div class="section-divider"></div>
                <div class="participants-kicker">Também participam</div>
                <div class="participants-row">
                  @for (p of r.participants; track p) {
                    <div class="participant-chip">
                      <span class="participant-avatar">{{ initialsOf(p) }}</span>
                      {{ p }}
                    </div>
                  }
                </div>
              }
            </ar-panel-card>

            <ar-panel-card title="Linha do tempo">
              <div class="timeline">
                @for (ev of r.timeline; track ev.time + ev.date; let last = $last) {
                  <div class="timeline-row">
                    <div class="timeline-marker">
                      <span class="timeline-dot"></span>
                      @if (!last) {
                        <span class="timeline-line"></span>
                      }
                    </div>
                    <div class="timeline-body">
                      <div class="timeline-time">{{ ev.time }} · {{ ev.date }}</div>
                      <div class="timeline-desc">{{ ev.description }}</div>
                    </div>
                  </div>
                }
              </div>
            </ar-panel-card>
          </div>

          <div class="side">
            <ar-panel-card title="Pagamento">
              <ar-pill [tone]="paymentTone[r.paymentStatus]" card-actions>{{ paymentLabel[r.paymentStatus] }}</ar-pill>
              <div class="kv-row">
                <span class="kv-label">Forma de pagamento</span>
                <span class="kv-value">{{ r.paymentMethod }}</span>
              </div>
              <div class="kv-row">
                <span class="kv-label">Valor do slot</span>
                <span class="kv-value">{{ formatBRL(r.slotValue) }}</span>
              </div>
              <div class="section-divider"></div>
              <div class="kv-row total-row">
                <span class="kv-label">Total</span>
                <span class="total-value">{{ formatBRL(r.slotValue) }}</span>
              </div>
            </ar-panel-card>

            <ar-panel-card title="Detalhes">
              <div class="kv-row">
                <span class="kv-label">Código</span>
                <span class="kv-value code-value">{{ r.code }}</span>
              </div>
              <div class="kv-row">
                <span class="kv-label">Quadra</span>
                <span class="kv-value">{{ r.court }}</span>
              </div>
              <div class="created-note">{{ r.createdLabel }}</div>
            </ar-panel-card>

            <button type="button" class="action-btn">
              <ar-icon name="bookmark" [size]="15" />
              Abrir comanda desta reserva
            </button>
            <button type="button" class="action-btn">
              <ar-icon name="clock" [size]="15" />
              Reagendar
            </button>
          </div>
        </div>
      } @else {
        <div class="body">
          <ar-panel-card>
            <div class="empty-state">Reserva não encontrada.</div>
          </ar-panel-card>
        </div>
      }
    </ar-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 22px;
    }

    .cancel-link {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-live);
    }

    .cancel-link:hover:not(:disabled) {
      text-decoration: underline;
    }

    .cancel-link:disabled {
      color: var(--nx-text-dim);
      cursor: default;
    }

    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
      overflow: auto;
    }

    .main,
    .side {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .time-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .time-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 34px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .time-sub {
      margin-top: 6px;
      font-size: 13px;
      color: var(--nx-text-dim);
    }

    .client-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .client-avatar {
      width: 48px;
      height: 48px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .client-body {
      min-width: 0;
    }

    .client-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14.5px;
      color: var(--nx-text);
    }

    .client-meta {
      margin-top: 2px;
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    .section-divider {
      height: 1px;
      background: var(--nx-line);
      margin: 16px 0 14px;
    }

    .participants-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .participants-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .participant-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 12px 0 6px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .participant-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 9.5px;
      color: var(--nx-orange-500);
    }

    .timeline {
      display: flex;
      flex-direction: column;
    }

    .timeline-row {
      display: flex;
      gap: 12px;
    }

    .timeline-marker {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 8px;
      flex: none;
    }

    .timeline-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      flex: none;
      margin-top: 4px;
    }

    .timeline-line {
      flex: 1;
      width: 1px;
      background: var(--nx-line-strong);
      margin-top: 2px;
      min-height: 20px;
    }

    .timeline-body {
      flex: 1;
      padding-bottom: 18px;
    }

    .timeline-row:last-child .timeline-body {
      padding-bottom: 0;
    }

    .timeline-time {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text);
    }

    .timeline-desc {
      margin-top: 3px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .kv-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
    }

    .kv-label {
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .kv-value {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      font-weight: 600;
      color: var(--nx-text);
    }

    .code-value {
      color: var(--nx-orange-500);
    }

    .total-row {
      padding-top: 12px;
    }

    .total-row .kv-label {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .total-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
    }

    .created-note {
      margin-top: 10px;
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    .action-btn {
      height: 44px;
      padding: 0 14px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      width: 100%;
      transition: all 140ms var(--nx-ease-out);
    }

    .action-btn:hover {
      background: var(--nx-surface-2);
    }

    .empty-state {
      padding: 40px 0;
      text-align: center;
      color: var(--nx-text-dim);
      font-size: 13px;
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelReservationDetailComponent {
  readonly id = input.required<string>();

  protected readonly initialsOf = initialsOf;
  protected readonly formatBRL = formatBRL;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly paymentLabel = PAYMENT_LABEL;
  protected readonly paymentTone = PAYMENT_TONE;

  protected readonly reservation = computed(() => MOCK_RESERVATIONS[this.id()] ?? null);

  protected readonly status = linkedSignal<ReservationStatus>(
    () => this.reservation()?.status ?? 'confirmada',
  );

  protected readonly headerTitle = computed(() => {
    const r = this.reservation();
    return r ? `Reserva #${r.code}` : 'Reserva não encontrada';
  });

  protected readonly subtitleLabel = computed(() => {
    const r = this.reservation();
    return r ? `${r.court} · ${r.sport} · ${r.dateLabel}` : '';
  });

  protected confirmReservation(): void {
    this.status.set('confirmada');
  }

  protected cancelReservation(): void {
    this.status.set('cancelada');
  }
}

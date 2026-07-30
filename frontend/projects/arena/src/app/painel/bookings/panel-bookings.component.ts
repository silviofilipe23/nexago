import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  BOOKING_VIEW_MODE_LABEL,
  attendanceLabel,
  bookingIsActive,
  bookingStatusLabel,
  displayBookingCode,
  enrichCourtName,
  formatBRL,
  sectionTitleForDateKey,
  type ArenaBooking,
  type ArenaBookingViewMode,
} from './arena-booking.model';
import { resolveAthleteLabel, watchBookingsForArena } from './bookings-repository';
import { fetchCourtsList } from '../courts/courts-repository';

const VIEW_MODES: ArenaBookingViewMode[] = ['today', 'tomorrow', 'upcoming', 'past'];

const ATTENDANCE_TONE: Record<string, PillTone | undefined> = {
  checked_in: 'green',
  confirmed: 'orange',
  no_show: 'red',
  pending: 'dim',
};

interface BookingSection {
  dateKey: string;
  title: string;
  bookings: ArenaBooking[];
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Tela Reservas: reservas reais de `arenaBookings`, distinta da Agenda (grade de horários).
 *  Espelha as 4 abas do painel do gestor no Flutter (Hoje/Amanhã/Futuras/Passadas). */
@Component({
  selector: 'ar-panel-bookings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Reservas" [subtitle]="headerSubtitle()" />

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
          </ar-panel-card>
        } @else if (arenaLoading() || loading()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando reservas…</p>
          </ar-panel-card>
        } @else {
          <div class="summary-row">
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">{{ modeLabel[mode()] }}</div>
              <div class="summary-value">{{ visibleBookings().length }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Faturamento no período</div>
              <div class="summary-value tone-green">{{ formatBRL(periodTotalReais()) }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-dim">Recorrentes (mensalista)</div>
              <div class="summary-value">{{ recurringCount() }}</div>
            </ar-panel-card>
          </div>

          <ar-panel-card [kicker]="listKicker()" title="Reservas" class="table-card">
            <div class="ar-filter-bar" card-actions>
              @for (m of viewModes; track m) {
                <button type="button" class="ar-chip" [class.active]="mode() === m" (click)="mode.set(m)">{{ modeLabel[m] }}</button>
              }
            </div>

            @if (visibleBookings().length === 0) {
              <p class="state-text empty-text">Nenhuma reserva por aqui.</p>
            } @else if (mode() === 'today' || mode() === 'tomorrow') {
              <div class="table-head">
                <span>Cliente</span>
                <span>Quadra / horário</span>
                <span class="right">Valor</span>
                <span>Check-in</span>
                <span>Status</span>
              </div>
              <div class="table-list">
                @for (b of visibleBookings(); track b.id) {
                  <div class="table-row" [class.row-canceled]="!bookingIsActive(b)" (click)="open(b.id)">
                    <div class="cell-client">{{ customerLabel(b) }}</div>
                    <div class="cell-slot">{{ b.courtName }} · {{ b.startTime }}–{{ b.endTime }}</div>
                    <div class="cell-amount right">{{ formatBRL(b.amountReais) }}</div>
                    <div><ar-pill [tone]="attendanceTone[b.attendanceStatus] ?? 'dim'">{{ attendanceLabel(b.attendanceStatus) }}</ar-pill></div>
                    <div class="cell-status" [class.status-canceled]="!bookingIsActive(b)">{{ statusLabel(b.status) }}</div>
                  </div>
                }
              </div>
            } @else {
              @for (section of groupedSections(); track section.dateKey) {
                <div class="section-head">
                  <span class="section-title">{{ section.title }}</span>
                  <span class="section-count">{{ section.bookings.length }} · {{ formatBRL(sectionTotal(section)) }}</span>
                </div>
                <div class="table-list section-list">
                  @for (b of section.bookings; track b.id) {
                    <div class="table-row" [class.row-canceled]="!bookingIsActive(b)" (click)="open(b.id)">
                      <div class="cell-client">{{ customerLabel(b) }}</div>
                      <div class="cell-slot">{{ b.courtName }} · {{ b.startTime }}–{{ b.endTime }}</div>
                      <div class="cell-amount right">{{ formatBRL(b.amountReais) }}</div>
                      <div><ar-pill [tone]="attendanceTone[b.attendanceStatus] ?? 'dim'">{{ attendanceLabel(b.attendanceStatus) }}</ar-pill></div>
                      <div class="cell-status" [class.status-canceled]="!bookingIsActive(b)">{{ statusLabel(b.status) }}</div>
                    </div>
                  }
                </div>
              }
            }
          </ar-panel-card>
        }
      </div>
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
      margin: 0 0 12px;
    }

    .empty-text {
      margin: 12px 0;
    }

    .summary-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .summary-card {
      flex: 1;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .summary-label.tone-orange {
      color: var(--nx-orange-500);
    }

    .summary-label.tone-dim {
      color: var(--nx-text-dim);
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .summary-value.tone-green {
      color: var(--nx-win);
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.3fr 1.6fr 110px 140px 110px;
      gap: 14px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-list {
      display: flex;
      flex-direction: column;
    }

    .table-row {
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);
      cursor: pointer;
      border-radius: var(--nx-r-2);
      transition: background 140ms var(--nx-ease-out);
    }

    .table-row:hover {
      background: var(--nx-surface-1);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .table-row.row-canceled {
      opacity: 0.55;
    }

    .cell-status.status-canceled {
      color: var(--nx-live);
    }

    .cell-client {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-slot,
    .cell-status {
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .cell-amount {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }

    .right {
      text-align: right;
    }

    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin: 18px 0 6px;
    }

    .section-head:first-child {
      margin-top: 4px;
    }

    .section-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .section-count {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .section-list {
      border-bottom: 1px solid var(--nx-line-strong);
      padding-bottom: 6px;
      margin-bottom: 4px;
    }

    @media (max-width: 1180px) {
      .summary-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelBookingsComponent {
  private readonly router = inject(Router);
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly viewModes = VIEW_MODES;
  protected readonly modeLabel = BOOKING_VIEW_MODE_LABEL;
  protected readonly attendanceTone = ATTENDANCE_TONE;
  protected readonly formatBRL = formatBRL;
  protected readonly attendanceLabel = attendanceLabel;
  protected readonly statusLabel = bookingStatusLabel;
  protected readonly bookingIsActive = bookingIsActive;
  protected readonly displayBookingCode = displayBookingCode;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly loading = signal(true);
  protected readonly bookings = signal<ArenaBooking[]>([]);
  protected readonly courtNames = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly athleteLabels = signal<Record<string, string>>({});
  protected readonly mode = signal<ArenaBookingViewMode>('today');

  private unsubscribeBookings: (() => void) | null = null;

  protected readonly enrichedBookings = computed(() => {
    const names = this.courtNames();
    return this.bookings().map((b) => enrichCourtName(b, names));
  });

  protected readonly visibleBookings = computed(() => {
    const all = this.enrichedBookings();
    const mode = this.mode();
    const today = todayKey();
    const tomorrow = tomorrowKey();

    if (mode === 'today') {
      return all.filter((b) => b.dateKey === today).sort(this.sortByStartTime);
    }
    if (mode === 'tomorrow') {
      return all.filter((b) => b.dateKey === tomorrow).sort(this.sortByStartTime);
    }
    if (mode === 'upcoming') {
      return all.filter((b) => b.dateKey.length >= 10 && b.dateKey > tomorrow);
    }
    return all.filter((b) => b.dateKey.length >= 10 && b.dateKey < today);
  });

  protected readonly groupedSections = computed<BookingSection[]>(() => {
    const list = this.visibleBookings();
    const byDate = new Map<string, ArenaBooking[]>();
    for (const b of list) {
      const arr = byDate.get(b.dateKey) ?? [];
      arr.push(b);
      byDate.set(b.dateKey, arr);
    }
    const ascending = this.mode() === 'upcoming';
    const keys = [...byDate.keys()].sort((a, c) => (ascending ? a.localeCompare(c) : c.localeCompare(a)));
    return keys.map((dateKey) => ({
      dateKey,
      title: sectionTitleForDateKey(dateKey),
      bookings: (byDate.get(dateKey) ?? []).sort(this.sortByStartTime),
    }));
  });

  protected readonly periodTotalReais = computed(() =>
    this.visibleBookings()
      .filter(bookingIsActive)
      .reduce((sum, b) => sum + (b.amountReais ?? 0), 0),
  );

  protected readonly recurringCount = computed(() => this.visibleBookings().filter((b) => bookingIsActive(b) && b.isRecurring).length);

  protected readonly listKicker = computed(() => `${this.visibleBookings().length} registros`);

  protected readonly headerSubtitle = computed(() => `${this.arenaContext.arenaName() ?? 'Arena'} · reservas em tempo real`);

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      this.unsubscribeBookings?.();
      this.unsubscribeBookings = null;
      if (!arenaId) return;

      this.loading.set(true);
      const db = arenaFirestore();
      void fetchCourtsList(db, arenaId).then((courts) => {
        this.courtNames.set(new Map(courts.map((c) => [c.id, c.name])));
      });
      this.unsubscribeBookings = watchBookingsForArena(db, arenaId, (list) => {
        this.bookings.set(list);
        this.loading.set(false);
        this.resolveMissingAthleteLabels(list);
      });
    });
  }

  private sortByStartTime = (a: ArenaBooking, b: ArenaBooking): number => a.startTime.localeCompare(b.startTime);

  private resolveMissingAthleteLabels(list: ArenaBooking[]): void {
    const known = this.athleteLabels();
    const missing = new Set(list.map((b) => b.athleteId).filter((id) => id && !(id in known)));
    if (missing.size === 0) return;
    const db = arenaFirestore();
    for (const athleteId of missing) {
      void resolveAthleteLabel(db, athleteId).then((label) => {
        this.athleteLabels.update((current) => ({ ...current, [athleteId]: label }));
      });
    }
  }

  protected customerLabel(booking: ArenaBooking): string {
    if (booking.customerName) return booking.customerName;
    if (!booking.athleteId) return 'Cliente';
    return this.athleteLabels()[booking.athleteId] ?? 'Carregando…';
  }

  protected sectionTotal(section: BookingSection): number {
    return section.bookings.filter(bookingIsActive).reduce((sum, b) => sum + (b.amountReais ?? 0), 0);
  }

  protected open(bookingId: string): void {
    void this.router.navigate(['/painel/reservas', bookingId]);
  }
}

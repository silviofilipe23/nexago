import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { fetchCourtsList } from '../courts/courts-repository';
import type { ArenaCourt } from '../courts/court.model';
import { bookingIsActive, dateKeyOf, type ArenaBooking } from '../bookings/arena-booking.model';
import { resolveAthleteLabel, watchBookingsForArena } from '../bookings/bookings-repository';
import { applyBookingsOverlay, applyScheduleFilters, scheduleDayStats, type ArenaScheduleStatusFilter } from './arena-schedule-grouping';
import { ARENA_SLOT_BLOCK_REASON_LABEL, ARENA_SLOT_BLOCK_REASONS, type ArenaSlot, type ArenaSlotBlockReason } from './arena-slot.model';
import { blockSlot, blockVirtualSlot, fetchCourtsRaw, unblockSlot, watchArenaDaySlots, watchArenaWeekSlots } from './schedule-repository';
import { weekDatesFor, type WeekDay } from './agenda-week-math';
import { AgendaGridComponent, type AgendaBlock, type AgendaBlockStatus, type AgendaCourt } from '../ui/agenda-grid.component';
import { AgendaWeekGridComponent, type AgendaWeekBlock } from '../ui/agenda-week-grid.component';
import { ChartTabsComponent } from '../ui/chart-tabs.component';
import { DatePickerComponent } from '../ui/date-picker.component';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type AgendaView = 'Dia' | 'Semana';

interface AgendaListRow {
  id: string;
  time: string;
  court: string;
  client: string;
  status: AgendaBlockStatus;
}

const STATUS_FILTERS: { id: ArenaScheduleStatusFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'available', label: 'Disponível' },
  { id: 'booked', label: 'Reservado' },
  { id: 'blocked', label: 'Bloqueado' },
];

const STATUS_LABEL: Record<AgendaBlockStatus, string> = {
  available: 'Disponível',
  confirmada: 'Confirmada',
  pendente: 'Pendente',
  bloqueado: 'Bloqueado',
  manutencao: 'Manutenção',
};

const STATUS_TONE: Record<AgendaBlockStatus, PillTone> = {
  available: 'dim',
  confirmada: 'green',
  pendente: 'yellow',
  bloqueado: 'orange',
  manutencao: 'dim',
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Tela Agenda do painel: grade de quadras × horário (07:00–22:00) com todos os horários do
 *  dia — disponíveis (clicáveis pra bloquear), reservados (`arenaBookings`) e bloqueados
 *  (`arenaSlots`) — espelhando `ArenaSchedulePage`/`VirtualSlotGenerator` (Flutter).
 *  Toggle "Dia"/"Semana" troca a grade de verdade (grid de 1 dia × quadras ou de 7 dias ×
 *  quadras), e o calendário no header seleciona qualquer data. Sem "Nova reserva": o Flutter
 *  também não tem criação de reserva pelo gestor em lugar nenhum (reserva é sempre iniciada
 *  pelo atleta na busca). */
@Component({
  selector: 'ar-panel-agenda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    ChartTabsComponent,
    PillComponent,
    IconComponent,
    ModalComponent,
    AgendaGridComponent,
    AgendaWeekGridComponent,
    DatePickerComponent,
  ],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Agenda de quadras" [subtitle]="subtitleLabel()">
        <div class="header-actions">
          <button type="button" class="ar-ghost-btn nav-btn" (click)="goToday()">Hoje</button>
          <button type="button" class="ar-ghost-btn nav-btn icon-btn" (click)="shiftDay(-1)">
            <ar-icon name="chevron-right" [size]="14" style="transform: rotate(180deg)" />
          </button>
          <ar-date-picker [selected]="selectedDateKey()" (dateChange)="onDateKeySelected($event)" />
          <button type="button" class="ar-ghost-btn nav-btn icon-btn" (click)="shiftDay(1)">
            <ar-icon name="chevron-right" [size]="14" />
          </button>
          <ar-chart-tabs [tabs]="views" [active]="view()" (change)="view.set($any($event))" />
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" disabled title="Em breve">
            <ar-icon name="plus" [size]="14" />
            Nova reserva
          </button>
        </div>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
          </ar-panel-card>
        } @else if (arenaLoading() || loading()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando agenda…</p>
          </ar-panel-card>
        } @else {
          <ar-panel-card class="grid-card">
            <div class="filters-row" card-actions>
              <div class="ar-filter-bar">
                @for (f of statusFilters; track f.id) {
                  <button type="button" class="ar-chip" [class.active]="statusFilter() === f.id" (click)="statusFilter.set(f.id)">
                    {{ f.label }}
                  </button>
                }
              </div>
              @if (courts().length > 1) {
                <select class="court-select" [value]="courtFilter() ?? ''" (change)="courtFilter.set($any($event.target).value || null)">
                  <option value="">Todas as quadras</option>
                  @for (c of courts(); track c.id) {
                    <option [value]="c.id">{{ c.name }}</option>
                  }
                </select>
              }
            </div>

            @if (courts().length === 0) {
              <p class="state-text">Nenhuma quadra cadastrada ainda.</p>
            } @else if (view() === 'Dia') {
              <ar-agenda-grid [courts]="agendaCourts()" [blocks]="agendaBlocks()" (blockClick)="onBlockClick($event)" />
            } @else {
              <ar-agenda-week-grid
                [weekDays]="weekDays()"
                [courts]="agendaCourts()"
                [blocks]="agendaWeekBlocks()"
                (blockClick)="onBlockClick($event)"
                (dayHeaderClick)="onDateKeySelected($event)"
              />
            }
          </ar-panel-card>

          <ar-panel-card title="Horários do dia" [kicker]="listKicker()" class="list-card">
            <div class="list">
              @for (r of listRows(); track r.id) {
                <div class="agenda-row" [class.clickable]="r.status !== 'manutencao'" (click)="r.status !== 'manutencao' && onBlockClick(r.id)">
                  <div class="agenda-time">{{ r.time }}</div>
                  <div class="agenda-body">
                    <div class="agenda-title">{{ r.court }}{{ r.client ? ' · ' + r.client : '' }}</div>
                  </div>
                  <ar-pill [tone]="statusTone[r.status]">{{ statusLabel[r.status] }}</ar-pill>
                </div>
              } @empty {
                <p class="state-text empty-text">Nenhum horário para este filtro.</p>
              }
            </div>
          </ar-panel-card>
        }
      </div>

      @if (blockTarget(); as target) {
        <ar-modal (close)="blockTarget.set(null)">
          <h2 class="modal-title">Bloquear horário</h2>
          <p class="modal-subtitle">
            {{ target.startTime }}–{{ target.endTime }} · {{ courtName(target.courtId) }}. Esse horário some da busca — ninguém consegue reservar.
          </p>

          @if (blockError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }

          <div class="field-label">Motivo</div>
          <div class="ar-filter-bar weekday-bar">
            @for (r of blockReasons; track r) {
              <button type="button" class="ar-chip" [class.active]="blockReason() === r" (click)="blockReason.set(r)">{{ blockReasonLabel[r] }}</button>
            }
          </div>

          <div class="field-label">Nota (opcional)</div>
          <input
            type="text"
            class="input-box"
            placeholder="Ex.: troca da rede + limpeza geral"
            [value]="blockNote()"
            (input)="blockNote.set($any($event.target).value)"
          />

          <div class="actions">
            <button type="button" class="ar-ghost-btn" [disabled]="blocking()" (click)="blockTarget.set(null)">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="blocking()" (click)="confirmBlock()">
              {{ blocking() ? 'Bloqueando…' : 'Bloquear horário' }}
            </button>
          </div>
        </ar-modal>
      }

      @if (unblockTarget(); as target) {
        <ar-modal (close)="unblockTarget.set(null)">
          <h2 class="confirm-title">Desbloquear horário?</h2>
          <p class="confirm-body">
            {{ target.startTime }}–{{ target.endTime }} · {{ courtName(target.courtId) }} volta a ficar disponível pra reserva.
          </p>
          @if (unblockError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="unblocking()" (click)="unblockTarget.set(null)">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="unblocking()" (click)="confirmUnblock()">
              {{ unblocking() ? 'Desbloqueando…' : 'Desbloquear horário' }}
            </button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .nav-btn {
      height: 34px;
      padding: 0 12px;
    }

    .icon-btn {
      width: 34px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
      min-height: 0;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .grid-card {
      min-height: 0;
      overflow: hidden;
    }

    .filters-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
    }

    .court-select {
      height: 32px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      padding: 0 10px;
    }

    .list-card {
      min-height: 0;
      overflow: hidden;
    }

    .list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
      margin-top: 2px;
    }

    .list::-webkit-scrollbar {
      display: none;
    }

    .empty-text {
      margin: 12px 0;
    }

    .agenda-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .agenda-row.clickable {
      cursor: pointer;
    }

    .agenda-row:last-child {
      border-bottom: none;
    }

    .agenda-time {
      width: 46px;
      flex: none;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .agenda-body {
      flex: 1;
      min-width: 0;
    }

    .agenda-title {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .modal-title,
    .confirm-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin: 0 0 10px;
    }

    .modal-subtitle {
      font-size: 13px;
      color: var(--nx-text-dim);
      margin: 4px 0 20px;
    }

    .confirm-body {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 22px;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
      margin-bottom: 16px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .weekday-bar {
      margin-bottom: 18px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
      margin-bottom: 18px;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .actions,
    .confirm-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelAgendaComponent {
  private readonly router = inject(Router);
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly views: AgendaView[] = ['Dia', 'Semana'];
  protected readonly view = signal<AgendaView>('Dia');

  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly statusFilter = signal<ArenaScheduleStatusFilter>('all');
  protected readonly courtFilter = signal<string | null>(null);
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly blockReasons = ARENA_SLOT_BLOCK_REASONS;
  protected readonly blockReasonLabel = ARENA_SLOT_BLOCK_REASON_LABEL;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly loading = signal(true);
  protected readonly courts = signal<ArenaCourt[]>([]);
  protected readonly courtsRaw = signal<{ id: string; data: Record<string, unknown> }[]>([]);
  private readonly courtsRawLoaded = signal(false);
  protected readonly bookings = signal<ArenaBooking[]>([]);
  protected readonly slots = signal<ArenaSlot[]>([]);
  protected readonly weekSlots = signal<ArenaSlot[]>([]);
  protected readonly athleteLabels = signal<Record<string, string>>({});
  protected readonly selectedDate = signal(new Date());

  protected readonly blockTarget = signal<ArenaSlot | null>(null);
  protected readonly blockReason = signal<ArenaSlotBlockReason>('manutencao');
  protected readonly blockNote = signal('');
  protected readonly blocking = signal(false);
  protected readonly blockError = signal<string | null>(null);

  protected readonly unblockTarget = signal<ArenaSlot | null>(null);
  protected readonly unblocking = signal(false);
  protected readonly unblockError = signal<string | null>(null);

  private unsubscribeBookings: (() => void) | null = null;
  private unsubscribeSlots: (() => void) | null = null;

  protected readonly selectedDateKey = computed(() => dateKeyOf(this.selectedDate()));

  protected readonly slotsWithOverlay = computed(() => applyBookingsOverlay(this.slots(), this.bookings()));

  protected readonly filteredSlots = computed(() => applyScheduleFilters(this.slotsWithOverlay(), this.statusFilter(), this.courtFilter()));

  protected readonly dayStats = computed(() => scheduleDayStats(this.slotsWithOverlay()));

  protected readonly weekDays = computed<WeekDay[]>(() => weekDatesFor(this.selectedDate()));

  protected readonly weekSlotsWithOverlay = computed(() => applyBookingsOverlay(this.weekSlots(), this.bookings()));

  protected readonly filteredWeekSlots = computed(() => applyScheduleFilters(this.weekSlotsWithOverlay(), this.statusFilter(), this.courtFilter()));

  protected readonly weekStats = computed(() => scheduleDayStats(this.filteredWeekSlots()));

  protected readonly agendaWeekBlocks = computed<AgendaWeekBlock[]>(() => {
    const blocks: AgendaWeekBlock[] = [];
    for (const s of this.filteredWeekSlots()) {
      const start = timeToMinutes(s.startTime);
      let end = timeToMinutes(s.endTime);
      if (end <= start) end += 24 * 60;
      blocks.push({ id: s.id, dateKey: s.dateKey, courtId: s.courtId, start, dur: end - start, status: this.slotStatusForBlock(s), client: this.clientLabelFor(s) });
    }
    return blocks;
  });

  protected readonly agendaCourts = computed<AgendaCourt[]>(() =>
    this.courts().map((c) => ({ id: c.id, name: c.name, sport: c.types.join(', ') || '—' })),
  );

  private bookingFor(slot: ArenaSlot): ArenaBooking | null {
    if (!slot.bookingId) return null;
    return this.bookings().find((b) => b.id === slot.bookingId) ?? null;
  }

  private slotStatusForBlock(slot: ArenaSlot): AgendaBlockStatus {
    if (slot.status === 'available') return 'available';
    if (slot.status === 'blocked') return 'bloqueado';
    const booking = this.bookingFor(slot);
    return booking?.status === 'pending_payment' ? 'pendente' : 'confirmada';
  }

  private clientLabelFor(slot: ArenaSlot): string {
    const booking = this.bookingFor(slot);
    if (!booking) return '';
    if (booking.customerName) return booking.customerName;
    if (!booking.athleteId) return 'Cliente';
    return this.athleteLabels()[booking.athleteId] ?? 'Carregando…';
  }

  protected readonly agendaBlocks = computed<AgendaBlock[]>(() => {
    const blocks: AgendaBlock[] = [];
    for (const s of this.filteredSlots()) {
      const start = timeToMinutes(s.startTime);
      let end = timeToMinutes(s.endTime);
      if (end <= start) end += 24 * 60;
      blocks.push({ id: s.id, courtId: s.courtId, start, dur: end - start, status: this.slotStatusForBlock(s), client: this.clientLabelFor(s) });
    }
    const showMaintenance = this.statusFilter() === 'all' || this.statusFilter() === 'blocked';
    if (showMaintenance) {
      for (const c of this.courts()) {
        if (c.status !== 'maintenance') continue;
        if (this.courtFilter() && this.courtFilter() !== c.id) continue;
        blocks.push({ id: `maint-${c.id}`, courtId: c.id, start: 7 * 60, dur: 15 * 60, status: 'manutencao', client: '' });
      }
    }
    return blocks;
  });

  protected readonly listRows = computed<AgendaListRow[]>(() => {
    const rows: AgendaListRow[] = this.filteredSlots().map((s) => ({
      id: s.id,
      time: s.startTime,
      court: this.courtName(s.courtId),
      client: this.clientLabelFor(s),
      status: this.slotStatusForBlock(s),
    }));
    const showMaintenance = this.statusFilter() === 'all' || this.statusFilter() === 'blocked';
    if (showMaintenance) {
      for (const c of this.courts()) {
        if (c.status !== 'maintenance') continue;
        if (this.courtFilter() && this.courtFilter() !== c.id) continue;
        rows.push({ id: `maint-${c.id}`, time: '—', court: c.name, client: 'Quadra em manutenção', status: 'manutencao' });
      }
    }
    rows.sort((a, b) => a.time.localeCompare(b.time));
    return rows;
  });

  protected readonly listKicker = computed(() => `${this.listRows().length} registros`);

  protected readonly subtitleLabel = computed(() => {
    if (this.view() === 'Semana') {
      const days = this.weekDays();
      const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
      const first = days[0]?.date;
      const last = days[6]?.date;
      const range = first && last ? `${fmt.format(first).replace('.', '')} – ${fmt.format(last).replace('.', '')}` : '';
      const stats = this.weekStats();
      return `${range} · ${stats.available} livres · ${stats.booked} reservados · ${stats.blocked} bloqueados`;
    }
    const d = this.selectedDate();
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '');
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d).replace('.', '');
    const stats = this.dayStats();
    return `${weekday} · ${date} · ${stats.available} livres · ${stats.booked} reservados · ${stats.blocked} bloqueados`;
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      this.unsubscribeBookings?.();
      this.unsubscribeBookings = null;
      if (!arenaId) return;

      this.loading.set(true);
      this.courtsRawLoaded.set(false);
      const db = arenaFirestore();
      void fetchCourtsList(db, arenaId).then((list) => this.courts.set(list));
      void fetchCourtsRaw(db, arenaId).then((list) => {
        this.courtsRaw.set(list);
        this.courtsRawLoaded.set(true);
      });
      this.unsubscribeBookings = watchBookingsForArena(db, arenaId, (list) => {
        this.bookings.set(list);
        this.resolveMissingAthleteLabels(list);
      });
    });

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const view = this.view();
      const courts = this.courtsRaw();
      const rawLoaded = this.courtsRawLoaded();
      this.unsubscribeSlots?.();
      this.unsubscribeSlots = null;
      if (!arenaId || !rawLoaded) return;
      if (courts.length === 0) {
        this.slots.set([]);
        this.weekSlots.set([]);
        this.loading.set(false);
        return;
      }

      const db = arenaFirestore();
      if (view === 'Dia') {
        const dateKey = this.selectedDateKey();
        const date = this.selectedDate();
        this.unsubscribeSlots = watchArenaDaySlots(db, arenaId, date, dateKey, courts, (list) => {
          this.slots.set(list);
          this.loading.set(false);
        });
      } else {
        this.unsubscribeSlots = watchArenaWeekSlots(db, arenaId, this.weekDays(), courts, (list) => {
          this.weekSlots.set(list);
          this.loading.set(false);
        });
      }
    });
  }

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

  protected courtName(courtId: string): string {
    return this.courts().find((c) => c.id === courtId)?.name ?? 'Quadra';
  }

  protected goToday(): void {
    this.selectedDate.set(new Date());
  }

  protected shiftDay(delta: number): void {
    const d = new Date(this.selectedDate());
    d.setDate(d.getDate() + delta);
    this.selectedDate.set(d);
  }

  protected onDateKeySelected(dateKey: string): void {
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!y || !m || !d) return;
    this.selectedDate.set(new Date(y, m - 1, d));
  }

  protected onBlockClick(id: string): void {
    if (id.startsWith('maint-')) return;
    const slot = this.filteredSlots().find((s) => s.id === id);
    if (!slot) return;

    if (slot.status === 'booked') {
      if (slot.bookingId) void this.router.navigate(['/painel/reservas', slot.bookingId]);
      return;
    }
    if (slot.status === 'available') {
      this.blockError.set(null);
      this.blockReason.set('manutencao');
      this.blockNote.set('');
      this.blockTarget.set(slot);
      return;
    }
    if (slot.status === 'blocked') {
      this.unblockError.set(null);
      this.unblockTarget.set(slot);
    }
  }

  protected async confirmBlock(): Promise<void> {
    const slot = this.blockTarget();
    if (!slot) return;
    this.blocking.set(true);
    this.blockError.set(null);
    try {
      const db = arenaFirestore();
      if (slot.isVirtual) {
        await blockVirtualSlot(db, slot, this.blockReason(), this.blockNote());
      } else {
        await blockSlot(db, slot.id, this.blockReason(), this.blockNote());
      }
      this.blockTarget.set(null);
    } catch (err) {
      this.blockError.set(err instanceof Error ? err.message : 'Não foi possível bloquear o horário.');
    } finally {
      this.blocking.set(false);
    }
  }

  protected async confirmUnblock(): Promise<void> {
    const slot = this.unblockTarget();
    if (!slot) return;
    this.unblocking.set(true);
    this.unblockError.set(null);
    try {
      await unblockSlot(arenaFirestore(), slot.id);
      this.unblockTarget.set(null);
    } catch (err) {
      this.unblockError.set(err instanceof Error ? err.message : 'Não foi possível desbloquear o horário.');
    } finally {
      this.unblocking.set(false);
    }
  }
}

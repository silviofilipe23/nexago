import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { fetchCourtsList } from '../courts/courts-repository';
import { bookingAllocationFromArena } from '../courts/booking-allocation';
import type { ArenaCourt } from '../courts/court.model';
import { dateKeyOf, type ArenaBooking } from '../bookings/arena-booking.model';
import { bookingCanChangeCourt, changeBookingCourt, courtAssignOptions } from '../bookings/booking-court-change';
import {
  checkInBookingByManager,
  markNoShowByManager,
  resolveAthleteLabel,
  watchBookingsForArenaInRange,
} from '../bookings/bookings-repository';
import { applyBookingsOverlay } from './arena-schedule-grouping';
import type { ArenaSlot } from './arena-slot.model';
import {
  bookingCanCheckInNow,
  bookingCanMarkNoShow,
  buildBoard,
  buildCapacityHours,
  capacityCourts,
  dropBlockReason,
  hourBookings,
  hourSummary,
  provisionalBookings,
  type BoardTile,
} from './capacity-hours';
import { fetchCourtsRaw, watchArenaDaySlots } from './schedule-repository';
import { DatePickerComponent } from '../ui/date-picker.component';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';

type HoursTab = 'Lista' | 'Quadro';

/** Agenda → Por horário (`docs/product/reservas-por-capacidade.md`, PR 5; canvas "Reservas por
 *  capacidade" 04–06). Horários do dia com a ocupação das quadras da distribuição; no horário
 *  escolhido, a lista (Definir quadra, Chegou, Faltou) e o quadro (arrastar troca a quadra).
 *  Toda troca passa pela callable `changeArenaBookingCourt`, que confere tudo de novo. */
@Component({
  selector: 'ar-panel-agenda-hours',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PillComponent,
    IconComponent,
    ModalComponent,
    DatePickerComponent,
  ],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Agenda de quadras" [subtitle]="subtitle()">
        <div class="header-actions">
          <nav class="seg" aria-label="Visão da agenda">
            <a routerLink="/painel/agenda">Quadras</a>
            <a class="on" aria-current="page">Por horário</a>
          </nav>
          <button type="button" class="ar-ghost-btn nav-btn" (click)="goToday()">Hoje</button>
          <button type="button" class="ar-ghost-btn nav-btn icon-btn" aria-label="Dia anterior" (click)="shiftDay(-1)">
            <ar-icon name="chevron-right" [size]="14" style="transform: rotate(180deg)" />
          </button>
          <ar-date-picker [selected]="dateKey()" (dateChange)="onDateKeySelected($event)" />
          <button type="button" class="ar-ghost-btn nav-btn icon-btn" aria-label="Próximo dia" (click)="shiftDay(1)">
            <ar-icon name="chevron-right" [size]="14" />
          </button>
        </div>
      </ar-page-header>

      <div class="body">
        @if (arenaContext.notFound()) {
          <ar-panel-card pad="lg"><p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p></ar-panel-card>
        } @else if (arenaContext.loading() || loading()) {
          <ar-panel-card pad="lg"><p class="state-text">Carregando horários…</p></ar-panel-card>
        } @else if (hours().length === 0) {
          <ar-panel-card pad="lg"><p class="state-text">Nenhum horário de quadra neste dia.</p></ar-panel-card>
        } @else {
          <div class="split">
            <div class="hours" role="listbox" aria-label="Horários do dia">
              <div class="field-label">Horários do dia</div>
              @for (h of hours(); track h.start) {
                <button
                  type="button"
                  role="option"
                  class="hour"
                  [class.on]="h.start === activeHourStart()"
                  [attr.aria-selected]="h.start === activeHourStart()"
                  (click)="selectedHour.set(h.start)"
                >
                  <span class="hour-t">{{ h.startTime }}</span>
                  <span class="hour-mid">
                    <span class="hour-s">
                      {{ h.booked }}/{{ h.capacity }} reservadas
                      @if (h.unassigned) { · <b>{{ h.unassigned }} sem quadra</b> }
                    </span>
                    <span class="bar"><i [class.full]="h.free === 0" [style.width.%]="h.occupancyPct"></i></span>
                  </span>
                  @if (h.free === 0) {
                    <ar-pill tone="orange">Lotado</ar-pill>
                  } @else {
                    <ar-pill tone="dim">{{ h.free }} {{ h.free === 1 ? 'vaga' : 'vagas' }}</ar-pill>
                  }
                </button>
              }
            </div>

            @if (active(); as hour) {
              <ar-panel-card class="detail">
                <div class="dhead">
                  <div>
                    <div class="field-label">Horário selecionado</div>
                    <div class="time">{{ hour.startTime }} – {{ hour.endTime }}</div>
                  </div>
                  @if (!readOnly() && provisional().length > 0) {
                    <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="openConfirmAll()">
                      <ar-icon name="check" [size]="14" />
                      Confirmar todas ({{ provisional().length }})
                    </button>
                  }
                </div>
                <div class="kpis">
                  <div class="k"><div class="k-l">Reservas</div><div class="k-v">{{ hour.booked }}</div></div>
                  <div class="k"><div class="k-l">Capacidade</div><div class="k-v">{{ hour.capacity }}</div></div>
                  <div class="k"><div class="k-l">Vagas</div><div class="k-v">{{ hour.free }}</div></div>
                  <div class="k"><div class="k-l">Ocupação</div><div class="k-v">{{ hour.occupancyPct }}%</div></div>
                </div>

                <div class="tabs" role="tablist">
                  @for (t of tabs; track t) {
                    <button type="button" role="tab" [class.on]="tab() === t" [attr.aria-selected]="tab() === t" (click)="tab.set(t)">{{ t }}</button>
                  }
                </div>

                @if (message(); as msg) {
                  <div class="banner" [class.error]="msg.error" role="status">{{ msg.text }}</div>
                }

                @if (tab() === 'Lista') {
                  @for (b of rows(); track b.id) {
                    <div class="bk">
                      <span class="avatar">{{ initials(b) }}</span>
                      <div class="bk-main">
                        <div class="bk-n">{{ customer(b) }}</div>
                        <div class="bk-s">{{ b.startTime }}–{{ b.endTime }}@if (b.sportLabel; as s) { · {{ s }}}</div>
                      </div>
                      @if (b.allocationStatus === 'unassigned') {
                        <span class="court-pill">{{ b.courtName }}<small>provisória</small></span>
                      } @else {
                        <span class="court-pill ok"><ar-icon name="check" [size]="13" />{{ b.courtName }}</span>
                      }
                      <div class="bk-a">
                        @if (b.attendanceStatus === 'checked_in') {
                          <ar-pill tone="green">Chegou</ar-pill>
                        } @else if (b.attendanceStatus === 'no_show') {
                          <ar-pill tone="red">Faltou</ar-pill>
                        }
                        @if (!readOnly()) {
                          @if (canAssign(b)) {
                            <button type="button" class="ar-ghost-btn sm" [disabled]="busy(b.id)" (click)="openAssign(b)">
                              {{ b.allocationStatus === 'unassigned' ? 'Definir quadra' : 'Trocar' }}
                            </button>
                          }
                          @if (canCheckIn(b)) {
                            <button type="button" class="ar-ghost-btn sm" [disabled]="busy(b.id)" (click)="checkIn(b)">Chegou</button>
                          }
                          @if (canNoShow(b)) {
                            <button type="button" class="ar-ghost-btn sm" [disabled]="busy(b.id)" (click)="noShow(b)">Faltou</button>
                          }
                        }
                      </div>
                    </div>
                  } @empty {
                    <p class="state-text">Nenhuma reserva neste horário.</p>
                  }
                  @if (provisional().length > 0) {
                    <p class="note">
                      Reserva com <b>quadra provisória</b> pode mudar sozinha se uma aula, um plano ou outra reserva precisar da
                      quadra. “Definir quadra”, “Confirmar todas” ou o QR lido pelo atleta fixam a quadra.
                    </p>
                  }
                } @else {
                  <p class="hint">
                    @if (readOnly()) {
                      Quadras do horário. Seu cargo não permite mudar reservas de quadra.
                    } @else {
                      Arraste uma reserva para outra quadra. Se a quadra de destino tiver uma reserva provisória, as duas trocam de lugar.
                    }
                  </p>
                  <div class="board">
                    @for (t of board(); track t.court.id) {
                      <div
                        class="tile"
                        [class.blocked]="t.state === 'blocked' || t.state === 'maintenance' || t.state === 'closed'"
                        [class.drop]="dropTarget() === t.court.id"
                        (dragover)="onDragOver($event, t)"
                        (dragleave)="dropTarget.set(null)"
                        (drop)="onDrop($event, t)"
                      >
                        <div class="tile-h">{{ t.court.name }}</div>
                        @if (t.booking; as b) {
                          <div
                            class="chipbk"
                            [class.ok]="b.allocationStatus !== 'unassigned'"
                            [class.dragging]="dragging()?.id === b.id"
                            [attr.draggable]="!readOnly() && !busy(b.id)"
                            (dragstart)="onDragStart($event, b)"
                            (dragend)="onDragEnd()"
                          >
                            <span class="chip-n">{{ customer(b) }}</span>
                            <small>{{ busy(b.id) ? 'Salvando…' : b.allocationStatus === 'unassigned' ? 'Provisória' : 'Definida' }}</small>
                          </div>
                        } @else {
                          <span class="free">{{ tileLabel(t) }}</span>
                        }
                      </div>
                    }
                  </div>
                  <div class="legend"><span><i class="sw"></i>Provisória</span><span><i class="sw ok"></i>Definida</span></div>
                }
              </ar-panel-card>
            }
          </div>
        }
      </div>

      @if (assignTarget(); as b) {
        <ar-modal (close)="closeAssign()">
          <h2 class="confirm-title">{{ b.allocationStatus === 'unassigned' ? 'Definir quadra' : 'Trocar quadra' }}</h2>
          <p class="confirm-body">{{ b.startTime }}–{{ b.endTime }}@if (b.sportLabel; as s) { · {{ s }}} · {{ customer(b) }}</p>
          @if (assignOptions().length === 0) {
            <p class="confirm-body">Nenhuma outra quadra ativa deste esporte.</p>
          } @else {
            <div class="court-grid" role="radiogroup" aria-label="Quadra">
              @for (option of assignOptions(); track option.court.id) {
                <label class="court-opt" [class.prov]="option.provisional" [class.sel]="targetCourtId() === option.court.id">
                  <input type="radio" name="hours-court" [checked]="targetCourtId() === option.court.id" (change)="targetCourtId.set(option.court.id)" />
                  <span>{{ option.court.name }}</span>
                  <small>{{ option.provisional ? 'provisória' : '' }}</small>
                </label>
              }
            </div>
          }
          @if (assignError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="assigning()" (click)="closeAssign()">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="assigning() || !targetCourtId()" (click)="assign()">
              <ar-icon name="check" [size]="14" />
              {{ assigning() ? 'Salvando…' : 'Confirmar ' + (targetCourtName() ?? '') }}
            </button>
          </div>
        </ar-modal>
      }

      @if (confirmAllOpen() && active(); as hour) {
        <ar-modal (close)="closeConfirmAll()">
          <h2 class="confirm-title">Confirmar as quadras das {{ hour.startTime }}?</h2>
          <p class="confirm-body">
            {{ provisional().length === 1 ? 'A reserva provisória fica' : 'As ' + provisional().length + ' reservas provisórias ficam' }}
            na quadra que já segura. Depois disso o sistema não move mais essas reservas.
          </p>
          <div class="clist">
            @for (b of provisional(); track b.id) {
              <div class="crow"><span>{{ customer(b) }}@if (b.sportLabel; as s) { · {{ s }}}</span><b>{{ b.courtName }}</b></div>
            }
          </div>
          @if (revealBeforeArrival()) {
            <p class="confirm-body small">O atleta recebe um aviso com a quadra.</p>
          }
          @if (confirmAllError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="confirmingAll()" (click)="closeConfirmAll()">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="confirmingAll()" (click)="confirmAll()">
              <ar-icon name="check" [size]="14" />
              {{ confirmingAll() ? 'Confirmando…' : 'Confirmar ' + provisional().length + (provisional().length === 1 ? ' quadra' : ' quadras') }}
            </button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
  `,
  styles: `
    @use 'breakpoints' as ar;

    .header-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .nav-btn { height: 34px; padding: 0 12px; }
    .icon-btn { width: 34px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
    .seg { display: inline-flex; padding: 3px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .seg a { padding: 6px 12px; border-radius: 8px; font-size: 12.5px; font-weight: 600; color: var(--nx-text-mute); text-decoration: none; cursor: pointer; }
    .seg a.on { background: var(--nx-orange-500); color: var(--nx-text-on-orange); cursor: default; }

    .body { flex: 1; padding: 22px 32px 28px; min-height: 0; }
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); }
    .split { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 16px; align-items: start; }

    .field-label { font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); margin-bottom: 10px; }
    .hours { display: flex; flex-direction: column; gap: 8px; }
    .hour {
      display: grid; grid-template-columns: 54px 1fr auto; gap: 12px; align-items: center; text-align: left;
      padding: 12px 14px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line);
      color: var(--nx-text); font: inherit; cursor: pointer;
    }
    .hour.on { border-color: var(--nx-orange-500); background: var(--nx-orange-tint); }
    .hour-t { font-family: var(--nx-font-mono); font-size: 14px; font-weight: 700; }
    .hour-mid { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .hour-s { font-size: 11.5px; color: var(--nx-text-mute); }
    .hour-s b { color: var(--nx-pending); font-weight: 600; }
    .bar { height: 6px; border-radius: 6px; background: var(--nx-surface-2); overflow: hidden; display: block; }
    .bar i { display: block; height: 100%; background: var(--nx-orange-500); border-radius: 6px; }
    .bar i.full { background: var(--nx-live); }

    .dhead { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
    .time { font-family: var(--nx-font-display); font-weight: 800; font-size: 30px; letter-spacing: -0.02em; color: var(--nx-text); }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .k { background: var(--nx-surface-1); border-radius: var(--nx-r-3); padding: 12px 14px; }
    .k-l { font-family: var(--nx-font-mono); font-size: 8.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .k-v { font-family: var(--nx-font-display); font-weight: 700; font-size: 22px; margin-top: 4px; color: var(--nx-text); }

    .tabs { display: flex; gap: 18px; border-bottom: 1px solid var(--nx-line); margin: 18px 0 6px; }
    .tabs button { background: none; border: none; padding: 10px 0; font: inherit; font-size: 13px; font-weight: 600; color: var(--nx-text-mute); cursor: pointer; }
    .tabs button.on { color: var(--nx-text); box-shadow: inset 0 -2px 0 var(--nx-orange-500); }

    .banner { margin: 10px 0; padding: 10px 14px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-win); color: var(--nx-win); font-size: 12.5px; }
    .banner.error { border-color: var(--nx-live); color: var(--nx-live); background: rgba(255, 59, 48, 0.08); }

    .bk { display: grid; grid-template-columns: 36px minmax(0, 1.2fr) auto minmax(0, 1.4fr); gap: 14px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--nx-line); }
    .avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--nx-surface-2); border: 1px solid var(--nx-line-strong); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: var(--nx-orange-400); }
    .bk-main { min-width: 0; }
    .bk-n { font-weight: 600; font-size: 13.5px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bk-s { font-size: 11.5px; color: var(--nx-text-dim); margin-top: 2px; }
    .bk-a { display: flex; gap: 8px; justify-content: flex-end; align-items: center; flex-wrap: wrap; }
    .sm { height: 32px; padding: 0 12px; font-size: 12px; }
    .court-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; padding: 6px 10px; border-radius: 9px; border: 1px dashed var(--nx-pending); color: var(--nx-pending); white-space: nowrap; }
    .court-pill.ok { border-style: solid; border-color: var(--nx-win); color: var(--nx-win); }
    .court-pill small { font-family: var(--nx-font-mono); font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.85; }
    .note { margin: 16px 0 0; padding: 12px 14px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); font-size: 12.5px; line-height: 1.5; color: var(--nx-text-mute); }
    .note b { color: var(--nx-pending); }

    .hint { font-size: 12.5px; color: var(--nx-text-mute); margin: 10px 0 0; }
    .board { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 14px; }
    .tile { min-height: 96px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .tile.drop { border: 1px dashed var(--nx-orange-500); background: var(--nx-orange-tint); }
    .tile.blocked { background: repeating-linear-gradient(135deg, var(--nx-surface-1) 0 8px, var(--nx-surface-2) 8px 16px); opacity: 0.75; }
    .tile-h { font-family: var(--nx-font-mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-mute); }
    .chipbk { padding: 8px 10px; border-radius: 9px; background: var(--nx-surface-0); border: 1px dashed var(--nx-pending); cursor: grab; min-width: 0; }
    .chipbk.ok { border-style: solid; border-color: var(--nx-win); }
    .chipbk.dragging { opacity: 0.45; }
    .chipbk[draggable='false'] { cursor: default; }
    .chip-n { display: block; font-size: 12.5px; font-weight: 600; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chipbk small { display: block; font-family: var(--nx-font-mono); font-size: 8.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--nx-text-dim); margin-top: 2px; }
    .free { margin: auto; font-size: 12px; color: var(--nx-text-dim); }
    .legend { display: flex; gap: 16px; font-size: 11.5px; color: var(--nx-text-mute); margin-top: 12px; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .sw { width: 14px; height: 10px; border-radius: 3px; border: 1px dashed var(--nx-pending); }
    .sw.ok { border: 1px solid var(--nx-win); }

    .confirm-title { font-family: var(--nx-font-display); font-weight: 800; font-size: 19px; color: var(--nx-text); margin: 0 0 10px; }
    .confirm-body { font-size: 13.5px; line-height: 1.55; color: var(--nx-text-mute); margin: 0 0 18px; }
    .confirm-body.small { font-size: 12.5px; margin-top: 12px; }
    .error-banner { border-radius: var(--nx-r-2); border: 1px solid var(--nx-live); background: rgba(255, 59, 48, 0.08); color: var(--nx-live); padding: 10px 14px; font-size: 12.5px; margin: 12px 0; }
    .confirm-actions { display: flex; align-items: center; justify-content: flex-end; gap: 16px; margin-top: 18px; }
    .court-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
    .court-opt { position: relative; display: flex; flex-direction: column; justify-content: center; gap: 2px; min-height: 52px; padding: 0 12px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); background: var(--nx-surface-1); font-size: 13px; font-weight: 600; color: var(--nx-text); cursor: pointer; }
    .court-opt input { position: absolute; opacity: 0; width: 1px; height: 1px; }
    .court-opt small { font-family: var(--nx-font-mono); font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-pending); font-weight: 500; }
    .court-opt.prov { border-style: dashed; border-color: var(--nx-pending); }
    .court-opt.sel { background: var(--nx-orange-500); border-color: var(--nx-orange-500); color: var(--nx-text-on-orange); }
    .court-opt.sel small { color: var(--nx-text-on-orange); }
    .court-opt:focus-within { outline: 2px solid var(--nx-orange-400); outline-offset: 2px; }
    .clist { display: flex; flex-direction: column; gap: 8px; }
    .crow { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 13px; color: var(--nx-text); }
    .crow b { font-family: var(--nx-font-mono); font-size: 12.5px; color: var(--nx-win); }

    @include ar.below(lg) {
      .split { grid-template-columns: 1fr; }
      .kpis { grid-template-columns: repeat(2, 1fr); }
      .bk { grid-template-columns: 36px minmax(0, 1fr); }
      .bk > .court-pill, .bk-a { grid-column: 2; justify-content: flex-start; }
    }
  `,
})
export class PanelAgendaHoursComponent {
  protected readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));
  protected readonly tabs: HoursTab[] = ['Lista', 'Quadro'];
  protected readonly tab = signal<HoursTab>('Lista');

  protected readonly loading = signal(true);
  private readonly courts = signal<ArenaCourt[]>([]);
  private readonly courtsRaw = signal<{ id: string; data: Record<string, unknown> }[] | null>(null);
  private readonly bookings = signal<ArenaBooking[]>([]);
  private readonly slots = signal<ArenaSlot[]>([]);
  private readonly athleteLabels = signal<Record<string, string>>({});
  protected readonly selectedDate = signal(new Date());
  protected readonly selectedHour = signal<number | null>(null);
  private readonly now = signal(new Date());

  protected readonly message = signal<{ text: string; error: boolean } | null>(null);
  private readonly busyIds = signal<ReadonlySet<string>>(new Set());

  protected readonly assignTarget = signal<ArenaBooking | null>(null);
  protected readonly targetCourtId = signal<string | null>(null);
  protected readonly assigning = signal(false);
  protected readonly assignError = signal<string | null>(null);

  protected readonly confirmAllOpen = signal(false);
  protected readonly confirmingAll = signal(false);
  protected readonly confirmAllError = signal<string | null>(null);

  protected readonly dragging = signal<ArenaBooking | null>(null);
  protected readonly dropTarget = signal<string | null>(null);

  protected readonly dateKey = computed(() => dateKeyOf(this.selectedDate()));
  private readonly allocation = computed(() => bookingAllocationFromArena(this.arenaContext.arenaDocData()));
  protected readonly revealBeforeArrival = computed(() => this.allocation().revealBeforeArrival);
  /** Quadras da distribuição (modo "a arena define a quadra") ou todas. */
  private readonly hourCourts = computed(() => {
    const a = this.allocation();
    return capacityCourts(this.courts(), a.mode === 'capacity' ? a.courtIds : []);
  });
  private readonly dayBookings = computed(() => this.bookings().filter((b) => b.dateKey === this.dateKey()));
  private readonly daySlots = computed(() => applyBookingsOverlay(this.slots(), this.dayBookings()));

  protected readonly hours = computed(() => buildCapacityHours(this.hourCourts(), this.daySlots(), this.dayBookings()));

  /** Hora escolhida; sem escolha, a atual (hoje) ou a primeira do dia. */
  protected readonly activeHourStart = computed<number | null>(() => {
    const hours = this.hours();
    const chosen = this.selectedHour();
    if (chosen != null && hours.some((h) => h.start === chosen)) return chosen;
    if (hours.length === 0) return null;
    if (this.dateKey() === dateKeyOf(this.now())) {
      const minutes = this.now().getHours() * 60;
      const current = hours.find((h) => h.start >= minutes);
      if (current) return current.start;
    }
    return hours[0]!.start;
  });

  protected readonly board = computed<BoardTile[]>(() => {
    const start = this.activeHourStart();
    return start == null ? [] : buildBoard(start, this.hourCourts(), this.daySlots(), this.dayBookings());
  });
  protected readonly active = computed(() => {
    const start = this.activeHourStart();
    return start == null ? null : hourSummary(start, this.board());
  });
  protected readonly rows = computed(() => hourBookings(this.board()));
  protected readonly provisional = computed(() => provisionalBookings(this.board()));

  protected readonly assignOptions = computed(() => {
    const b = this.assignTarget();
    return b ? courtAssignOptions(b, this.courts()) : [];
  });
  protected readonly targetCourtName = computed(
    () => this.courts().find((c) => c.id === this.targetCourtId())?.name ?? null,
  );

  protected readonly subtitle = computed(() => {
    const d = this.selectedDate();
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '');
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d).replace('.', '');
    const unassigned = this.dayBookings().filter((b) => b.allocationStatus === 'unassigned' && b.status !== 'canceled').length;
    return `${weekday} · ${date}${unassigned ? ` · ${unassigned} sem quadra definida` : ''}`;
  });


  constructor() {
    const destroyRef = inject(DestroyRef);
    const clock = setInterval(() => this.now.set(new Date()), 60_000);
    let unsubscribeBookings: (() => void) | null = null;
    let unsubscribeSlots: (() => void) | null = null;
    destroyRef.onDestroy(() => {
      clearInterval(clock);
      unsubscribeBookings?.();
      unsubscribeSlots?.();
    });

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      const db = arenaFirestore();
      this.courtsRaw.set(null);
      void fetchCourtsList(db, arenaId).then((list) => this.courts.set(list));
      void fetchCourtsRaw(db, arenaId).then((list) => this.courtsRaw.set(list));
    });

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const key = this.dateKey();
      unsubscribeBookings?.();
      unsubscribeBookings = null;
      if (!arenaId) return;
      unsubscribeBookings = watchBookingsForArenaInRange(arenaFirestore(), arenaId, { fromKey: key, toKey: key }, (list) => {
        this.bookings.set(list);
        this.resolveMissingAthleteLabels(list);
      });
    });

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const courts = this.courtsRaw();
      const key = this.dateKey();
      const date = this.selectedDate();
      unsubscribeSlots?.();
      unsubscribeSlots = null;
      if (!arenaId || courts == null) return;
      if (courts.length === 0) {
        this.slots.set([]);
        this.loading.set(false);
        return;
      }
      unsubscribeSlots = watchArenaDaySlots(arenaFirestore(), arenaId, date, key, courts, (list) => {
        this.slots.set(list);
        this.loading.set(false);
      });
    });
  }

  private resolveMissingAthleteLabels(list: ArenaBooking[]): void {
    const known = this.athleteLabels();
    const missing = new Set(list.map((b) => b.athleteId).filter((id) => id && !(id in known)));
    const db = arenaFirestore();
    for (const athleteId of missing) {
      void resolveAthleteLabel(db, athleteId).then((label) =>
        this.athleteLabels.update((current) => ({ ...current, [athleteId]: label })),
      );
    }
  }

  protected customer(b: ArenaBooking): string {
    if (b.customerName) return b.customerName;
    if (!b.athleteId) return b.classSessionId ? 'Aula' : 'Cliente';
    return this.athleteLabels()[b.athleteId] ?? 'Carregando…';
  }

  protected initials(b: ArenaBooking): string {
    const parts = this.customer(b).split(/\s+/).filter((p) => /^\p{L}/u.test(p));
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase() || '·';
  }

  protected tileLabel(t: BoardTile): string {
    switch (t.state) {
      case 'blocked': return 'Bloqueada';
      case 'maintenance': return 'Manutenção';
      case 'closed': return 'Fechada';
      case 'booked': return 'Ocupada';
      default: return 'Livre';
    }
  }

  protected busy(id: string): boolean {
    return this.busyIds().has(id);
  }

  private setBusy(id: string, on: boolean): void {
    this.busyIds.update((ids) => {
      const next = new Set(ids);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected canAssign(b: ArenaBooking): boolean {
    return bookingCanChangeCourt(b);
  }

  protected canCheckIn(b: ArenaBooking): boolean {
    return bookingCanCheckInNow(b, this.now());
  }

  protected canNoShow(b: ArenaBooking): boolean {
    return bookingCanMarkNoShow(b, this.now());
  }

  protected goToday(): void {
    this.selectedDate.set(new Date());
    this.selectedHour.set(null);
  }

  protected shiftDay(delta: number): void {
    const d = new Date(this.selectedDate());
    d.setDate(d.getDate() + delta);
    this.selectedDate.set(d);
    this.selectedHour.set(null);
  }

  protected onDateKeySelected(key: string): void {
    const [y, m, d] = key.split('-').map(Number);
    if (!y || !m || !d) return;
    this.selectedDate.set(new Date(y, m - 1, d));
    this.selectedHour.set(null);
  }

  // ── Definir / trocar quadra ───────────────────────────────────────────────

  protected openAssign(b: ArenaBooking): void {
    if (this.readOnly()) return;
    const options = courtAssignOptions(b, this.courts());
    this.targetCourtId.set(options[0]?.provisional ? options[0].court.id : options.length === 1 ? options[0]!.court.id : null);
    this.assignError.set(null);
    this.assignTarget.set(b);
  }

  protected closeAssign(): void {
    if (!this.assigning()) this.assignTarget.set(null);
  }

  protected async assign(): Promise<void> {
    const b = this.assignTarget();
    const toCourtId = this.targetCourtId();
    if (!b || !toCourtId) return;
    this.assigning.set(true);
    this.assignError.set(null);
    try {
      const result = await changeBookingCourt(arenaFunctions(), { bookingId: b.id, toCourtId, reason: null });
      this.assignTarget.set(null);
      this.flash(result.assigned ? `Quadra definida: ${result.courtName}.` : `Reserva movida para ${result.courtName}.`);
    } catch (err) {
      this.assignError.set(err instanceof Error ? err.message : 'Não foi possível trocar a quadra.');
    } finally {
      this.assigning.set(false);
    }
  }

  // ── Chegou / Faltou ───────────────────────────────────────────────────────

  protected async checkIn(b: ArenaBooking): Promise<void> {
    await this.run(b, () => checkInBookingByManager(arenaFirestore(), b.id), `${this.customer(b)} chegou.`);
  }

  protected async noShow(b: ArenaBooking): Promise<void> {
    await this.run(b, () => markNoShowByManager(arenaFirestore(), b.id), `Falta marcada para ${this.customer(b)}.`);
  }

  private async run(b: ArenaBooking, action: () => Promise<unknown>, done: string): Promise<void> {
    if (this.readOnly() || this.busy(b.id)) return;
    this.setBusy(b.id, true);
    try {
      await action();
      this.flash(done);
    } catch (err) {
      this.flash(err instanceof Error ? err.message : 'Não foi possível salvar.', true);
    } finally {
      this.setBusy(b.id, false);
    }
  }

  // ── Confirmar todas ───────────────────────────────────────────────────────

  protected openConfirmAll(): void {
    this.confirmAllError.set(null);
    this.confirmAllOpen.set(true);
  }

  protected closeConfirmAll(): void {
    if (!this.confirmingAll()) this.confirmAllOpen.set(false);
  }

  /** Fixa cada provisória na quadra que ela já segura (a callable só marca `assigned`). Uma por vez:
   *  se uma falhar, as outras seguem e a falha aparece no modal. */
  protected async confirmAll(): Promise<void> {
    const list = this.provisional();
    if (list.length === 0 || this.readOnly()) return;
    this.confirmingAll.set(true);
    this.confirmAllError.set(null);
    const failed: string[] = [];
    for (const b of list) {
      try {
        await changeBookingCourt(arenaFunctions(), { bookingId: b.id, toCourtId: b.courtId, reason: null });
      } catch (err) {
        failed.push(`${this.customer(b)}: ${err instanceof Error ? err.message : 'erro'}`);
      }
    }
    this.confirmingAll.set(false);
    if (failed.length > 0) {
      this.confirmAllError.set(`Não deu para confirmar ${failed.length}: ${failed.join(' · ')}`);
      return;
    }
    this.confirmAllOpen.set(false);
    this.flash(list.length === 1 ? 'Quadra confirmada.' : `${list.length} quadras confirmadas.`);
  }

  // ── Quadro: arrastar ──────────────────────────────────────────────────────

  protected onDragStart(event: DragEvent, b: ArenaBooking): void {
    if (this.readOnly() || this.busy(b.id)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('text/plain', b.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.dragging.set(b);
  }

  protected onDragEnd(): void {
    this.dragging.set(null);
    this.dropTarget.set(null);
  }

  protected onDragOver(event: DragEvent, tile: BoardTile): void {
    const b = this.dragging();
    if (!b || tile.court.id === b.courtId || dropBlockReason(b, tile) !== null) return;
    event.preventDefault();
    this.dropTarget.set(tile.court.id);
  }

  protected async onDrop(event: DragEvent, tile: BoardTile): Promise<void> {
    event.preventDefault();
    const b = this.dragging();
    this.onDragEnd();
    if (!b || tile.court.id === b.courtId) return;
    const reason = dropBlockReason(b, tile);
    if (reason) {
      this.flash(reason, true);
      return;
    }
    await this.run(
      b,
      () => changeBookingCourt(arenaFunctions(), { bookingId: b.id, toCourtId: tile.court.id, reason: null }),
      `${this.customer(b)} foi para a ${tile.court.name}.`,
    );
  }

  private flash(text: string, error = false): void {
    this.message.set({ text, error });
  }
}

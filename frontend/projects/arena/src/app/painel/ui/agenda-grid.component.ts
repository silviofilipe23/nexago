import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import {
  AGENDA_GRID_END_MIN,
  AGENDA_GRID_START_MIN,
  AGENDA_ROW_HEIGHT,
  AGENDA_SLOT_MIN,
  formatMinutes,
  isWithinGrid,
  minutesToRowOffset,
  nowInMinutes,
} from './agenda-grid-math';

export type AgendaBookingStatus = 'confirmada' | 'pendente' | 'manutencao';

export interface AgendaCourt {
  id: string;
  name: string;
  sport: string;
}

export interface AgendaBooking {
  courtId: string;
  start: number;
  dur: number;
  status: AgendaBookingStatus;
  client: string;
}

interface PositionedBooking extends AgendaBooking {
  top: number;
  height: number;
  label: string;
  timeLabel: string;
}

interface RowMark {
  offset: number;
  isHour: boolean;
  label: string;
}

/** Grade de quadras × horário (protótipo ArAgendaGrade), com blocos de reserva posicionados por cálculo. */
@Component({
  selector: 'ar-agenda-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="court-header">
        @for (c of courts(); track c.id) {
          <div class="court-head">
            <div class="court-name">{{ c.name }}</div>
            <div class="court-sport">{{ c.sport }}</div>
          </div>
        }
      </div>

      <div class="body">
        <div class="grid" [style.height.px]="gridHeight()">
          @for (row of rowMarks(); track row.offset) {
            @if (row.isHour) {
              <div class="hour-label" [style.top.px]="row.offset - 6">{{ row.label }}</div>
            }
            <div class="hour-line" [class.solid]="row.isHour" [style.top.px]="row.offset"></div>
          }

          <div class="columns">
            @for (c of courts(); track c.id) {
              <div class="column">
                @for (b of positionedByCourt()[c.id] ?? []; track b.start) {
                  <div class="block" [class]="'tone-' + b.status" [style.top.px]="b.top" [style.height.px]="b.height">
                    <div class="block-title">{{ b.label }}</div>
                    @if (b.height > 30) {
                      <div class="block-time">{{ b.timeLabel }}</div>
                    }
                  </div>
                }
              </div>
            }
          </div>

          @if (nowOffset() >= 0) {
            <div class="now-line" [style.top.px]="nowOffset()">
              <div class="now-line-bar"></div>
              <span class="now-line-dot"></span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .wrap {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .court-header {
      display: flex;
      padding-left: 52px;
      padding-bottom: 10px;
      flex: none;
    }

    .court-head {
      flex: 1;
      text-align: center;
    }

    .court-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .court-sport {
      font-family: var(--nx-font-ui);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .body::-webkit-scrollbar {
      display: none;
    }

    .grid {
      position: relative;
      padding-left: 52px;
    }

    .hour-label {
      position: absolute;
      left: 0;
      width: 42px;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      color: var(--nx-text-dim);
    }

    .hour-line {
      position: absolute;
      left: 52px;
      right: 0;
      border-top: 1px dotted var(--nx-line);
    }

    .hour-line.solid {
      border-top-style: solid;
    }

    .columns {
      position: absolute;
      top: 0;
      left: 52px;
      right: 0;
      bottom: 0;
      display: flex;
    }

    .column {
      flex: 1;
      position: relative;
      border-left: 1px solid var(--nx-line);
    }

    .block {
      position: absolute;
      left: 3px;
      right: 3px;
      box-sizing: border-box;
      border-radius: 8px;
      padding: 5px 8px;
      overflow: hidden;
      cursor: pointer;
      border: 1px solid;
    }

    .block.tone-confirmada {
      background: rgba(43, 209, 126, 0.12);
      border-color: rgba(43, 209, 126, 0.35);
      border-left: 3px solid var(--nx-win);
    }

    .block.tone-pendente {
      background: rgba(244, 197, 67, 0.12);
      border-color: rgba(244, 197, 67, 0.35);
      border-left: 3px solid var(--nx-pending);
    }

    .block.tone-manutencao {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.14);
      border-left: 3px solid var(--nx-text-dim);
    }

    .block-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .block-time {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .now-line {
      position: absolute;
      left: 42px;
      right: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      pointer-events: none;
    }

    .now-line-bar {
      flex: 1;
      height: 2px;
      background: var(--nx-live);
      box-shadow: 0 0 8px rgba(255, 59, 48, 0.6);
    }

    .now-line-dot {
      width: 7px;
      height: 7px;
      border-radius: 99px;
      background: var(--nx-live);
    }
  `,
})
export class AgendaGridComponent {
  readonly courts = input.required<AgendaCourt[]>();
  readonly bookings = input.required<AgendaBooking[]>();

  private readonly nowMinutes = signal(nowInMinutes());

  protected readonly rowCount = computed(
    () => (AGENDA_GRID_END_MIN - AGENDA_GRID_START_MIN) / AGENDA_SLOT_MIN,
  );

  protected readonly gridHeight = computed(() => this.rowCount() * AGENDA_ROW_HEIGHT + 10);

  protected readonly rowMarks = computed<RowMark[]>(() =>
    Array.from({ length: this.rowCount() }, (_, i) => {
      const minute = AGENDA_GRID_START_MIN + i * AGENDA_SLOT_MIN;
      return { offset: i * AGENDA_ROW_HEIGHT, isHour: minute % 60 === 0, label: formatMinutes(minute) };
    }),
  );

  protected readonly positionedByCourt = computed<Record<string, PositionedBooking[]>>(() => {
    const result: Record<string, PositionedBooking[]> = {};
    for (const b of this.bookings()) {
      const top = minutesToRowOffset(b.start) + 1;
      const height = (b.dur / AGENDA_SLOT_MIN) * AGENDA_ROW_HEIGHT - 3;
      const label = b.status === 'manutencao' ? 'Manutenção' : b.client;
      const timeLabel = `${formatMinutes(b.start)}–${formatMinutes(b.start + b.dur)}`;
      const positioned: PositionedBooking = { ...b, top, height, label, timeLabel };
      (result[b.courtId] ??= []).push(positioned);
    }
    return result;
  });

  /** -1 quando a hora atual está fora da janela 07:00–22:00 (linha "agora" não aparece). */
  protected readonly nowOffset = computed(() => {
    const minutes = this.nowMinutes();
    return isWithinGrid(minutes) ? minutesToRowOffset(minutes) : -1;
  });
}

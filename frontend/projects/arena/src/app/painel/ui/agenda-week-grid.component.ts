import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { WeekDay } from '../agenda/agenda-week-math';
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
import type { AgendaBlockStatus, AgendaCourt } from './agenda-grid.component';

export interface AgendaWeekBlock {
  id: string;
  dateKey: string;
  courtId: string;
  start: number;
  dur: number;
  status: AgendaBlockStatus;
  client: string;
}

interface PositionedWeekBlock extends AgendaWeekBlock {
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

const NON_CLICKABLE: ReadonlySet<AgendaBlockStatus> = new Set(['manutencao']);
const WEEKDAY_SHORT = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/** Grade de 7 dias × quadras × horário — irmã de AgendaGridComponent, mesma matemática de
 *  linha/hora e mesmo vocabulário visual de blocos, com um eixo de dia a mais. */
@Component({
  selector: 'ar-agenda-week-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="header">
        <div class="gutter-spacer"></div>
        @for (day of weekDays(); track day.dateKey) {
          <div class="day-col-header" [class.today]="day.isToday" [class.selected]="day.dateKey === selectedDateKey()" [style.minWidth.px]="dayColumnWidth()">
            <button type="button" class="day-title" (click)="dayHeaderClick.emit(day.dateKey)">
              {{ weekdayLabel(day.date) }} · {{ dateLabel(day.date) }}
            </button>
            <div class="court-header">
              @for (c of courts(); track c.id) {
                <div class="court-head">{{ c.name }}</div>
              }
            </div>
          </div>
        }
      </div>

      <div class="grid" [style.height.px]="gridHeight()">
        @for (row of rowMarks(); track row.offset) {
          @if (row.isHour) {
            <div class="hour-label" [style.top.px]="row.offset - 6">{{ row.label }}</div>
          }
          <div class="hour-line" [class.solid]="row.isHour" [style.top.px]="row.offset"></div>
        }

        <div class="days">
          @for (day of weekDays(); track day.dateKey) {
            <div class="day-group" [style.minWidth.px]="dayColumnWidth()">
              @for (c of courts(); track c.id) {
                <div class="column">
                  @for (b of positionedByDayAndCourt()[day.dateKey + ':' + c.id] ?? []; track b.start) {
                    <div
                      class="block"
                      [class]="'tone-' + b.status"
                      [class.clickable]="isClickable(b.status)"
                      [style.top.px]="b.top"
                      [style.height.px]="b.height"
                      (click)="isClickable(b.status) && blockClick.emit(b.id)"
                    >
                      <div class="block-title">{{ b.label }}</div>
                      @if (b.height > 30) {
                        <div class="block-time">{{ b.timeLabel }}</div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>

        @if (nowOffset() >= 0) {
          <div class="now-line" [style.top.px]="nowOffset()"></div>
        }
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
      height: 100%;
      min-height: 0;
      overflow: auto;
      position: relative;
      scrollbar-width: thin;
    }

    .header {
      display: flex;
      position: sticky;
      top: 0;
      z-index: 6;
      background: var(--nx-surface-0);
      padding-bottom: 10px;
    }

    .gutter-spacer {
      width: 52px;
      flex: none;
    }

    .day-col-header {
      flex: 1;
      min-width: 190px;
      text-align: center;
      border-left: 1px solid var(--nx-line);
    }

    .day-col-header.today .day-title {
      color: var(--nx-orange-500);
    }

    .day-col-header.selected {
      border-bottom: 2px solid var(--nx-orange-500);
    }

    .day-title {
      display: block;
      width: 100%;
      background: none;
      border: none;
      cursor: pointer;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text);
      padding: 2px 0 6px;
    }

    .court-header {
      display: flex;
    }

    .court-head {
      flex: 1;
      font-family: var(--nx-font-ui);
      font-size: 10px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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

    .days {
      position: absolute;
      top: 0;
      left: 52px;
      right: 0;
      bottom: 0;
      display: flex;
    }

    .day-group {
      flex: 1;
      min-width: 190px;
      display: flex;
      border-left: 1px solid var(--nx-line-strong);
    }

    .column {
      flex: 1;
      position: relative;
      border-left: 1px solid var(--nx-line);
    }

    .column:first-child {
      border-left: none;
    }

    .block {
      position: absolute;
      left: 2px;
      right: 2px;
      box-sizing: border-box;
      border-radius: 6px;
      padding: 3px 5px;
      overflow: hidden;
      cursor: default;
      border: 1px solid;
    }

    .block.clickable {
      cursor: pointer;
    }

    .block.tone-available {
      background: transparent;
      border: 1px dashed var(--nx-line-strong);
    }

    .block.tone-available .block-title,
    .block.tone-available .block-time {
      color: var(--nx-text-dim);
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

    .block.tone-bloqueado {
      background: rgba(255, 106, 26, 0.08);
      border-color: rgba(255, 106, 26, 0.3);
      border-left: 3px solid var(--nx-orange-500);
    }

    .block.tone-manutencao {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.14);
      border-left: 3px solid var(--nx-text-dim);
    }

    .block-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 10px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .block-time {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      color: var(--nx-text-dim);
      margin-top: 1px;
    }

    .now-line {
      position: absolute;
      left: 52px;
      right: 0;
      height: 2px;
      background: var(--nx-live);
      box-shadow: 0 0 8px rgba(255, 59, 48, 0.6);
      z-index: 5;
      pointer-events: none;
    }
  `,
})
export class AgendaWeekGridComponent {
  readonly weekDays = input.required<WeekDay[]>();
  readonly courts = input.required<AgendaCourt[]>();
  readonly blocks = input.required<AgendaWeekBlock[]>();
  readonly selectedDateKey = input.required<string>();
  readonly blockClick = output<string>();
  readonly dayHeaderClick = output<string>();

  private readonly nowMinutes = signal(nowInMinutes());

  protected readonly rowCount = computed(() => (AGENDA_GRID_END_MIN - AGENDA_GRID_START_MIN) / AGENDA_SLOT_MIN);
  protected readonly gridHeight = computed(() => this.rowCount() * AGENDA_ROW_HEIGHT + 10);

  protected readonly rowMarks = computed<RowMark[]>(() =>
    Array.from({ length: this.rowCount() }, (_, i) => {
      const minute = AGENDA_GRID_START_MIN + i * AGENDA_SLOT_MIN;
      return { offset: i * AGENDA_ROW_HEIGHT, isHour: minute % 60 === 0, label: formatMinutes(minute) };
    }),
  );

  /** Largura mínima de cada grupo-de-dia escala com o nº de quadras visíveis, senão as
   *  sub-colunas ficam ilegíveis com 4+ quadras em vez de crescer e deixar rolar. */
  protected readonly dayColumnWidth = computed(() => Math.max(190, this.courts().length * 90));

  protected readonly positionedByDayAndCourt = computed<Partial<Record<string, PositionedWeekBlock[]>>>(() => {
    const result: Partial<Record<string, PositionedWeekBlock[]>> = {};
    for (const b of this.blocks()) {
      const top = minutesToRowOffset(b.start) + 1;
      const height = (b.dur / AGENDA_SLOT_MIN) * AGENDA_ROW_HEIGHT - 3;
      const label = b.status === 'available' ? 'Disponível' : b.status === 'manutencao' ? 'Manutenção' : b.status === 'bloqueado' ? 'Bloqueado' : b.client;
      const timeLabel = `${formatMinutes(b.start)}–${formatMinutes(b.start + b.dur)}`;
      const key = `${b.dateKey}:${b.courtId}`;
      const positioned: PositionedWeekBlock = { ...b, top, height, label, timeLabel };
      (result[key] ??= []).push(positioned);
    }
    return result;
  });

  protected isClickable(status: AgendaBlockStatus): boolean {
    return !NON_CLICKABLE.has(status);
  }

  protected readonly nowOffset = computed(() => {
    const minutes = this.nowMinutes();
    return isWithinGrid(minutes) ? minutesToRowOffset(minutes) : -1;
  });

  protected weekdayLabel(date: Date): string {
    return WEEKDAY_SHORT.format(date).replace('.', '');
  }

  protected dateLabel(date: Date): string {
    return DAY_MONTH.format(date);
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { weekDatesFor } from '../agenda/agenda-week-math';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { AulaSingleModalComponent } from './aula-single-modal.component';
import { agendaHourRange, layoutDayBlocks } from './aulas-agenda-layout';
import { AulasPageComponent } from './aulas-ui';
import {
  TEACHER_COLORS,
  WEEKDAY_SHORT,
  addDaysKey,
  compareSessions,
  shortDate,
  todayKeyLocal,
  type ClassSession,
  type ClassTeacher,
} from './class.model';
import { fetchTeachers, watchSessionsBetween } from './classes-repository';

const ROW_H = 44;

interface PositionedBlock {
  session: ClassSession;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  color: string;
}

/** 02 · Agenda semanal de aulas — por professor (cor do professor) ou por quadra. Toda aula
 *  aqui também é um bloqueio na agenda de reservas da arena. */
@Component({
  selector: 'ar-panel-aulas-agenda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, IconComponent, AulaSingleModalComponent],
  template: `
    <ar-aulas-page title="Aulas" [subtitle]="'Agenda semanal · ' + weekLabel()" tab="agenda">
      <div page-actions style="display: flex; gap: 8px; flex-wrap: wrap">
        <button type="button" class="ar-mini-btn" (click)="shiftWeek(-7)">
          <ar-icon name="chevron-left" [size]="14" />
          Semana anterior
        </button>
        <button type="button" class="ar-mini-btn" (click)="goToday()">Hoje</button>
        <button type="button" class="ar-mini-btn" (click)="shiftWeek(7)">
          Próxima
          <ar-icon name="chevron-right" [size]="14" />
        </button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="singleOpen.set(true)">
          <ar-icon name="plus" [size]="14" />
          Agendar aula
        </button>
      </div>

      <div class="filters">
        <span class="kicker">Professor</span>
        <button type="button" class="ar-chip" [class.active]="teacherFilter() === null" (click)="teacherFilter.set(null)">Todos</button>
        @for (t of teachers(); track t.id) {
          <button type="button" class="ar-chip chip-dot" [class.active]="teacherFilter() === t.id" (click)="teacherFilter.set(t.id)">
            <span class="dot" [style.background]="t.color"></span>{{ t.name.split(' ')[0] }}
          </button>
        }
        <span class="grow"></span>
        <div class="ar-chart-tabs">
          <button type="button" [class.active]="colorBy() === 'teacher'" (click)="colorBy.set('teacher')">Por professor</button>
          <button type="button" [class.active]="colorBy() === 'court'" (click)="colorBy.set('court')">Por quadra</button>
        </div>
      </div>

      @if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      }

      <ar-panel-card pad="sm" class="grid-card">
        <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Agenda semanal de aulas">
          <div class="calendar">
            <div class="head">
              <div></div>
              @for (d of week(); track d.dateKey) {
                <div class="day-head" [class.today]="d.isToday">
                  <span class="dow">{{ weekdayShort[$index + 1] }}</span>
                  <span class="dnum">{{ shortDate(d.dateKey) }}</span>
                </div>
              }
            </div>
            <div class="body" [style.height.px]="(hours()[1] - hours()[0]) * rowH">
              <div class="hours">
                @for (h of hourLabels(); track h) {
                  <div class="hour" [style.height.px]="rowH">{{ h }}</div>
                }
              </div>
              @for (d of week(); track d.dateKey) {
                <div class="day-col" [class.weekend]="$index >= 5">
                  @for (h of hourLabels(); track h) {
                    <div class="hour-line" [style.height.px]="rowH"></div>
                  }
                  @for (b of blocksByDay().get(d.dateKey) ?? []; track b.session.id) {
                    <button
                      type="button"
                      class="block"
                      [class.canceled]="b.session.status === 'canceled'"
                      [class.single]="b.session.type !== 'turma'"
                      [style.top.px]="b.top"
                      [style.height.px]="b.height"
                      [style.left]="'calc(' + b.leftPct + '% + 3px)'"
                      [style.width]="'calc(' + b.widthPct + '% - 6px)'"
                      [style.border-left-color]="b.color"
                      [style.background]="b.color + '1F'"
                      [attr.aria-label]="b.session.className + ' ' + b.session.startTime"
                      (click)="open(b.session.id)"
                    >
                      <span class="b-title">{{ b.session.className }}</span>
                      <span class="b-sub">
                        {{ b.session.startTime }} · {{ b.session.courtName }}
                        @if (b.session.status === 'canceled') {
                          · cancelada
                        }
                      </span>
                    </button>
                  }
                  @if (d.isToday && nowTop() != null) {
                    <div class="now" [style.top.px]="nowTop()"><span></span></div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
        @if (!loading() && filtered().length === 0) {
          <p class="state-text empty">Nenhuma aula nesta semana. Crie uma turma ou agende uma aula avulsa.</p>
        }
      </ar-panel-card>
      <p class="foot">Cada aula bloqueia a quadra na agenda de reservas — o horário não aparece para aluguel.</p>
    </ar-aulas-page>

    @if (singleOpen() && arenaId(); as id) {
      <ar-aula-single-modal [arenaId]="id" [initialDate]="anchor()" (closed)="singleOpen.set(false)" (created)="singleOpen.set(false)" />
    }
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .state-text.empty { margin: 14px 4px 4px; }
    .filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: none; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); margin-right: 4px; }
    .grow { flex: 1; }
    .chip-dot { display: inline-flex; align-items: center; gap: 7px; }
    .dot { width: 7px; height: 7px; border-radius: 50%; }
    .grid-card { flex: none; }
    .calendar { min-width: 860px; }
    .head, .body { display: grid; grid-template-columns: 56px repeat(7, minmax(0, 1fr)); }
    .head { border-bottom: 1px solid var(--nx-line); }
    .day-head { padding: 10px 12px; border-left: 1px solid var(--nx-line); display: flex; align-items: baseline; gap: 6px; }
    .dow { font-family: var(--nx-font-display); font-weight: 700; font-size: 12.5px; color: var(--nx-text); }
    .dnum { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); }
    .day-head.today .dow, .day-head.today .dnum { color: var(--nx-orange-500); }
    .body { position: relative; overflow: hidden; }
    .hour { padding: 4px 8px 0 0; text-align: right; font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); box-sizing: border-box; }
    .day-col { position: relative; border-left: 1px solid var(--nx-line); }
    .day-col.weekend { background: rgba(255, 255, 255, 0.015); }
    .hour-line { border-top: 1px dashed rgba(255, 255, 255, 0.05); box-sizing: border-box; }
    .hour-line:first-child { border-top: none; }
    .block {
      position: absolute; display: flex; flex-direction: column; gap: 1px; padding: 5px 7px; overflow: hidden;
      border: none; border-left: 3px solid; border-radius: 8px; text-align: left; cursor: pointer; box-sizing: border-box;
    }
    .block:hover { filter: brightness(1.2); }
    .block.single { outline: 1px dashed rgba(255, 255, 255, 0.18); outline-offset: -1px; }
    .block.canceled { opacity: 0.45; }
    .block.canceled .b-title { text-decoration: line-through; }
    .b-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 11.5px; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .b-sub { font-family: var(--nx-font-mono); font-size: 9.5px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .now { position: absolute; left: 0; right: 0; height: 2px; background: var(--nx-live); pointer-events: none; }
    .now span { position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: var(--nx-live); }
    .foot { font-size: 12px; color: var(--nx-text-dim); margin: 0; }
  `,
})
export class PanelAulasAgendaComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly router = inject(Router);

  protected readonly rowH = ROW_H;
  protected readonly weekdayShort = WEEKDAY_SHORT;
  protected readonly shortDate = shortDate;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('aulas'));
  protected readonly arenaId = computed(() => this.arenaContext.arenaId());

  protected readonly anchor = signal(todayKeyLocal());
  protected readonly teachers = signal<ClassTeacher[]>([]);
  protected readonly sessions = signal<ClassSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly teacherFilter = signal<string | null>(null);
  protected readonly colorBy = signal<'teacher' | 'court'>('teacher');
  protected readonly singleOpen = signal(false);
  private readonly now = signal(new Date());

  protected readonly week = computed(() => {
    const [y, m, d] = this.anchor().split('-').map(Number);
    return weekDatesFor(new Date(y!, m! - 1, d!));
  });
  protected readonly weekLabel = computed(() => {
    const w = this.week();
    return `${shortDate(w[0]!.dateKey)} – ${shortDate(w[6]!.dateKey)}`;
  });
  protected readonly filtered = computed(() => {
    const t = this.teacherFilter();
    return this.sessions().filter((s) => t == null || s.teacherId === t).sort(compareSessions);
  });
  protected readonly hours = computed(() => agendaHourRange(this.filtered()));
  protected readonly hourLabels = computed(() => {
    const [from, to] = this.hours();
    return Array.from({ length: to - from }, (_, i) => `${String(from + i).padStart(2, '0')}:00`);
  });
  private readonly courtColors = computed(() => {
    const ids = [...new Set(this.sessions().map((s) => s.courtId))].sort();
    return new Map(ids.map((id, i) => [id, TEACHER_COLORS[(i + 1) % TEACHER_COLORS.length]!]));
  });
  protected readonly blocksByDay = computed(() => {
    const [from] = this.hours();
    const byDay = new Map<string, PositionedBlock[]>();
    const sessionsByDay = new Map<string, ClassSession[]>();
    for (const s of this.filtered()) sessionsByDay.set(s.date, [...(sessionsByDay.get(s.date) ?? []), s]);
    for (const [day, list] of sessionsByDay) {
      const layout = new Map(layoutDayBlocks(list).map((l) => [l.id, l]));
      byDay.set(
        day,
        list.map((session) => {
          const l = layout.get(session.id)!;
          return {
            session,
            top: ((l.startMin - from * 60) / 60) * ROW_H + 2,
            height: Math.max(22, ((l.endMin - l.startMin) / 60) * ROW_H - 4),
            leftPct: (l.lane / l.lanes) * 100,
            widthPct: 100 / l.lanes,
            color: this.colorBy() === 'teacher' ? session.teacherColor : this.courtColors().get(session.courtId) ?? TEACHER_COLORS[0]!,
          };
        }),
      );
    }
    return byDay;
  });
  protected readonly nowTop = computed(() => {
    const [from, to] = this.hours();
    const n = this.now();
    const min = n.getHours() * 60 + n.getMinutes();
    if (min < from * 60 || min > to * 60) return null;
    return ((min - from * 60) / 60) * ROW_H;
  });

  private unsub: Unsubscribe | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    const tick = setInterval(() => this.now.set(new Date()), 60_000);
    destroyRef.onDestroy(() => {
      clearInterval(tick);
      this.unsub?.();
    });

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      fetchTeachers(arenaFirestore(), arenaId)
        .then((list) => this.teachers.set(list.filter((t) => t.status === 'active')))
        .catch(() => this.teachers.set([]));
    });

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const week = this.week();
      if (!arenaId) return;
      this.unsub?.();
      this.loading.set(true);
      this.unsub = watchSessionsBetween(
        arenaFirestore(),
        arenaId,
        week[0]!.dateKey,
        week[6]!.dateKey,
        (list) => {
          this.sessions.set(list);
          this.loading.set(false);
          this.loadError.set(null);
        },
        () => {
          this.loading.set(false);
          this.loadError.set('Não foi possível carregar a agenda de aulas.');
        },
      );
    });
  }

  protected shiftWeek(days: number): void {
    this.anchor.set(addDaysKey(this.anchor(), days));
  }

  protected goToday(): void {
    this.anchor.set(todayKeyLocal());
  }

  protected open(sessionId: string): void {
    void this.router.navigate(['/painel/aulas/aula', sessionId]);
  }
}


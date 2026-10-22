import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { ClassesActions } from '../../data/actions/classes.actions';
import { addDays, formatDayKey, parseDayKey, todayKey, wallClock, WEEKDAY_SHORT, weekdayOf } from '../../domain/dates';
import type { ClassSession, TrainingClass } from '../../domain/models';
import { horizonEnd, occurrences } from '../../domain/schedule';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent, SegmentedComponent } from '../../ui/kit';
import { SessionModalComponent } from './session-modal.component';
import { GRID_HOURS, GRID_START_MIN, layoutDay, nowOffset, weekDays } from './week-layout';

/** Altura de uma hora na grade (px). */
const HOUR_PX = 40;
const PX_PER_MIN = HOUR_PX / 60;

interface ScheduleItem {
  key: string;
  date: string;
  startTime: string;
  durationMin: number;
  title: string;
  color: string;
  coachName: string;
  courtName: string;
  cancelled: boolean;
  changed: boolean;
  draft: boolean;
  session: ClassSession | null;
  cls: TrainingClass | null;
}

/** W15 — agenda semanal (ou do dia) a partir das aulas geradas. */
@Component({
  selector: 'ct-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, SegmentedComponent, IconComponent, SessionModalComponent],
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.scss',
})
export class ScheduleComponent {
  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(ClassesActions);
  private readonly router = inject(Router);

  readonly centerId = input.required<string>();

  protected readonly hourPx = HOUR_PX;
  protected readonly hours = Array.from({ length: GRID_HOURS }, (_, i) => `${String(GRID_START_MIN / 60 + i).padStart(2, '0')}:00`);
  protected readonly gridHeight = GRID_HOURS * HOUR_PX;
  protected readonly viewOptions = [
    { value: 'day', label: 'Dia' },
    { value: 'week', label: 'Semana' },
  ];
  protected readonly scopeOptions = [
    { value: 'center', label: 'Centro' },
    { value: 'coach', label: 'Professor' },
    { value: 'court', label: 'Quadra' },
  ];

  private readonly tz = computed(() => this.ctx.center()?.timezone);
  /** Relógio de parede do centro, atualizado a cada minuto (linha "agora"). */
  private readonly now = signal(new Date());
  protected readonly today = computed(() => todayKey(this.tz(), this.now()));

  protected readonly anchor = signal('');
  protected readonly view = signal<string>(this.prefersDay() ? 'day' : 'week');
  protected readonly program = signal<string | null>(null);
  protected readonly scope = signal<string>('center');
  protected readonly coachFilter = signal('');
  protected readonly courtFilter = signal('');
  protected readonly selected = signal<ClassSession | null>(null);
  protected readonly ensureError = signal('');

  protected readonly canEdit = computed(() => this.ctx.isManager() && this.ctx.canWrite());

  protected readonly days = computed(() => {
    const a = this.anchor() || this.today();
    return this.view() === 'week' ? weekDays(a) : [a];
  });

  private readonly items = computed<ScheduleItem[]>(() => {
    const days = this.days();
    const first = days[0]!;
    const last = days[days.length - 1]!;
    const color = (programId: string) => this.store.programById(programId)?.color ?? '#9AA0A6';
    const sessions: ScheduleItem[] = this.store
      .sessions()
      .filter((s) => s.date >= first && s.date <= last)
      .map((s) => ({
        key: s.id,
        date: s.date,
        startTime: s.startTime,
        durationMin: s.durationMin,
        title: s.className,
        color: color(s.programId),
        coachName: s.coachName,
        courtName: s.courtName,
        cancelled: s.status === 'cancelled',
        changed: s.changed,
        draft: false,
        session: s,
        cls: this.store.classById(s.classId) ?? null,
      }));
    // Rascunho ainda não tem aula gerada: mostra a ocorrência prevista, tracejada.
    const drafts: ScheduleItem[] = this.store
      .classes()
      .filter((c) => c.status === 'draft' && c.weekdays.length)
      .flatMap((c) =>
        occurrences(c, first, last).map((date) => ({
          key: `draft_${c.id}_${date}`,
          date,
          startTime: c.startTime,
          durationMin: c.durationMin,
          title: c.name,
          color: color(c.programId),
          coachName: c.coachName,
          courtName: c.courtName,
          cancelled: false,
          changed: false,
          draft: true,
          session: null,
          cls: c,
        })),
      );
    const p = this.program();
    const scope = this.scope();
    return [...sessions, ...drafts].filter((it) => {
      const programId = it.session?.programId ?? it.cls?.programId;
      if (p && programId !== p) return false;
      if (scope === 'coach' && this.coachFilter() && (it.session?.coachUid ?? it.cls?.coachUid) !== this.coachFilter()) return false;
      if (scope === 'court' && this.courtFilter() && (it.session?.courtId ?? it.cls?.courtId) !== this.courtFilter()) return false;
      return true;
    });
  });

  protected readonly columns = computed(() => {
    const items = this.items();
    const today = this.today();
    return this.days().map((day) => ({
      day,
      weekday: WEEKDAY_SHORT[weekdayOf(day)],
      num: parseDayKey(day).d,
      isToday: day === today,
      blocks: layoutDay(items.filter((i) => i.date === day)).map((b) => ({
        ...b,
        topPx: b.top * PX_PER_MIN + 2,
        heightPx: Math.max(18, b.height * PX_PER_MIN - 4),
        left: `calc(${(b.lane / b.lanes) * 100}% + 3px)`,
        width: `calc(${100 / b.lanes}% - 6px)`,
      })),
    }));
  });

  protected readonly nowTop = computed(() => {
    if (!this.days().includes(this.today())) return null;
    const off = nowOffset(wallClock(this.now(), this.tz()).time);
    return off === null ? null : off * PX_PER_MIN;
  });
  protected readonly nowColumn = computed(() => this.days().indexOf(this.today()));

  protected readonly rangeLabel = computed(() => {
    const d = this.days();
    const a = d[0]!;
    const b = d[d.length - 1]!;
    if (a === b) return `${WEEKDAY_SHORT[weekdayOf(a)]} ${formatDayKey(a, true)}`;
    return a.slice(0, 7) === b.slice(0, 7) ? `${parseDayKey(a).d}–${formatDayKey(b)}` : `${formatDayKey(a)} – ${formatDayKey(b)}`;
  });

  protected readonly subtitle = computed(() => {
    const it = this.items().filter((i) => !i.draft);
    const cancelled = it.filter((i) => i.cancelled).length;
    const changed = it.filter((i) => i.changed && !i.cancelled).length;
    return `${this.rangeLabel()} · ${it.length} aula${it.length === 1 ? '' : 's'} · ${cancelled} cancelada${cancelled === 1 ? '' : 's'} · ${changed} alterada${changed === 1 ? '' : 's'}`;
  });

  protected readonly generatedUntil = computed(() => {
    const keys = this.store
      .classes()
      .filter((c) => c.status === 'active' && c.generatedUntil)
      .map((c) => c.generatedUntil!)
      .sort();
    return keys.length ? formatDayKey(keys[0]!) : null;
  });

  protected readonly isEmpty = computed(() => this.store.loaded.sessions() && this.items().length === 0);

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // Professor começa vendo só as próprias aulas.
    effect(() => {
      const me = this.ctx.me();
      if (me?.role === 'coach') {
        untracked(() => {
          if (!this.coachFilter()) {
            this.scope.set('coach');
            this.coachFilter.set(me.uid);
          }
        });
      }
    });

    // Estende as aulas até o horizonte (idempotente). Uma tentativa por turma por visita à tela.
    const attempted = new Set<string>();
    effect(() => {
      if (!this.canEdit() || !this.store.loaded.classes()) return;
      const horizon = horizonEnd(this.today());
      const due = this.store.classes().filter((c) => c.status === 'active' && (c.generatedUntil ?? '') < horizon && !attempted.has(c.id));
      if (due.length === 0) return;
      due.forEach((c) => attempted.add(c.id));
      untracked(() => void this.extend(due));
    });
  }

  private async extend(classes: TrainingClass[]): Promise<void> {
    for (const c of classes) {
      try {
        await this.actions.ensureSessions(c);
      } catch (err) {
        this.ensureError.set(`Não foi possível gerar as próximas aulas de ${c.name}: ${writeErrorMessage(err)}`);
      }
    }
  }

  private prefersDay(): boolean {
    try {
      return window.matchMedia('(max-width: 700px)').matches;
    } catch {
      return false;
    }
  }

  protected value(e: Event): string {
    return (e.target as HTMLSelectElement).value;
  }

  protected shift(dir: -1 | 1): void {
    const a = this.anchor() || this.today();
    this.anchor.set(addDays(a, dir * (this.view() === 'week' ? 7 : 1)));
  }

  protected goToday(): void {
    this.anchor.set('');
  }

  protected setScope(v: string): void {
    this.scope.set(v);
    if (v === 'coach' && !this.coachFilter()) this.coachFilter.set(this.ctx.me()?.uid ?? '');
  }

  protected open(it: ScheduleItem): void {
    if (it.session) {
      this.selected.set(it.session);
    } else if (it.cls && this.canEdit()) {
      void this.router.navigate(['/centro', this.centerId(), 'turmas'], { queryParams: { editar: it.cls.id } });
    }
  }

  protected openSeries(day: string): void {
    const s = this.selected();
    this.selected.set(null);
    if (s) {
      void this.router.navigate(['/centro', this.centerId(), 'turmas'], { queryParams: { editar: s.classId, desde: day } });
    }
  }

  protected newClass(): void {
    void this.router.navigate(['/centro', this.centerId(), 'turmas'], { queryParams: { nova: 1 } });
  }

  protected blockLabel(it: ScheduleItem): string {
    return it.cancelled ? ' · CANCELADA' : it.draft ? ' · RASCUNHO' : it.changed ? ' · ALTERADA' : '';
  }
}

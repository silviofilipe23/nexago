import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked, type OnInit } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { ClassesActions, type ClassInput } from '../../data/actions/classes.actions';
import { formatDayKey, isValidDayKey, isValidTime, todayKey, WEEK_ORDER, WEEKDAY_SHORT, type Weekday } from '../../domain/dates';
import type { TrainingClass } from '../../domain/models';
import { describeConflict, findConflicts, suggestAlternatives, type ClassRule, type ScheduleSuggestion } from '../../domain/schedule';
import { IconComponent } from '../../ui/icon.component';
import { ModalComponent } from '../../ui/kit';

/** W14 — criar/editar turma com conflitos de professor e quadra checados ao vivo. */
@Component({
  selector: 'ct-class-form-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, IconComponent],
  templateUrl: './class-form-modal.component.html',
  styles: `
    fieldset { border: 0; margin: 0; padding: 0; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
    .days { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .days .ct-day { width: 46px; }
    .time { width: 120px; height: 36px; }
    .conflict-title { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-live); }
    .series { border: 1px solid rgba(91,155,255,0.35); background: rgba(91,155,255,0.07); }
  `,
})
export class ClassFormModalComponent implements OnInit {
  private readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(ClassesActions);

  readonly cls = input<TrainingClass | null>(null);
  /** "Vale a partir de" sugerido (vem da agenda). */
  readonly fromDate = input<string | null>(null);
  readonly readonly = input(false);
  readonly closed = output<void>();

  protected readonly week = WEEK_ORDER.map((d) => ({ d, label: WEEKDAY_SHORT[d] }));
  protected readonly today = computed(() => todayKey(this.ctx.center()?.timezone));

  protected readonly name = signal('');
  protected readonly programId = signal('');
  protected readonly level = signal('');
  protected readonly coachUid = signal('');
  protected readonly capacity = signal(6);
  protected readonly duration = signal(60);
  protected readonly weekdays = signal<Weekday[]>([]);
  protected readonly startTime = signal('19:00');
  protected readonly courtId = signal('');
  protected readonly startDate = signal('');
  protected readonly endDate = signal('');
  protected readonly seriesFrom = signal('');
  protected readonly reason = signal('');

  protected readonly closing = signal(false);
  protected readonly closeReason = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly tried = signal(false);

  protected readonly isActive = computed(() => this.cls()?.status === 'active');
  protected readonly isEnded = computed(() => {
    const st = this.cls()?.status;
    return st === 'closed' || st === 'cancelled';
  });
  protected readonly locked = computed(() => this.readonly() || this.isEnded());
  protected readonly title = computed(() => {
    const c = this.cls();
    if (!c) return 'Nova turma';
    return this.locked() ? c.name : 'Editar turma';
  });

  protected readonly levels = computed(() => this.store.programById(this.programId())?.levels ?? []);
  protected readonly activeCourts = computed(() => this.store.courts().filter((c) => c.status === 'active' || c.id === this.courtId()));
  private readonly coachName = computed(() => this.store.memberByUid(this.coachUid())?.displayName ?? this.cls()?.coachName ?? '');
  private readonly courtName = computed(() => this.store.courts().find((c) => c.id === this.courtId())?.name ?? '');
  protected readonly minCapacity = computed(() => Math.max(1, this.cls()?.seatsTaken ?? 0));

  private readonly candidate = computed<ClassRule>(() => ({
    id: this.cls()?.id,
    name: this.name(),
    coachUid: this.coachUid(),
    courtId: this.courtId(),
    courtName: this.courtName(),
    weekdays: this.weekdays(),
    startTime: this.startTime(),
    durationMin: this.duration(),
    // Edição de turma ativa só vale daqui pra frente: conflito conta a partir da data escolhida.
    startDate: this.seriesChanged() && isValidDayKey(this.seriesFrom()) ? this.seriesFrom() : this.startDate() || this.today(),
    endDate: this.endDate() || null,
  }));

  protected readonly conflicts = computed(() => {
    const c = this.candidate();
    if (this.locked() || !isValidTime(c.startTime) || c.weekdays.length === 0 || c.durationMin <= 0) return [];
    return findConflicts(c, this.store.classes()).map((x) => ({
      kind: x.kind === 'coach' ? 'Professor' : this.courtName() || 'Quadra',
      text: describeConflict(x, this.coachName().split(' ')[0] ?? '', this.courtName()),
    }));
  });

  protected readonly suggestions = computed(() => {
    if (this.conflicts().length === 0) return [];
    return suggestAlternatives(
      this.candidate(),
      this.store.classes(),
      this.store.courts().filter((c) => c.status === 'active'),
      this.store.coaches().map((m) => ({ uid: m.uid, name: m.displayName })),
    );
  });

  /** Mudou algo que reescreve aulas já geradas (dias, horário, duração, professor, quadra, fim). */
  protected readonly seriesChanged = computed(() => {
    const c = this.cls();
    if (!c || c.status !== 'active') return false;
    return (
      [...c.weekdays].sort().join() !== [...this.weekdays()].sort().join() ||
      c.startTime !== this.startTime() ||
      c.durationMin !== this.duration() ||
      c.coachUid !== this.coachUid() ||
      c.courtId !== this.courtId() ||
      (c.endDate ?? '') !== this.endDate()
    );
  });

  protected readonly problems = computed(() => {
    const p: string[] = [];
    if (this.name().trim().length < 2) p.push('Informe o nome da turma.');
    if (!this.programId()) p.push('Escolha a modalidade.');
    if (this.levels().length && !this.level()) p.push('Escolha o nível.');
    if (!this.coachUid()) p.push('Escolha o professor.');
    if (!this.courtId()) p.push('Escolha a quadra.');
    if (this.weekdays().length === 0) p.push('Marque pelo menos um dia.');
    if (!isValidTime(this.startTime())) p.push('Horário inválido.');
    if (!(this.duration() >= 15 && this.duration() <= 300)) p.push('Duração entre 15 e 300 minutos.');
    if (!(this.capacity() >= this.minCapacity())) {
      p.push(this.minCapacity() > 1 ? `Capacidade não pode ser menor que as ${this.minCapacity()} vagas ocupadas.` : 'Capacidade mínima de 1 aluno.');
    }
    if (!isValidDayKey(this.startDate())) p.push('Data de início inválida.');
    if (this.endDate() && (!isValidDayKey(this.endDate()) || this.endDate() < this.startDate())) p.push('Data de fim precisa ser depois do início.');
    if (this.seriesChanged()) {
      if (!isValidDayKey(this.seriesFrom()) || this.seriesFrom() < this.today()) p.push('A mudança precisa valer de hoje em diante.');
      if (this.reason().trim().length < 3) p.push('Informe o motivo da mudança.');
    }
    if (this.conflicts().length) p.push('Resolva os conflitos de horário antes de salvar.');
    return p;
  });

  constructor() {
    // Aberto por `?nova=1` logo no carregamento, as modalidades podem chegar depois do ngOnInit:
    // sem isso a turma nova ficaria sem modalidade e sem nível.
    effect(() => {
      const first = this.store.programs()[0];
      untracked(() => {
        if (!this.cls() && !this.programId() && first) {
          this.setProgram(first.id);
        }
      });
    });
  }

  ngOnInit(): void {
    const c = this.cls();
    const firstProgram = this.store.programs()[0];
    this.name.set(c?.name ?? '');
    this.programId.set(c?.programId ?? firstProgram?.id ?? '');
    this.level.set(c?.level ?? firstProgram?.levels[0] ?? '');
    this.coachUid.set(c?.coachUid ?? '');
    this.capacity.set(c?.capacity ?? 6);
    this.duration.set(c?.durationMin ?? 60);
    this.weekdays.set(c ? [...c.weekdays] : []);
    this.startTime.set(c?.startTime ?? '19:00');
    this.courtId.set(c?.courtId ?? '');
    this.startDate.set(c?.startDate ?? this.today());
    this.endDate.set(c?.endDate ?? '');
    const from = this.fromDate();
    this.seriesFrom.set(from && isValidDayKey(from) && from >= this.today() ? from : this.today());
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected numberValue(e: Event): number {
    return Number((e.target as HTMLInputElement).value);
  }

  protected setProgram(id: string): void {
    this.programId.set(id);
    this.level.set(this.store.programById(id)?.levels[0] ?? '');
  }

  protected toggleDay(d: Weekday): void {
    this.weekdays.update((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]));
  }

  protected applySuggestion(s: ScheduleSuggestion): void {
    if (s.patch.startTime) this.startTime.set(s.patch.startTime);
    if (s.patch.courtId) this.courtId.set(s.patch.courtId);
    if (s.patch.coachUid) this.coachUid.set(s.patch.coachUid);
    if (s.patch.weekdays) this.weekdays.set([...s.patch.weekdays]);
  }

  protected fmt(key: string): string {
    return isValidDayKey(key) ? formatDayKey(key, true) : key;
  }

  private buildInput(): ClassInput {
    return {
      name: this.name().trim(),
      programId: this.programId(),
      level: this.level(),
      coachUid: this.coachUid(),
      coachName: this.coachName(),
      weekdays: WEEK_ORDER.filter((d) => this.weekdays().includes(d)),
      startTime: this.startTime(),
      durationMin: this.duration(),
      courtId: this.courtId(),
      courtName: this.courtName(),
      capacity: this.capacity(),
      startDate: this.startDate(),
      endDate: this.endDate() || null,
    };
  }

  protected save(activate: boolean): Promise<void> {
    this.tried.set(true);
    if (this.problems().length) return Promise.resolve();
    const c = this.cls();
    const input = this.buildInput();
    return this.run(async () => {
      if (c && this.seriesChanged()) {
        await this.actions.applySeriesChange(c, input, this.seriesFrom(), this.reason().trim());
      } else {
        await this.actions.saveClass(c?.id ?? null, input, activate);
      }
    });
  }

  protected closeClass(): Promise<void> {
    const c = this.cls();
    if (!c) return Promise.resolve();
    if (this.closeReason().trim().length < 3) {
      this.error.set('Informe o motivo do encerramento.');
      return Promise.resolve();
    }
    return this.run(() => this.actions.closeClass(c, this.closeReason().trim()));
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await fn();
      this.closed.emit();
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}

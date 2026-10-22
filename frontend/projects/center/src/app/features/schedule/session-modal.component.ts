import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, type OnInit } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { ClassesActions, type SessionPatch } from '../../data/actions/classes.actions';
import { formatDayWithWeekday, isValidTime, todayKey } from '../../domain/dates';
import { holdsSeat } from '../../domain/enrollment';
import type { ClassSession } from '../../domain/models';
import { endTime, overlaps } from '../../domain/schedule';
import { ModalComponent } from '../../ui/kit';

type Action = 'cancel' | 'time' | 'coach' | 'court';

const ACTIONS: { value: Action; label: string }[] = [
  { value: 'cancel', label: 'Cancelar' },
  { value: 'time', label: 'Mudar horário' },
  { value: 'coach', label: 'Trocar professor' },
  { value: 'court', label: 'Trocar quadra' },
];

/** W16 — mexer em UMA aula (cancelar/alterar) sem tocar na regra da turma. */
@Component({
  selector: 'ct-session-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  templateUrl: './session-modal.component.html',
})
export class SessionModalComponent implements OnInit {
  private readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(ClassesActions);

  readonly session = input.required<ClassSession>();
  readonly canEdit = input(false);
  /** Professor da aula (com `attendance`) ou gestor, aula de hoje ou passada. */
  readonly canAttend = input(false);
  readonly closed = output<void>();
  /** Abre a chamada desta aula. */
  readonly attendance = output<void>();
  /** "Esta e as próximas": a tela pai leva para a edição da turma a partir deste dia. */
  readonly series = output<string>();

  protected readonly actionOptions = ACTIONS;
  protected readonly action = signal<Action>('cancel');
  protected readonly reason = signal('');
  protected readonly newTime = signal('');
  protected readonly newCoach = signal('');
  protected readonly newCourt = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  private readonly today = computed(() => todayKey(this.ctx.center()?.timezone));
  protected readonly isPast = computed(() => this.session().date < this.today() || this.session().status === 'done');
  protected readonly editable = computed(() => this.canEdit() && !this.isPast());

  protected readonly kicker = computed(() => {
    const s = this.session();
    return `${formatDayWithWeekday(s.date)} · ${s.startTime}–${endTime(s.startTime, s.durationMin)} · ${s.courtName || 'sem quadra'}`;
  });

  /** Matrículas que ocupam vaga (pausadas não contam) + alunos de reposição nesta data. */
  protected readonly enrolled = computed(() =>
    this.store.enrollments().filter((e) => e.classId === this.session().classId && holdsSeat(e.status) && e.status !== 'paused').length,
  );
  protected readonly makeups = computed(() => this.session().makeupStudentIds.length);
  protected readonly autoMakeup = computed(() => this.ctx.center()?.policies.cancelledClassMakeup === 'auto');
  protected readonly marked = computed(() => Object.keys(this.session().attendance).length);

  /** Choque com outra aula do mesmo dia (mesmo professor ou mesma quadra) depois da mudança. */
  protected readonly clash = computed(() => {
    const s = this.session();
    const a = this.action();
    if (a === 'cancel') return '';
    const time = a === 'time' ? this.newTime() : s.startTime;
    const coach = a === 'coach' ? this.newCoach() : s.coachUid;
    const court = a === 'court' ? this.newCourt() : s.courtId;
    if (!isValidTime(time)) return '';
    const other = this.store
      .sessions()
      .find(
        (o) =>
          o.id !== s.id &&
          o.date === s.date &&
          o.status !== 'cancelled' &&
          overlaps(time, s.durationMin, o.startTime, o.durationMin) &&
          ((coach && o.coachUid === coach) || (court && o.courtId === court)),
      );
    if (!other) return '';
    const who = coach && other.coachUid === coach ? `${other.coachName || 'O professor'} já dá ${other.className}` : `${other.courtName || 'A quadra'} ocupada por ${other.className}`;
    return `${who} · ${other.startTime}–${endTime(other.startTime, other.durationMin)}`;
  });

  protected readonly patch = computed<SessionPatch | null>(() => {
    const s = this.session();
    switch (this.action()) {
      case 'time':
        return isValidTime(this.newTime()) && this.newTime() !== s.startTime ? { startTime: this.newTime() } : null;
      case 'coach': {
        const m = this.store.memberByUid(this.newCoach());
        return m && m.uid !== s.coachUid ? { coachUid: m.uid, coachName: m.displayName } : null;
      }
      case 'court': {
        const c = this.store.courts().find((x) => x.id === this.newCourt());
        return c && c.id !== s.courtId ? { courtId: c.id, courtName: c.name } : null;
      }
      default:
        return null;
    }
  });

  protected readonly primaryLabel = computed(() => {
    if (this.action() === 'cancel') {
      const n = this.enrolled() + this.makeups();
      return n ? `Cancelar aula · ${n} aluno${n > 1 ? 's' : ''} afetado${n > 1 ? 's' : ''}` : 'Cancelar aula';
    }
    return 'Salvar só esta aula';
  });

  ngOnInit(): void {
    const s = this.session();
    this.newTime.set(s.startTime);
    this.newCoach.set(s.coachUid);
    this.newCourt.set(s.courtId);
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(): Promise<void> {
    const s = this.session();
    const reason = this.reason().trim();
    if (reason.length < 3) {
      this.error.set('Informe o motivo (aparece para os alunos e na auditoria).');
      return Promise.resolve();
    }
    if (this.action() === 'cancel') {
      return this.run(() => this.actions.cancelSession(s, reason));
    }
    const patch = this.patch();
    if (!patch) {
      this.error.set('Escolha o novo valor.');
      return Promise.resolve();
    }
    if (this.clash()) {
      this.error.set('A mudança gera conflito com outra aula.');
      return Promise.resolve();
    }
    return this.run(() => this.actions.changeSession(s, patch, reason));
  }

  protected restore(): Promise<void> {
    return this.run(() => this.actions.restoreSession(this.session()));
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

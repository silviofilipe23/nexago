import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { AttendanceActions, MARK_LABELS } from '../../data/actions/attendance.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import { formatDayWithWeekday, formatInstant } from '../../domain/dates';
import { placeLabel } from '../../domain/locations';
import type { AttendanceMark } from '../../domain/models';
import { endTime } from '../../domain/schedule';
import { AuditTrailComponent, ModalComponent, PersonComponent, SegmentedComponent, type AuditRow } from '../../ui/kit';
import { applyAttendanceDraft, attendanceRoster, EMPTY_DRAFT, effectLabel, rsvpLabel, type AttendanceDraft } from './attendance-roster';

const MARK_OPTIONS = [
  { value: 'present', label: 'P' },
  { value: 'excused', label: 'J' },
  { value: 'absent', label: 'F' },
];

/**
 * Chamada da aula (protótipo P3 Chamada, P4 Encaixar reposição, P5 Finalizar, P6 Corrigir,
 * P7 Histórico). Lê a aula AO VIVO do store: se outra pessoa corrigir, a tela acompanha.
 */
@Component({
  selector: 'ct-attendance-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, PersonComponent, SegmentedComponent, AuditTrailComponent],
  templateUrl: './attendance-modal.component.html',
  styles: `
    .row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--nx-line); flex-wrap: wrap; }
    .row:first-child { border-top: none; }
    .fix { display: flex; gap: 8px; flex-wrap: wrap; width: 100%; padding-left: 42px; }
    .fix .ct-input { flex: 1; min-width: 180px; }
    .sum { display: flex; gap: 14px; flex-wrap: wrap; }
  `,
})
export class AttendanceModalComponent {
  private readonly ctx = inject(CenterContextService);
  private readonly store = inject(CenterStore);
  private readonly actions = inject(AttendanceActions);

  readonly sessionId = input.required<string>();
  readonly closed = output<void>();

  protected readonly markOptions = MARK_OPTIONS;
  protected readonly markLabels = MARK_LABELS;

  protected readonly session = computed(() => this.store.sessions().find((s) => s.id === this.sessionId()) ?? null);
  protected readonly done = computed(() => this.session()?.status === 'done');
  protected readonly canManage = computed(() => this.ctx.isManager() && this.ctx.canWrite());

  /**
   * Só o que esta tela mudou (antes de finalizar). A chamada mostrada e gravada é a da aula ao
   * vivo + este rascunho: check-in e "não vou" que chegam com a tela aberta não se perdem.
   */
  private readonly draft = signal<AttendanceDraft>(EMPTY_DRAFT);
  private loadedFor = '';
  private readonly merged = computed(() => {
    const s = this.session();
    return s ? applyAttendanceDraft(s, this.draft()) : { attendance: {}, makeupStudentIds: [] };
  });
  protected readonly marks = computed(() => this.merged().attendance);
  protected readonly makeupIds = computed(() => this.merged().makeupStudentIds);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly fixing = signal<string | null>(null);
  protected readonly fixTo = signal<AttendanceMark>('present');
  protected readonly fixReason = signal('');
  protected readonly reopening = signal(false);
  protected readonly reopenReason = signal('');
  protected readonly addingMakeup = signal('');
  /** Professor não lê todos os alunos: candidatos (id, nome, créditos) vêm do servidor. */
  private readonly seesAllStudents = computed(() => this.ctx.isManager() || this.ctx.has('enroll_students') || this.ctx.has('view_finance'));
  private readonly remoteCandidates = signal<{ id: string; name: string; makeupCredits: number }[]>([]);
  private readonly remoteNames = computed(() => new Map(this.remoteCandidates().map((c) => [c.id, c.name])));

  constructor() {
    effect(() => {
      const id = this.sessionId();
      if (!id || this.seesAllStudents()) return;
      untracked(() => {
        this.actions
          .listMakeupCandidates(id)
          .then((r) => this.remoteCandidates.set(r.candidates))
          .catch(() => this.remoteCandidates.set([]));
      });
    });
    // Rascunho zera ao trocar de aula.
    effect(() => {
      const id = this.sessionId();
      if (this.loadedFor === id) return;
      this.loadedFor = id;
      untracked(() => this.draft.set(EMPTY_DRAFT));
    });
  }

  protected readonly kicker = computed(() => {
    const s = this.session();
    return s ? `${formatDayWithWeekday(s.date)} · ${s.startTime}–${endTime(s.startTime, s.durationMin)} · ${placeLabel(s)}` : '';
  });

  protected readonly rows = computed(() => {
    const s = this.session();
    if (!s) return [];
    const cls = this.store.classById(s.classId);
    const attendance = this.done() ? s.attendance : this.marks();
    const makeups = this.done() ? s.makeupStudentIds : this.makeupIds();
    return attendanceRoster(cls?.rosterStudentIds ?? [], attendance, makeups).map((r) => {
      const st = this.store.studentById(r.studentId);
      return {
        ...r,
        name: st?.name ?? this.remoteNames().get(r.studentId) ?? (r.makeup ? 'Aluno de reposição' : 'Aluno removido'),
        sub: [r.makeup ? 'Reposição' : '', st?.isMinor ? 'Menor' : ''].filter(Boolean).join(' · '),
        mark: (attendance[r.studentId] as AttendanceMark | undefined) ?? null,
        effect: effectLabel(s.effectsApplied[r.studentId]),
        /** Resposta do aluno pelo app e se a falta justificada foi ele que lançou (no prazo). */
        rsvp: rsvpLabel(s.rsvps[r.studentId], s.attendanceByStudent[r.studentId] === true),
        /** Mensalidade atrasada além do limite da política (o servidor marca; sem valores para o professor). */
        hold: st?.billingHold === true,
      };
    });
  });

  protected readonly unmarked = computed(() => this.rows().filter((r) => !r.mark).length);
  protected readonly counts = computed(() => {
    const v = this.rows().map((r) => r.mark);
    return { p: v.filter((m) => m === 'present').length, j: v.filter((m) => m === 'excused').length, f: v.filter((m) => m === 'absent').length };
  });

  /** Quem pode ser encaixado: tem crédito de reposição e ainda não está na lista. */
  protected readonly makeupCandidates = computed(() => {
    const inList = new Set(this.rows().map((r) => r.studentId));
    if (!this.seesAllStudents()) return this.remoteCandidates().filter((c) => !inList.has(c.id));
    return this.store.students().filter((st) => st.status === 'active' && st.makeupCredits > 0 && !inList.has(st.id));
  });

  protected readonly history = computed<AuditRow[]>(() => {
    const s = this.session();
    if (!s) return [];
    const tz = this.ctx.center()?.timezone;
    const name = (id: string) => this.store.studentById(id)?.name ?? 'Aluno';
    const rows: AuditRow[] = [...s.attendanceLog]
      .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
      .map((c) => ({
        when: formatInstant(c.at, tz),
        who: c.byName,
        what: `${name(c.studentId)}: ${c.from ? MARK_LABELS[c.from] : 'sem marcação'} → ${c.to ? MARK_LABELS[c.to] : '—'}`,
        why: c.reason,
      }));
    if (s.finalizedAt) {
      rows.push({ when: formatInstant(s.finalizedAt, tz), who: s.finalizedByName || '—', what: 'Aula finalizada' });
    }
    return rows;
  });

  protected setMark(studentId: string, v: string): void {
    this.draft.update((d) => ({ ...d, marks: { ...d.marks, [studentId]: v as AttendanceMark } }));
  }

  protected markAll(v: AttendanceMark): void {
    const cur = this.marks();
    const add: Record<string, AttendanceMark> = {};
    for (const r of this.rows()) if (!cur[r.studentId]) add[r.studentId] = v;
    this.draft.update((d) => ({ ...d, marks: { ...d.marks, ...add } }));
  }

  protected addMakeup(): void {
    const id = this.addingMakeup();
    if (!id) return;
    this.draft.update((d) => ({
      ...d,
      addedMakeups: [...d.addedMakeups, id],
      removedMakeups: d.removedMakeups.filter((x) => x !== id),
    }));
    this.addingMakeup.set('');
  }

  protected removeMakeup(id: string): void {
    this.draft.update((d) => ({
      marks: { ...d.marks, [id]: null },
      addedMakeups: d.addedMakeups.filter((x) => x !== id),
      removedMakeups: [...d.removedMakeups, id],
    }));
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected async save(finalize: boolean): Promise<void> {
    const s = this.session();
    if (!s) return;
    if (finalize && this.unmarked() > 0) {
      this.error.set(`Marque todos os alunos antes de finalizar (${this.unmarked()} sem marcação).`);
      return;
    }
    const ok = await this.run(() => this.actions.save(s, this.marks(), this.makeupIds(), finalize));
    if (ok) this.draft.set(EMPTY_DRAFT);
  }

  protected startFix(studentId: string, current: AttendanceMark | null): void {
    this.fixing.set(studentId);
    this.fixTo.set(current === 'present' ? 'excused' : 'present');
    this.fixReason.set('');
    this.error.set('');
  }

  protected async confirmFix(studentId: string, name: string): Promise<void> {
    const s = this.session();
    if (!s) return;
    if (this.fixReason().trim().length < 3) {
      this.error.set('Explique o motivo da correção.');
      return;
    }
    if (s.attendance[studentId] === this.fixTo()) {
      this.fixing.set(null);
      return;
    }
    const ok = await this.run(() => this.actions.correct(s, studentId, name, this.fixTo(), this.fixReason()));
    if (ok) this.fixing.set(null);
  }

  protected async reopen(): Promise<void> {
    const s = this.session();
    if (!s) return;
    if (this.reopenReason().trim().length < 3) {
      this.error.set('Explique por que a chamada vai ser reaberta.');
      return;
    }
    const ok = await this.run(() => this.actions.reopen(s, this.reopenReason()));
    if (ok) {
      this.reopening.set(false);
      this.draft.set(EMPTY_DRAFT);
    }
  }

  private async run(fn: () => Promise<void>): Promise<boolean> {
    this.busy.set(true);
    this.error.set('');
    try {
      await fn();
      return true;
    } catch (err) {
      this.error.set(writeErrorMessage(err));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { initialsOf } from '../../profile/profile-format';
import { NxBlockingDialogComponent, NxInlineMessageComponent, NxToastService } from '../../shared/feedback';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import {
  ATTENDANCE_MARKS,
  ATTENDANCE_MARK_LABEL,
  attendanceCounts,
  attendanceCountsLine,
  attendancePayload,
  attendancePrimaryLabel,
  closeAttendanceNotice,
  draftDiffers,
  draftFromRoster,
  markRemainingPresent,
  teacherSessionSubtitle,
  toggleMark,
  type AttendanceDraft,
  type AttendanceMark,
  type TeacherRoster,
} from './teacher-attendance.model';
import { TeacherAttendanceError, fetchMyClassSessionRoster, saveMyClassAttendance } from './teacher-attendance.repository';

/** Ponto de dados da tela — o harness de QA troca por um dublê (`providers` da rota). */
@Injectable({ providedIn: 'root' })
export class TeacherAttendanceApi {
  load(sessionId: string): Promise<TeacherRoster> {
    return fetchMyClassSessionRoster(sessionId);
  }

  save(input: Parameters<typeof saveMyClassAttendance>[0]): ReturnType<typeof saveMyClassAttendance> {
    return saveMyClassAttendance(input);
  }
}

/**
 * Chamada de uma aula minha (`/professor/aulas/:sessionId`), aberta pelo "Fazer chamada" da
 * agenda. Só com vínculo `ACTIVE` + "Gerenciar as próprias aulas" naquela arena — o servidor
 * recusa o resto, e a tela mostra o motivo dele. Mesmo gesto da chamada do portal da arena:
 * rascunho local, "Marcar restantes presentes", salvar sem fechar e fechar (com aviso de quem
 * ficou sem marca). Sem encaixe, cancelamento nem dado de contato: isso é da arena.
 */
@Component({
  selector: 'app-teacher-attendance',
  imports: [RouterLink, AtPanelShellComponent, NxBlockingDialogComponent, NxInlineMessageComponent, NxPageLoadingComponent],
  templateUrl: './teacher-attendance.component.html',
  styleUrl: './teacher-attendance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherAttendanceComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(TeacherAttendanceApi);
  private readonly toasts = inject(NxToastService);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly marks = ATTENDANCE_MARKS;
  protected readonly markLabel = ATTENDANCE_MARK_LABEL;
  protected readonly initialsOf = initialsOf;

  protected readonly sessionId = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('sessionId') ?? '')), {
    initialValue: '',
  });

  protected readonly roster = signal<TeacherRoster | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<TeacherAttendanceError | null>(null);
  protected readonly draft = signal<AttendanceDraft>({});
  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** "Fechar com alunos sem marca?" aberto. */
  protected readonly confirmClose = signal(false);

  protected readonly session = computed(() => this.roster()?.session ?? null);
  protected readonly students = computed(() => this.roster()?.students ?? []);
  protected readonly counts = computed(() => attendanceCounts(this.draft()));
  protected readonly countsLine = computed(() => attendanceCountsLine(this.counts()));
  protected readonly subtitle = computed(() => {
    const s = this.session();
    return s ? teacherSessionSubtitle(s) : '';
  });
  protected readonly canceled = computed(() => this.session()?.status === 'canceled');
  protected readonly completed = computed(() => this.session()?.status === 'completed');
  /** Dá para marcar agora: o servidor abriu a chamada (dia da aula ou depois, não cancelada). */
  protected readonly editable = computed(() => {
    const s = this.session();
    return s != null && s.attendanceOpen && s.status !== 'canceled' && !this.saving();
  });
  private readonly noteChanged = computed(() => this.note().trim() !== (this.session()?.teacherNote ?? ''));
  protected readonly dirty = computed(() => draftDiffers(this.draft(), this.students()) || this.noteChanged());
  protected readonly primaryLabel = computed(() =>
    attendancePrimaryLabel(this.session()?.status ?? 'scheduled', this.counts().present),
  );
  protected readonly primaryDisabled = computed(() => !this.editable() || (this.completed() && !this.dirty()));
  protected readonly unmarkedBody = computed(() => {
    const n = this.counts().unmarked;
    return `${n} aluno${n === 1 ? '' : 's'} fica${n === 1 ? '' : 'm'} sem registro nesta aula. Dá para corrigir depois.`;
  });

  constructor() {
    effect(() => {
      const id = this.sessionId();
      untracked(() => void this.load(id));
    });
  }

  protected async load(sessionId = this.sessionId()): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.applyRoster(await this.api.load(sessionId));
    } catch (err) {
      this.roster.set(null);
      this.loadError.set(
        err instanceof TeacherAttendanceError ? err : new TeacherAttendanceError('Não foi possível carregar a lista da aula.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  private applyRoster(roster: TeacherRoster): void {
    this.roster.set(roster);
    this.draft.set(draftFromRoster(roster.students));
    this.note.set(roster.session.teacherNote ?? '');
  }

  protected markOf(studentId: string): AttendanceMark | null {
    return this.draft()[studentId] ?? null;
  }

  protected toggle(studentId: string, mark: AttendanceMark): void {
    if (!this.editable()) return;
    this.draft.update((d) => toggleMark(d, studentId, mark));
    this.saveError.set(null);
  }

  protected markRemaining(): void {
    if (!this.editable()) return;
    this.draft.update(markRemainingPresent);
    this.saveError.set(null);
  }

  protected onNoteInput(value: string): void {
    this.note.set(value);
  }

  /** Botão principal. Fechar com aluno sem marca pede confirmação antes. */
  protected requestClose(): void {
    if (this.primaryDisabled()) return;
    if (!this.completed() && this.counts().unmarked > 0) {
      this.confirmClose.set(true);
      return;
    }
    void this.save(true);
  }

  protected confirmAndClose(): void {
    this.confirmClose.set(false);
    void this.save(true);
  }

  protected async save(close: boolean): Promise<void> {
    const s = this.session();
    if (!s || !this.editable()) return;
    const wasCompleted = s.status === 'completed';
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const result = await this.api.save({
        sessionId: s.sessionId,
        marks: attendancePayload(this.draft(), this.students()),
        teacherNote: this.note().trim() || null,
        close,
      });
      if (wasCompleted) {
        this.toasts.success('Chamada corrigida.');
      } else if (close) {
        this.toasts.success(closeAttendanceNotice(result.credited, result.debited));
      } else {
        this.toasts.success('Chamada salva.', 'Feche a chamada quando terminar.');
      }
      this.applySaved(close);
    } catch (err) {
      this.saveError.set(err instanceof TeacherAttendanceError ? err.message : 'Não foi possível salvar a chamada. Tente de novo.');
      return;
    } finally {
      this.saving.set(false);
    }
    // Relê do servidor (a arena pode ter mexido na mesma aula); falhar aqui não desfaz o que salvou.
    try {
      this.applyRoster(await this.api.load(s.sessionId));
    } catch {
      // a tela já mostra o que foi gravado (`applySaved`)
    }
  }

  /** O que acabou de ser gravado vira o estado salvo da tela, sem esperar a releitura. */
  private applySaved(close: boolean): void {
    const roster = this.roster();
    if (!roster) return;
    const draft = this.draft();
    const note = this.note().trim() || null;
    this.roster.set({
      session: { ...roster.session, teacherNote: note, status: close ? 'completed' : roster.session.status },
      students: roster.students.map((st) => ({ ...st, mark: draft[st.studentId] ?? null })),
    });
    this.note.set(note ?? '');
  }
}

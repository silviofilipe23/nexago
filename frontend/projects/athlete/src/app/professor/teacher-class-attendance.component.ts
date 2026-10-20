import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { fetchMyClassSessionRoster, saveTeacherClassAttendance, TeacherClassError } from '../data/class-agenda-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxInlineMessageComponent, NxToastService } from '../shared/feedback';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import {
  ATTENDANCE_MARK_LABEL,
  attendanceCounts,
  attendancePayload,
  draftDiffers,
  draftFromRoster,
  shortDayLabel,
  withUnmarkedPresent,
  type AttendanceDraft,
  type AttendanceMark,
  type TeacherRoster,
} from './teacher-attendance.model';
import { PfNoteComponent, type PfNoteTone } from './ui/professor-ui.components';

const MARKS: readonly AttendanceMark[] = ['present', 'absent', 'excused'];

/**
 * Chamada de uma aula que o atleta dá como professor (`/professor/aulas/:sessionId`), liberada
 * pelo vínculo com a arena ("Gerenciar as próprias aulas"). Presente / falta / avisou por aluno,
 * "Todos presentes" e "Fechar chamada" — sem encaixe nem cancelamento, que seguem da arena. As
 * marcas ficam num rascunho local até fechar. Entrada pelo "Fazer chamada" da agenda.
 */
@Component({
  selector: 'app-teacher-class-attendance',
  imports: [RouterLink, AtPanelShellComponent, NxInlineMessageComponent, NxPageLoadingComponent, PfNoteComponent],
  templateUrl: './teacher-class-attendance.component.html',
  styleUrl: './teacher-class-attendance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherClassAttendanceComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(NxToastService);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly sessionId = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('sessionId') ?? '')), {
    initialValue: '',
  });

  protected readonly markOptions = MARKS;
  protected readonly markLabel = ATTENDANCE_MARK_LABEL;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly roster = signal<TeacherRoster | null>(null);
  /** Rascunho local (todas as marcas); `null` até a lista chegar. */
  protected readonly draft = signal<AttendanceDraft | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** Fechar com aluno sem marca pede confirmação na própria tela (sem `confirm()` nativo). */
  protected readonly confirmingClose = signal(false);

  protected readonly session = computed(() => this.roster()?.session ?? null);
  protected readonly counts = computed(() => attendanceCounts(this.draft() ?? {}));
  protected readonly editable = computed(() => (this.session()?.attendanceOpen ?? false) && !this.saving());
  protected readonly dirty = computed(() => {
    const roster = this.roster();
    const draft = this.draft();
    return roster != null && draft != null && draftDiffers(draft, roster);
  });
  protected readonly subtitle = computed(() => {
    const s = this.session();
    return s ? `${s.startTime}–${s.endTime} · ${s.courtName} · ${s.arenaName}` : '';
  });
  protected readonly footerLabel = computed(() => {
    if (this.session()?.status === 'completed') return 'Salvar alterações';
    const p = this.counts().present;
    return `Fechar chamada · ${p} presente${p === 1 ? '' : 's'}`;
  });
  protected readonly canSave = computed(
    () => this.editable() && (this.session()?.status !== 'completed' || this.dirty()),
  );
  protected readonly notice = computed<{ tone: PfNoteTone; text: string } | null>(() => {
    const s = this.session();
    if (!s) return null;
    if (s.status === 'canceled') return { tone: 'red', text: 'Aula cancelada pela arena. A chamada fica fechada.' };
    if (!s.attendanceOpen) {
      return {
        tone: 'dim',
        text: `A chamada abre no dia da aula (${shortDayLabel(s.date)}). Por enquanto, esta é a lista de quem faz a turma nesse dia.`,
      };
    }
    if (s.status === 'completed') return { tone: 'blue', text: 'Chamada fechada. Ainda dá para corrigir uma marca.' };
    return {
      tone: 'yellow',
      text: 'A arena vê a chamada assim que você fecha — reposição e pacote de aulas são lançados na hora.',
    };
  });

  constructor() {
    effect(() => {
      const id = this.sessionId();
      if (id) void this.load(id);
    });
  }

  protected async load(sessionId = this.sessionId()): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const roster = await fetchMyClassSessionRoster(sessionId);
      this.roster.set(roster);
      this.draft.set(draftFromRoster(roster));
    } catch (err) {
      this.loadError.set(err instanceof TeacherClassError ? err.message : 'Não foi possível abrir a chamada agora.');
    } finally {
      this.loading.set(false);
    }
  }

  protected markOf(studentId: string): AttendanceMark | null {
    return this.draft()?.[studentId] ?? null;
  }

  /** Tocar a marca que já está escolhida limpa o aluno. */
  protected setMark(studentId: string, mark: AttendanceMark): void {
    if (!this.editable()) return;
    this.confirmingClose.set(false);
    this.draft.update((d) => (d ? { ...d, [studentId]: d[studentId] === mark ? null : mark } : d));
  }

  protected allPresent(): void {
    if (!this.editable()) return;
    this.draft.update((d) => (d ? withUnmarkedPresent(d) : d));
  }

  protected async save(force = false): Promise<void> {
    const session = this.session();
    const draft = this.draft();
    if (!session || !draft || !this.canSave()) return;
    const closing = session.status !== 'completed';
    const counts = this.counts();
    if (closing && counts.unmarked > 0 && !force) {
      this.confirmingClose.set(true);
      return;
    }
    this.confirmingClose.set(false);
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await saveTeacherClassAttendance(session.sessionId, attendancePayload(draft), true);
      const p = counts.present;
      this.toasts.success(closing ? `Chamada fechada · ${p} presente${p === 1 ? '' : 's'}` : 'Chamada atualizada');
      if (closing) {
        void this.router.navigate(['/agenda']);
        return;
      }
      await this.load(session.sessionId);
    } catch (err) {
      this.saveError.set(err instanceof TeacherClassError ? err.message : 'Não foi possível salvar a chamada.');
    } finally {
      this.saving.set(false);
    }
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0]!.charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
    return (first + last).toUpperCase();
  }
}

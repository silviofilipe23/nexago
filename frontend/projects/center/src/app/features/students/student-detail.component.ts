import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { StudentsActions } from '../../data/actions/students.actions';
import { formatDayKey, formatInstant, monthLabel, todayKey, wallClock } from '../../domain/dates';
import { CONTRACT_STATE, contractState, sortContracts } from '../../domain/contracts';
import { holdsSeat, invoiceDisplayStatus } from '../../domain/enrollment';
import { attendanceRate, tallyAttendance } from '../../domain/metrics';
import { formatBRL } from '../../domain/money';
import { ENROLLMENT_STATUS, INVOICE_STATUS, STUDENT_STATUS, type AttendanceMark, type Enrollment, type Student, type StudentStatus } from '../../domain/models';
import { placeLabel } from '../../domain/locations';
import { weekdaysLabel } from '../../domain/schedule';
import { IconComponent } from '../../ui/icon.component';
import { AuditTrailComponent, BannerComponent, ModalComponent, PageHeaderComponent, PersonComponent, SegmentedComponent, ToggleComponent, type AuditRow } from '../../ui/kit';
import { SendContractModalComponent } from '../contracts/send-contract-modal.component';
import { ageOn, recentAttendance } from './student-rows';
import { REQUEST_TYPE, openRequestFor, requestSituation } from '../requests/request-view';

type Tab = 'overview' | 'enrollments' | 'attendance' | 'invoices' | 'history';

const MARK: Record<AttendanceMark, [string, string]> = {
  present: ['P', 'Presente'],
  excused: ['J', 'Falta justificada'],
  absent: ['F', 'Falta'],
};

interface StatusAction {
  to: StudentStatus;
  label: string;
  danger: boolean;
}

/** W11 — ficha do aluno (adulto ou menor). */
@Component({
  selector: 'ct-student-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, PersonComponent, BannerComponent, SegmentedComponent, ToggleComponent, ModalComponent, AuditTrailComponent, IconComponent, SendContractModalComponent],
  templateUrl: './student-detail.component.html',
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; align-items: start; }
    .marks { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; }
    .mark { height: 30px; border-radius: 7px; display: grid; place-items: center; font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; }
    .mark.present { background: rgba(43,209,126,0.14); color: var(--nx-win); }
    .mark.excused { background: rgba(244,197,67,0.14); color: var(--nx-pending); }
    .mark.absent { background: rgba(255,59,48,0.14); color: var(--nx-live); }
    .enr + .enr { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--nx-line-strong); }
    .tabs { overflow-x: auto; }
    .contract { text-decoration: none; color: var(--nx-text-mute); }
    .contract:hover .ct-disp { color: var(--nx-orange-400); }
    .rq-link { color: var(--nx-orange-400); text-decoration: none; font-family: var(--nx-font-display); font-weight: 600; }
    .rq-row { min-height: 36px; }
    .rq-row > span { grid-column: 1 / -1; }
  `,
})
export class StudentDetailComponent {
  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(StudentsActions);
  private readonly router = inject(Router);

  readonly centerId = input.required<string>();
  readonly studentId = input.required<string>();

  protected readonly statusLabel = STUDENT_STATUS;
  protected readonly enrollmentStatus = ENROLLMENT_STATUS;
  protected readonly invoiceStatus = INVOICE_STATUS;
  protected readonly markLabel = MARK;
  protected readonly tab = signal<string>('overview');

  private readonly tz = computed(() => this.ctx.center()?.timezone);
  private readonly today = computed(() => todayKey(this.tz()));
  protected readonly student = computed(() => this.store.students().find((s) => s.id === this.studentId()) ?? null);
  protected readonly canEdit = computed(() => this.ctx.has('enroll_students') && this.ctx.canWrite());
  protected readonly notifyBusy = signal(false);

  /** Push de aula cancelada/alterada (só chega a quem tem conta NexaGO vinculada). */
  protected async setNotify(s: Student, on: boolean): Promise<void> {
    this.notifyBusy.set(true);
    try {
      await this.actions.updateStudent(s, { notifyClasses: on });
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.notifyBusy.set(false);
    }
  }
  protected readonly seesEnrollments = computed(() => this.ctx.has('view_enrollments') || this.ctx.has('enroll_students'));
  protected readonly seesFinance = computed(() => this.ctx.has('view_finance'));
  /** Contratos: a rule libera a leitura para quem matricula (gestor e recepção inclusos). */
  protected readonly seesContracts = computed(() => this.ctx.has('enroll_students'));
  protected readonly sendingContract = signal(false);
  protected readonly contracts = computed(() =>
    sortContracts(this.store.contracts().filter((c) => c.studentId === this.studentId())).map((c) => {
      const st = contractState(c, this.today());
      return { c, label: CONTRACT_STATE[st][0], tone: CONTRACT_STATE[st][1] };
    }),
  );

  protected readonly tabs = computed(() => {
    const t: { value: Tab; label: string }[] = [{ value: 'overview', label: 'Visão geral' }];
    if (this.seesEnrollments()) t.push({ value: 'enrollments', label: 'Matrículas' });
    t.push({ value: 'attendance', label: 'Presença' });
    if (this.seesFinance()) t.push({ value: 'invoices', label: 'Cobranças' });
    // Trilha de auditoria só chega pra owner/admin (rule + listener).
    if (this.ctx.isManager()) t.push({ value: 'history', label: 'Histórico' });
    return t;
  });

  protected readonly enrollments = computed(() =>
    this.store
      .enrollments()
      .filter((e) => e.studentId === this.studentId())
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
  );
  protected readonly current = computed(() => this.enrollments().filter((e) => holdsSeat(e.status)));
  /** Trancamento, pausa por lesão ou cancelamento em andamento, por matrícula (link para o pedido). */
  protected readonly openRequests = computed(() => {
    const all = this.store.requests();
    const out: Record<string, { id: string; label: string }> = {};
    for (const e of this.enrollments()) {
      const r = openRequestFor(all, e.id);
      if (r) out[e.id] = { id: r.id, label: `${REQUEST_TYPE[r.type][0]} · ${requestSituation(r).label}` };
    }
    return out;
  });

  protected readonly subtitle = computed(() => {
    const s = this.student();
    if (!s) return '';
    const age = ageOn(s.birthDate, this.today());
    const since = s.createdAt ? wallClock(s.createdAt, this.tz()).dayKey.slice(0, 7) : null;
    return [
      s.isMinor ? 'Aluno menor' : 'Aluno',
      age !== null ? `${age} anos` : '',
      this.current()[0]?.className ?? '',
      since ? `desde ${monthLabel(since).toLowerCase()} ${since.slice(0, 4)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  });

  protected readonly recent = computed(() => recentAttendance(this.store.sessions(), this.studentId(), this.today()));
  protected readonly recentRate = computed(() => {
    const r = this.recent();
    const present = r.filter((c) => c.mark === 'present').length;
    return r.length ? `${Math.round((present / r.length) * 100)}% · ${present} de ${r.length}` : 'Sem chamada registrada';
  });
  protected readonly allAttendance = computed(() =>
    this.store
      .sessions()
      .filter((s) => s.attendance[this.studentId()] || s.makeupStudentIds.includes(this.studentId()))
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
  protected readonly overallRate = computed(() => attendanceRate(tallyAttendance(this.store.sessions(), this.studentId())));

  protected readonly invoices = computed(() =>
    this.store
      .invoices()
      .filter((i) => i.studentId === this.studentId())
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
      .map((i) => ({ inv: i, st: invoiceDisplayStatus(i, this.today()) })),
  );

  protected readonly history = computed<AuditRow[]>(() => {
    const ids = new Set([this.studentId(), ...this.enrollments().map((e) => e.id), ...this.invoices().map((i) => i.inv.id)]);
    return this.store
      .audit()
      .filter((a) => ids.has(a.entityId))
      .map((a) => ({ when: formatInstant(a.at, this.tz()), who: a.actorName || 'Sistema', what: a.detail || a.action, why: a.reason || undefined }));
  });

  protected readonly statusActions = computed<StatusAction[]>(() => {
    const s = this.student();
    if (!s) return [];
    // Reativar volta a "convidado" se o aluno ainda não tem conta vinculada.
    const back: StudentStatus = s.uid ? 'active' : 'invited';
    switch (s.status) {
      case 'active':
      case 'invited':
        return [
          { to: 'inactive', label: 'Inativar', danger: false },
          { to: 'blocked', label: 'Bloquear', danger: true },
        ];
      case 'inactive':
        return [
          { to: back, label: 'Reativar', danger: false },
          { to: 'blocked', label: 'Bloquear', danger: true },
        ];
      default:
        return [{ to: back, label: 'Desbloquear', danger: false }];
    }
  });

  // Edição de emergência/saúde
  protected readonly editingCare = signal(false);
  protected readonly eName = signal('');
  protected readonly ePhone = signal('');
  protected readonly eNotes = signal('');

  // Modais
  protected readonly consentOpen = signal(false);
  protected readonly consentImage = signal(false);
  protected readonly statusTarget = signal<StatusAction | null>(null);
  protected readonly reason = signal('');

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected join(parts: string[]): string {
    return parts.filter(Boolean).join(' · ');
  }

  protected day(key: string | null): string {
    return key ? formatDayKey(key, true) : '—';
  }

  protected instant(at: Date | null): string {
    return at ? formatDayKey(wallClock(at, this.tz()).dayKey, true) : '—';
  }

  protected brl(cents: number): string {
    return formatBRL(cents);
  }

  protected price(e: Enrollment): string {
    const c = e.contract;
    if (!c) return '—';
    return c.planType === 'monthly' ? `${formatBRL(c.priceCents)}/mês` : `${formatBRL(c.priceCents)} · pacote`;
  }

  protected schedule(e: Enrollment): string {
    const c = this.store.classById(e.classId);
    return c ? `${weekdaysLabel(c.weekdays)} ${c.startTime} · ${placeLabel(c)}` : '—';
  }

  protected coach(e: Enrollment): string {
    return this.store.classById(e.classId)?.coachName || '—';
  }

  protected newEnrollment(): void {
    void this.router.navigate(['/centro', this.centerId(), 'matriculas'], { queryParams: { nova: 1, aluno: this.studentId() } });
  }

  protected startCare(): void {
    const s = this.student();
    if (!s) return;
    this.eName.set(s.emergencyName);
    this.ePhone.set(s.emergencyPhone);
    this.eNotes.set(s.medicalNotes);
    this.error.set('');
    this.editingCare.set(true);
  }

  protected saveCare(): Promise<void> {
    return this.run(async (s) => {
      await this.actions.updateStudent(s, { emergencyName: this.eName().trim(), emergencyPhone: this.ePhone().trim(), medicalNotes: this.eNotes().trim() });
      this.editingCare.set(false);
    });
  }

  protected openConsent(): void {
    this.consentImage.set(this.student()?.imageUseAllowed ?? false);
    this.error.set('');
    this.consentOpen.set(true);
  }

  protected saveConsent(): Promise<void> {
    return this.run(async (s) => {
      await this.actions.recordGuardianConsent(s, this.consentImage());
      this.consentOpen.set(false);
    });
  }

  protected openStatus(a: StatusAction): void {
    this.reason.set('');
    this.error.set('');
    this.statusTarget.set(a);
  }

  protected saveStatus(): Promise<void> {
    const target = this.statusTarget();
    if (!target) return Promise.resolve();
    if (this.reason().trim().length < 3) {
      this.error.set('Informe o motivo (fica na trilha de auditoria).');
      return Promise.resolve();
    }
    return this.run(async (s) => {
      await this.actions.setStatus(s, target.to, this.reason().trim());
      this.statusTarget.set(null);
    });
  }

  private async run(fn: (s: Student) => Promise<void>): Promise<void> {
    const s = this.student();
    if (!s || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await fn(s);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}

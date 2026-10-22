import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { EnrollmentsActions } from '../../data/actions/enrollments.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterStore } from '../../data/center-store.service';
import { addDays, formatDayKey, formatInstant, isValidDayKey, todayKey } from '../../domain/dates';
import { canTransition, holdExpired } from '../../domain/enrollment';
import { formatBRL } from '../../domain/money';
import { ENROLLMENT_STATUS, type Enrollment, type EnrollmentStatus } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { AuditTrailComponent, PageHeaderComponent, PersonComponent, type AuditRow } from '../../ui/kit';
import { planRule } from '../plans/plan-view';
import { enrollmentDetail, ordinal, payerNameFor, queuePositions, statusCounts, waitlistGroups } from './enrollment-view';
import { NewEnrollmentComponent } from './new-enrollment.component';

type Filter = EnrollmentStatus | 'all';
type ActionKind = 'activate' | 'pause' | 'resume' | 'cancel' | 'complete';

/** Ordem da tabela: o que pede ação primeiro. */
const STATUS_ORDER: EnrollmentStatus[] = ['pending', 'waitlisted', 'active', 'paused', 'completed', 'cancelled'];

@Component({
  selector: 'ct-enrollments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PersonComponent, AuditTrailComponent, IconComponent, NewEnrollmentComponent],
  templateUrl: './enrollments.component.html',
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .pos { width: 22px; font-family: var(--nx-font-mono); font-size: 11px; font-weight: 700; color: var(--nx-orange-400); }
    .det.pending { color: var(--nx-pending); }
    .det.red { color: var(--nx-live); }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .form { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
    .disabled-note { font-size: 11.5px; color: var(--nx-text-dim); max-width: 260px; }
  `,
})
export class EnrollmentsComponent {
  readonly centerId = input('');
  /** `?nova=1` abre o modal; `?aluno=<id>` pré-seleciona o aluno. */
  readonly nova = input<string | undefined>();
  readonly aluno = input<string | undefined>();

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(EnrollmentsActions);

  protected readonly STATUS = ENROLLMENT_STATUS;
  protected readonly statuses = STATUS_ORDER;
  protected readonly formatDayKey = formatDayKey;
  protected readonly formatBRL = formatBRL;
  protected readonly formatInstant = formatInstant;
  protected readonly planRule = planRule;
  protected readonly ordinal = ordinal;

  protected readonly filter = signal<Filter>('all');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly showNew = signal(false);

  protected readonly tz = computed(() => this.ctx.center()?.timezone);
  protected readonly today = computed(() => todayKey(this.tz()));
  protected readonly policies = computed(() => this.ctx.center()?.policies ?? null);
  protected readonly canEdit = computed(() => this.ctx.has('enroll_students') && this.ctx.canWrite());
  protected readonly centerActive = computed(() => this.ctx.center()?.status === 'active');
  /** Por que não dá pra matricular (null = pode). */
  protected readonly enrollBlock = computed(() => {
    if (!this.ctx.has('enroll_students')) {
      return 'Seu papel não matricula alunos.';
    }
    if (this.ctx.isSuspended()) {
      return 'Centro suspenso: somente leitura.';
    }
    if (!this.centerActive()) {
      return 'Matrículas liberam depois que o centro for ativado.';
    }
    return null;
  });

  protected readonly counts = computed(() => statusCounts(this.store.enrollments()));
  protected readonly subtitle = computed(() => {
    const c = this.counts();
    return `${c.active} ativas · ${c.pending} pendentes · ${c.paused} pausadas · ${c.waitlisted} na espera`;
  });

  private readonly positions = computed(() => queuePositions(this.store.enrollments()));

  protected readonly rows = computed(() => {
    const f = this.filter();
    const invoices = this.store.invoices();
    const pos = this.positions();
    const tz = this.tz();
    const now = new Date();
    return this.store
      .enrollments()
      .filter((e) => f === 'all' || e.status === f)
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.studentName.localeCompare(b.studentName, 'pt-BR'))
      .map((e) => ({
        e,
        plan: e.contract?.planName ?? (e.planId ? this.store.planById(e.planId)?.name : null) ?? '—',
        detail: enrollmentDetail(e, { invoices, queuePosition: pos.get(e.id) ?? null, tz, now }),
      }));
  });

  protected readonly waitlists = computed(() => waitlistGroups(this.store.classes(), this.store.enrollments()));

  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return id ? (this.store.enrollments().find((e) => e.id === id) ?? null) : null;
  });

  protected readonly selectedExpired = computed(() => {
    const e = this.selected();
    return e ? holdExpired(e) : false;
  });

  /** Primeira cobrança ligada à matrícula (só aparece pra quem vê o financeiro). */
  protected readonly selectedInvoice = computed(() => {
    const e = this.selected();
    if (!e) {
      return null;
    }
    const list = this.store.invoices().filter((i) => i.enrollmentId === e.id);
    return list.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0] ?? null;
  });

  protected readonly selectedAudit = computed<AuditRow[]>(() => {
    const e = this.selected();
    if (!e) {
      return [];
    }
    const tz = this.tz();
    return this.store
      .audit()
      .filter((a) => a.entityId === e.id)
      .map((a) => ({ when: formatInstant(a.at, tz), who: a.actorName, what: a.detail, why: a.reason || undefined }));
  });

  // Ação em andamento no card da matrícula selecionada.
  protected readonly action = signal<ActionKind | null>(null);
  protected readonly reason = signal('');
  protected readonly pauseUntil = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly offerBusy = signal<string | null>(null);
  protected readonly offerError = signal('');

  /** Ativar sem pagamento confirmado exige motivo quando a política é "após pagamento". */
  protected readonly activateNeedsReason = computed(() => this.policies()?.activation !== 'on_confirmation');

  protected readonly actionValid = computed(() => {
    const a = this.action();
    const reason = this.reason().trim();
    if (a === 'cancel') {
      return reason.length >= 3;
    }
    if (a === 'activate') {
      return !this.activateNeedsReason() || reason.length >= 3;
    }
    if (a === 'pause') {
      const d = this.pauseUntil();
      return reason.length >= 3 && isValidDayKey(d) && d > this.today();
    }
    return a != null;
  });

  constructor() {
    effect(() => {
      if (this.nova() === '1') {
        untracked(() => this.showNew.set(true));
      }
    });
  }

  can(to: EnrollmentStatus): boolean {
    const e = this.selected();
    return !!e && this.canEdit() && canTransition(e.status, to);
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.resetAction();
  }

  startAction(kind: ActionKind): void {
    this.action.set(kind);
    this.reason.set('');
    this.pauseUntil.set(addDays(this.today(), 14));
    this.error.set('');
  }

  resetAction(): void {
    this.action.set(null);
    this.reason.set('');
    this.error.set('');
  }

  async runAction(): Promise<void> {
    const e = this.selected();
    const a = this.action();
    if (!e || !a || !this.actionValid() || this.busy()) {
      return;
    }
    const reason = this.reason().trim();
    await this.run(async () => {
      if (a === 'pause') {
        await this.actions.pause(e, this.pauseUntil(), reason);
      } else {
        const to: EnrollmentStatus = a === 'activate' || a === 'resume' ? 'active' : a === 'cancel' ? 'cancelled' : 'completed';
        await this.actions.transition(e, to, reason);
      }
    });
  }

  /** Reserva vencida: libera a vaga cancelando com o motivo padrão. */
  async release(e: Enrollment): Promise<void> {
    await this.run(() => this.actions.transition(e, 'cancelled', 'Reserva expirada'));
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await fn();
      this.resetAction();
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async offerSeat(e: Enrollment): Promise<void> {
    const plan = e.planId ? this.store.planById(e.planId) : undefined;
    this.offerError.set('');
    if (!plan) {
      this.offerError.set('O plano escolhido na fila não existe mais. Remova da fila e matricule de novo.');
      return;
    }
    const student = this.store.studentById(e.studentId);
    this.offerBusy.set(e.id);
    try {
      const r = await this.actions.offerSeat(e, plan, student ? payerNameFor(student) : e.studentName);
      if (r === 'full') {
        this.offerError.set('A turma lotou de novo antes da oferta. Nada foi alterado.');
      } else {
        this.select(e.id);
      }
    } catch (err) {
      this.offerError.set(writeErrorMessage(err));
    } finally {
      this.offerBusy.set(null);
    }
  }

  onCreated(id: string): void {
    this.showNew.set(false);
    this.filter.set('all');
    this.select(id);
  }

  inputValue(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }
}

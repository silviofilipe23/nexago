import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { EnrollmentsActions, type EnrollInput } from '../../data/actions/enrollments.actions';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, isValidDayKey, todayKey } from '../../domain/dates';
import { buildContract, freeSeats, isFull, priceOn, waitlistOf } from '../../domain/enrollment';
import { formatBRL } from '../../domain/money';
import type { Plan, TrainingClass } from '../../domain/models';
import { placeLabel } from '../../domain/locations';
import { weekdaysLabel } from '../../domain/schedule';
import { IconComponent } from '../../ui/icon.component';
import { ModalComponent, PersonComponent, ToggleComponent } from '../../ui/kit';
import { planRule, priceSuffix } from '../plans/plan-view';
import { alternativeClasses, payerNameFor, plansForProgram } from './enrollment-view';

const STEPS = ['Aluno', 'Turma', 'Plano', 'Condições', 'Confirmar'];

/** Turma sem vaga: escolhida já cheia (`raced=false`) ou lotou durante o preenchimento. */
interface FullState {
  capacity: number;
  seatsTaken: number;
  raced: boolean;
}

/** W18 — Nova matrícula em passos, com o desvio "turma lotada" (fila ou outra turma). */
@Component({
  selector: 'ct-new-enrollment',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, PersonComponent, ToggleComponent, IconComponent],
  templateUrl: './new-enrollment.component.html',
  styles: `
    .steps { display: flex; gap: 6px; }
    .steps > div { flex: 1; min-width: 0; }
    .bar { height: 4px; border-radius: 2px; background: var(--nx-surface-2); }
    .bar.done { background: var(--nx-win); }
    .bar.now { background: var(--nx-orange-500); }
    .lbl { margin-top: 6px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lbl.now { color: var(--nx-orange-400); }
    .list { display: flex; flex-direction: column; gap: 8px; max-height: 340px; overflow-y: auto; }
    .pick { padding: 10px 12px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); background: var(--nx-surface-0); cursor: pointer; text-align: left; font: inherit; color: var(--nx-text); }
    .pick.on { border-color: var(--nx-orange-500); background: rgba(255,106,26,0.08); }
    .opt { display: flex; align-items: center; gap: 12px; width: 100%; }
    .seats { font-family: var(--nx-font-mono); font-size: 12px; font-weight: 700; color: var(--nx-win); }
    .seats.full { color: var(--nx-pending); }
    .full-t { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; color: var(--nx-pending); }
    .alt { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .price { font-family: var(--nx-font-display); font-weight: 800; font-size: 15px; color: var(--nx-text); white-space: nowrap; }
  `,
})
export class NewEnrollmentComponent implements OnInit {
  readonly initialStudentId = input<string | null>(null);
  readonly closed = output<void>();
  readonly created = output<string>();
  /** "Enviar contrato" depois de matricular: o pai abre o envio com aluno e matrícula. */
  readonly sendContract = output<{ studentId: string; enrollmentId: string }>();

  private readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(EnrollmentsActions);

  protected readonly steps = STEPS;
  protected readonly formatBRL = formatBRL;
  protected readonly formatDayKey = formatDayKey;
  protected readonly planRule = planRule;
  protected readonly priceSuffix = priceSuffix;
  protected readonly freeSeats = freeSeats;

  protected readonly step = signal(0);
  protected readonly query = signal('');
  protected readonly studentId = signal<string | null>(null);
  protected readonly classId = signal<string | null>(null);
  protected readonly planId = signal<string | null>(null);
  protected readonly today = computed(() => todayKey(this.ctx.center()?.timezone));
  protected readonly startDate = signal('');
  protected readonly full = signal<FullState | null>(null);
  protected readonly notify = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** Matrícula criada, oferecendo o envio do contrato (só quando há modelo publicado). */
  protected readonly createdId = signal<string | null>(null);
  private readonly hasContractModel = computed(
    () => this.ctx.has('enroll_students') && this.store.contractTemplates().some((t) => t.status === 'published' && t.version > 0 && t.kind === 'enrollment'),
  );

  protected readonly policies = computed(() => this.ctx.center()?.policies ?? null);

  protected readonly students = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.store
      .students()
      .filter((s) => s.status === 'active' || s.status === 'invited')
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
      .slice(0, 60);
  });
  protected readonly classes = computed(() => this.store.classes().filter((c) => c.status === 'active'));

  protected readonly student = computed(() => (this.studentId() ? (this.store.studentById(this.studentId()!) ?? null) : null));
  protected readonly cls = computed(() => (this.classId() ? (this.store.classById(this.classId()!) ?? null) : null));
  protected readonly plan = computed(() => (this.planId() ? (this.store.planById(this.planId()!) ?? null) : null));
  protected readonly plans = computed(() => {
    const c = this.cls();
    return c ? plansForProgram(this.store.plans(), c.programId) : [];
  });
  protected readonly payerName = computed(() => {
    const s = this.student();
    return s ? payerNameFor(s) : '';
  });
  protected readonly contract = computed(() => {
    const p = this.plan();
    const pol = this.policies();
    return p && pol ? buildContract(p, pol, this.today()) : null;
  });

  protected readonly title = computed(() => {
    const s = this.student();
    const c = this.cls();
    return s && c ? `${s.name} → ${c.name}` : s ? s.name : 'Escolha o aluno';
  });

  protected readonly alternatives = computed(() => {
    const c = this.cls();
    return c ? alternativeClasses(this.store.classes(), c) : [];
  });
  protected readonly queueLength = computed(() => {
    const c = this.cls();
    return c ? waitlistOf(this.store.enrollments(), c.id).length : 0;
  });

  protected readonly stepValid = computed(() => {
    switch (this.step()) {
      case 0:
        return !!this.student();
      case 1:
        return !!this.cls();
      case 2:
        return !!this.plan();
      case 3:
        return isValidDayKey(this.startDate());
      default:
        return true;
    }
  });

  ngOnInit(): void {
    this.startDate.set(this.today());
    const pre = this.initialStudentId();
    // Não exige o aluno já carregado: num reload com ?aluno= o feed chega depois e `student()` resolve.
    if (pre) {
      this.studentId.set(pre);
      this.step.set(1);
    }
  }

  className(c: TrainingClass): string {
    const program = this.store.programById(c.programId)?.name;
    return [program, c.level].filter(Boolean).join(' · ');
  }

  schedule(c: TrainingClass): string {
    return [`${weekdaysLabel(c.weekdays)} ${c.startTime}`, c.coachName, placeLabel(c)].filter(Boolean).join(' · ');
  }

  pickStudent(id: string): void {
    this.studentId.set(id);
    this.step.set(1);
  }

  /** Turma cheia já na escolha leva direto ao estado "lotada". */
  pickClass(c: TrainingClass): void {
    this.classId.set(c.id);
    if (this.plan() && !this.plans().some((p) => p.id === this.planId())) {
      this.planId.set(null);
    }
    if (isFull(c)) {
      // Fila exige o plano pretendido; com um só elegível, já vem escolhido.
      if (!this.planId() && this.plans().length === 1) {
        this.planId.set(this.plans()[0]!.id);
      }
      this.full.set({ capacity: c.capacity, seatsTaken: c.seatsTaken, raced: false });
      return;
    }
    this.full.set(null);
    this.step.set(2);
  }

  /** Alternativa da mesma modalidade/nível: o plano continua válido, volta pro passo certo. */
  pickAlternative(c: TrainingClass): void {
    this.classId.set(c.id);
    this.full.set(null);
    this.error.set('');
    this.step.set(this.plan() ? 4 : 2);
  }

  pickPlan(id: string): void {
    this.planId.set(id);
  }

  next(): void {
    if (this.stepValid() && this.step() < STEPS.length - 1) {
      this.step.update((s) => s + 1);
    }
  }

  back(): void {
    if (this.full()) {
      this.full.set(null);
      this.step.set(1);
      return;
    }
    this.error.set('');
    this.step.update((s) => Math.max(0, s - 1));
  }

  private input(): EnrollInput | null {
    const s = this.student();
    const c = this.cls();
    const p = this.plan();
    if (!s || !c || !p) {
      return null;
    }
    return { student: { id: s.id, name: s.name }, cls: { id: c.id, name: c.name }, plan: p, startDate: this.startDate(), notifyOnSeat: this.notify() };
  }

  async confirm(): Promise<void> {
    const data = this.input();
    if (!data || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.actions.enroll(data, this.payerName());
      if (r.kind === 'full') {
        // Alguém pegou a última vaga enquanto o formulário estava aberto.
        this.full.set({ capacity: r.capacity, seatsTaken: r.seatsTaken, raced: true });
      } else if (this.hasContractModel()) {
        this.createdId.set(r.id);
      } else {
        this.created.emit(r.id);
      }
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async joinWaitlist(): Promise<void> {
    const data = this.input();
    if (!data || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      this.created.emit(await this.actions.joinWaitlist(data));
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  /** Fechar depois de criada também conta como concluir (o pai seleciona a matrícula nova). */
  dismiss(): void {
    const id = this.createdId();
    if (id) this.created.emit(id);
    else this.closed.emit();
  }

  offerContract(): void {
    const id = this.createdId();
    const s = this.student();
    if (id && s) this.sendContract.emit({ studentId: s.id, enrollmentId: id });
  }

  inputValue(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }

  priceToday(p: Plan): number {
    return priceOn(p, this.today());
  }
}

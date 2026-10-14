import { Injectable, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  deleteField,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type CollectionReference,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { localIsoDate } from '../treinos/training-rules';
import { readCharge, readEnrollment, readPlan, type Charge, type Enrollment, type PaymentMethod, type Plan } from './finance-model';
import {
  currentMonth,
  generateCharges,
  monthRange,
  nextPeriodStart,
  replacementStart,
  type GeneratedCharge,
  type PlanCycle,
} from './finance-rules';

export interface PlanInput {
  name: string;
  amountCents: number;
  cycle: PlanCycle;
  description: string;
}

export interface EnrollInput {
  athleteUid: string;
  athleteName: string;
  plan: Plan;
  startDate: string;
  dueDay: number;
  count: number;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

/** Traduz o erro do Firestore numa mensagem útil — regra/índice não publicados não podem virar "lista vazia". */
function describeError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: string }).code) : '';
  if (code === 'permission-denied') {
    return 'Sem permissão para acessar o financeiro. As regras do Firestore podem não estar publicadas.';
  }
  if (code === 'failed-precondition') {
    return 'O índice do Firestore ainda está sendo criado. Tente de novo em alguns minutos.';
  }
  return 'Não foi possível carregar o financeiro.';
}

/**
 * Financeiro do treinador (livro-caixa manual). `coaches/{uid}/{plans,enrollments,charges}` são
 * owner-only: leitura e escrita direto do client, sem Cloud Function.
 * Planos e matrículas são pequenos e ouvidos inteiros; parcelas em dois listeners — o mês
 * visível e as pendentes vencidas (qualquer mês).
 */
@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly auth = inject(AuthService);
  protected readonly firestore = createFirestore();

  private readonly plansState = signal<Plan[]>([]);
  private readonly enrollmentsState = signal<Enrollment[]>([]);
  private readonly monthChargesState = signal<Charge[]>([]);
  private readonly overdueState = signal<Charge[]>([]);
  private readonly readyState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly plans = this.plansState.asReadonly();
  readonly enrollments = this.enrollmentsState.asReadonly();
  readonly monthCharges = this.monthChargesState.asReadonly();
  readonly overdueCharges = this.overdueState.asReadonly();
  /** `true` depois do primeiro snapshot de planos e matrículas (ou de um erro). */
  readonly ready = this.readyState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** Mês visível em Pagamentos (`YYYY-MM`). */
  readonly month = signal(currentMonth());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.plansState.set([]);
        this.enrollmentsState.set([]);
        this.readyState.set(false);
        this.errorState.set(null);
        return;
      }
      let plansReady = false;
      let enrollmentsReady = false;
      const markReady = () => {
        if (plansReady && enrollmentsReady) {
          this.readyState.set(true);
        }
      };
      const fail = (error: unknown) => {
        this.errorState.set(describeError(error));
        this.readyState.set(true);
      };
      this.errorState.set(null);
      const stopPlans = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'plans'),
        (snap) => {
          this.plansState.set(snap.docs.map((d) => readPlan(d.id, d.data())));
          plansReady = true;
          markReady();
        },
        fail,
      );
      const stopEnrollments = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'enrollments'),
        (snap) => {
          this.enrollmentsState.set(snap.docs.map((d) => readEnrollment(d.id, d.data())));
          enrollmentsReady = true;
          markReady();
        },
        fail,
      );
      onCleanup(() => {
        stopPlans();
        stopEnrollments();
      });
    });

    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      const { start, end } = monthRange(this.month());
      if (!uid) {
        this.monthChargesState.set([]);
        return;
      }
      const stop = onSnapshot(
        query(collection(this.firestore, 'coaches', uid, 'charges'), where('dueDate', '>=', start), where('dueDate', '<=', end)),
        (snap) => this.monthChargesState.set(snap.docs.map((d) => readCharge(d.id, d.data()))),
        (error) => this.errorState.set(describeError(error)),
      );
      onCleanup(stop);
    });

    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.overdueState.set([]);
        return;
      }
      const stop = onSnapshot(
        query(
          collection(this.firestore, 'coaches', uid, 'charges'),
          where('status', '==', 'pendente'),
          where('dueDate', '<', localIsoDate()),
        ),
        (snap) => this.overdueState.set(snap.docs.map((d) => readCharge(d.id, d.data()))),
        (error) => this.errorState.set(describeError(error)),
      );
      onCleanup(stop);
    });
  }

  protected requireUid(): string {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    return uid;
  }

  protected col(name: 'plans' | 'enrollments' | 'charges'): CollectionReference {
    return collection(this.firestore, 'coaches', this.requireUid(), name);
  }

  async createPlan(input: PlanInput): Promise<string> {
    const ref = doc(this.col('plans'));
    await setDoc(ref, {
      name: input.name.trim(),
      amountCents: input.amountCents,
      cycle: input.cycle,
      description: input.description.trim(),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updatePlan(id: string, input: PlanInput): Promise<void> {
    await updateDoc(doc(this.col('plans'), id), {
      name: input.name.trim(),
      amountCents: input.amountCents,
      cycle: input.cycle,
      description: input.description.trim(),
      updatedAt: serverTimestamp(),
    });
  }

  async setPlanActive(id: string, active: boolean): Promise<void> {
    await updateDoc(doc(this.col('plans'), id), { active, updatedAt: serverTimestamp() });
  }

  /** Todas as parcelas de um aluno (uma leitura pontual; índice de campo único é automático). */
  private async loadAthleteCharges(athleteUid: string): Promise<Charge[]> {
    const snap = await getDocs(query(this.col('charges'), where('athleteUid', '==', athleteUid)));
    return snap.docs.map((d) => readCharge(d.id, d.data()));
  }

  private chargeData(enrollment: Pick<Enrollment, 'athleteUid' | 'athleteName'>, plan: Plan, g: GeneratedCharge) {
    return {
      athleteUid: enrollment.athleteUid,
      athleteName: enrollment.athleteName,
      planId: plan.id,
      planName: plan.name,
      periodKey: g.periodKey,
      amountCents: g.amountCents,
      dueDate: g.dueDate,
      status: 'pendente',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  }

  private activePeriods(charges: Charge[]): string[] {
    return charges.filter((c) => c.status !== 'cancelado').map((c) => c.periodKey);
  }

  /** Matricula (ou re-matricula) o aluno e gera as parcelas, tudo num lote. Devolve quantas criou. */
  async enroll(input: EnrollInput): Promise<number> {
    const existing = await this.loadAthleteCharges(input.athleteUid);
    const generated = generateCharges({
      cycle: input.plan.cycle,
      amountCents: input.plan.amountCents,
      startDate: input.startDate,
      dueDay: input.dueDay,
      count: input.count,
      existingPeriods: this.activePeriods(existing),
    });
    const enrollment = { athleteUid: input.athleteUid, athleteName: input.athleteName };
    const batch = writeBatch(this.firestore);
    // Sem merge: re-matricular regrava o doc inteiro como `ativa` (some o `endedAt`).
    batch.set(doc(this.col('enrollments'), input.athleteUid), {
      ...enrollment,
      planId: input.plan.id,
      startDate: input.startDate,
      dueDay: input.dueDay,
      status: 'ativa',
      createdAt: serverTimestamp(),
    });
    for (const g of generated) {
      batch.set(doc(this.col('charges')), this.chargeData(enrollment, input.plan, g));
    }
    await batch.commit();
    return generated.length;
  }

  /** Gera mais parcelas a partir do período seguinte ao último que o aluno já tem. */
  async generateMore(enrollment: Enrollment, plan: Plan, count: number): Promise<number> {
    const existing = await this.loadAthleteCharges(enrollment.athleteUid);
    const lastPeriod = existing.map((c) => c.periodKey).sort().pop();
    const generated = generateCharges({
      cycle: plan.cycle,
      amountCents: plan.amountCents,
      startDate: lastPeriod ? nextPeriodStart(lastPeriod, plan.cycle) : enrollment.startDate,
      dueDay: enrollment.dueDay,
      count,
      existingPeriods: this.activePeriods(existing),
    });
    const batch = writeBatch(this.firestore);
    for (const g of generated) {
      batch.set(doc(this.col('charges')), this.chargeData(enrollment, plan, g));
    }
    await batch.commit();
    return generated.length;
  }

  /**
   * Troca o plano: cancela as pendentes com vencimento de hoje em diante e gera uma série nova do plano novo,
   * recomeçando no mesmo período da primeira cancelada. Pagas e vencidas não são tocadas.
   */
  async changePlan(enrollment: Enrollment, newPlan: Plan, count: number, today: string): Promise<number> {
    const existing = await this.loadAthleteCharges(enrollment.athleteUid);
    const toCancel = existing.filter((c) => c.status === 'pendente' && c.dueDate >= today);
    const cancelledIds = new Set(toCancel.map((c) => c.id));
    const kept = existing.filter((c) => !cancelledIds.has(c.id));
    const generated = generateCharges({
      cycle: newPlan.cycle,
      amountCents: newPlan.amountCents,
      startDate: replacementStart(toCancel.map((c) => c.periodKey), today),
      dueDay: enrollment.dueDay,
      count,
      existingPeriods: this.activePeriods(kept),
    });
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.col('enrollments'), enrollment.athleteUid), { planId: newPlan.id });
    for (const c of toCancel) {
      batch.update(doc(this.col('charges'), c.id), { status: 'cancelado', updatedAt: serverTimestamp() });
    }
    for (const g of generated) {
      batch.set(doc(this.col('charges')), this.chargeData(enrollment, newPlan, g));
    }
    await batch.commit();
    return generated.length;
  }

  /** Encerra a matrícula e cancela as pendentes com vencimento de hoje em diante; o resto é histórico. */
  async endEnrollment(enrollment: Enrollment, today: string): Promise<void> {
    const existing = await this.loadAthleteCharges(enrollment.athleteUid);
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.col('enrollments'), enrollment.athleteUid), {
      status: 'encerrada',
      endedAt: serverTimestamp(),
    });
    for (const c of existing.filter((x) => x.status === 'pendente' && x.dueDate >= today)) {
      batch.update(doc(this.col('charges'), c.id), { status: 'cancelado', updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }

  async markPaid(chargeId: string, input: { paidAt: string; method: PaymentMethod; note: string }): Promise<void> {
    await updateDoc(doc(this.col('charges'), chargeId), {
      status: 'pago',
      paidAt: input.paidAt,
      method: input.method,
      note: input.note.trim(),
      updatedAt: serverTimestamp(),
    });
  }

  /** Volta para pendente e apaga os dados da baixa. */
  async undoPaid(chargeId: string): Promise<void> {
    await updateDoc(doc(this.col('charges'), chargeId), {
      status: 'pendente',
      paidAt: deleteField(),
      method: deleteField(),
      note: deleteField(),
      updatedAt: serverTimestamp(),
    });
  }

  /** `periodKey` acompanha o mês do novo vencimento, senão "Gerar próximos" recriaria a parcela. */
  async editCharge(chargeId: string, input: { amountCents: number; dueDate: string }): Promise<void> {
    await updateDoc(doc(this.col('charges'), chargeId), {
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      periodKey: input.dueDate.slice(0, 7),
      updatedAt: serverTimestamp(),
    });
  }

  async cancelCharge(chargeId: string): Promise<void> {
    await updateDoc(doc(this.col('charges'), chargeId), { status: 'cancelado', updatedAt: serverTimestamp() });
  }
}
